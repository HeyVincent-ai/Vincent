import { type Hex } from 'viem';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import prisma from '../db/client';
import { AppError } from '../api/middleware/errorHandler';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker';
import { sendApprovalRequest } from '../telegram';

// ============================================================
// Types
// ============================================================

export type CurveType = 'ethereum' | 'solana';

export interface SignInput {
  secretId: string;
  apiKeyId?: string;
  message: string; // Hex-encoded message to sign
  curve: CurveType;
}

export interface SignOutput {
  signature: string; // Hex-encoded signature
  status: 'executed' | 'pending_approval' | 'denied';
  publicKey: string; // The public key/address that signed
  reason?: string;
  transactionLogId: string;
}

export interface AddressesOutput {
  ethAddress: string;
  solanaAddress: string;
}

// ============================================================
// Helpers
// ============================================================

async function getSignerData(secretId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, deletedAt: null },
    include: { rawSignerMetadata: true },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  if (secret.type !== 'RAW_SIGNER') {
    throw new AppError('INVALID_TYPE', 'Secret is not a raw signer', 400);
  }

  if (!secret.value) {
    throw new AppError('NO_VALUE', 'Signer private key not available', 500);
  }

  if (!secret.rawSignerMetadata) {
    throw new AppError('NO_METADATA', 'Signer metadata not found', 500);
  }

  return {
    privateKey: secret.value as Hex,
    ethAddress: secret.rawSignerMetadata.ethAddress,
    solanaAddress: secret.rawSignerMetadata.solanaAddress,
    userId: secret.userId,
  };
}

/**
 * Sign a message using Ethereum's secp256k1 curve (ECDSA)
 */
function signWithEthereum(privateKey: Hex, messageHex: string): string {
  // For raw signing, we sign the message bytes directly
  // The messageHex is the hex-encoded bytes to sign
  const messageBytes = Buffer.from(messageHex.replace(/^0x/, ''), 'hex');

  // Use @noble/curves for raw ECDSA signing
  // viem's signMessage adds Ethereum-specific prefix, so we use raw signing
  const privateKeyBytes = new Uint8Array(Buffer.from(privateKey.slice(2), 'hex'));

  // Sign with 'recovered' format to get the recovery byte (65 bytes: r + s + recovery)
  // prehash: false because we're signing raw message bytes, not a pre-hashed message
  const signatureBytes = secp256k1.sign(messageBytes, privateKeyBytes, {
    prehash: false,
    lowS: true,
    format: 'recovered',
  });

  // Parse the signature using Signature.fromBytes to get r, s, and recovery
  const sig = secp256k1.Signature.fromBytes(signatureBytes, 'recovered');

  // Return the compact signature (r || s || v) as hex
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  const v = (sig.recovery ?? 0) + 27; // Ethereum recovery id

  return '0x' + r + s + v.toString(16).padStart(2, '0');
}

/**
 * Sign a message using Solana's ed25519 curve
 */
function signWithSolana(privateKey: Hex, messageHex: string): string {
  const seedBytes = Buffer.from(privateKey.slice(2), 'hex');
  const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(seedBytes));

  const messageBytes = Buffer.from(messageHex.replace(/^0x/, ''), 'hex');
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

  return '0x' + Buffer.from(signature).toString('hex');
}

// ============================================================
// Sign
// ============================================================

export async function sign(input: SignInput): Promise<SignOutput> {
  const { secretId, apiKeyId, message, curve } = input;
  const signer = await getSignerData(secretId);

  // Validate curve type
  if (curve !== 'ethereum' && curve !== 'solana') {
    throw new AppError('INVALID_CURVE', 'Curve must be "ethereum" or "solana"', 400);
  }

  // Validate message format (must be hex)
  if (!/^0x[0-9a-fA-F]*$/.test(message)) {
    throw new AppError('INVALID_MESSAGE', 'Message must be hex-encoded (0x...)', 400);
  }

  const publicKey = curve === 'ethereum' ? signer.ethAddress : signer.solanaAddress;

  // Build policy check action
  // For raw signing, we can't parse the intent, so we use a generic action
  const policyAction: PolicyCheckAction = {
    type: 'send_transaction', // Use send_transaction type for policy checking
    to: '0x0000000000000000000000000000000000000000', // Unknown recipient
    chainId: curve === 'ethereum' ? 1 : 0, // 0 for Solana (non-EVM)
    value: 0,
  };

  // Check policies - for raw signer, only REQUIRE_APPROVAL makes sense
  const policyResult = await checkPolicies(secretId, policyAction);

  // Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId,
      apiKeyId,
      actionType: 'raw_sign',
      requestData: {
        curve,
        messageLength: message.length,
        messagePreview: message.slice(0, 66) + (message.length > 66 ? '...' : ''),
      },
      status: 'PENDING',
    },
  });

  // Handle policy verdicts
  const reason = policyResult.triggeredPolicy?.reason;

  if (policyResult.verdict === 'deny') {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'DENIED',
        responseData: { reason },
      },
    });

    return {
      signature: '',
      status: 'denied',
      publicKey,
      reason,
      transactionLogId: txLog.id,
    };
  }

  if (policyResult.verdict === 'require_approval') {
    // Create pending approval
    const pendingApproval = await prisma.pendingApproval.create({
      data: {
        transactionLogId: txLog.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minute timeout
      },
    });

    // Send Telegram approval request (fire-and-forget)
    sendApprovalRequest(pendingApproval.id).catch(() => {
      // Ignore errors in fire-and-forget
    });

    return {
      signature: '',
      status: 'pending_approval',
      publicKey,
      reason,
      transactionLogId: txLog.id,
    };
  }

  // Execute the signing
  try {
    let signature: string;
    if (curve === 'ethereum') {
      signature = signWithEthereum(signer.privateKey, message);
    } else {
      signature = signWithSolana(signer.privateKey, message);
    }

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'EXECUTED',
        responseData: {
          signature,
          publicKey,
          curve,
        },
      },
    });

    return {
      signature,
      status: 'executed',
      publicKey,
      transactionLogId: txLog.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown signing error';

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: { error: errorMessage },
      },
    });

    throw new AppError('SIGN_FAILED', `Signing failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Get Addresses
// ============================================================

export async function getAddresses(secretId: string): Promise<AddressesOutput> {
  const signer = await getSignerData(secretId);

  return {
    ethAddress: signer.ethAddress,
    solanaAddress: signer.solanaAddress,
  };
}

// ============================================================
// Execute Approved Sign (called by Telegram approval handler)
// ============================================================

export async function executeApprovedSign(
  transactionLogId: string
): Promise<{ signature: string; publicKey: string }> {
  const txLog = await prisma.transactionLog.findUnique({
    where: { id: transactionLogId },
    include: { secret: { include: { rawSignerMetadata: true } } },
  });

  if (!txLog) {
    throw new AppError('NOT_FOUND', 'Transaction log not found', 404);
  }

  if (txLog.status !== 'APPROVED') {
    throw new AppError('INVALID_STATUS', 'Transaction is not approved', 400);
  }

  const secret = txLog.secret;
  if (!secret || !secret.value || !secret.rawSignerMetadata) {
    throw new AppError('NO_SECRET', 'Secret data not available', 500);
  }

  const requestData = txLog.requestData as {
    curve: CurveType;
    message?: string;
  };

  if (!requestData.message) {
    throw new AppError('NO_MESSAGE', 'Original message not stored', 500);
  }

  const privateKey = secret.value as Hex;
  const curve = requestData.curve;
  const publicKey =
    curve === 'ethereum'
      ? secret.rawSignerMetadata.ethAddress
      : secret.rawSignerMetadata.solanaAddress;

  let signature: string;
  if (curve === 'ethereum') {
    signature = signWithEthereum(privateKey, requestData.message);
  } else {
    signature = signWithSolana(privateKey, requestData.message);
  }

  await prisma.transactionLog.update({
    where: { id: transactionLogId },
    data: {
      status: 'EXECUTED',
      responseData: {
        signature,
        publicKey,
        curve,
      },
    },
  });

  return { signature, publicKey };
}
