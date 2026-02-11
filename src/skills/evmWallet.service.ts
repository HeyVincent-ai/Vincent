import { type Hex, type Address, parseEther, parseUnits } from 'viem';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker.js';
import * as priceService from '../services/price.service.js';
import * as zerodev from './zerodev.service.js';
import * as zeroExService from './zeroEx.service.js';
import * as relayService from './relay.service.js';
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
  };
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
// Fund Types
// ============================================================

export interface FundPreviewInput {
  secretId: string;
  tokenIn: string;
  sourceChainId: number;
  depositChainId: number;
  depositWalletAddress: string;
  tokenInAmount: string;
  tokenOut: string;
  slippage?: number;
}

export interface FundPreviewOutput {
  isSimpleTransfer: boolean;
  tokenIn: string;
  tokenOut: string;
  sourceChainId: number;
  depositChainId: number;
  depositWalletAddress: string;
  amountIn: string;
  amountOut: string;
  route?: string;
  timeEstimate?: number;
  fees: {
    gas: string;
    relayer?: string;
    total: string;
  };
  smartAccountAddress: string;
  balanceCheck: {
    sufficient: boolean;
    currentBalance: string;
    requiredBalance: string;
    tokenSymbol: string;
  };
}

export interface FundExecuteInput {
  secretId: string;
  apiKeyId?: string;
  tokenIn: string;
  sourceChainId: number;
  depositChainId: number;
  depositWalletAddress: string;
  tokenInAmount: string;
  tokenOut: string;
  slippage?: number;
}

export interface FundExecuteOutput {
  txHash: string | null;
  status: 'executed' | 'pending_approval' | 'denied' | 'cross_chain_pending';
  isSimpleTransfer: boolean;
  relayRequestId?: string;
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
      });
    } else {
      // Batch call (approval + swap)
      result = await zerodev.executeBatchTransaction({
        privateKey: wallet.privateKey,
        chainId,
        calls,
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

// ============================================================
// Fund Preview
// ============================================================

export async function previewFund(input: FundPreviewInput): Promise<FundPreviewOutput> {
  const wallet = await getWalletData(input.secretId);

  // Balance check
  const { balance: currentBalance, symbol: tokenSymbol } = await getTokenBalance(
    wallet.smartAccountAddress,
    input.tokenIn,
    input.sourceChainId
  );
  const sufficient = parseFloat(currentBalance) >= parseFloat(input.tokenInAmount);

  // Simple transfer: same token + same chain
  const isSimpleTransfer =
    input.tokenIn.toLowerCase() === input.tokenOut.toLowerCase() &&
    input.sourceChainId === input.depositChainId;

  const balanceCheck = {
    sufficient,
    currentBalance,
    requiredBalance: input.tokenInAmount,
    tokenSymbol,
  };

  if (isSimpleTransfer) {
    return {
      isSimpleTransfer: true,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      sourceChainId: input.sourceChainId,
      depositChainId: input.depositChainId,
      depositWalletAddress: input.depositWalletAddress,
      amountIn: input.tokenInAmount,
      amountOut: input.tokenInAmount, // 1:1 for simple transfer
      fees: { gas: '0', total: '0' }, // Gas sponsored by paymaster
      smartAccountAddress: wallet.smartAccountAddress,
      balanceCheck,
    };
  }

  // Cross-chain: get Relay quote
  const amountWei = await tokenAmountToWei(input.tokenIn, input.tokenInAmount, input.sourceChainId);

  const quote = await relayService.getQuote({
    user: wallet.smartAccountAddress,
    originChainId: input.sourceChainId,
    destinationChainId: input.depositChainId,
    originCurrency: relayService.normalizeTokenAddress(input.tokenIn),
    destinationCurrency: relayService.normalizeTokenAddress(input.tokenOut),
    amount: amountWei,
    tradeType: 'EXACT_INPUT',
    recipient: input.depositWalletAddress,
    slippageTolerance: input.slippage?.toString(),
  });

  return {
    isSimpleTransfer: false,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    sourceChainId: input.sourceChainId,
    depositChainId: input.depositChainId,
    depositWalletAddress: input.depositWalletAddress,
    amountIn: amountWei,
    amountOut: quote.details.currencyOut.amount,
    route: quote.details.operation,
    timeEstimate: quote.details.timeEstimate,
    fees: {
      gas: quote.fees.gas?.amountFormatted ?? '0',
      relayer: quote.fees.relayer?.amountFormatted ?? '0',
      total: String(
        parseFloat(quote.fees.gas?.amountUsd ?? '0') +
          parseFloat(quote.fees.relayer?.amountUsd ?? '0')
      ),
    },
    smartAccountAddress: wallet.smartAccountAddress,
    balanceCheck,
  };
}

// ============================================================
// Fund Execute
// ============================================================

export async function executeFund(input: FundExecuteInput): Promise<FundExecuteOutput> {
  const wallet = await getWalletData(input.secretId);

  // Subscription check
  const subCheck = await gasService.checkSubscriptionForChain(
    wallet.userId,
    input.sourceChainId,
    wallet.createdAt
  );
  if (!subCheck.allowed) {
    throw new AppError('SUBSCRIPTION_REQUIRED', subCheck.reason!, 402);
  }

  // Preview + balance validation
  const preview = await previewFund({
    secretId: input.secretId,
    tokenIn: input.tokenIn,
    sourceChainId: input.sourceChainId,
    depositChainId: input.depositChainId,
    depositWalletAddress: input.depositWalletAddress,
    tokenInAmount: input.tokenInAmount,
    tokenOut: input.tokenOut,
    slippage: input.slippage,
  });

  if (!preview.balanceCheck.sufficient) {
    throw new AppError(
      'INSUFFICIENT_BALANCE',
      `Insufficient balance. Have ${preview.balanceCheck.currentBalance} ${preview.balanceCheck.tokenSymbol}, need ${preview.balanceCheck.requiredBalance}`,
      400
    );
  }

  // Policy check
  const policyAction: PolicyCheckAction = {
    type: preview.isSimpleTransfer ? 'transfer' : 'send_transaction',
    to: input.depositWalletAddress.toLowerCase(),
    chainId: input.sourceChainId,
  };

  if (!relayService.isNativeToken(input.tokenIn)) {
    policyAction.tokenAddress = input.tokenIn.toLowerCase();
    policyAction.tokenAmount = parseFloat(input.tokenInAmount);
    try {
      policyAction.tokenSymbol = await zerodev.getTokenSymbol(
        input.tokenIn as Address,
        input.sourceChainId
      );
    } catch {
      // Non-critical
    }
  } else {
    policyAction.value = parseFloat(input.tokenInAmount);
  }

  const policyResult = await checkPolicies(input.secretId, policyAction);

  // USD value for logging
  let usdValue: number | null = null;
  try {
    if (relayService.isNativeToken(input.tokenIn)) {
      usdValue = await priceService.ethToUsd(parseFloat(input.tokenInAmount));
    } else {
      usdValue = await priceService.tokenToUsd(input.tokenIn, parseFloat(input.tokenInAmount));
    }
  } catch {
    // Price unavailable
  }

  // Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId: input.secretId,
      apiKeyId: input.apiKeyId,
      actionType: 'fund',
      requestData: {
        tokenIn: input.tokenIn,
        tokenOut: input.tokenOut,
        sourceChainId: input.sourceChainId,
        depositChainId: input.depositChainId,
        depositWalletAddress: input.depositWalletAddress,
        tokenInAmount: input.tokenInAmount,
        slippage: input.slippage,
        usdValue,
        isSimpleTransfer: preview.isSimpleTransfer,
      },
      status: policyResult.verdict === 'allow' ? 'PENDING' : 'DENIED',
    },
  });

  // Handle deny
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
      isSimpleTransfer: preview.isSimpleTransfer,
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  // Handle require_approval
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
      isSimpleTransfer: preview.isSimpleTransfer,
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  // Execute
  try {
    if (preview.isSimpleTransfer) {
      // Direct transfer via executeTransfer
      const isNative = relayService.isNativeToken(input.tokenIn);

      let result;
      if (isNative) {
        result = await zerodev.executeTransfer({
          privateKey: wallet.privateKey,
          chainId: input.sourceChainId,
          to: input.depositWalletAddress as Address,
          value: parseEther(input.tokenInAmount),
        });
      } else {
        const decimals = await zerodev.getTokenDecimals(
          input.tokenIn as Address,
          input.sourceChainId
        );
        result = await zerodev.executeTransfer({
          privateKey: wallet.privateKey,
          chainId: input.sourceChainId,
          to: input.depositWalletAddress as Address,
          tokenAddress: input.tokenIn as Address,
          tokenAmount: parseUnits(input.tokenInAmount, decimals),
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
          },
        },
      });

      return {
        txHash: result.txHash,
        status: 'executed',
        isSimpleTransfer: true,
        smartAccountAddress: result.smartAccountAddress,
        transactionLogId: txLog.id,
        explorerUrl: getExplorerTxUrl(input.sourceChainId, result.txHash),
      };
    }

    // Cross-chain via Relay
    const amountWei = await tokenAmountToWei(
      input.tokenIn,
      input.tokenInAmount,
      input.sourceChainId
    );

    const quote = await relayService.getQuote({
      user: wallet.smartAccountAddress,
      originChainId: input.sourceChainId,
      destinationChainId: input.depositChainId,
      originCurrency: relayService.normalizeTokenAddress(input.tokenIn),
      destinationCurrency: relayService.normalizeTokenAddress(input.tokenOut),
      amount: amountWei,
      tradeType: 'EXACT_INPUT',
      recipient: input.depositWalletAddress,
      slippageTolerance: input.slippage?.toString(),
    });

    const calls = buildCallsFromRelaySteps(quote.steps);

    if (calls.length === 0) {
      throw new AppError('RELAY_NO_STEPS', 'Relay returned no executable transaction steps', 502);
    }

    const result =
      calls.length === 1
        ? await zerodev.executeSendTransaction({
            privateKey: wallet.privateKey,
            chainId: input.sourceChainId,
            to: calls[0].to,
            data: calls[0].data,
            value: calls[0].value,
          })
        : await zerodev.executeBatchTransaction({
            privateKey: wallet.privateKey,
            chainId: input.sourceChainId,
            calls,
          });

    const relayRequestId = quote.steps.find((s) => s.requestId)?.requestId;

    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'EXECUTED',
        txHash: result.txHash,
        responseData: {
          txHash: result.txHash,
          smartAccountAddress: result.smartAccountAddress,
          relayRequestId,
        },
      },
    });

    return {
      txHash: result.txHash,
      status: 'cross_chain_pending',
      isSimpleTransfer: false,
      relayRequestId,
      smartAccountAddress: result.smartAccountAddress,
      transactionLogId: txLog.id,
      explorerUrl: getExplorerTxUrl(input.sourceChainId, result.txHash),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error instanceof AppError ? error.code : 'TX_FAILED';
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

    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('TX_FAILED', `Fund failed: ${errorMessage}`, 500);
  }
}

// ============================================================
// Fund Helpers
// ============================================================

async function getTokenBalance(
  address: Address,
  token: string,
  chainId: number
): Promise<{ balance: string; symbol: string }> {
  const isNative = relayService.isNativeToken(token) || token.toUpperCase() === 'ETH';

  if (isNative) {
    const result = await zerodev.getEthBalance(address, chainId);
    return { balance: result.balance, symbol: 'ETH' };
  }

  const result = await zerodev.getErc20Balance(address, token as Address, chainId);
  return { balance: result.balance, symbol: result.symbol };
}

function buildCallsFromRelaySteps(
  steps: relayService.RelayStep[]
): Array<{ to: Address; data: Hex; value: bigint }> {
  const calls: Array<{ to: Address; data: Hex; value: bigint }> = [];
  for (const step of steps) {
    if (step.kind === 'transaction') {
      for (const item of step.items) {
        calls.push({
          to: item.data.to as Address,
          data: item.data.data as Hex,
          value: BigInt(item.data.value || '0'),
        });
      }
    }
  }
  return calls;
}
