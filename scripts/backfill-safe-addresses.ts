/**
 * One-off script to deploy Safes for existing POLYMARKET_WALLET secrets
 * that have a NULL safe_address.
 *
 * Run BEFORE the migration that makes safe_address NOT NULL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." \
 *   ALCHEMY_API_KEY="..." \
 *   POLY_BUILDER_API_KEY="..." \
 *   POLY_BUILDER_SECRET="..." \
 *   POLY_BUILDER_PASSPHRASE="..." \
 *   npx tsx scripts/backfill-safe-addresses.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Inline the deploy logic to avoid importing the full app env validation.
// This mirrors polymarket.service.ts deploySafe + approveCollateral.

async function deploySafe(privateKey: string): Promise<string> {
  const { Wallet } = await import('@ethersproject/wallet');
  const { JsonRpcProvider } = await import('@ethersproject/providers');
  const { RelayClient, RelayerTxType } = await import(
    '@polymarket/builder-relayer-client'
  );
  const { BuilderConfig } = await import('@polymarket/builder-signing-sdk');

  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const rpcUrl = alchemyKey
    ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://polygon-rpc.com';
  const provider = new JsonRpcProvider(rpcUrl, 137);
  const wallet = new Wallet(privateKey, provider);

  const relayerUrl =
    process.env.POLYMARKET_RELAYER_HOST || 'https://relayer-v2.polymarket.com/';

  let builderConfig: InstanceType<typeof BuilderConfig> | undefined;
  if (
    process.env.POLY_BUILDER_API_KEY &&
    process.env.POLY_BUILDER_SECRET &&
    process.env.POLY_BUILDER_PASSPHRASE
  ) {
    builderConfig = new BuilderConfig({
      localBuilderCreds: {
        key: process.env.POLY_BUILDER_API_KEY,
        secret: process.env.POLY_BUILDER_SECRET,
        passphrase: process.env.POLY_BUILDER_PASSPHRASE,
      },
    });
  }

  const relayClient = new RelayClient(
    relayerUrl,
    137,
    wallet,
    builderConfig,
    RelayerTxType.SAFE
  );

  const relayPayload = await relayClient.getRelayPayload(
    wallet.address,
    'SAFE'
  );
  const expectedSafeAddress = relayPayload.address;
  console.log(`  Deploying safe ${expectedSafeAddress}...`);

  const response = await relayClient.deploy();

  const tx = await relayClient.pollUntilState(
    response.transactionID,
    ['STATE_MINED', 'STATE_CONFIRMED'],
    'STATE_FAILED',
    60,
    2000
  );

  if (!tx) {
    throw new Error('Safe deployment transaction failed or timed out');
  }

  const safeAddress = tx.proxyAddress || expectedSafeAddress;
  console.log(`  Safe deployed at ${safeAddress} (tx: ${tx.transactionHash})`);
  return safeAddress;
}

async function approveCollateral(privateKey: string): Promise<void> {
  const { Wallet } = await import('@ethersproject/wallet');
  const { JsonRpcProvider } = await import('@ethersproject/providers');
  const { Interface } = await import('@ethersproject/abi');
  const { RelayClient, RelayerTxType } = await import(
    '@polymarket/builder-relayer-client'
  );
  const { BuilderConfig } = await import('@polymarket/builder-signing-sdk');

  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const rpcUrl = alchemyKey
    ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://polygon-rpc.com';
  const provider = new JsonRpcProvider(rpcUrl, 137);
  const wallet = new Wallet(privateKey, provider);

  const relayerUrl =
    process.env.POLYMARKET_RELAYER_HOST || 'https://relayer-v2.polymarket.com/';

  let builderConfig: InstanceType<typeof BuilderConfig> | undefined;
  if (
    process.env.POLY_BUILDER_API_KEY &&
    process.env.POLY_BUILDER_SECRET &&
    process.env.POLY_BUILDER_PASSPHRASE
  ) {
    builderConfig = new BuilderConfig({
      localBuilderCreds: {
        key: process.env.POLY_BUILDER_API_KEY,
        secret: process.env.POLY_BUILDER_SECRET,
        passphrase: process.env.POLY_BUILDER_PASSPHRASE,
      },
    });
  }

  const relayClient = new RelayClient(
    relayerUrl,
    137,
    wallet,
    builderConfig,
    RelayerTxType.SAFE
  );

  const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
  const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
  const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
  const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
  const MAX_ALLOWANCE =
    '115792089237316195423570985008687907853269984665640564039457584007913129639935';

  const erc20Iface = new Interface([
    'function approve(address spender, uint256 amount)',
  ]);
  const erc1155Iface = new Interface([
    'function setApprovalForAll(address operator, bool approved)',
  ]);

  const txns = [
    {
      to: USDC_ADDRESS,
      data: erc20Iface.encodeFunctionData('approve', [
        CTF_EXCHANGE,
        MAX_ALLOWANCE,
      ]),
      value: '0',
    },
    {
      to: USDC_ADDRESS,
      data: erc20Iface.encodeFunctionData('approve', [
        NEG_RISK_CTF_EXCHANGE,
        MAX_ALLOWANCE,
      ]),
      value: '0',
    },
    {
      to: USDC_ADDRESS,
      data: erc20Iface.encodeFunctionData('approve', [
        NEG_RISK_ADAPTER,
        MAX_ALLOWANCE,
      ]),
      value: '0',
    },
    {
      to: CTF_CONTRACT,
      data: erc1155Iface.encodeFunctionData('setApprovalForAll', [
        CTF_EXCHANGE,
        true,
      ]),
      value: '0',
    },
    {
      to: CTF_CONTRACT,
      data: erc1155Iface.encodeFunctionData('setApprovalForAll', [
        NEG_RISK_CTF_EXCHANGE,
        true,
      ]),
      value: '0',
    },
    {
      to: CTF_CONTRACT,
      data: erc1155Iface.encodeFunctionData('setApprovalForAll', [
        NEG_RISK_ADAPTER,
        true,
      ]),
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

  console.log(`  Collateral approved (tx: ${tx.transactionHash})`);
}

async function main() {
  // Find all polymarket wallet metadata rows missing a safe address.
  // Use raw SQL because the Prisma client now types safeAddress as non-nullable.
  const rows = await prisma.$queryRaw<
    Array<{ secret_id: string; value: string | null }>
  >`
    SELECT m.secret_id, s.value
    FROM polymarket_wallet_metadata m
    JOIN secrets s ON s.id = m.secret_id
    WHERE m.safe_address IS NULL
  `;

  console.log(
    `Found ${rows.length} POLYMARKET_WALLET secret(s) with NULL safe_address.\n`
  );

  if (rows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const secretId = row.secret_id;
    const privateKey = row.value;
    console.log(`[${secretId}] Processing...`);

    if (!privateKey) {
      console.log(`[${secretId}] SKIP - no private key stored`);
      failed++;
      continue;
    }

    try {
      const safeAddress = await deploySafe(privateKey);

      console.log(`[${secretId}] Approving collateral...`);
      await approveCollateral(privateKey);

      await prisma.polymarketWalletMetadata.update({
        where: { secretId },
        data: { safeAddress },
      });

      console.log(`[${secretId}] OK - safe_address = ${safeAddress}\n`);
      succeeded++;
    } catch (err) {
      console.error(`[${secretId}] FAILED:`, err);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  if (failed > 0) {
    console.log(
      'WARNING: Some wallets failed. Fix issues and re-run before applying the migration.'
    );
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
