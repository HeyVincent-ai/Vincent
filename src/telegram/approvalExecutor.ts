import { type Hex, type Address, parseEther, parseUnits } from 'viem';
import prisma from '../db/client';
import * as zerodev from '../skills/zerodev.service';
import * as zeroExService from '../skills/zeroEx.service';

/**
 * Execute a transaction that has been approved via Telegram.
 * Re-reads the secret/wallet data and executes based on the TransactionLog.
 */
export async function executeApprovedTransaction(
  txLog: { id: string; secretId: string; actionType: string; requestData: unknown }
): Promise<{ txHash: string }> {
  const secret = await prisma.secret.findFirst({
    where: { id: txLog.secretId, deletedAt: null },
    include: { walletMetadata: true },
  });

  if (!secret || !secret.value || !secret.walletMetadata) {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: { status: 'FAILED', responseData: { error: 'Wallet not found or missing data' } },
    });
    throw new Error('Wallet not found or missing data');
  }

  const privateKey = secret.value as Hex;
  const requestData = txLog.requestData as Record<string, unknown>;
  const chainId = requestData.chainId as number;

  try {
    let result: { txHash: string; smartAccountAddress: string };

    if (txLog.actionType === 'transfer') {
      const to = requestData.to as string;
      const amount = requestData.amount as string;
      const token = requestData.token as string | undefined;
      const isNativeEth = !token || token.toUpperCase() === 'ETH';

      if (isNativeEth) {
        result = await zerodev.executeTransfer({
          privateKey,
          chainId,
          to: to as Address,
          value: parseEther(amount),
        });
      } else {
        const decimals = await zerodev.getTokenDecimals(token as Address, chainId);
        result = await zerodev.executeTransfer({
          privateKey,
          chainId,
          to: to as Address,
          tokenAddress: token as Address,
          tokenAmount: parseUnits(amount, decimals),
        });
      }
    } else if (txLog.actionType === 'send_transaction') {
      const to = requestData.to as string;
      const data = requestData.data as string;
      const value = requestData.value as string | undefined;

      result = await zerodev.executeSendTransaction({
        privateKey,
        chainId,
        to: to as Address,
        data: data as Hex,
        value: value ? parseEther(value) : 0n,
      });
    } else if (txLog.actionType === 'swap') {
      const sellToken = requestData.sellToken as string;
      const buyToken = requestData.buyToken as string;
      const sellAmount = requestData.sellAmount as string;
      const slippageBps = (requestData.slippageBps as number) ?? 100;

      // Re-fetch a fresh quote (0x quotes expire quickly)
      const sellAmountWei = requestData.sellAmountWei as string;
      const takerAddress = secret.walletMetadata!.smartAccountAddress;
      const quote = await zeroExService.getQuote({
        sellToken,
        buyToken,
        sellAmount: sellAmountWei,
        takerAddress,
        chainId,
        slippageBps,
      });

      if (!quote.transaction) {
        throw new Error('0x quote did not return transaction data');
      }

      const isNativeSell = zeroExService.isNativeToken(sellToken);
      const calls: Array<{ to: Address; data: `0x${string}`; value: bigint }> = [];

      if (!isNativeSell) {
        const approvalData = zeroExService.buildApprovalData(
          sellToken as Address,
          quote.allowanceTarget as Address
        );
        calls.push(approvalData);
      }

      calls.push({
        to: quote.transaction.to as Address,
        data: quote.transaction.data as `0x${string}`,
        value: BigInt(quote.transaction.value),
      });

      if (calls.length === 1) {
        result = await zerodev.executeSendTransaction({
          privateKey,
          chainId,
          to: calls[0].to,
          data: calls[0].data,
          value: calls[0].value,
        });
      } else {
        result = await zerodev.executeBatchTransaction({
          privateKey,
          chainId,
          calls,
        });
      }
    } else {
      throw new Error(`Unknown action type: ${txLog.actionType}`);
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

    return { txHash: result.txHash };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'FAILED',
        responseData: { error: errorMessage },
      },
    });
    throw error;
  }
}
