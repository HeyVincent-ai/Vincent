/**
 * E2E Test: EVM Wallet Skill on Base Mainnet
 *
 * Tests all features from skills/wallet/SKILL.md against real Base mainnet (chainId 8453).
 * Uses a funder wallet to seed the test wallet, then returns funds at the end.
 *
 * Features tested:
 * 1. Create wallet
 * 2. Get wallet address
 * 3. Check native balance
 * 4. Check ERC20 token balances
 * 5. Transfer ETH
 * 6. Transfer ERC20 tokens (USDC)
 * 7. Swap tokens (ETH → USDC via 0x)
 * 8. Send arbitrary transaction
 *
 * Required env vars:
 *   E2E_FUNDER_PRIVATE_KEY - Private key with ETH + USDC on Base mainnet
 *   ZERODEV_PROJECT_ID     - ZeroDev project with Base mainnet enabled
 *   ZEROX_API_KEY          - 0x API key for swaps
 *   DATABASE_URL           - Real PostgreSQL database
 *
 * Run: npm run test:base-mainnet
 * Or:  npx vitest run src/e2e/baseMainnet.e2e.test.ts --timeout 300000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  parseEther,
  formatUnits,
  formatEther,
  type Hex,
  type Address,
  erc20Abi,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createApp } from '../app';
import prisma from '../db/client';
import type { Express } from 'express';

// ============================================================
// Constants
// ============================================================

const BASE_MAINNET_CHAIN_ID = 8453;

// USDC on Base mainnet (native)
const USDC_ADDRESS: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

// Native ETH marker
const NATIVE_ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Test amounts - small to minimize costs
const ETH_FUND_AMOUNT = '0.002'; // ETH to fund smart account for testing
const ETH_TRANSFER_AMOUNT = '0.0001'; // Small ETH transfer
const USDC_FUND_AMOUNT = '2.00'; // USDC to fund smart account
const USDC_TRANSFER_AMOUNT = '0.50'; // Small USDC transfer
const SWAP_ETH_AMOUNT = '0.0005'; // ETH to swap for USDC

// Burn address for test transfers
const BURN_ADDRESS: Address = '0x000000000000000000000000000000000000dEaD';

// ============================================================
// Helpers
// ============================================================

function getFunderPrivateKey(): Hex {
  const key = process.env.E2E_FUNDER_PRIVATE_KEY;
  if (!key) throw new Error('E2E_FUNDER_PRIVATE_KEY env var is required');
  return key.startsWith('0x') ? (key as Hex) : (`0x${key}` as Hex);
}

function getBaseRpcUrl(): string {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey) {
    return `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  }
  // Fallback to public RPC
  return 'https://mainnet.base.org';
}

async function sendEth(
  fromPrivateKey: Hex,
  to: Address,
  amount: string
): Promise<Hex> {
  const account = privateKeyToAccount(fromPrivateKey);
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(getBaseRpcUrl()),
  });

  const hash = await client.sendTransaction({
    to,
    value: parseEther(amount),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(getBaseRpcUrl()),
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

async function sendUsdc(
  fromPrivateKey: Hex,
  to: Address,
  amount: string
): Promise<Hex> {
  const account = privateKeyToAccount(fromPrivateKey);
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(getBaseRpcUrl()),
  });

  const amountWei = parseUnits(amount, USDC_DECIMALS);

  const hash = await client.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amountWei],
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(getBaseRpcUrl()),
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

async function getEthBalance(address: Address): Promise<string> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(getBaseRpcUrl()),
  });

  const balance = await publicClient.getBalance({ address });
  return formatEther(balance);
}

async function getUsdcBalance(address: Address): Promise<string> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(getBaseRpcUrl()),
  });

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });

  return formatUnits(balance, USDC_DECIMALS);
}

// ============================================================
// Test Suite
// ============================================================

describe('Base Mainnet E2E: Full Wallet Skill Test', () => {
  let app: Express;
  let apiKey: string;
  let secretId: string;
  let smartAccountAddress: Address;
  let funderAddress: Address;

  // Evidence collected for verification
  const evidence: {
    fundEthTxHash?: string;
    fundUsdcTxHash?: string;
    ethTransferTxHash?: string;
    usdcTransferTxHash?: string;
    swapTxHash?: string;
    sendTxHash?: string;
    returnEthTxHash?: string;
    returnUsdcTxHash?: string;
    initialFunderEthBalance?: string;
    initialFunderUsdcBalance?: string;
    finalFunderEthBalance?: string;
    finalFunderUsdcBalance?: string;
    finalSmartAccountEthBalance?: string;
    finalSmartAccountUsdcBalance?: string;
  } = {};

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    const funderKey = getFunderPrivateKey();
    funderAddress = privateKeyToAccount(funderKey).address;

    console.log(`\n========================================`);
    console.log(`  BASE MAINNET E2E TEST - SETUP`);
    console.log(`========================================`);
    console.log(`Funder address: ${funderAddress}`);

    // Check funder balances
    const funderEth = await getEthBalance(funderAddress);
    const funderUsdc = await getUsdcBalance(funderAddress);
    evidence.initialFunderEthBalance = funderEth;
    evidence.initialFunderUsdcBalance = funderUsdc;

    console.log(`Funder ETH balance: ${funderEth}`);
    console.log(`Funder USDC balance: ${funderUsdc}`);

    // Verify sufficient funds
    expect(parseFloat(funderEth)).toBeGreaterThan(parseFloat(ETH_FUND_AMOUNT));
    expect(parseFloat(funderUsdc)).toBeGreaterThan(parseFloat(USDC_FUND_AMOUNT));
    console.log(`========================================\n`);
  }, 60_000);

  afterAll(async () => {
    // ============================================================
    // Return remaining funds to funder
    // ============================================================
    console.log('\n========================================');
    console.log('  CLEANUP: Returning funds to funder');
    console.log('========================================');

    try {
      if (smartAccountAddress && apiKey) {
        // Check final balances
        const finalEth = await getEthBalance(smartAccountAddress);
        const finalUsdc = await getUsdcBalance(smartAccountAddress);
        evidence.finalSmartAccountEthBalance = finalEth;
        evidence.finalSmartAccountUsdcBalance = finalUsdc;

        console.log(`Smart account final ETH: ${finalEth}`);
        console.log(`Smart account final USDC: ${finalUsdc}`);

        // Return USDC if any remains
        const usdcBalance = parseFloat(finalUsdc);
        if (usdcBalance > 0.01) {
          // Leave dust
          const returnAmount = (usdcBalance - 0.001).toFixed(6);
          console.log(`Returning ${returnAmount} USDC to funder...`);

          const res = await request(app)
            .post('/api/skills/evm-wallet/transfer')
            .set('Authorization', `Bearer ${apiKey}`)
            .send({
              to: funderAddress,
              amount: returnAmount,
              token: USDC_ADDRESS,
              chainId: BASE_MAINNET_CHAIN_ID,
            });

          if (res.status === 200 && res.body.data?.txHash) {
            evidence.returnUsdcTxHash = res.body.data.txHash;
            console.log(`USDC return tx: https://basescan.org/tx/${res.body.data.txHash}`);
          } else {
            console.log(`USDC return failed: ${JSON.stringify(res.body)}`);
          }
        }

        // Return ETH if any remains (need to keep some for potential gas, but paymaster should cover it)
        const ethBalance = parseFloat(finalEth);
        if (ethBalance > 0.0001) {
          const returnAmount = (ethBalance - 0.00001).toFixed(6);
          console.log(`Returning ${returnAmount} ETH to funder...`);

          const res = await request(app)
            .post('/api/skills/evm-wallet/transfer')
            .set('Authorization', `Bearer ${apiKey}`)
            .send({
              to: funderAddress,
              amount: returnAmount,
              chainId: BASE_MAINNET_CHAIN_ID,
            });

          if (res.status === 200 && res.body.data?.txHash) {
            evidence.returnEthTxHash = res.body.data.txHash;
            console.log(`ETH return tx: https://basescan.org/tx/${res.body.data.txHash}`);
          } else {
            console.log(`ETH return failed: ${JSON.stringify(res.body)}`);
          }
        }
      }

      // Record final funder balances
      if (funderAddress) {
        evidence.finalFunderEthBalance = await getEthBalance(funderAddress);
        evidence.finalFunderUsdcBalance = await getUsdcBalance(funderAddress);
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }

    // ============================================================
    // Print evidence summary
    // ============================================================
    console.log('\n========================================');
    console.log('  BASE MAINNET E2E TEST EVIDENCE');
    console.log('========================================');
    console.log(`Smart account: ${smartAccountAddress}`);
    console.log(`Secret ID: ${secretId}`);
    console.log(`Funder: ${funderAddress}`);
    console.log(`\nInitial funder ETH: ${evidence.initialFunderEthBalance}`);
    console.log(`Initial funder USDC: ${evidence.initialFunderUsdcBalance}`);
    console.log(`\nTransactions:`);
    if (evidence.fundEthTxHash) {
      console.log(`  Fund ETH: https://basescan.org/tx/${evidence.fundEthTxHash}`);
    }
    if (evidence.fundUsdcTxHash) {
      console.log(`  Fund USDC: https://basescan.org/tx/${evidence.fundUsdcTxHash}`);
    }
    if (evidence.ethTransferTxHash) {
      console.log(`  ETH Transfer: https://basescan.org/tx/${evidence.ethTransferTxHash}`);
    }
    if (evidence.usdcTransferTxHash) {
      console.log(`  USDC Transfer: https://basescan.org/tx/${evidence.usdcTransferTxHash}`);
    }
    if (evidence.swapTxHash) {
      console.log(`  Swap ETH->USDC: https://basescan.org/tx/${evidence.swapTxHash}`);
    }
    if (evidence.sendTxHash) {
      console.log(`  Send Transaction: https://basescan.org/tx/${evidence.sendTxHash}`);
    }
    if (evidence.returnUsdcTxHash) {
      console.log(`  Return USDC: https://basescan.org/tx/${evidence.returnUsdcTxHash}`);
    }
    if (evidence.returnEthTxHash) {
      console.log(`  Return ETH: https://basescan.org/tx/${evidence.returnEthTxHash}`);
    }
    console.log(`\nFinal smart account ETH: ${evidence.finalSmartAccountEthBalance}`);
    console.log(`Final smart account USDC: ${evidence.finalSmartAccountUsdcBalance}`);
    console.log(`Final funder ETH: ${evidence.finalFunderEthBalance}`);
    console.log(`Final funder USDC: ${evidence.finalFunderUsdcBalance}`);
    console.log('========================================\n');

    // ============================================================
    // Database cleanup
    // ============================================================
    try {
      if (secretId) {
        await prisma.auditLog.deleteMany({ where: { secretId } });
        await prisma.pendingApproval.deleteMany({
          where: { transactionLog: { secretId } },
        });
        await prisma.transactionLog.deleteMany({ where: { secretId } });
        await prisma.policy.deleteMany({ where: { secretId } });
        await prisma.apiKey.deleteMany({ where: { secretId } });
        await prisma.walletSecretMetadata.deleteMany({ where: { secretId } });
        await prisma.secret.delete({ where: { id: secretId } }).catch(() => {});
      }
    } catch (err) {
      console.error('DB cleanup failed:', err);
    }

    await prisma.$disconnect();
  }, 300_000);

  // ============================================================
  // Test 1: Create a wallet
  // ============================================================

  it('should create a wallet on Base mainnet', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .send({
        type: 'EVM_WALLET',
        memo: 'E2E test wallet - Base Mainnet',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.secret.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(res.body.data.apiKey.key).toMatch(/^ssk_/);
    expect(res.body.data.claimUrl).toBeTruthy();

    apiKey = res.body.data.apiKey.key;
    secretId = res.body.data.secret.id;
    smartAccountAddress = res.body.data.secret.walletAddress as Address;

    console.log(`\nCreated smart account: ${smartAccountAddress}`);
    console.log(`Secret ID: ${secretId}`);
    console.log(`Claim URL: ${res.body.data.claimUrl}`);
  }, 120_000);

  // ============================================================
  // Test 2: Get wallet address
  // ============================================================

  it('should get the wallet address', async () => {
    const res = await request(app)
      .get('/api/skills/evm-wallet/address')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.smartAccountAddress).toBe(smartAccountAddress);
    console.log(`Address endpoint confirmed: ${res.body.data.smartAccountAddress}`);
  }, 30_000);

  // ============================================================
  // Test 3: Check balance (should be 0 before funding)
  // ============================================================

  it('should show zero balance before funding', async () => {
    const res = await request(app)
      .get(`/api/skills/evm-wallet/balance?chainId=${BASE_MAINNET_CHAIN_ID}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.eth.balance).toBe('0');
    expect(res.body.data.chainId).toBe(BASE_MAINNET_CHAIN_ID);
    console.log(`Initial ETH balance: ${res.body.data.eth.balance}`);
  }, 30_000);

  // ============================================================
  // Test 4: Fund the wallet
  // ============================================================

  it('should be funded by the funder wallet', async () => {
    const funderKey = getFunderPrivateKey();

    // Fund with ETH
    console.log(`Funding smart account with ${ETH_FUND_AMOUNT} ETH...`);
    const ethTxHash = await sendEth(funderKey, smartAccountAddress, ETH_FUND_AMOUNT);
    evidence.fundEthTxHash = ethTxHash;
    console.log(`ETH fund tx: https://basescan.org/tx/${ethTxHash}`);

    // Fund with USDC
    console.log(`Funding smart account with ${USDC_FUND_AMOUNT} USDC...`);
    const usdcTxHash = await sendUsdc(funderKey, smartAccountAddress, USDC_FUND_AMOUNT);
    evidence.fundUsdcTxHash = usdcTxHash;
    console.log(`USDC fund tx: https://basescan.org/tx/${usdcTxHash}`);

    // Verify funding
    const ethBalance = await getEthBalance(smartAccountAddress);
    const usdcBalance = await getUsdcBalance(smartAccountAddress);

    console.log(`Smart account ETH balance: ${ethBalance}`);
    console.log(`Smart account USDC balance: ${usdcBalance}`);

    expect(parseFloat(ethBalance)).toBeGreaterThanOrEqual(parseFloat(ETH_FUND_AMOUNT));
    expect(parseFloat(usdcBalance)).toBeGreaterThanOrEqual(parseFloat(USDC_FUND_AMOUNT));
  }, 120_000);

  // ============================================================
  // Test 5: Check balance with tokens
  // ============================================================

  it('should show balance with USDC token', async () => {
    const res = await request(app)
      .get(`/api/skills/evm-wallet/balance?chainId=${BASE_MAINNET_CHAIN_ID}&tokens=${USDC_ADDRESS}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(parseFloat(res.body.data.eth.balance)).toBeGreaterThan(0);
    expect(res.body.data.tokens).toBeDefined();
    expect(res.body.data.tokens.length).toBe(1);
    expect(res.body.data.tokens[0].symbol).toBe('USDC');
    expect(parseFloat(res.body.data.tokens[0].balance)).toBeGreaterThan(0);

    console.log(`Balance check - ETH: ${res.body.data.eth.balance}`);
    console.log(`Balance check - USDC: ${res.body.data.tokens[0].balance}`);
  }, 30_000);

  // ============================================================
  // Test 6: Transfer ETH
  // ============================================================

  it('should transfer ETH to burn address', async () => {
    const res = await request(app)
      .post('/api/skills/evm-wallet/transfer')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        to: BURN_ADDRESS,
        amount: ETH_TRANSFER_AMOUNT,
        chainId: BASE_MAINNET_CHAIN_ID,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(res.body.data.smartAccountAddress).toBe(smartAccountAddress);
    expect(res.body.data.explorerUrl).toContain('basescan.org');

    evidence.ethTransferTxHash = res.body.data.txHash;
    console.log(`ETH transfer tx: ${res.body.data.explorerUrl}`);
  }, 120_000);

  // ============================================================
  // Test 7: Transfer USDC
  // ============================================================

  it('should transfer USDC to burn address', async () => {
    const res = await request(app)
      .post('/api/skills/evm-wallet/transfer')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        to: BURN_ADDRESS,
        amount: USDC_TRANSFER_AMOUNT,
        token: USDC_ADDRESS,
        chainId: BASE_MAINNET_CHAIN_ID,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    evidence.usdcTransferTxHash = res.body.data.txHash;
    console.log(`USDC transfer tx: ${res.body.data.explorerUrl}`);
  }, 120_000);

  // ============================================================
  // Test 8: Preview swap (ETH → USDC)
  // ============================================================

  it('should preview a swap from ETH to USDC', async () => {
    const res = await request(app)
      .post('/api/skills/evm-wallet/swap/preview')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        sellToken: NATIVE_ETH,
        buyToken: USDC_ADDRESS,
        sellAmount: SWAP_ETH_AMOUNT,
        chainId: BASE_MAINNET_CHAIN_ID,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sellToken.toLowerCase()).toBe(NATIVE_ETH.toLowerCase());
    expect(res.body.data.buyToken.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
    expect(res.body.data.liquidityAvailable).toBe(true);
    expect(res.body.data.route.length).toBeGreaterThan(0);

    console.log(`Swap preview: ${SWAP_ETH_AMOUNT} ETH → ~${formatUnits(BigInt(res.body.data.buyAmount), USDC_DECIMALS)} USDC`);
    console.log(`Route: ${res.body.data.route.map((r: any) => r.source).join(' → ')}`);
  }, 60_000);

  // ============================================================
  // Test 9: Execute swap (ETH → USDC)
  // ============================================================

  it('should execute a swap from ETH to USDC', async () => {
    const res = await request(app)
      .post('/api/skills/evm-wallet/swap/execute')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        sellToken: NATIVE_ETH,
        buyToken: USDC_ADDRESS,
        sellAmount: SWAP_ETH_AMOUNT,
        chainId: BASE_MAINNET_CHAIN_ID,
        slippageBps: 100, // 1% slippage
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    evidence.swapTxHash = res.body.data.txHash;
    console.log(`Swap executed: ${res.body.data.explorerUrl}`);
    console.log(`Sold: ${formatEther(BigInt(res.body.data.sellAmount))} ETH`);
    console.log(`Bought: ${formatUnits(BigInt(res.body.data.buyAmount), USDC_DECIMALS)} USDC`);
  }, 180_000);

  // ============================================================
  // Test 10: Send arbitrary transaction (0-value call to self)
  // ============================================================

  it('should send an arbitrary transaction', async () => {
    // A simple self-call with empty data (just tests the send-transaction flow)
    const res = await request(app)
      .post('/api/skills/evm-wallet/send-transaction')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        to: smartAccountAddress,
        data: '0x',
        value: '0',
        chainId: BASE_MAINNET_CHAIN_ID,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    evidence.sendTxHash = res.body.data.txHash;
    console.log(`Send transaction tx: ${res.body.data.explorerUrl}`);
  }, 120_000);

  // ============================================================
  // Test 11: Verify final balances
  // ============================================================

  it('should have reduced balances after operations', async () => {
    const res = await request(app)
      .get(`/api/skills/evm-wallet/balance?chainId=${BASE_MAINNET_CHAIN_ID}&tokens=${USDC_ADDRESS}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    const ethBalance = parseFloat(res.body.data.eth.balance);
    const usdcBalance = parseFloat(res.body.data.tokens[0].balance);

    console.log(`Final balances - ETH: ${ethBalance}, USDC: ${usdcBalance}`);

    // Should have less ETH than we funded (transfers + swaps)
    expect(ethBalance).toBeLessThan(parseFloat(ETH_FUND_AMOUNT));
    // Should still have some USDC (funded - transferred + swapped)
    expect(usdcBalance).toBeGreaterThan(0);
  }, 30_000);
});
