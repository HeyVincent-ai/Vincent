import { type Hex, type Address, parseEther, parseUnits } from 'viem';
import prisma from '../db/client';
import { AppError } from '../api/middleware/errorHandler';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker';
import * as priceService from '../services/price.service';
import * as zerodev from './zerodev.service';
import * as gasService from './gas.service';
import { sendApprovalRequest } from '../telegram';

// ============================================================
// Types
// ============================================================

export interface TransferInput {
  secretId: string;
  apiKeyId?: string;
  to: string;
  amount: string; // Human-readable amount (e.g. "0.1" for ETH, "100" for tokens)
  token?: string; // Token address, or "ETH" / undefined for native ETH
}

export interface TransferOutput {
  txHash: string;
  status: 'executed' | 'pending_approval' | 'denied';
  smartAccountAddress: string;
  reason?: string;
  transactionLogId: string;
}

export interface SendTransactionInput {
  secretId: string;
  apiKeyId?: string;
  to: string;
  data: string; // Hex-encoded calldata
  value?: string; // ETH value in ether (e.g. "0.1")
}

export interface SendTransactionOutput {
  txHash: string | null;
  status: 'executed' | 'pending_approval' | 'denied';
  smartAccountAddress: string;
  reason?: string;
  transactionLogId: string;
}

export interface BalanceOutput {
  address: string;
  chainId: number;
  eth: { balance: string; balanceWei: string };
  tokens?: Array<{
    address: string;
    symbol: string;
    balance: string;
    balanceRaw: string;
    decimals: number;
  }>;
}

export interface AddressOutput {
  smartAccountAddress: string;
  chainId: number;
}

// ============================================================
// Helpers
// ============================================================

async function getWalletData(secretId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, deletedAt: null },
    include: { walletMetadata: true },
  });

  if (!secret) {
    throw new AppError('NOT_FOUND', 'Secret not found', 404);
  }

  if (secret.type !== 'EVM_WALLET') {
    throw new AppError('INVALID_TYPE', 'Secret is not an EVM wallet', 400);
  }

  if (!secret.value) {
    throw new AppError('NO_VALUE', 'Wallet private key not available', 500);
  }

  if (!secret.walletMetadata) {
    throw new AppError('NO_METADATA', 'Wallet metadata not found', 500);
  }

  return {
    privateKey: secret.value as Hex,
    smartAccountAddress: secret.walletMetadata.smartAccountAddress as Address,
    chainId: secret.walletMetadata.chainId,
    userId: secret.userId,
  };
}

// ============================================================
// Transfer
// ============================================================

export async function executeTransfer(input: TransferInput): Promise<TransferOutput> {
  const { secretId, apiKeyId, to, amount, token } = input;
  const wallet = await getWalletData(secretId);

  // Check subscription for mainnet
  const subCheck = await gasService.checkSubscriptionForChain(wallet.userId, wallet.chainId);
  if (!subCheck.allowed) {
    throw new AppError('SUBSCRIPTION_REQUIRED', subCheck.reason!, 402);
  }

  const isNativeEth = !token || token.toUpperCase() === 'ETH';

  // Build policy check action
  const policyAction: PolicyCheckAction = {
    type: 'transfer',
    to: to.toLowerCase(),
  };

  if (isNativeEth) {
    policyAction.value = parseFloat(amount);
  } else {
    policyAction.tokenAddress = token!.toLowerCase();
    policyAction.tokenAmount = parseFloat(amount);
  }

  // Check policies
  const policyResult = await checkPolicies(secretId, policyAction);

  // Compute USD value for transaction log
  let usdValue: number | null = null;
  try {
    if (isNativeEth) {
      usdValue = await priceService.ethToUsd(parseFloat(amount));
    } else {
      usdValue = await priceService.tokenToUsd(token!, parseFloat(amount));
    }
  } catch {
    // Price unavailable, log as null
  }

  // Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId,
      apiKeyId,
      actionType: 'transfer',
      requestData: {
        to,
        amount,
        token: token ?? 'ETH',
        usdValue,
      },
      status: policyResult.verdict === 'allow' ? 'PENDING' : 'DENIED',
    },
  });

  // Handle policy verdict
  if (policyResult.verdict === 'deny') {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'DENIED',
        responseData: { reason: policyResult.triggeredPolicy?.reason },
      },
    });

    return {
      txHash: '',
      status: 'denied',
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  if (policyResult.verdict === 'require_approval') {
    const pendingApproval = await prisma.pendingApproval.create({
      data: {
        transactionLogId: txLog.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min timeout
      },
    });

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: { status: 'PENDING' },
    });

    // Send Telegram approval request (fire-and-forget)
    sendApprovalRequest(pendingApproval.id).catch((err) =>
      console.error('Failed to send approval request:', err)
    );

    return {
      txHash: '',
      status: 'pending_approval',
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  // Execute the transfer
  try {
    let result;

    if (isNativeEth) {
      result = await zerodev.executeTransfer({
        privateKey: wallet.privateKey,
        chainId: wallet.chainId,
        to: to as Address,
        value: parseEther(amount),
      });
    } else {
      // Get token decimals for proper amount conversion
      const decimals = await zerodev.getTokenDecimals(
        token as Address,
        wallet.chainId
      );

      result = await zerodev.executeTransfer({
        privateKey: wallet.privateKey,
        chainId: wallet.chainId,
        to: to as Address,
        tokenAddress: token as Address,
        tokenAmount: parseUnits(amount, decimals),
      });
    }

    // Update transaction log with success
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'EXECUTED',
        txHash: result.txHash,
        responseData: {
          txHash: result.txHash,
          smartAccountAddress: result.smartAccountAddress,
        },
      },
    });

    return {
      txHash: result.txHash,
      status: 'executed',
      smartAccountAddress: result.smartAccountAddress,
      transactionLogId: txLog.id,
    };
  } catch (error) {
    // Update transaction log with failure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: { error: errorMessage },
      },
    });

    throw new AppError('TX_FAILED', `Transfer failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Send Transaction
// ============================================================

export async function executeSendTransaction(
  input: SendTransactionInput
): Promise<SendTransactionOutput> {
  const { secretId, apiKeyId, to, data, value } = input;
  const wallet = await getWalletData(secretId);

  // Check subscription for mainnet
  const subCheck = await gasService.checkSubscriptionForChain(wallet.userId, wallet.chainId);
  if (!subCheck.allowed) {
    throw new AppError('SUBSCRIPTION_REQUIRED', subCheck.reason!, 402);
  }

  // Extract function selector (first 4 bytes of calldata)
  const functionSelector = data.length >= 10 ? data.slice(0, 10) : undefined;

  // Build policy check action
  const policyAction: PolicyCheckAction = {
    type: 'send_transaction',
    to: to.toLowerCase(),
    value: value ? parseFloat(value) : 0,
    functionSelector,
  };

  // Check policies
  const policyResult = await checkPolicies(secretId, policyAction);

  // Compute USD value
  let usdValue: number | null = null;
  try {
    if (value) {
      usdValue = await priceService.ethToUsd(parseFloat(value));
    } else {
      usdValue = 0;
    }
  } catch {
    // Price unavailable
  }

  // Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId,
      apiKeyId,
      actionType: 'send_transaction',
      requestData: {
        to,
        data,
        value: value ?? '0',
        functionSelector,
        usdValue,
      },
      status: 'PENDING',
    },
  });

  // Handle policy verdict
  if (policyResult.verdict === 'deny') {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'DENIED',
        responseData: { reason: policyResult.triggeredPolicy?.reason },
      },
    });

    return {
      txHash: null,
      status: 'denied',
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  if (policyResult.verdict === 'require_approval') {
    const pendingApproval = await prisma.pendingApproval.create({
      data: {
        transactionLogId: txLog.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    // Send Telegram approval request (fire-and-forget)
    sendApprovalRequest(pendingApproval.id).catch((err) =>
      console.error('Failed to send approval request:', err)
    );

    return {
      txHash: null,
      status: 'pending_approval',
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  // Execute the transaction
  try {
    const result = await zerodev.executeSendTransaction({
      privateKey: wallet.privateKey,
      chainId: wallet.chainId,
      to: to as Address,
      data: data as Hex,
      value: value ? parseEther(value) : 0n,
    });

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'EXECUTED',
        txHash: result.txHash,
        responseData: {
          txHash: result.txHash,
          smartAccountAddress: result.smartAccountAddress,
        },
      },
    });

    return {
      txHash: result.txHash,
      status: 'executed',
      smartAccountAddress: result.smartAccountAddress,
      transactionLogId: txLog.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: { error: errorMessage },
      },
    });

    throw new AppError('TX_FAILED', `Transaction failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Read-Only Functions
// ============================================================

export async function getBalance(
  secretId: string,
  tokenAddresses?: string[]
): Promise<BalanceOutput> {
  const wallet = await getWalletData(secretId);

  const eth = await zerodev.getEthBalance(
    wallet.smartAccountAddress,
    wallet.chainId
  );

  const result: BalanceOutput = {
    address: wallet.smartAccountAddress,
    chainId: wallet.chainId,
    eth,
  };

  if (tokenAddresses && tokenAddresses.length > 0) {
    result.tokens = await Promise.all(
      tokenAddresses.map(async (addr) => {
        const tokenBalance = await zerodev.getErc20Balance(
          wallet.smartAccountAddress,
          addr as Address,
          wallet.chainId
        );
        return {
          address: addr,
          ...tokenBalance,
        };
      })
    );
  }

  return result;
}

export async function getAddress(secretId: string): Promise<AddressOutput> {
  const wallet = await getWalletData(secretId);

  return {
    smartAccountAddress: wallet.smartAccountAddress,
    chainId: wallet.chainId,
  };
}
