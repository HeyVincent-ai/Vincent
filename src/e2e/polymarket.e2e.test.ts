/**
 * E2E Test: Polymarket CLOB — real bets with real USDC on Polygon
 *
 * Creates a wallet via the API, funds it with USDC from a funder wallet,
 * places a bet, sells it back, then returns remaining USDC to the funder.
 *
 * Required env vars:
 *   E2E_FUNDER_PRIVATE_KEY  - Private key with USDC + MATIC on Polygon
 *   ALCHEMY_API_KEY          - Alchemy API key (for Polygon RPC)
 *   DATABASE_URL             - Real PostgreSQL database
 *
 * Run:
 *   npx vitest run src/e2e/polymarket.e2e.test.ts --timeout 300000
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

const POLYGON_CHAIN_ID = 137;
const USDC_POLYGON: Address = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC on Polygon
const USDC_DECIMALS = 6;
const FUND_AMOUNT = '0.1'; // $1 USDC

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

  // Wait for confirmation
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

describe('Polymarket E2E: Real bets with real USDC', () => {
  let app: Express;
  let apiKey: string;
  let secretId: string;
  let testEoaAddress: Address;
  let funderAddress: Address;
  let chosenTokenId: string;
  let buyPrice: number;
  let sellPrice: number;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    const funderKey = getFunderPrivateKey();
    funderAddress = privateKeyToAccount(funderKey).address;

    console.log(`Funder address: ${funderAddress}`);
    const funderBalance = await getUsdcBalance(funderAddress);
    console.log(`Funder USDC balance: ${funderBalance}`);
    expect(parseFloat(funderBalance)).toBeGreaterThan(1);

    // Step 1: Create wallet via API
    const createRes = await request(app)
      .post('/api/secrets')
      .send({ type: 'EVM_WALLET', memo: 'Polymarket E2E test wallet' })
      .expect(201);

    expect(createRes.body.success).toBe(true);
    apiKey = createRes.body.data.apiKey.key;
    secretId = createRes.body.data.secret.id;
    testEoaAddress = createRes.body.data.secret.walletAddress;
    
    expect(testEoaAddress.length).toBeGreaterThan(0);

    console.log(`Test wallet EOA: ${testEoaAddress}`);
    console.log(`Test wallet secret ID: ${secretId}`);

    // Step 2: Fund the test wallet with USDC
    console.log(`Funding test wallet with ${FUND_AMOUNT} USDC...`);
    const fundTxHash = await sendUsdc(funderKey, testEoaAddress, FUND_AMOUNT);
    console.log(`Fund tx: https://polygonscan.com/tx/${fundTxHash}`);

    const testBalance = await getUsdcBalance(testEoaAddress);
    console.log(`Test wallet USDC balance: ${testBalance}`);
    expect(parseFloat(testBalance)).toBeGreaterThanOrEqual(parseFloat(FUND_AMOUNT));
  }, 120_000);

  afterAll(async () => {
    try {
      // Cancel any remaining orders
      if (apiKey) {
        await request(app)
          .delete('/api/skills/polymarket/orders')
          .set('Authorization', `Bearer ${apiKey}`)
          .catch(() => {});
      }

      // Send remaining USDC back to funder
      if (testEoaAddress && funderAddress) {
        const secret = await prisma.secret.findUnique({ where: { id: secretId } });
        if (secret?.value) {
          const remainingBalance = await getUsdcBalance(testEoaAddress);
          console.log(`Remaining USDC in test wallet: ${remainingBalance}`);

          if (parseFloat(remainingBalance) > 0.001) {
            // The test EOA needs MATIC for the ERC20 transfer back.
            // Send a tiny bit of MATIC from funder first.
            const funderKey = getFunderPrivateKey();
            const funderAccount = privateKeyToAccount(funderKey);
            const funderClient = createWalletClient({
              account: funderAccount,
              chain: polygon,
              transport: http(getPolygonRpcUrl()),
            });

            // Now send USDC back
            const testKey = secret.value as Hex;
            const recoveryTx = await sendUsdc(testKey, funderAddress, remainingBalance);
            console.log(`Recovery tx: https://polygonscan.com/tx/${recoveryTx}`);
          }
        }
      }
    } catch (err) {
      console.error('Cleanup fund recovery failed:', err);
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
  // Test 1: Check balance
  // ============================================================

  it('should show USDC balance on Polymarket', async () => {
    const res = await request(app)
      .get('/api/skills/polymarket/balance')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.eoaAddress.toLowerCase()).toBe(testEoaAddress.toLowerCase());

    console.log(`Polymarket collateral balance: ${res.body.data.collateral.balance}`);
    console.log(`Polymarket collateral allowance: ${res.body.data.collateral.allowance}`);
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
    const markets = res.body.data.data;
    expect(markets.length).toBeGreaterThan(0);

    console.log(`Found ${markets.length} markets`);

    // Find a market with tokens that has reasonable activity
    let foundMarket = null;
    let foundTokenId = null;
    let midpoint = 0;

    for (const market of markets) {
      if (!market.tokens || market.tokens.length < 2) continue;
      if (market.closed || market.archived) continue;

      // Try the first token
      const tokenId = market.tokens[0].token_id;
      try {
        const midRes = await request(app)
          .get(`/api/skills/polymarket/orderbook/${tokenId}`)
          .set('Authorization', `Bearer ${apiKey}`);

        if (midRes.status !== 200) continue;

        const orderbook = midRes.body.data;
        if (!orderbook.bids?.length || !orderbook.asks?.length) continue;

        // Check midpoint is in reasonable range
        const bestBid = parseFloat(orderbook.bids[0].price);
        const bestAsk = parseFloat(orderbook.asks[0].price);
        midpoint = (bestBid + bestAsk) / 2;

        if (midpoint < 0.1 || midpoint > 0.9) continue;

        // Check there's enough depth (at least $5 on each side)
        const bidDepth = orderbook.bids.reduce(
          (sum: number, b: { size: string }) => sum + parseFloat(b.size),
          0
        );
        const askDepth = orderbook.asks.reduce(
          (sum: number, a: { size: string }) => sum + parseFloat(a.size),
          0
        );
        if (bidDepth < 5 || askDepth < 5) continue;

        foundMarket = market;
        foundTokenId = tokenId;
        buyPrice = bestAsk;
        sellPrice = bestBid;

        console.log(`Selected market: ${market.question || market.condition_id}`);
        console.log(`Token ID: ${tokenId}`);
        console.log(`Best bid: ${bestBid}, Best ask: ${bestAsk}, Midpoint: ${midpoint}`);
        console.log(`Bid depth: ${bidDepth} shares, Ask depth: ${askDepth} shares`);
        break;
      } catch {
        continue;
      }
    }

    expect(foundMarket).toBeTruthy();
    expect(foundTokenId).toBeTruthy();
    chosenTokenId = foundTokenId!;
  }, 120_000);

  // ============================================================
  // Test 3: Get order book for chosen token
  // ============================================================

  it('should get order book for chosen token', async () => {
    expect(chosenTokenId).toBeTruthy();

    const res = await request(app)
      .get(`/api/skills/polymarket/orderbook/${chosenTokenId}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.bids.length).toBeGreaterThan(0);
    expect(res.body.data.asks.length).toBeGreaterThan(0);

    // Update prices in case they changed
    buyPrice = parseFloat(res.body.data.asks[0].price);
    sellPrice = parseFloat(res.body.data.bids[0].price);

    console.log(`Order book: ${res.body.data.bids.length} bids, ${res.body.data.asks.length} asks`);
  }, 60_000);

  // ============================================================
  // Test 4: Place a BUY limit order
  // ============================================================

  it('should place a small BUY bet', async () => {
    expect(chosenTokenId).toBeTruthy();

    // Buy 1 share at the best ask price
    const res = await request(app)
      .post('/api/skills/polymarket/bet')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        tokenId: chosenTokenId,
        side: 'BUY',
        amount: 1, // 1 share
        price: buyPrice,
      });

    console.log(`BUY response status: ${res.status}`);
    console.log(`BUY response:`, JSON.stringify(res.body.data, null, 2));

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.eoaAddress.toLowerCase()).toBe(testEoaAddress.toLowerCase());
  }, 120_000);

  // ============================================================
  // Test 5: Check positions
  // ============================================================

  it('should show positions after buying', async () => {
    const res = await request(app)
      .get('/api/skills/polymarket/positions')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    console.log(`Open orders: ${res.body.data.openOrders.length}`);
    console.log(`Positions:`, JSON.stringify(res.body.data.openOrders.slice(0, 3), null, 2));
  }, 60_000);

  // ============================================================
  // Test 6: Place a SELL limit order to reclaim
  // ============================================================

  it('should place a SELL bet to close position', async () => {
    expect(chosenTokenId).toBeTruthy();

    // Refresh the order book to get current bid
    const obRes = await request(app)
      .get(`/api/skills/polymarket/orderbook/${chosenTokenId}`)
      .set('Authorization', `Bearer ${apiKey}`);

    if (obRes.status === 200 && obRes.body.data.bids?.length) {
      sellPrice = parseFloat(obRes.body.data.bids[0].price);
    }

    // Sell 1 share at the best bid price
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
    console.log(`SELL response:`, JSON.stringify(res.body.data, null, 2));

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
  }, 120_000);

  // ============================================================
  // Test 7: Check trade history
  // ============================================================

  it('should show trade history', async () => {
    const res = await request(app)
      .get('/api/skills/polymarket/trades')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    console.log(`Trades: ${res.body.data.trades.length}`);
    if (res.body.data.trades.length > 0) {
      console.log(`Latest trade:`, JSON.stringify(res.body.data.trades[0], null, 2));
    }
  }, 60_000);
});
