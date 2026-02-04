import { Wallet } from '@ethersproject/wallet';
import { JsonRpcProvider } from '@ethersproject/providers';
import type {
  ApiKeyCreds,
  OpenOrder,
  Trade,
  OrderBookSummary,
  BalanceAllowanceResponse,
  AssetType,
  UserMarketOrder,
  Side,
} from '@polymarket/clob-client';
import prisma from '../db/client';
import { env } from '../utils/env';
import { initializePolymarketProxy } from '../utils/proxy';

// ============================================================
// ESM dynamic imports (these packages are ESM-only)
// ============================================================

async function loadClobClient() {
  return import('@polymarket/clob-client');
}

async function loadOrderUtils() {
  return import('@polymarket/order-utils');
}

async function loadRelayerClient() {
  return import('@polymarket/builder-relayer-client');
}

async function loadBuilderSdk() {
  return import('@polymarket/builder-signing-sdk');
}

// ============================================================
// Types
// ============================================================

export type { ApiKeyCreds, OpenOrder, Trade, OrderBookSummary };

export async function getSide() {
  const { Side } = await loadClobClient();
  return Side;
}

export interface PolymarketClientConfig {
  privateKey: string;
  secretId: string;
  safeAddress?: string;
}

// ============================================================
// Builder Config
// ============================================================

async function getBuilderConfig() {
  if (!env.POLY_BUILDER_API_KEY || !env.POLY_BUILDER_SECRET || !env.POLY_BUILDER_PASSPHRASE) {
    return undefined;
  }
  const { BuilderConfig } = await loadBuilderSdk();
  return new BuilderConfig({
    localBuilderCreds: {
      key: env.POLY_BUILDER_API_KEY,
      secret: env.POLY_BUILDER_SECRET,
      passphrase: env.POLY_BUILDER_PASSPHRASE,
    },
  });
}

// ============================================================
// Relayer Client
// ============================================================

function getPolygonProvider(): JsonRpcProvider {
  const alchemyKey = env.ALCHEMY_API_KEY;
  const rpcUrl = alchemyKey
    ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://polygon-rpc.com';
  return new JsonRpcProvider(rpcUrl, 137);
}

async function getRelayClient(privateKey: string) {
  const { RelayClient, RelayerTxType } = await loadRelayerClient();
  const wallet = new Wallet(privateKey, getPolygonProvider());
  const relayerUrl = env.POLYMARKET_RELAYER_HOST || 'https://relayer-v2.polymarket.com/';
  const builderConfig = await getBuilderConfig();
  return new RelayClient(
    relayerUrl,
    137, // Polygon
    wallet,
    builderConfig,
    RelayerTxType.SAFE
  );
}

// ============================================================
// Safe Deployment & Approval (gasless via relayer)
// ============================================================

/**
 * Deploy a Gnosis Safe via the Polymarket relayer (gasless).
 * Returns the Safe address.
 */
export async function deploySafe(privateKey: string): Promise<string> {
  const relayClient = await getRelayClient(privateKey);

  // First get the expected Safe address before deploying
  const wallet = new Wallet(privateKey, getPolygonProvider());
  const relayPayload = await relayClient.getRelayPayload(wallet.address, 'SAFE');
  const expectedSafeAddress = relayPayload.address;
  console.log(`Deploying safe ${expectedSafeAddress}...`);

  const response = await relayClient.deploy();

  // Poll until mined
  const tx = await relayClient.pollUntilState(
    response.transactionID,
    ['STATE_MINED', 'STATE_CONFIRMED'],
    'STATE_FAILED',
    60, // maxPolls
    2000 // pollFrequency ms
  );

  if (!tx) {
    throw new Error('Safe deployment transaction failed or timed out');
  }

  // The deployed Safe address comes from the transaction's proxyAddress field
  // or from the relay payload address
  const safeAddress = tx.proxyAddress || expectedSafeAddress;
  console.log(`Safe deployed at ${safeAddress} (tx: ${tx.transactionHash})`);
  return safeAddress;
}

/**
 * Approve USDC collateral for trading via the relayer (gasless).
 * This approves the CTF exchange and Neg Risk CTF exchange to spend USDC from the Safe.
 */
export async function approveCollateral(privateKey: string): Promise<void> {
  const relayClient = await getRelayClient(privateKey);

  // USDC on Polygon (USDC.e bridged)
  const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  // Conditional Tokens Framework contract
  const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
  // CTF Exchange address
  const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
  // Neg Risk CTF Exchange
  const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
  // Neg Risk Adapter
  const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

  const MAX_ALLOWANCE =
    '115792089237316195423570985008687907853269984665640564039457584007913129639935';

  const { Interface } = await import('@ethersproject/abi');
  const erc20Iface = new Interface(['function approve(address spender, uint256 amount)']);
  const erc1155Iface = new Interface([
    'function setApprovalForAll(address operator, bool approved)',
  ]);

  const txns = [
    // USDC approvals
    {
      to: USDC_ADDRESS,
      data: erc20Iface.encodeFunctionData('approve', [CTF_EXCHANGE, MAX_ALLOWANCE]),
      value: '0',
    },
    {
      to: USDC_ADDRESS,
      data: erc20Iface.encodeFunctionData('approve', [NEG_RISK_CTF_EXCHANGE, MAX_ALLOWANCE]),
      value: '0',
    },
    {
      to: USDC_ADDRESS,
      data: erc20Iface.encodeFunctionData('approve', [NEG_RISK_ADAPTER, MAX_ALLOWANCE]),
      value: '0',
    },
    // Conditional token operator approvals (ERC1155 setApprovalForAll)
    {
      to: CTF_CONTRACT,
      data: erc1155Iface.encodeFunctionData('setApprovalForAll', [CTF_EXCHANGE, true]),
      value: '0',
    },
    {
      to: CTF_CONTRACT,
      data: erc1155Iface.encodeFunctionData('setApprovalForAll', [NEG_RISK_CTF_EXCHANGE, true]),
      value: '0',
    },
    {
      to: CTF_CONTRACT,
      data: erc1155Iface.encodeFunctionData('setApprovalForAll', [NEG_RISK_ADAPTER, true]),
      value: '0',
    },
  ];

  const response = await relayClient.execute(txns);

  const tx = await relayClient.pollUntilState(
    response.transactionID,
    ['STATE_MINED', 'STATE_CONFIRMED'],
    'STATE_FAILED',
    60,
    2000
  );

  if (!tx) {
    throw new Error('Collateral approval transaction failed or timed out');
  }
}

// ============================================================
// Credential Management
// ============================================================

/**
 * Get or create Polymarket CLOB API credentials for a given secret.
 * On first call, derives credentials via L1 auth and stores them in DB.
 */
async function getOrCreateCredentials(
  privateKey: string,
  secretId: string,
  safeAddress?: string
): Promise<ApiKeyCreds> {
  // Initialize proxy for geo-restricted regions before API calls
  await initializePolymarketProxy();

  // Check if credentials already exist
  const existing = await prisma.polymarketCredentials.findUnique({
    where: { secretId },
  });

  if (existing) {
    return {
      key: existing.apiKey,
      secret: existing.apiSecret,
      passphrase: existing.passphrase,
    };
  }

  // Derive credentials via L1 auth
  const wallet = new Wallet(privateKey);
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const { ClobClient, Chain } = await loadClobClient();
  const { SignatureType } = await loadOrderUtils();

  // If using a Safe, derive API key with POLY_GNOSIS_SAFE signature type
  let l1Client: InstanceType<typeof ClobClient>;
  if (safeAddress) {
    l1Client = new ClobClient(
      host,
      Chain.POLYGON,
      wallet,
      undefined, // no creds yet
      SignatureType.POLY_GNOSIS_SAFE,
      safeAddress
    );
  } else {
    l1Client = new ClobClient(host, Chain.POLYGON, wallet);
  }
  const creds = await l1Client.createOrDeriveApiKey();

  // Store credentials in DB
  await prisma.polymarketCredentials.create({
    data: {
      secretId,
      eoaAddress: wallet.address,
      apiKey: creds.key,
      apiSecret: creds.secret,
      passphrase: creds.passphrase,
    },
  });

  return creds;
}

/**
 * Build an authenticated ClobClient for a secret.
 * If safeAddress is provided, uses POLY_GNOSIS_SAFE signature type with builder config.
 */
async function buildClient(config: PolymarketClientConfig) {
  // Initialize proxy for geo-restricted regions (US, etc.)
  await initializePolymarketProxy();

  const wallet = new Wallet(config.privateKey);
  const creds = await getOrCreateCredentials(
    config.privateKey,
    config.secretId,
    config.safeAddress
  );
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const { ClobClient, Chain } = await loadClobClient();
  const { SignatureType } = await loadOrderUtils();

  if (config.safeAddress) {
    const builderConfig = await getBuilderConfig();
    return new ClobClient(
      host,
      Chain.POLYGON,
      wallet,
      creds,
      SignatureType.POLY_GNOSIS_SAFE,
      config.safeAddress,
      undefined, // geoBlockToken
      undefined, // useServerTime
      builderConfig
    );
  }

  return new ClobClient(host, Chain.POLYGON, wallet, creds);
}

/**
 * Get the EOA address from a private key.
 */
export function getEoaAddress(privateKey: string): string {
  return new Wallet(privateKey).address;
}

// ============================================================
// Market Info
// ============================================================

/**
 * Get market info by condition ID.
 */
export async function getMarket(conditionId: string): Promise<any> {
  const { ClobClient, Chain } = await loadClobClient();
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getMarket(conditionId);
}

/**
 * Get the order book for a token ID.
 */
export async function getOrderBook(tokenId: string): Promise<OrderBookSummary> {
  const { ClobClient, Chain } = await loadClobClient();
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getOrderBook(tokenId);
}

/**
 * Get the midpoint price for a token.
 */
export async function getMidpoint(tokenId: string): Promise<string> {
  const { ClobClient, Chain } = await loadClobClient();
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getMidpoint(tokenId);
}

/**
 * Browse markets (paginated).
 */
export async function getMarkets(nextCursor?: string) {
  const { ClobClient, Chain } = await loadClobClient();
  const host = env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const client = new ClobClient(host, Chain.POLYGON);
  return client.getSimplifiedMarkets(nextCursor);
}

// ============================================================
// Trading
// ============================================================

/**
 * Place a limit order (GTC - Good Till Cancelled).
 */
export async function placeLimitOrder(
  config: PolymarketClientConfig,
  params: {
    tokenId: string;
    side: Side;
    price: number;
    size: number;
  }
): Promise<any> {
  const client = await buildClient(config);

  const order = await client.createOrder({
    tokenID: params.tokenId,
    side: params.side,
    price: params.price,
    size: params.size,
  });

  const { OrderType } = await loadClobClient();
  const result = await client.postOrder(order, OrderType.GTC);
  validateOrderResponse(result);
  return result;
}

/**
 * Place a market order (FOK - Fill or Kill).
 */
export async function placeMarketOrder(
  config: PolymarketClientConfig,
  params: {
    tokenId: string;
    side: Side;
    amount: number;
  }
): Promise<any> {
  const client = await buildClient(config);

  const userMarketOrder: UserMarketOrder = {
    tokenID: params.tokenId,
    side: params.side,
    amount: params.amount,
  };

  const order = await client.createMarketOrder(userMarketOrder);
  const { OrderType } = await loadClobClient();
  const result = await client.postOrder(order, OrderType.FOK);
  validateOrderResponse(result);
  return result;
}

/**
 * Check if a response looks like a Cloudflare block page (geo-restriction).
 * Note: Polymarket blocks 33 countries including US, UK, Germany, France, etc.
 * The builder API key does NOT bypass geo-restrictions - it's for order attribution.
 * See: https://docs.polymarket.com/developers/CLOB/geoblock
 */
function isCloudflareBlock(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  return (
    data.includes('Cloudflare') &&
    (data.includes('Sorry, you have been blocked') ||
      data.includes('Attention Required') ||
      data.includes('cf-error-details'))
  );
}

/**
 * Validate that a CLOB order response is actually successful.
 */
function validateOrderResponse(result: any): void {
  if (!result) {
    throw new Error('CLOB returned empty response');
  }

  if (typeof result === 'string') {
    // Check for Cloudflare block (geo-restriction)
    if (isCloudflareBlock(result)) {
      throw new Error(
        'CLOB_GEO_BLOCKED: Polymarket blocks order placement from 33 countries including US, UK, Germany, France. ' +
          'The builder API key does NOT bypass geo-restrictions. ' +
          'Run from a non-restricted region (VPN/proxy to eu-west-1 recommended). ' +
          'See: https://docs.polymarket.com/developers/CLOB/geoblock'
      );
    }
    throw new Error(`CLOB returned unexpected response: ${result.slice(0, 200)}`);
  }

  if (result.error) {
    const errMsg =
      typeof result.error === 'string'
        ? result.error.slice(0, 200)
        : JSON.stringify(result.error).slice(0, 200);
    throw new Error(`CLOB order failed: ${errMsg}`);
  }

  if (!result.orderID && !result.success) {
    throw new Error(`CLOB order response missing orderID: ${JSON.stringify(result).slice(0, 200)}`);
  }
}

// ============================================================
// Positions & Orders
// ============================================================

/**
 * Get open orders for this wallet.
 */
export async function getOpenOrders(
  config: PolymarketClientConfig,
  params?: { market?: string; assetId?: string }
): Promise<OpenOrder[]> {
  const client = await buildClient(config);
  const response = await client.getOpenOrders(params);
  return response;
}

/**
 * Get trade history for this wallet.
 */
export async function getTrades(
  config: PolymarketClientConfig,
  params?: { market?: string; assetId?: string }
): Promise<Trade[]> {
  const client = await buildClient(config);
  return client.getTrades(params);
}

/**
 * Cancel a specific order.
 */
export async function cancelOrder(config: PolymarketClientConfig, orderId: string): Promise<any> {
  const client = await buildClient(config);
  return client.cancelOrder({ orderID: orderId });
}

/**
 * Cancel all open orders.
 */
export async function cancelAllOrders(config: PolymarketClientConfig): Promise<any> {
  const client = await buildClient(config);
  return client.cancelAll();
}

// ============================================================
// Balance
// ============================================================

/**
 * Get USDC collateral balance and allowance.
 */
export async function getCollateralBalance(
  config: PolymarketClientConfig
): Promise<BalanceAllowanceResponse> {
  const client = await buildClient(config);
  return client.getBalanceAllowance({
    asset_type: 'COLLATERAL' as AssetType,
  });
}

/**
 * Get conditional token balance for a specific token ID.
 */
export async function getConditionalBalance(
  config: PolymarketClientConfig,
  tokenId: string
): Promise<BalanceAllowanceResponse> {
  const client = await buildClient(config);
  return client.getBalanceAllowance({
    asset_type: 'CONDITIONAL' as AssetType,
    token_id: tokenId,
  });
}

/**
 * Update (set max) allowance for USDC collateral on the CTF exchange.
 */
export async function updateCollateralAllowance(config: PolymarketClientConfig): Promise<void> {
  const client = await buildClient(config);
  await client.updateBalanceAllowance({
    asset_type: 'COLLATERAL' as AssetType,
  });
}
