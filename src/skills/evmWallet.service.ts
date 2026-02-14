import { type Hex, type Address, parseEther, parseUnits } from 'viem';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker.js';
import * as priceService from '../services/price.service.js';
import * as zerodev from './zerodev.service.js';
import * as zeroExService from './zeroEx.service.js';
import * as gasService from './gas.service.js';
import * as alchemyService from './alchemy.service.js';
import { sendApprovalRequest } from '../telegram/index.js';
import { getExplorerTxUrl } from '../config/chains.js';

// ============================================================
// Types
// ============================================================

export interface TransferInput {
  secretId: string;
  apiKeyId?: string;
  to: string;
  amount: string; // Human-readable amount (e.g. "0.1" for ETH, "100" for tokens)
  token?: string; // Token address, or "ETH" / undefined for native ETH
  chainId: number;
}

export interface TransferOutput {
  txHash: string;
  status: 'executed' | 'pending_approval' | 'denied';
  smartAccountAddress: string;
  reason?: string;
  transactionLogId: string;
  explorerUrl?: string;
}

export interface SendTransactionInput {
  secretId: string;
  apiKeyId?: string;
  to: string;
  data: string; // Hex-encoded calldata
  value?: string; // ETH value in ether (e.g. "0.1")
  chainId: number;
}

export interface SendTransactionOutput {
  txHash: string | null;
  status: 'executed' | 'pending_approval' | 'denied';
  smartAccountAddress: string;
  reason?: string;
  transactionLogId: string;
  explorerUrl?: string;
}

export interface AddressOutput {
  smartAccountAddress: string;
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
    userId: secret.userId,
    createdAt: secret.createdAt,
    canTakeOwnership: secret.walletMetadata.canTakeOwnership,
    ownershipTransferred: secret.walletMetadata.ownershipTransferred,
    sessionKeyData: secret.walletMetadata.sessionKeyData,
  };
}

/**
 * Track which chains have been used for transactions.
 * This is needed for ownership transfer - we need to execute recovery on all chains
 * where the wallet has been deployed/used.
 */
async function trackChainUsage(secretId: string, chainId: number): Promise<void> {
  await prisma.walletSecretMetadata.updateMany({
    where: {
      secretId,
      NOT: {
        chainsUsed: {
          has: chainId,
        },
      },
    },
    data: {
      chainsUsed: {
        push: chainId,
      },
    },
  });
}

/**
 * Get smartAccountAddress for ZeroDev execution calls.
 * Only wallets created with session key initConfig (canTakeOwnership=true) should
 * pass their address, as it triggers initConfig reconstruction in getKernelClient.
 * Legacy wallets were created without this initConfig, so passing their address
 * would cause counterfactual address mismatches on undeployed chains.
 */
function getSmartAccountAddressForExec(wallet: {
  smartAccountAddress: Address;
  canTakeOwnership: boolean;
}): Address | undefined {
  return wallet.canTakeOwnership ? wallet.smartAccountAddress : undefined;
}

/**
 * Get sessionKeyData for post-ownership-transfer signing.
 * Throws if ownership was transferred but no session key exists (legacy account).
 */
function getSessionKeyForSigning(wallet: {
  ownershipTransferred: boolean;
  sessionKeyData: string | null;
}): string | undefined {
  if (!wallet.ownershipTransferred) return undefined;
  if (!wallet.sessionKeyData) {
    throw new AppError(
      'LEGACY_ACCOUNT',
      'This wallet was created before session key support. Backend signing is not available after ownership transfer.',
      400
    );
  }
  return wallet.sessionKeyData;
}

// ============================================================
// Transfer
// ============================================================

export async function executeTransfer(input: TransferInput): Promise<TransferOutput> {
  const { secretId, apiKeyId, to, amount, token, chainId } = input;
  const wallet = await getWalletData(secretId);

  // Check subscription for mainnet
  const subCheck = await gasService.checkSubscriptionForChain(
    wallet.userId,
    chainId,
    wallet.createdAt
  );
  if (!subCheck.allowed) {
    throw new AppError('SUBSCRIPTION_REQUIRED', subCheck.reason!, 402);
  }

  const isNativeEth = !token || token.toUpperCase() === 'ETH';

  // Build policy check action
  const policyAction: PolicyCheckAction = {
    type: 'transfer',
    to: to.toLowerCase(),
    chainId,
  };

  if (isNativeEth) {
    policyAction.value = parseFloat(amount);
  } else {
    policyAction.tokenAddress = token!.toLowerCase();
    policyAction.tokenAmount = parseFloat(amount);
    // Fetch token symbol for stablecoin price fallback
    try {
      policyAction.tokenSymbol = await zerodev.getTokenSymbol(token! as Address, chainId);
    } catch {
      // Non-critical — price service will still try other resolution methods
    }
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
        chainId,
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
        chainId: chainId,
        to: to as Address,
        value: parseEther(amount),
        sessionKeyData: getSessionKeyForSigning(wallet),
        smartAccountAddress: getSmartAccountAddressForExec(wallet),
      });
    } else {
      // Get token decimals for proper amount conversion
      const decimals = await zerodev.getTokenDecimals(token as Address, chainId);

      result = await zerodev.executeTransfer({
        privateKey: wallet.privateKey,
        chainId: chainId,
        to: to as Address,
        tokenAddress: token as Address,
        tokenAmount: parseUnits(amount, decimals),
        sessionKeyData: getSessionKeyForSigning(wallet),
        smartAccountAddress: getSmartAccountAddressForExec(wallet),
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

    // Track chain usage for ownership transfer
    await trackChainUsage(secretId, chainId);

    return {
      txHash: result.txHash,
      status: 'executed',
      smartAccountAddress: result.smartAccountAddress,
      transactionLogId: txLog.id,
      explorerUrl: getExplorerTxUrl(chainId, result.txHash),
    };
  } catch (error) {
    // Update transaction log with failure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error instanceof AppError ? error.code : 'TX_FAILED';
    // Safely serialize error details for JSON storage
    const errorDetails =
      error instanceof AppError && error.details
        ? JSON.parse(JSON.stringify(error.details))
        : undefined;

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: {
          error: errorMessage,
          code: errorCode,
          ...(errorDetails && { details: errorDetails }),
        },
      },
    });

    // Re-throw AppErrors directly to preserve detailed error info
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('TX_FAILED', `Transfer failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Send Transaction
// ============================================================

export async function executeSendTransaction(
  input: SendTransactionInput
): Promise<SendTransactionOutput> {
  const { secretId, apiKeyId, to, data, value, chainId } = input;
  const wallet = await getWalletData(secretId);

  // Check subscription for mainnet
  const subCheck = await gasService.checkSubscriptionForChain(
    wallet.userId,
    chainId,
    wallet.createdAt
  );
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
    chainId,
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
        chainId,
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
      chainId: chainId,
      to: to as Address,
      data: data as Hex,
      value: value ? parseEther(value) : 0n,
      sessionKeyData: getSessionKeyForSigning(wallet),
      smartAccountAddress: getSmartAccountAddressForExec(wallet),
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

    // Track chain usage for ownership transfer
    await trackChainUsage(secretId, chainId);

    return {
      txHash: result.txHash,
      status: 'executed',
      smartAccountAddress: result.smartAccountAddress,
      transactionLogId: txLog.id,
      explorerUrl: getExplorerTxUrl(chainId, result.txHash),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error instanceof AppError ? error.code : 'TX_FAILED';
    // Safely serialize error details for JSON storage
    const errorDetails =
      error instanceof AppError && error.details
        ? JSON.parse(JSON.stringify(error.details))
        : undefined;

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: {
          error: errorMessage,
          code: errorCode,
          ...(errorDetails && { details: errorDetails }),
        },
      },
    });

    // Re-throw AppErrors directly to preserve detailed error info
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('TX_FAILED', `Transaction failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Read-Only Functions
// ============================================================

export async function getAddress(secretId: string): Promise<AddressOutput> {
  const wallet = await getWalletData(secretId);

  return {
    smartAccountAddress: wallet.smartAccountAddress,
  };
}

// ============================================================
// Portfolio Balances (Alchemy)
// ============================================================

export async function getPortfolioBalances(secretId: string, chainIds?: number[]) {
  const wallet = await getWalletData(secretId);
  const portfolio = await alchemyService.getPortfolioBalances(wallet.smartAccountAddress, chainIds);

  return {
    address: wallet.smartAccountAddress,
    tokens: portfolio.tokens,
  };
}

// ============================================================
// Swap Types
// ============================================================

export interface SwapPreviewInput {
  secretId: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string; // Human-readable amount (e.g. "0.1" for 0.1 ETH)
  chainId: number;
  slippageBps?: number;
}

export interface SwapPreviewOutput {
  sellToken: string;
  buyToken: string;
  sellAmount: string; // In wei
  buyAmount: string; // In wei
  minBuyAmount: string;
  route: Array<{ source: string; proportion: string }>;
  gasEstimate: string;
  fees: {
    integratorFee: string | null;
    zeroExFee: string | null;
  };
  liquidityAvailable: boolean;
  smartAccountAddress: string;
}

export interface SwapExecuteInput {
  secretId: string;
  apiKeyId?: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string; // Human-readable amount
  chainId: number;
  slippageBps?: number;
}

export interface SwapExecuteOutput {
  txHash: string | null;
  status: 'executed' | 'pending_approval' | 'denied';
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  smartAccountAddress: string;
  reason?: string;
  transactionLogId: string;
  explorerUrl?: string;
}

// ============================================================
// Swap Preview
// ============================================================

export async function previewSwap(input: SwapPreviewInput): Promise<SwapPreviewOutput> {
  const { secretId, sellToken, buyToken, sellAmount, chainId, slippageBps } = input;
  const wallet = await getWalletData(secretId);

  // Convert human-readable amount to wei
  const sellAmountWei = await tokenAmountToWei(sellToken, sellAmount, chainId);

  const price = await zeroExService.getPrice({
    sellToken,
    buyToken,
    sellAmount: sellAmountWei,
    takerAddress: wallet.smartAccountAddress,
    chainId,
    slippageBps,
  });

  const route = price.route.fills.map((fill) => ({
    source: fill.source,
    proportion: `${(Number(fill.proportionBps) / 100).toFixed(1)}%`,
  }));

  return {
    sellToken: price.sellToken,
    buyToken: price.buyToken,
    sellAmount: price.sellAmount,
    buyAmount: price.buyAmount,
    minBuyAmount: price.minBuyAmount,
    route,
    gasEstimate: price.gas,
    fees: {
      integratorFee: price.fees?.integratorFee?.amount ?? null,
      zeroExFee: price.fees?.zeroExFee?.amount ?? null,
    },
    liquidityAvailable: price.liquidityAvailable,
    smartAccountAddress: wallet.smartAccountAddress,
  };
}

// ============================================================
// Swap Execute
// ============================================================

export async function executeSwap(input: SwapExecuteInput): Promise<SwapExecuteOutput> {
  const { secretId, apiKeyId, sellToken, buyToken, sellAmount, chainId, slippageBps } = input;
  const wallet = await getWalletData(secretId);

  // Check subscription for mainnet
  const subCheck = await gasService.checkSubscriptionForChain(
    wallet.userId,
    chainId,
    wallet.createdAt
  );
  if (!subCheck.allowed) {
    throw new AppError('SUBSCRIPTION_REQUIRED', subCheck.reason!, 402);
  }

  // Convert human-readable amount to wei
  const sellAmountWei = await tokenAmountToWei(sellToken, sellAmount, chainId);

  // Get quote from 0x
  const quote = await zeroExService.getQuote({
    sellToken,
    buyToken,
    sellAmount: sellAmountWei,
    takerAddress: wallet.smartAccountAddress,
    chainId,
    slippageBps,
  });

  if (!quote.liquidityAvailable) {
    throw new AppError('NO_LIQUIDITY', 'No liquidity available for this swap', 400);
  }

  if (!quote.transaction) {
    throw new AppError('NO_TX_DATA', 'No transaction data returned from 0x API', 502);
  }

  // Compute USD value of the sell side for policy checks
  let usdValue: number | null = null;
  try {
    if (zeroExService.isNativeToken(sellToken)) {
      usdValue = await priceService.ethToUsd(parseFloat(sellAmount));
    } else {
      usdValue = await priceService.tokenToUsd(sellToken, parseFloat(sellAmount));
    }
  } catch {
    // Price unavailable
  }

  // Build policy check action - swaps are treated as send_transaction
  // The "to" is the 0x exchange proxy, value is the sell amount
  const policyAction: PolicyCheckAction = {
    type: 'send_transaction',
    to: quote.transaction.to.toLowerCase(),
    value: zeroExService.isNativeToken(sellToken) ? parseFloat(sellAmount) : 0,
    functionSelector: quote.transaction.data.slice(0, 10),
    chainId,
  };

  // Also check token allowlists for both sell and buy tokens (as transfer policy)
  // We use a transfer-type check for token restrictions
  const sellTokenPolicyAction: PolicyCheckAction = {
    type: 'transfer',
    to: quote.transaction.to.toLowerCase(),
    tokenAddress: zeroExService.isNativeToken(sellToken) ? undefined : sellToken.toLowerCase(),
    tokenAmount: parseFloat(sellAmount),
    chainId,
  };

  // Check policies - check both the send_transaction policies and transfer token policies
  const policyResult = await checkPolicies(secretId, policyAction);
  if (policyResult.verdict === 'allow') {
    // Also check token-level policies if selling an ERC20
    if (!zeroExService.isNativeToken(sellToken)) {
      const tokenPolicyResult = await checkPolicies(secretId, sellTokenPolicyAction);
      if (tokenPolicyResult.verdict !== 'allow') {
        return handlePolicyVerdict(
          tokenPolicyResult,
          wallet,
          secretId,
          apiKeyId,
          input,
          usdValue,
          quote
        );
      }
    }
  }
  if (policyResult.verdict !== 'allow') {
    return handlePolicyVerdict(policyResult, wallet, secretId, apiKeyId, input, usdValue, quote);
  }

  // Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId,
      apiKeyId,
      actionType: 'swap',
      requestData: {
        sellToken,
        buyToken,
        sellAmount,
        sellAmountWei,
        chainId,
        slippageBps,
        usdValue,
        buyAmount: quote.buyAmount,
      },
      status: 'PENDING',
    },
  });

  // Execute the swap
  try {
    const isNativeSell = zeroExService.isNativeToken(sellToken);

    // Build call array: [optional ERC20 approval, swap tx]
    const calls: Array<{ to: Address; data: `0x${string}`; value: bigint }> = [];

    if (!isNativeSell) {
      // Need ERC20 approval for the allowance target
      const approvalData = zeroExService.buildApprovalData(
        sellToken as Address,
        quote.allowanceTarget as Address
      );
      calls.push(approvalData);
    }

    // Swap transaction
    calls.push({
      to: quote.transaction.to as Address,
      data: quote.transaction.data as `0x${string}`,
      value: BigInt(quote.transaction.value),
    });

    let result;
    if (calls.length === 1) {
      // Single call (native ETH swap)
      result = await zerodev.executeSendTransaction({
        privateKey: wallet.privateKey,
        chainId,
        to: calls[0].to,
        data: calls[0].data,
        value: calls[0].value,
        sessionKeyData: getSessionKeyForSigning(wallet),
        smartAccountAddress: getSmartAccountAddressForExec(wallet),
      });
    } else {
      // Batch call (approval + swap)
      result = await zerodev.executeBatchTransaction({
        privateKey: wallet.privateKey,
        chainId,
        calls,
        sessionKeyData: getSessionKeyForSigning(wallet),
        smartAccountAddress: getSmartAccountAddressForExec(wallet),
      });
    }

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'EXECUTED',
        txHash: result.txHash,
        responseData: {
          txHash: result.txHash,
          smartAccountAddress: result.smartAccountAddress,
          buyAmount: quote.buyAmount,
        },
      },
    });

    // Track chain usage for ownership transfer
    await trackChainUsage(secretId, chainId);

    return {
      txHash: result.txHash,
      status: 'executed',
      sellToken: quote.sellToken,
      buyToken: quote.buyToken,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      smartAccountAddress: result.smartAccountAddress,
      transactionLogId: txLog.id,
      explorerUrl: getExplorerTxUrl(chainId, result.txHash),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error instanceof AppError ? error.code : 'TX_FAILED';
    // Safely serialize error details for JSON storage
    const errorDetails =
      error instanceof AppError && error.details
        ? JSON.parse(JSON.stringify(error.details))
        : undefined;

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: {
          error: errorMessage,
          code: errorCode,
          ...(errorDetails && { details: errorDetails }),
        },
      },
    });

    // Re-throw AppErrors directly to preserve detailed error info
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('TX_FAILED', `Swap failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Swap Helpers
// ============================================================

async function handlePolicyVerdict(
  policyResult: { verdict: string; triggeredPolicy?: { reason: string } },
  wallet: { smartAccountAddress: string; privateKey: Hex },
  secretId: string,
  apiKeyId: string | undefined,
  input: SwapExecuteInput,
  usdValue: number | null,
  quote: zeroExService.ZeroExQuote
): Promise<SwapExecuteOutput> {
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId,
      apiKeyId,
      actionType: 'swap',
      requestData: {
        sellToken: input.sellToken,
        buyToken: input.buyToken,
        sellAmount: input.sellAmount,
        chainId: input.chainId,
        slippageBps: input.slippageBps,
        usdValue,
        buyAmount: quote.buyAmount,
      },
      status: policyResult.verdict === 'deny' ? 'DENIED' : 'PENDING',
      responseData:
        policyResult.verdict === 'deny'
          ? { reason: policyResult.triggeredPolicy?.reason }
          : undefined,
    },
  });

  if (policyResult.verdict === 'require_approval') {
    const pendingApproval = await prisma.pendingApproval.create({
      data: {
        transactionLogId: txLog.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    sendApprovalRequest(pendingApproval.id).catch((err) =>
      console.error('Failed to send approval request:', err)
    );

    return {
      txHash: null,
      status: 'pending_approval',
      sellToken: quote.sellToken,
      buyToken: quote.buyToken,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  // Denied
  return {
    txHash: null,
    status: 'denied',
    sellToken: quote.sellToken,
    buyToken: quote.buyToken,
    sellAmount: quote.sellAmount,
    buyAmount: quote.buyAmount,
    smartAccountAddress: wallet.smartAccountAddress,
    reason: policyResult.triggeredPolicy?.reason,
    transactionLogId: txLog.id,
  };
}

async function tokenAmountToWei(
  tokenAddress: string,
  amount: string,
  chainId: number
): Promise<string> {
  if (zeroExService.isNativeToken(tokenAddress) || tokenAddress.toUpperCase() === 'ETH') {
    return parseEther(amount).toString();
  }

  const decimals = await zerodev.getTokenDecimals(tokenAddress as Address, chainId);
  return parseUnits(amount, decimals).toString();
}
