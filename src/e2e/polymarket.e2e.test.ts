/**
 * E2E Test: Polymarket CLOB — gasless bets via Safe wallet + Builder relayer
 *
 * Creates a POLYMARKET_WALLET via the API (gasless Safe-based wallet),
 * funds the Safe with USDC after lazy deployment, places a bet, sells it back,
 * then returns remaining USDC to the funder.
 *
 * Required env vars:
 *   E2E_FUNDER_PRIVATE_KEY  - Private key with USDC on Polygon
 *   ALCHEMY_API_KEY          - Alchemy API key (for Polygon RPC)
 *   DATABASE_URL             - Real PostgreSQL database
 *   POLY_BUILDER_API_KEY     - Polymarket builder API key
 *   POLY_BUILDER_SECRET      - Polymarket builder secret
 *   POLY_BUILDER_PASSPHRASE  - Polymarket builder passphrase
 *
 * Run:
 *   npm run test:polymarket
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  type Hex,
  type Address,
  erc20Abi,
} from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createApp } from '../app';
import prisma from '../db/client';
import type { Express } from 'express';

// ============================================================
// Constants
// ============================================================

const USDC_NATIVE: Address = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Native USDC on Polygon
const USDC_E: Address = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (bridged) — used by Polymarket
const USDC_DECIMALS = 6;
// Polymarket minimum order is $1
const MIN_FUND_AMOUNT = 1.0;

// Uniswap V3 SwapRouter on Polygon
const UNISWAP_SWAP_ROUTER: Address = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

// ============================================================
// Helpers
// ============================================================

function getFunderPrivateKey(): Hex {
  const key = process.env.E2E_FUNDER_PRIVATE_KEY;
  if (!key) throw new Error('E2E_FUNDER_PRIVATE_KEY env var is required');
  return key.startsWith('0x') ? (key as Hex) : (`0x${key}` as Hex);
}

function getPolygonRpcUrl(): string {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyKey) throw new Error('ALCHEMY_API_KEY env var is required');
  return `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`;
}

async function sendUsdcE(fromPrivateKey: Hex, to: Address, amount: string): Promise<Hex> {
  const account = privateKeyToAccount(fromPrivateKey);
  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const amountWei = parseUnits(amount, USDC_DECIMALS);

  const hash = await client.writeContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amountWei],
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

async function getUsdcEBalance(address: Address): Promise<string> {
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const balance = await publicClient.readContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });

  return formatUnits(balance, USDC_DECIMALS);
}

async function getNativeUsdcBalance(address: Address): Promise<string> {
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const balance = await publicClient.readContract({
    address: USDC_NATIVE,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });

  return formatUnits(balance, USDC_DECIMALS);
}

/**
 * Swap native USDC to USDC.e via Uniswap V3 on Polygon.
 */
async function swapNativeUsdcToUsdcE(privateKey: Hex, amount: string): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const amountWei = parseUnits(amount, USDC_DECIMALS);

  // Approve Uniswap router to spend native USDC
  const approveTx = await walletClient.writeContract({
    address: USDC_NATIVE,
    abi: erc20Abi,
    functionName: 'approve',
    args: [UNISWAP_SWAP_ROUTER, amountWei],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  // exactInputSingle swap
  const swapRouterAbi = [
    {
      name: 'exactInputSingle',
      type: 'function',
      inputs: [
        {
          name: 'params',
          type: 'tuple',
          components: [
            { name: 'tokenIn', type: 'address' },
            { name: 'tokenOut', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'recipient', type: 'address' },
            { name: 'deadline', type: 'uint256' },
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMinimum', type: 'uint256' },
            { name: 'sqrtPriceLimitX96', type: 'uint160' },
          ],
        },
      ],
      outputs: [{ name: 'amountOut', type: 'uint256' }],
      stateMutability: 'payable',
    },
  ] as const;

  // 0.01% fee tier for stablecoin pairs
  const hash = await walletClient.writeContract({
    address: UNISWAP_SWAP_ROUTER,
    abi: swapRouterAbi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: USDC_NATIVE,
        tokenOut: USDC_E,
        fee: 100, // 0.01% fee tier
        recipient: account.address,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
        amountIn: amountWei,
        amountOutMinimum: (amountWei * 99n) / 100n, // 1% slippage
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ============================================================
// Test Suite
// ============================================================

describe('Polymarket E2E: Gasless bets via Safe wallet', () => {
  let app: Express;
  let apiKey: string;
  let secretId: string;
  let safeAddress: Address;
  let funderAddress: Address;
  let chosenTokenId: string;
  let chosenMarketQuestion: string;
  let buyPrice: number;
  let sellPrice: number;

  // Evidence collected for verification
  const evidence: {
    fundTxHash?: string;
    buyOrderId?: string;
    buyOrderDetails?: any;
    sellOrderId?: string;
    sellOrderDetails?: any;
    trades?: any[];
    finalBalance?: string;
  } = {};

  /**
   * Check if an HTTP response indicates geo-restriction (Cloudflare block).
   */
  function isGeoBlocked(res: any): boolean {
    const message = res?.body?.error?.message || '';
    return (
      message.includes('GEO_BLOCKED') ||
      message.includes('Cloudflare') ||
      message.includes('cf-error') ||
      message.includes('<!DOCTYPE html>') ||
      message.includes('<!doctype html>')
    );
  }

  /**
   * Fail the test with a clear message when geo-blocked.
   */
  function failIfGeoBlocked(res: any, action: string): void {
    if (res.status === 500 && isGeoBlocked(res)) {
      throw new Error(
        `\n` +
          `═══════════════════════════════════════════════════════════════════\n` +
          `  🚫 GEO-BLOCKED: Cannot ${action}\n` +
          `═══════════════════════════════════════════════════════════════════\n` +
          `\n` +
          `  Polymarket blocks order placement from the US and 32 other countries.\n` +
          `  Your current IP is in a restricted region.\n` +
          `\n` +
          `  👉 TURN ON YOUR VPN and connect to a non-blocked region:\n` +
          `     • EU (except UK, Germany, France, Italy, Belgium, Poland)\n` +
          `     • South America (except Venezuela)\n` +
          `     • Most of Asia (except Singapore, Thailand, Taiwan)\n` +
          `\n` +
          `  Recommended: Connect to Ireland (eu-west-1) or Brazil\n` +
          `\n` +
          `  See: https://docs.polymarket.com/developers/CLOB/geoblock\n` +
          `═══════════════════════════════════════════════════════════════════\n`
      );
    }
  }

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    const funderKey = getFunderPrivateKey();
    funderAddress = privateKeyToAccount(funderKey).address;

    console.log(`Funder address: ${funderAddress}`);
    const funderNativeBalance = await getNativeUsdcBalance(funderAddress);
    console.log(`Funder native USDC balance: ${funderNativeBalance}`);

    // Check total available funds (native + bridged USDC)
    let funderUsdcEBalance = await getUsdcEBalance(funderAddress);
    console.log(`Funder USDC.e balance: ${funderUsdcEBalance}`);

    const totalAvailable = parseFloat(funderNativeBalance) + parseFloat(funderUsdcEBalance);
    console.log(`Total available USDC: $${totalAvailable.toFixed(2)}`);

    // Need at least $1.10 to reliably test (Polymarket $1 min + fees + buffer)
    const SAFE_MIN = 1.1;
    if (totalAvailable < SAFE_MIN) {
      throw new Error(
        `\n` +
          `═══════════════════════════════════════════════════════════════════\n` +
          `  💰 INSUFFICIENT FUNDS in funder wallet\n` +
          `═══════════════════════════════════════════════════════════════════\n` +
          `\n` +
          `  Polymarket requires minimum $1 orders.\n` +
          `  Need at least $${SAFE_MIN.toFixed(2)} to test, but only have $${totalAvailable.toFixed(2)}.\n` +
          `\n` +
          `  👉 Top up the funder wallet:\n` +
          `     Address: ${funderAddress}\n` +
          `     Network: Polygon\n` +
          `     Amount:  Send $${Math.max(2 - totalAvailable, 1).toFixed(2)} USDC (recommend $2+)\n` +
          `\n` +
          `  Tip: Each test run uses ~$1. Fund with $5-10 to run multiple tests.\n` +
          `\n` +
          `═══════════════════════════════════════════════════════════════════\n`
      );
    }

    // Swap native USDC to USDC.e if needed (Polymarket uses bridged USDC.e)
    if (parseFloat(funderUsdcEBalance) < MIN_FUND_AMOUNT) {
      const needed = MIN_FUND_AMOUNT - parseFloat(funderUsdcEBalance) + 0.1; // Small buffer
      const available = parseFloat(funderNativeBalance);
      const swapAmount = Math.min(needed, available * 0.95).toFixed(2); // Leave 5% for gas

      console.log(`Swapping ${swapAmount} native USDC -> USDC.e via Uniswap V3...`);
      const swapTx = await swapNativeUsdcToUsdcE(funderKey, swapAmount);
      console.log(`Swap tx: https://polygonscan.com/tx/${swapTx}`);
      funderUsdcEBalance = await getUsdcEBalance(funderAddress);
      console.log(`Funder USDC.e balance after swap: ${funderUsdcEBalance}`);
    }

    // Calculate actual fund amount (use what's available, minimum $1.05)
    const fundAmount = Math.min(parseFloat(funderUsdcEBalance) * 0.95, MIN_FUND_AMOUNT).toFixed(2);
    expect(parseFloat(funderUsdcEBalance)).toBeGreaterThanOrEqual(MIN_FUND_AMOUNT * 0.95);

    // Step 1: Create POLYMARKET_WALLET via API
    const createRes = await request(app)
      .post('/api/secrets')
      .send({ type: 'POLYMARKET_WALLET', memo: 'Polymarket E2E gasless test wallet' })
      .expect(201);

    expect(createRes.body.success).toBe(true);
    apiKey = createRes.body.data.apiKey.key;
    secretId = createRes.body.data.secret.id;
    console.log(`Secret ID: ${secretId}`);
    console.log(
      `Initial wallet address (EOA, pre-Safe): ${createRes.body.data.secret.walletAddress}`
    );

    // Step 2: Trigger lazy Safe deployment by checking balance
    // This will deploy the Safe and approve collateral via the relayer (gasless)
    console.log('Triggering lazy Safe deployment via balance check...');
    const balRes = await request(app)
      .get('/api/skills/polymarket/balance')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    safeAddress = balRes.body.data.walletAddress as Address;
    console.log(`Safe address (deployed): ${safeAddress}`);
    expect(safeAddress).toBeTruthy();

    // Step 3: Fund the Safe with USDC.e
    console.log(`Funding Safe with ${fundAmount} USDC.e...`);
    const fundTxHash = await sendUsdcE(funderKey, safeAddress, fundAmount);
    evidence.fundTxHash = fundTxHash;
    console.log(`Fund tx: https://polygonscan.com/tx/${fundTxHash}`);

    const safeBalance = await getUsdcEBalance(safeAddress);
    console.log(`Safe USDC.e balance after funding: ${safeBalance}`);
    expect(parseFloat(safeBalance)).toBeGreaterThanOrEqual(parseFloat(fundAmount) * 0.99);
  }, 300_000); // 5 min — Safe deployment can take time

  afterAll(async () => {
    // ============================================================
    // Print evidence summary
    // ============================================================
    console.log('\n========================================');
    console.log('  POLYMARKET E2E TEST EVIDENCE SUMMARY');
    console.log('========================================');
    console.log(`Safe address: ${safeAddress}`);
    console.log(`Secret ID: ${secretId}`);
    if (evidence.fundTxHash) {
      console.log(`\nFunding TX: https://polygonscan.com/tx/${evidence.fundTxHash}`);
    }
    if (evidence.buyOrderId) {
      console.log(`\nBUY Order ID: ${evidence.buyOrderId}`);
      console.log(`BUY Order Details: ${JSON.stringify(evidence.buyOrderDetails, null, 2)}`);
    }
    if (evidence.sellOrderId) {
      console.log(`\nSELL Order ID: ${evidence.sellOrderId}`);
      console.log(`SELL Order Details: ${JSON.stringify(evidence.sellOrderDetails, null, 2)}`);
    }
    if (evidence.trades && evidence.trades.length > 0) {
      console.log(`\nTrades (${evidence.trades.length}):`);
      for (const t of evidence.trades) {
        console.log(`  - ${t.side} ${t.size} @ ${t.price} (ID: ${t.id || t.tradeId || 'N/A'})`);
      }
    }
    if (evidence.finalBalance) {
      console.log(`\nFinal Safe USDC balance: ${evidence.finalBalance}`);
    }
    if (chosenMarketQuestion) {
      console.log(`\nMarket: ${chosenMarketQuestion}`);
    }
    if (chosenTokenId) {
      console.log(`Token ID: ${chosenTokenId}`);
    }
    console.log('========================================\n');

    // ============================================================
    // Cleanup
    // ============================================================
    try {
      // Cancel any remaining orders
      if (apiKey) {
        await request(app)
          .delete('/api/skills/polymarket/orders')
          .set('Authorization', `Bearer ${apiKey}`)
          .catch(() => {});
      }

      // Record final balance
      if (safeAddress) {
        const bal = await getUsdcEBalance(safeAddress);
        evidence.finalBalance = bal;
        console.log(`Final Safe USDC: ${bal}`);
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }

    // DB cleanup
    try {
      if (secretId) {
        await prisma.auditLog.deleteMany({ where: { secretId } });
        await prisma.pendingApproval.deleteMany({
          where: { transactionLog: { secretId } },
        });
        await prisma.transactionLog.deleteMany({ where: { secretId } });
        await prisma.polymarketCredentials.deleteMany({ where: { secretId } });
        await prisma.polymarketWalletMetadata.deleteMany({ where: { secretId } });
        await prisma.policy.deleteMany({ where: { secretId } });
        await prisma.apiKey.deleteMany({ where: { secretId } });
        await prisma.walletSecretMetadata.deleteMany({ where: { secretId } });
        await prisma.secret.delete({ where: { id: secretId } }).catch(() => {});
      }
    } catch (err) {
      console.error('DB cleanup failed:', err);
    }

    await prisma.$disconnect();
  }, 120_000);

  // ============================================================
  // Test 1: Check balance — verify the API sees our USDC
  // ============================================================

  it('should show USDC balance on Polymarket', async () => {
    const res = await request(app)
      .get('/api/skills/polymarket/balance')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.walletAddress).toBeTruthy();

    const balance = parseFloat(res.body.data.collateral.balance);

    console.log(`Polymarket collateral balance: ${res.body.data.collateral.balance}`);
    console.log(`Polymarket collateral allowance: ${res.body.data.collateral.allowance}`);

    expect(balance).toBeGreaterThanOrEqual(0);

    // Verify Safe has USDC.e on-chain (at least $1 for Polymarket minimum)
    const safeOnChainBalance = await getUsdcEBalance(safeAddress);
    console.log(`Safe on-chain USDC.e balance: ${safeOnChainBalance}`);
    expect(parseFloat(safeOnChainBalance)).toBeGreaterThanOrEqual(1.0);
  }, 120_000);

  // ============================================================
  // Test 2: Browse markets and find a liquid one
  // ============================================================

  it('should browse markets and find a liquid market', async () => {
    const res = await request(app)
      .get('/api/skills/polymarket/markets')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.data.length).toBeGreaterThan(0);
    console.log(`Markets endpoint returned ${res.body.data.data.length} markets`);

    // Use Gamma API to find liquid, active markets sorted by volume
    const gammaRes = await fetch(
      'https://gamma-api.polymarket.com/markets?closed=false&active=true&acceptingOrders=true&limit=100&order=volume24hr&ascending=false'
    );
    const gammaMarkets = await gammaRes.json();
    expect(gammaMarkets.length).toBeGreaterThan(0);
    console.log(`Gamma API returned ${gammaMarkets.length} active markets`);

    let foundMarket = null;
    let foundTokenId: string | null = null;

    const candidates = gammaMarkets
      .filter((m: any) => {
        const tokenIds = m.clobTokenIds ? JSON.parse(m.clobTokenIds) : [];
        if (tokenIds.length < 2) return false;
        const ltp = parseFloat(m.lastTradePrice || '0');
        return (ltp > 0.15 && ltp < 0.85) || (1 - ltp > 0.15 && 1 - ltp < 0.85);
      })
      .slice(0, 15);
    console.log(`Candidate markets after pre-filter: ${candidates.length}`);

    for (const market of candidates) {
      const tokenIds = JSON.parse(market.clobTokenIds);
      const ltp = parseFloat(market.lastTradePrice || '0.5');
      const tokenId = ltp >= 0.15 && ltp <= 0.85 ? tokenIds[0] : tokenIds[1];

      const obRes = await request(app)
        .get(`/api/skills/polymarket/orderbook/${encodeURIComponent(tokenId)}`)
        .set('Authorization', `Bearer ${apiKey}`);

      if (obRes.status !== 200) continue;
      const orderbook = obRes.body.data;
      if (!orderbook.bids?.length || !orderbook.asks?.length) continue;

      const obBid = parseFloat(orderbook.bids[0].price);
      const obAsk = parseFloat(orderbook.asks[0].price);
      if (obBid <= 0 || obAsk <= 0) continue;
      if (obAsk <= obBid) continue;

      foundMarket = market;
      foundTokenId = tokenId;
      buyPrice = obAsk;
      sellPrice = obBid;

      const midpoint = (obBid + obAsk) / 2;
      const spread = obAsk - obBid;
      console.log(`Selected market: ${market.question}`);
      console.log(`Token ID: ${tokenId}`);
      console.log(`Last trade price: ${ltp}`);
      console.log(
        `Best bid: ${obBid}, Best ask: ${obAsk}, Midpoint: ${midpoint.toFixed(3)}, Spread: ${spread.toFixed(3)}`
      );
      break;
    }

    expect(foundMarket).toBeTruthy();
    expect(foundTokenId).toBeTruthy();
    chosenTokenId = foundTokenId!;
    chosenMarketQuestion = (foundMarket as any).question;
  }, 120_000);

  // ============================================================
  // Test 3: Get order book for chosen token
  // ============================================================

  it('should get order book for chosen token', async () => {
    expect(chosenTokenId).toBeTruthy();

    const res = await request(app)
      .get(`/api/skills/polymarket/orderbook/${encodeURIComponent(chosenTokenId)}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.bids.length).toBeGreaterThan(0);
    expect(res.body.data.asks.length).toBeGreaterThan(0);

    const topBid = res.body.data.bids[0];
    const topAsk = res.body.data.asks[0];
    expect(parseFloat(topBid.price)).toBeGreaterThan(0);
    expect(parseFloat(topAsk.price)).toBeGreaterThan(0);
    expect(parseFloat(topBid.price)).toBeLessThan(parseFloat(topAsk.price));

    buyPrice = parseFloat(topAsk.price);
    sellPrice = parseFloat(topBid.price);

    console.log(`Order book: ${res.body.data.bids.length} bids, ${res.body.data.asks.length} asks`);
    console.log(
      `Top bid: ${topBid.price} (${topBid.size} shares), Top ask: ${topAsk.price} (${topAsk.size} shares)`
    );
  }, 60_000);

  // ============================================================
  // Test 4: Place a BUY limit order (gasless!)
  // ============================================================

  it('should place a small BUY bet (gasless)', async () => {
    expect(chosenTokenId).toBeTruthy();

    const res = await request(app)
      .post('/api/skills/polymarket/bet')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        tokenId: chosenTokenId,
        side: 'BUY',
        amount: 1, // Polymarket minimum order is $1
        price: buyPrice,
      });

    console.log(`BUY response status: ${res.status}`);
    console.log(`BUY response body:`, JSON.stringify(res.body, null, 2));

    // Fail with clear message if geo-blocked
    failIfGeoBlocked(res, 'place BUY order');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');

    expect(res.body.data.orderId).toBeTruthy();
    expect(typeof res.body.data.orderId).toBe('string');
    expect(res.body.data.orderId.length).toBeGreaterThan(0);

    expect(res.body.data.transactionLogId).toBeTruthy();

    // Wallet address should be the Safe address
    expect(res.body.data.walletAddress.toLowerCase()).toBe(safeAddress.toLowerCase());

    evidence.buyOrderId = res.body.data.orderId;
    evidence.buyOrderDetails = res.body.data.orderDetails;

    console.log(`BUY Order ID: ${res.body.data.orderId}`);
  }, 120_000);

  // ============================================================
  // Test 5: Check positions — should see the buy order or a fill
  // ============================================================

  it('should show positions after buying', async () => {
    const res = await request(app)
      .get('/api/skills/polymarket/positions')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.walletAddress).toBeTruthy();

    const openOrders = res.body.data.openOrders;
    console.log(`Open orders: ${openOrders.length}`);
    if (openOrders.length > 0) {
      console.log('Open orders:', JSON.stringify(openOrders.slice(0, 3), null, 2));
    }

    const tradesRes = await request(app)
      .get('/api/skills/polymarket/trades')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    const trades = tradesRes.body.data.trades;
    console.log(`Trades so far: ${trades.length}`);

    const hasActivity = openOrders.length > 0 || trades.length > 0;
    expect(hasActivity).toBe(true);
  }, 60_000);

  // ============================================================
  // Test 6: Place a SELL order to close position
  // ============================================================

  it('should place a SELL bet to close position', async () => {
    expect(chosenTokenId).toBeTruthy();

    const obRes = await request(app)
      .get(`/api/skills/polymarket/orderbook/${encodeURIComponent(chosenTokenId)}`)
      .set('Authorization', `Bearer ${apiKey}`);

    if (obRes.status === 200 && obRes.body.data.bids?.length) {
      sellPrice = parseFloat(obRes.body.data.bids[0].price);
    }

    const res = await request(app)
      .post('/api/skills/polymarket/bet')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        tokenId: chosenTokenId,
        side: 'SELL',
        amount: 1, // Polymarket minimum order is $1
        price: sellPrice,
      });

    console.log(`SELL response status: ${res.status}`);
    console.log(`SELL response body:`, JSON.stringify(res.body, null, 2));

    // Fail with clear message if geo-blocked
    failIfGeoBlocked(res, 'place SELL order');

    // SELL may fail with "not enough balance" if the BUY limit order hasn't filled yet.
    // This is expected behavior — we accept either a successful order or a balance error.
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('executed');
      expect(res.body.data.orderId).toBeTruthy();

      evidence.sellOrderId = res.body.data.orderId;
      evidence.sellOrderDetails = res.body.data.orderDetails;
      console.log(`SELL Order ID: ${res.body.data.orderId}`);
    } else {
      // If the BUY hasn't filled, SELL will fail with balance/allowance error — this is OK
      const errMsg = res.body?.error?.message || '';
      console.log(`SELL failed (expected if BUY unfilled): ${errMsg}`);
      // Accept balance/allowance errors (expected if BUY order didn't fill)
      const isExpectedError =
        errMsg.toLowerCase().includes('balance') || errMsg.toLowerCase().includes('allowance');
      expect(isExpectedError).toBe(true);
    }
  }, 120_000);

  // ============================================================
  // Test 7: Check trade history — should show completed trades
  // ============================================================

  it('should show trade history', async () => {
    const res = await request(app)
      .get('/api/skills/polymarket/trades')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);

    const trades = res.body.data.trades;
    evidence.trades = trades;

    console.log(`Total trades: ${trades.length}`);
    if (trades.length > 0) {
      for (const t of trades.slice(0, 5)) {
        console.log(
          `  Trade: ${t.side} ${t.size} shares @ ${t.price} (ID: ${t.id || t.tradeId || 'N/A'})`
        );
      }
    }

    expect(Array.isArray(trades)).toBe(true);
  }, 60_000);
});
