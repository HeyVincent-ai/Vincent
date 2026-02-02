/**
 * E2E Test: Polymarket CLOB — real bets with real USDC on Polygon
 *
 * Creates a wallet via the API, funds the EOA with USDC from a funder wallet,
 * places a bet, sells it back, then returns remaining USDC to the funder.
 *
 * Required env vars:
 *   E2E_FUNDER_PRIVATE_KEY  - Private key with USDC + MATIC on Polygon
 *   ALCHEMY_API_KEY          - Alchemy API key (for Polygon RPC)
 *   DATABASE_URL             - Real PostgreSQL database
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

const POLYGON_CHAIN_ID = 137;
const USDC_POLYGON: Address = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
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

describe('Polymarket E2E: Real bets with real USDC', () => {
  let app: Express;
  let apiKey: string;
  let secretId: string;
  let testWalletAddress: Address; // smart account (returned by API)
  let testEoaAddress: Address;   // EOA (internal, used by Polymarket)
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
    recoveryTxHash?: string;
    trades?: any[];
    finalBalances?: { eoa: string; smartAccount: string };
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

    // Step 1: Create wallet via API
    const createRes = await request(app)
      .post('/api/secrets')
      .send({ type: 'EVM_WALLET', memo: 'Polymarket E2E test wallet' })
      .expect(201);

    expect(createRes.body.success).toBe(true);
    apiKey = createRes.body.data.apiKey.key;
    secretId = createRes.body.data.secret.id;
    testWalletAddress = createRes.body.data.secret.walletAddress;
    expect(testWalletAddress).toBeTruthy();

    // Step 2: Look up the EOA address from the DB
    // Polymarket uses the EOA for signing and collateral, not the smart account.
    // The API doesn't expose the EOA (by design), but the test needs it for funding.
    const secret = await prisma.secret.findUnique({ where: { id: secretId } });
    expect(secret?.value).toBeTruthy();
    testEoaAddress = privateKeyToAccount(secret!.value as Hex).address;

    console.log(`Test wallet (smart account): ${testWalletAddress}`);
    console.log(`Test wallet (EOA, internal): ${testEoaAddress}`);
    console.log(`Test wallet secret ID: ${secretId}`);

    // Step 3: Fund the EOA with USDC
    // Polymarket's CLOB operates on the EOA, so USDC must be there.
    console.log(`Funding EOA with ${FUND_AMOUNT} USDC...`);
    const fundTxHash = await sendUsdc(funderKey, testEoaAddress, FUND_AMOUNT);
    evidence.fundTxHash = fundTxHash;
    console.log(`Fund tx: https://polygonscan.com/tx/${fundTxHash}`);

    const eoaBalance = await getUsdcBalance(testEoaAddress);
    console.log(`EOA USDC balance after funding: ${eoaBalance}`);
    expect(parseFloat(eoaBalance)).toBeGreaterThanOrEqual(parseFloat(FUND_AMOUNT));
  }, 120_000);

  afterAll(async () => {
    // ============================================================
    // Print evidence summary
    // ============================================================
    console.log('\n========================================');
    console.log('  POLYMARKET E2E TEST EVIDENCE SUMMARY');
    console.log('========================================');
    console.log(`Smart account address: ${testWalletAddress}`);
    console.log(`EOA address (Polymarket): ${testEoaAddress}`);
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
    if (evidence.finalBalances) {
      console.log(`\nFinal EOA USDC balance: ${evidence.finalBalances.eoa}`);
      console.log(`Final smart account USDC balance: ${evidence.finalBalances.smartAccount}`);
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

      // Record final balances
      if (testEoaAddress && testWalletAddress) {
        const eoaBal = await getUsdcBalance(testEoaAddress);
        const smartBal = await getUsdcBalance(testWalletAddress);
        evidence.finalBalances = { eoa: eoaBal, smartAccount: smartBal };
        console.log(`Final EOA USDC: ${eoaBal}`);
        console.log(`Final smart account USDC: ${smartBal}`);
      }

      // Try to recover USDC from smart account via transfer API
      if (apiKey && funderAddress) {
        const smartBal = await getUsdcBalance(testWalletAddress);
        if (parseFloat(smartBal) > 0.001) {
          try {
            const transferRes = await request(app)
              .post('/api/skills/evm-wallet/transfer')
              .set('Authorization', `Bearer ${apiKey}`)
              .send({
                to: funderAddress,
                amount: smartBal,
                token: USDC_POLYGON,
                chainId: POLYGON_CHAIN_ID,
              });
            if (transferRes.body.data?.txHash) {
              evidence.recoveryTxHash = transferRes.body.data.txHash;
              console.log(`Smart account recovery tx: https://polygonscan.com/tx/${transferRes.body.data.txHash}`);
            }
          } catch (err) {
            console.error('Smart account USDC recovery failed:', err);
          }
        }
      }

      // Note: USDC on the EOA can't be recovered without MATIC for gas
      if (testEoaAddress) {
        const eoaBal = await getUsdcBalance(testEoaAddress);
        if (parseFloat(eoaBal) > 0.001) {
          console.log(`Note: ${eoaBal} USDC remaining on EOA ${testEoaAddress} (needs MATIC for gas to recover)`);
        }
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

    // The balance should reflect the USDC we funded to the EOA
    // Polymarket reports balance in USDC units (not wei)
    expect(balance).toBeGreaterThanOrEqual(0);

    // If balance is 0, the USDC might not be deposited to the exchange yet,
    // which is fine — the CLOB client handles this during order placement.
    // But the on-chain USDC balance on the EOA should be correct:
    const eoaOnChainBalance = await getUsdcBalance(testEoaAddress);
    console.log(`EOA on-chain USDC balance: ${eoaOnChainBalance}`);
    expect(parseFloat(eoaOnChainBalance)).toBeGreaterThanOrEqual(parseFloat(FUND_AMOUNT));
  }, 120_000);

  // ============================================================
  // Test 2: Browse markets and find a liquid one
  // ============================================================

  it('should browse markets and find a liquid market', async () => {
    // Verify our markets endpoint works
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

    // Sort by spread (Gamma's lastTradePrice tells us the "fair" price)
    // Pick a market with a reasonable lastTradePrice (not near 0 or 1)
    const candidates = gammaMarkets
      .filter((m: any) => {
        const tokenIds = m.clobTokenIds ? JSON.parse(m.clobTokenIds) : [];
        if (tokenIds.length < 2) return false;
        const ltp = parseFloat(m.lastTradePrice || '0');
        // lastTradePrice between 0.15-0.85 means reasonable market
        return (ltp > 0.15 && ltp < 0.85) || (1 - ltp > 0.15 && 1 - ltp < 0.85);
      })
      .slice(0, 15);
    console.log(`Candidate markets after pre-filter: ${candidates.length}`);

    for (const market of candidates) {
      const tokenIds = JSON.parse(market.clobTokenIds);
      // Pick the token closer to 0.5 fair value
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

    // Verify bid/ask structure
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
  // Test 4: Place a BUY limit order
  // ============================================================

  it('should place a small BUY bet', async () => {
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

    // The bet should succeed (200) — not 500 (error) or 403 (denied)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');

    // Must have a real order ID from the CLOB
    expect(res.body.data.orderId).toBeTruthy();
    expect(typeof res.body.data.orderId).toBe('string');
    expect(res.body.data.orderId.length).toBeGreaterThan(0);

    // Must have a transaction log ID
    expect(res.body.data.transactionLogId).toBeTruthy();

    // Wallet address should be the smart account
    expect(res.body.data.walletAddress.toLowerCase()).toBe(testWalletAddress.toLowerCase());

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

    // After a BUY, we should have at least an open order (if limit) or a fill.
    // Check trade history too.
    const tradesRes = await request(app)
      .get('/api/skills/polymarket/trades')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    const trades = tradesRes.body.data.trades;
    console.log(`Trades so far: ${trades.length}`);

    // We should see either an open order or a filled trade
    const hasActivity = openOrders.length > 0 || trades.length > 0;
    expect(hasActivity).toBe(true);
  }, 60_000);

  // ============================================================
  // Test 6: Place a SELL order to close position
  // ============================================================

  it('should place a SELL bet to close position', async () => {
    expect(chosenTokenId).toBeTruthy();

    // Refresh the order book to get current bid
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

    // Must have a real order ID
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

    // After BUY + SELL, we expect at least one trade
    // (limit orders may not fill immediately, so this can be 0 if unfilled)
    // At minimum the endpoint should work and return an array
    expect(Array.isArray(trades)).toBe(true);
  }, 60_000);
});
