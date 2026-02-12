import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import prisma from '../db/client.js';
import { env } from '../utils/env.js';
import { findDeploymentByWalletAddress } from './depositWallet.service.js';
import { addCryptoCredit } from './openclaw.service.js';

// USDC on Base (6 decimals)
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const USDC_DECIMALS = 6;
const POLLER_NAME = 'usdc_deposit_base';
const CONFIRMATION_BLOCKS = 5n;
const MAX_BLOCK_RANGE = 2000n;

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

let pollerTimer: ReturnType<typeof setInterval> | null = null;

function getPublicClient() {
  const alchemyKey = env.ALCHEMY_API_KEY;
  const rpcUrl = alchemyKey
    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://mainnet.base.org';

  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

/**
 * Start the USDC deposit poller background worker.
 * Monitors Base chain for USDC transfers to the configured deposit address.
 */
export function startDepositPoller(): void {
  if (pollerTimer) return;

  if (!env.USDC_DEPOSIT_ADDRESS) {
    console.log('[deposits] No USDC_DEPOSIT_ADDRESS configured, skipping deposit poller');
    return;
  }

  const intervalMs = env.USDC_DEPOSIT_POLL_INTERVAL_MS;
  console.log(
    `[deposits] Starting USDC deposit poller (every ${intervalMs / 1000}s) — watching ${env.USDC_DEPOSIT_ADDRESS}`
  );

  // Run once immediately, then on interval
  pollDeposits().catch((err) => {
    console.error('[deposits] Initial poll failed:', err);
  });

  pollerTimer = setInterval(() => {
    pollDeposits().catch((err) => {
      console.error('[deposits] Poll cycle failed:', err);
    });
  }, intervalMs);
}

/**
 * Stop the USDC deposit poller.
 */
export function stopDepositPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log('[deposits] USDC deposit poller stopped');
  }
}

/**
 * Execute one poll cycle: query Base chain for USDC Transfer events
 * to the deposit address, attribute them to deployments, and credit balances.
 */
export async function pollDeposits(): Promise<void> {
  const depositAddress = env.USDC_DEPOSIT_ADDRESS;
  if (!depositAddress) return;

  const client = getPublicClient();
  const currentBlock = await client.getBlockNumber();
  const safeBlock = currentBlock - CONFIRMATION_BLOCKS;

  // Get or initialize poller state
  let pollerState = await prisma.pollerState.findUnique({
    where: { pollerName: POLLER_NAME },
  });

  let fromBlock: bigint;
  if (pollerState) {
    fromBlock = BigInt(pollerState.lastBlockNumber) + 1n;
  } else {
    // First run: start from ~1000 blocks ago (roughly 30 min on Base)
    fromBlock = safeBlock > 1000n ? safeBlock - 1000n : 0n;
    console.log(`[deposits] First run — starting from block ${fromBlock}`);
  }

  if (fromBlock > safeBlock) {
    // Already caught up
    return;
  }

  // Cap the range to avoid huge log queries
  const toBlock = fromBlock + MAX_BLOCK_RANGE < safeBlock
    ? fromBlock + MAX_BLOCK_RANGE
    : safeBlock;

  // Query for USDC Transfer events to the deposit address
  const logs = await client.getLogs({
    address: BASE_USDC_ADDRESS,
    event: transferEvent,
    args: {
      to: depositAddress as `0x${string}`,
    },
    fromBlock,
    toBlock,
  });

  if (logs.length > 0) {
    console.log(`[deposits] Found ${logs.length} USDC transfer(s) in blocks ${fromBlock}–${toBlock}`);
  }

  for (const log of logs) {
    await processTransferLog(log);
  }

  // Update poller state
  await prisma.pollerState.upsert({
    where: { pollerName: POLLER_NAME },
    update: { lastBlockNumber: toBlock },
    create: { pollerName: POLLER_NAME, lastBlockNumber: toBlock },
  });
}

async function processTransferLog(log: any) {
  const txHash = log.transactionHash;
  const blockNumber = log.blockNumber;
  const args = log as any;
  const from = (args.args?.from as string)?.toLowerCase();
  const value = args.args?.value as bigint;

  if (!from || !value) return;

  // Convert USDC amount (6 decimals) to a number
  const amountUsdc = Number(value) / 10 ** USDC_DECIMALS;

  if (amountUsdc <= 0) return;

  // Look up which deployment this sender address is registered to
  const match = await findDeploymentByWalletAddress(from);

  if (!match) {
    console.log(
      `[deposits] Unattributed USDC deposit: ${amountUsdc} USDC from ${from} (tx: ${txHash})`
    );
    return;
  }

  try {
    const result = await addCryptoCredit(
      match.deploymentId,
      amountUsdc,
      txHash,
      blockNumber,
      from,
      amountUsdc
    );

    if (result.success) {
      console.log(
        `[deposits] Credited ${amountUsdc} USDC to deployment ${match.deploymentId} (tx: ${txHash}). New balance: $${result.newBalanceUsd.toFixed(2)}`
      );
    }
  } catch (err: any) {
    // Unique constraint violation = already processed (idempotent)
    if (err?.code === 'P2002') {
      return;
    }
    console.error(`[deposits] Failed to credit deposit (tx: ${txHash}):`, err);
  }
}
