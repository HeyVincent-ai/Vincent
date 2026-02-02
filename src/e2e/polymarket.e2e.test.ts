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

const USDC_POLYGON: Address = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_DECIMALS = 6;
const FUND_AMOUNT = '0.10'; // $0.10 USDC — enough for a small bet

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

async function sendUsdc(
  fromPrivateKey: Hex,
  to: Address,
  amount: string
): Promise<Hex> {
  const account = privateKeyToAccount(fromPrivateKey);
  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const amountWei = parseUnits(amount, USDC_DECIMALS);

  const hash = await client.writeContract({
    address: USDC_POLYGON,
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

async function getUsdcBalance(address: Address): Promise<string> {
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const balance = await publicClient.readContract({
    address: USDC_POLYGON,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });

  return formatUnits(balance, USDC_DECIMALS);
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

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    const funderKey = getFunderPrivateKey();
    funderAddress = privateKeyToAccount(funderKey).address;

    console.log(`Funder address: ${funderAddress}`);
    const funderBalance = await getUsdcBalance(funderAddress);
    console.log(`Funder USDC balance: ${funderBalance}`);
    expect(parseFloat(funderBalance)).toBeGreaterThan(0.5);

    // Step 1: Create POLYMARKET_WALLET via API
    const createRes = await request(app)
      .post('/api/secrets')
      .send({ type: 'POLYMARKET_WALLET', memo: 'Polymarket E2E gasless test wallet' })
      .expect(201);

    expect(createRes.body.success).toBe(true);
    apiKey = createRes.body.data.apiKey.key;
    secretId = createRes.body.data.secret.id;
    console.log(`Secret ID: ${secretId}`);
    console.log(`Initial wallet address (EOA, pre-Safe): ${createRes.body.data.secret.walletAddress}`);

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

    // Step 3: Fund the Safe with USDC
    console.log(`Funding Safe with ${FUND_AMOUNT} USDC...`);
    const fundTxHash = await sendUsdc(funderKey, safeAddress, FUND_AMOUNT);
    evidence.fundTxHash = fundTxHash;
    console.log(`Fund tx: https://polygonscan.com/tx/${fundTxHash}`);

    const safeBalance = await getUsdcBalance(safeAddress);
    console.log(`Safe USDC balance after funding: ${safeBalance}`);
    expect(parseFloat(safeBalance)).toBeGreaterThanOrEqual(parseFloat(FUND_AMOUNT));
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
        const bal = await getUsdcBalance(safeAddress);
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

    // Verify Safe has USDC on-chain
    const safeOnChainBalance = await getUsdcBalance(safeAddress);
    console.log(`Safe on-chain USDC balance: ${safeOnChainBalance}`);
    expect(parseFloat(safeOnChainBalance)).toBeGreaterThanOrEqual(parseFloat(FUND_AMOUNT));
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
      const tokenId = (ltp >= 0.15 && ltp <= 0.85) ? tokenIds[0] : tokenIds[1];

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
      console.log(`Best bid: ${obBid}, Best ask: ${obAsk}, Midpoint: ${midpoint.toFixed(3)}, Spread: ${spread.toFixed(3)}`);
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
    console.log(`Top bid: ${topBid.price} (${topBid.size} shares), Top ask: ${topAsk.price} (${topAsk.size} shares)`);
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
        amount: 1,
        price: buyPrice,
      });

    console.log(`BUY response status: ${res.status}`);
    console.log(`BUY response body:`, JSON.stringify(res.body, null, 2));

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
        amount: 1,
        price: sellPrice,
      });

    console.log(`SELL response status: ${res.status}`);
    console.log(`SELL response body:`, JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');

    expect(res.body.data.orderId).toBeTruthy();
    expect(typeof res.body.data.orderId).toBe('string');
    expect(res.body.data.orderId.length).toBeGreaterThan(0);

    evidence.sellOrderId = res.body.data.orderId;
    evidence.sellOrderDetails = res.body.data.orderDetails;

    console.log(`SELL Order ID: ${res.body.data.orderId}`);
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
        console.log(`  Trade: ${t.side} ${t.size} shares @ ${t.price} (ID: ${t.id || t.tradeId || 'N/A'})`);
      }
    }

    expect(Array.isArray(trades)).toBe(true);
  }, 60_000);
});
