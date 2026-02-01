/**
 * E2E Test: ERC20 transfer on Base Sepolia with gas sponsorship
 *
 * This test hits real Base Sepolia (chainId 84532) via ZeroDev.
 * It creates a wallet, then sends a 0-amount USDC transfer to prove
 * gas sponsorship is working (the smart account has no ETH for gas).
 *
 * Required env vars:
 *   ZERODEV_PROJECT_ID - ZeroDev project with Base Sepolia enabled
 *   DATABASE_URL       - Real PostgreSQL database
 *
 * Run: npx vitest run src/e2e/baseSepolia.e2e.test.ts --timeout 120000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import prisma from '../db/client';
import type { Express } from 'express';

const BASE_SEPOLIA_CHAIN_ID = 84532;

// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Burn address as recipient (doesn't matter for 0-amount transfer)
const RECIPIENT = '0x000000000000000000000000000000000000dEaD';

describe('Base Sepolia E2E: ERC20 Transfer with Gas Sponsorship', () => {
  let app: Express;
  let apiKey: string;
  let secretId: string;
  let smartAccountAddress: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();
  }, 30_000);

  afterAll(async () => {
    // Clean up test data
    if (secretId) {
      await prisma.transactionLog.deleteMany({ where: { secretId } });
      await prisma.policy.deleteMany({ where: { secretId } });
      await prisma.apiKey.deleteMany({ where: { secretId } });
      await prisma.walletSecretMetadata.deleteMany({ where: { secretId } });
      await prisma.secret.delete({ where: { id: secretId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should create a wallet on Base Sepolia', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .send({
        type: 'EVM_WALLET',
        memo: 'E2E test wallet - Base Sepolia',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.secret.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(res.body.data.apiKey.key).toMatch(/^ssk_/);

    apiKey = res.body.data.apiKey.key;
    secretId = res.body.data.secret.id;
    smartAccountAddress = res.body.data.secret.walletAddress;

    console.log(`Smart account: ${smartAccountAddress}`);
    console.log(`Secret ID: ${secretId}`);
  }, 60_000);

  it('should get the wallet address', async () => {
    const res = await request(app)
      .get('/api/skills/evm-wallet/address')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.data.smartAccountAddress).toBe(smartAccountAddress);
  }, 30_000);

  it('should get balance (ETH should be 0, proving no native gas needed)', async () => {
    const res = await request(app)
      .get(`/api/skills/evm-wallet/balance?chainId=${BASE_SEPOLIA_CHAIN_ID}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.data.eth.balance).toBe('0');
    expect(res.body.data.chainId).toBe(BASE_SEPOLIA_CHAIN_ID);  // chainId echoed from request
    console.log(`ETH balance: ${res.body.data.eth.balance} (confirming no native gas)`);
  }, 30_000);

  it('should execute a 0-amount ERC20 transfer with sponsored gas', async () => {
    const res = await request(app)
      .post('/api/skills/evm-wallet/transfer')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        to: RECIPIENT,
        amount: '0',
        token: USDC_ADDRESS,
        chainId: BASE_SEPOLIA_CHAIN_ID,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(res.body.data.smartAccountAddress).toBe(smartAccountAddress);

    console.log(`TX Hash: ${res.body.data.txHash}`);
    console.log(`Explorer: https://sepolia.basescan.org/tx/${res.body.data.txHash}`);
  }, 120_000);
});
