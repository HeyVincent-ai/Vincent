import { type Hex } from 'viem';
import nacl from 'tweetnacl';
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
  ethPublicKey: string | null;
  solanaPublicKey: string | null;
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
    ethPublicKey: secret.rawSignerMetadata.ethPublicKey,
    solanaPublicKey: secret.rawSignerMetadata.solanaPublicKey,
    userId: secret.userId,
  };
}

/**
 * Sign a message using Ethereum's secp256k1 curve (ECDSA)
 * Uses viem's built-in signing which wraps @noble/curves internally
 *
 * IMPORTANT: The message must be a 32-byte hash (e.g. keccak256 of transaction).
 * If the message is not 32 bytes, it will be hashed with keccak256 first.
 */
async function signWithEthereum(privateKey: Hex, messageHex: string): Promise<string> {
  // Import viem's signing utilities - viem is already a dependency and handles
  // the @noble/curves integration internally
  const { sign } = await import('viem/accounts');
  const { keccak256, toHex } = await import('viem');

  // Check if the message is already a 32-byte hash (64 hex chars + 0x prefix = 66 chars)
  // If not, hash it first with keccak256
  const messageHash =
    messageHex.length === 66
      ? (messageHex as Hex) // Already a 32-byte hash
      : keccak256(messageHex as Hex); // Hash the message first

  // Use viem's sign function which returns signature components
  const sig = await sign({ hash: messageHash, privateKey });

  // Combine r, s, v into a single hex string (65 bytes total)
  // r (32 bytes) + s (32 bytes) + v (1 byte)
  const rHex = sig.r.slice(2).padStart(64, '0');
  const sHex = sig.s.slice(2).padStart(64, '0');
  // v is either directly provided or derived from yParity (0 -> 27, 1 -> 28)
  const v = sig.v ?? (sig.yParity === 0 ? 27n : 28n);
  const vHex = toHex(v).slice(2).padStart(2, '0');

  return ('0x' + rHex + sHex + vHex) as Hex;
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
      signature = await signWithEthereum(signer.privateKey, message);
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
    ethPublicKey: signer.ethPublicKey,
    solanaPublicKey: signer.solanaPublicKey,
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
    signature = await signWithEthereum(privateKey, requestData.message);
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
