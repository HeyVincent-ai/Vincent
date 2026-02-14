/**
 * E2E Test: Raw Signer Skill on Base Sepolia
 *
 * Tests the raw signing functionality:
 * 1. Create a RAW_SIGNER secret
 * 2. Get both Ethereum and Solana addresses
 * 3. Fund the ETH address from funder wallet
 * 4. Sign a transaction using the raw signer API
 * 5. Broadcast the signed transaction
 * 6. Send remaining funds back to funder
 *
 * Required env vars:
 *   E2E_FUNDER_PRIVATE_KEY - Private key with ETH on Base Sepolia
 *   DATABASE_URL           - Real PostgreSQL database
 *
 * Run: npx vitest run src/e2e/rawSigner.e2e.test.ts --timeout 300000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Hex,
  type Address,
  serializeTransaction,
  keccak256,
  recoverPublicKey,
  hexToBytes,
  bytesToHex,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount, signTransaction } from 'viem/accounts';
import { createApp } from '../app';
import prisma from '../db/client';
import type { Express } from 'express';

// ============================================================
// Constants
// ============================================================

const BASE_SEPOLIA_CHAIN_ID = 84532;
const EXPLORER_BASE_URL = 'https://sepolia.basescan.org';

// Test amounts - small to minimize costs
const ETH_FUND_AMOUNT = '0.0002'; // ETH to fund the raw signer address
const ETH_SEND_AMOUNT = '0.00001'; // Small ETH transfer in test tx

// ============================================================
// Helpers
// ============================================================

function getFunderPrivateKey(): Hex {
  const key = process.env.E2E_FUNDER_PRIVATE_KEY;
  if (!key) throw new Error('E2E_FUNDER_PRIVATE_KEY env var is required');
  return key.startsWith('0x') ? (key as Hex) : (`0x${key}` as Hex);
}

function getBaseSepoliaRpcUrl(): string {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey) {
    return `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`;
  }
  // Fallback to public RPC
  return 'https://sepolia.base.org';
}

async function sendEth(fromPrivateKey: Hex, to: Address, amount: string): Promise<Hex> {
  const account = privateKeyToAccount(fromPrivateKey);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(getBaseSepoliaRpcUrl()),
  });

  const hash = await client.sendTransaction({
    to,
    value: parseEther(amount),
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(getBaseSepoliaRpcUrl()),
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

async function getEthBalance(address: Address): Promise<string> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(getBaseSepoliaRpcUrl()),
  });

  const balance = await publicClient.getBalance({ address });
  return formatEther(balance);
}

async function getNonce(address: Address): Promise<number> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(getBaseSepoliaRpcUrl()),
  });

  return await publicClient.getTransactionCount({ address });
}

async function getGasPrice(): Promise<bigint> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(getBaseSepoliaRpcUrl()),
  });

  return await publicClient.getGasPrice();
}

async function broadcastRawTransaction(serializedTx: Hex): Promise<Hex> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(getBaseSepoliaRpcUrl()),
  });

  const hash = await publicClient.sendRawTransaction({
    serializedTransaction: serializedTx,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Poll until the balance getter returns >= minAmount, with retries and delay */
async function waitForBalance(
  getter: () => Promise<string>,
  minAmount: string,
  { retries = 15, delayMs = 2000 } = {}
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    const balance = await getter();
    if (parseFloat(balance) >= parseFloat(minAmount)) {
      return balance;
    }
    console.log(`  Waiting for balance (attempt ${i + 1}/${retries}): ${balance} < ${minAmount}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Return last balance even if below threshold (test assertion will catch it)
  return getter();
}

// ============================================================
// Test Suite
// ============================================================

describe('Base Sepolia E2E: Raw Signer Skill Test', () => {
  let app: Express;
  let apiKey: string;
  let secretId: string;
  let ethAddress: Address;
  let solanaAddress: string;
  let ethPublicKey: string;
  let solanaPublicKey: string;
  let funderAddress: Address;

  // Evidence collected for verification
  const evidence: {
    fundEthTxHash?: string;
    signedTxHash?: string;
    returnEthTxHash?: string;
    initialFunderBalance?: string;
    finalFunderBalance?: string;
    finalSignerBalance?: string;
  } = {};

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    const funderKey = getFunderPrivateKey();
    funderAddress = privateKeyToAccount(funderKey).address;

    console.log(`\n========================================`);
    console.log(`  BASE SEPOLIA E2E TEST - RAW SIGNER`);
    console.log(`========================================`);
    console.log(`Funder address: ${funderAddress}`);

    // Check funder balance
    const funderEth = await getEthBalance(funderAddress);
    evidence.initialFunderBalance = funderEth;

    console.log(`Funder ETH balance: ${funderEth}`);

    // Verify sufficient funds
    expect(parseFloat(funderEth)).toBeGreaterThan(parseFloat(ETH_FUND_AMOUNT));
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
      if (ethAddress && apiKey) {
        // Check final balance
        const finalEth = await getEthBalance(ethAddress);
        evidence.finalSignerBalance = finalEth;

        console.log(`Raw signer final ETH: ${finalEth}`);

        // Return ETH if any remains (keeping some for gas)
        const ethBalance = parseFloat(finalEth);
        if (ethBalance > 0.00005) {
          // Get current gas price and estimate return amount
          const gasPrice = await getGasPrice();
          const gasLimit = 21000n;
          const gasCost = gasPrice * gasLimit;
          const balanceWei = parseEther(finalEth);
          const returnWei = balanceWei - gasCost - gasCost; // Extra buffer for safety

          if (returnWei > 0n) {
            const returnAmount = formatEther(returnWei);
            console.log(`Returning ${returnAmount} ETH to funder...`);

            // Build and sign return transaction using the raw signer
            const nonce = await getNonce(ethAddress);

            const tx = {
              to: funderAddress,
              value: returnWei,
              nonce,
              gasPrice,
              gas: gasLimit,
              chainId: BASE_SEPOLIA_CHAIN_ID,
            };

            const serializedUnsigned = serializeTransaction(tx);
            const txHash = keccak256(serializedUnsigned);

            // Sign using raw signer API
            const signRes = await request(app)
              .post('/api/skills/raw-signer/sign')
              .set('Authorization', `Bearer ${apiKey}`)
              .send({
                message: txHash,
                curve: 'ethereum',
              });

            if (signRes.status === 200 && signRes.body.data?.signature) {
              const signature = signRes.body.data.signature as Hex;
              // Parse signature: r (32 bytes) + s (32 bytes) + v (1 byte)
              const r = ('0x' + signature.slice(2, 66)) as Hex;
              const s = ('0x' + signature.slice(66, 130)) as Hex;
              const v = parseInt(signature.slice(130, 132), 16);

              const signedTx = serializeTransaction(tx, {
                r,
                s,
                v: BigInt(v),
              });

              const hash = await broadcastRawTransaction(signedTx);
              evidence.returnEthTxHash = hash;
              console.log(`ETH return tx: ${EXPLORER_BASE_URL}/tx/${hash}`);
            }
          }
        }
      }

      // Record final funder balance
      if (funderAddress) {
        evidence.finalFunderBalance = await getEthBalance(funderAddress);
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }

    // ============================================================
    // Print evidence summary
    // ============================================================
    console.log('\n========================================');
    console.log('  BASE SEPOLIA E2E TEST EVIDENCE');
    console.log('========================================');
    console.log(`ETH Address: ${ethAddress}`);
    console.log(`ETH Public Key: ${ethPublicKey?.slice(0, 20)}...`);
    console.log(`Solana Address: ${solanaAddress}`);
    console.log(`Solana Public Key: ${solanaPublicKey?.slice(0, 20)}...`);
    console.log(`Secret ID: ${secretId}`);
    console.log(`Funder: ${funderAddress}`);
    console.log(`\nInitial funder ETH: ${evidence.initialFunderBalance}`);
    console.log(`\nTransactions:`);
    if (evidence.fundEthTxHash) {
      console.log(`  Fund ETH: ${EXPLORER_BASE_URL}/tx/${evidence.fundEthTxHash}`);
    }
    if (evidence.signedTxHash) {
      console.log(`  Signed Tx: ${EXPLORER_BASE_URL}/tx/${evidence.signedTxHash}`);
    }
    if (evidence.returnEthTxHash) {
      console.log(`  Return ETH: ${EXPLORER_BASE_URL}/tx/${evidence.returnEthTxHash}`);
    }
    console.log(`\nFinal raw signer ETH: ${evidence.finalSignerBalance}`);
    console.log(`Final funder ETH: ${evidence.finalFunderBalance}`);
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
        await prisma.rawSignerMetadata.deleteMany({ where: { secretId } });
        await prisma.secret.delete({ where: { id: secretId } }).catch(() => {});
      }
    } catch (err) {
      console.error('DB cleanup failed:', err);
    }

    await prisma.$disconnect();
  }, 300_000);

  // ============================================================
  // Test 1: Create a raw signer
  // ============================================================

  it('should create a raw signer', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .send({
        type: 'RAW_SIGNER',
        memo: 'E2E test raw signer - Base Sepolia',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.secret.ethAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(res.body.data.secret.solanaAddress).toBeTruthy();
    // Verify public keys are returned
    expect(res.body.data.secret.ethPublicKey).toMatch(/^0x[a-fA-F0-9]{130}$/); // Uncompressed: 65 bytes = 130 hex chars
    expect(res.body.data.secret.solanaPublicKey).toMatch(/^0x[a-fA-F0-9]{64}$/); // ed25519: 32 bytes = 64 hex chars
    expect(res.body.data.apiKey.key).toMatch(/^ssk_/);
    expect(res.body.data.claimUrl).toBeTruthy();

    apiKey = res.body.data.apiKey.key;
    secretId = res.body.data.secret.id;
    ethAddress = res.body.data.secret.ethAddress as Address;
    solanaAddress = res.body.data.secret.solanaAddress;
    ethPublicKey = res.body.data.secret.ethPublicKey;
    solanaPublicKey = res.body.data.secret.solanaPublicKey;

    console.log(`\nCreated raw signer:`);
    console.log(`  ETH Address: ${ethAddress}`);
    console.log(`  ETH Public Key: ${ethPublicKey.slice(0, 20)}...`);
    console.log(`  Solana Address: ${solanaAddress}`);
    console.log(`  Solana Public Key: ${solanaPublicKey.slice(0, 20)}...`);
    console.log(`  Secret ID: ${secretId}`);
    console.log(`  Claim URL: ${res.body.data.claimUrl}`);
  }, 30_000);

  // ============================================================
  // Test 2: Get addresses via API
  // ============================================================

  it('should get both addresses and public keys via API', async () => {
    const res = await request(app)
      .get('/api/skills/raw-signer/addresses')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.ethAddress).toBe(ethAddress);
    expect(res.body.data.solanaAddress).toBe(solanaAddress);
    // Verify public keys are returned and match
    expect(res.body.data.ethPublicKey).toBe(ethPublicKey);
    expect(res.body.data.solanaPublicKey).toBe(solanaPublicKey);

    console.log(`Addresses endpoint confirmed:`);
    console.log(`  ETH: ${res.body.data.ethAddress}`);
    console.log(`  ETH Public Key: ${res.body.data.ethPublicKey.slice(0, 20)}...`);
    console.log(`  Solana: ${res.body.data.solanaAddress}`);
    console.log(`  Solana Public Key: ${res.body.data.solanaPublicKey.slice(0, 20)}...`);
  }, 30_000);

  // ============================================================
  // Test 3: Check balance (should be 0 before funding)
  // ============================================================

  it('should show zero balance before funding', async () => {
    const balance = await getEthBalance(ethAddress);
    expect(parseFloat(balance)).toBe(0);
    console.log(`Initial ETH balance: ${balance}`);
  }, 30_000);

  // ============================================================
  // Test 4: Fund the raw signer address
  // ============================================================

  it('should be funded by the funder wallet', async () => {
    const funderKey = getFunderPrivateKey();

    console.log(`Funding raw signer with ${ETH_FUND_AMOUNT} ETH...`);
    const ethTxHash = await sendEth(funderKey, ethAddress, ETH_FUND_AMOUNT);
    evidence.fundEthTxHash = ethTxHash;
    console.log(`ETH fund tx: ${EXPLORER_BASE_URL}/tx/${ethTxHash}`);

    // Verify funding (poll to allow RPC eventual consistency)
    const ethBalance = await waitForBalance(
      () => getEthBalance(ethAddress),
      ETH_FUND_AMOUNT
    );
    console.log(`Raw signer ETH balance: ${ethBalance}`);

    expect(parseFloat(ethBalance)).toBeGreaterThanOrEqual(parseFloat(ETH_FUND_AMOUNT));
  }, 120_000);

  // ============================================================
  // Test 5: Sign a message with Ethereum curve
  // ============================================================

  it('should sign a message with ethereum curve', async () => {
    // Sign a simple test message
    const testMessage = '0x48656c6c6f20576f726c6421'; // "Hello World!" in hex

    const res = await request(app)
      .post('/api/skills/raw-signer/sign')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        message: testMessage,
        curve: 'ethereum',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(res.body.data.publicKey).toBe(ethAddress);

    console.log(`Ethereum signature: ${res.body.data.signature.slice(0, 66)}...`);
  }, 30_000);

  // ============================================================
  // Test 6: Sign a message with Solana curve
  // ============================================================

  it('should sign a message with solana curve', async () => {
    // Sign a simple test message
    const testMessage = '0x48656c6c6f20576f726c6421'; // "Hello World!" in hex

    const res = await request(app)
      .post('/api/skills/raw-signer/sign')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        message: testMessage,
        curve: 'solana',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(res.body.data.publicKey).toBe(solanaAddress);

    // Ed25519 signatures are 64 bytes = 128 hex chars + 0x prefix
    expect(res.body.data.signature.length).toBe(130);

    console.log(`Solana signature: ${res.body.data.signature.slice(0, 66)}...`);
  }, 30_000);

  // ============================================================
  // Test 7: Sign and broadcast a real transaction
  // ============================================================

  it('should sign and broadcast a real transaction to 0x0...0', async () => {
    const nonce = await getNonce(ethAddress);
    const gasPrice = await getGasPrice();
    const gasLimit = 21000n;

    // Send 0 value to null address (burn address for testing)
    const nullAddress = '0x0000000000000000000000000000000000000000' as Address;

    const tx = {
      to: nullAddress,
      value: 0n,
      nonce,
      gasPrice,
      gas: gasLimit,
      chainId: BASE_SEPOLIA_CHAIN_ID,
    };

    // Serialize the unsigned transaction and hash it
    const serializedUnsigned = serializeTransaction(tx);
    const txHash = keccak256(serializedUnsigned);

    console.log(`Transaction hash to sign: ${txHash}`);

    // Sign using raw signer API
    const signRes = await request(app)
      .post('/api/skills/raw-signer/sign')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        message: txHash,
        curve: 'ethereum',
      })
      .expect(200);

    expect(signRes.body.success).toBe(true);
    expect(signRes.body.data.status).toBe('executed');

    const signature = signRes.body.data.signature as Hex;
    console.log(`Signature received: ${signature}`);

    // Parse signature: r (32 bytes) + s (32 bytes) + v (1 byte)
    const r = ('0x' + signature.slice(2, 66)) as Hex;
    const s = ('0x' + signature.slice(66, 130)) as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    console.log(`Parsed signature - r: ${r.slice(0, 20)}..., s: ${s.slice(0, 20)}..., v: ${v}`);

    // Serialize the signed transaction
    const signedTx = serializeTransaction(tx, {
      r,
      s,
      v: BigInt(v),
    });

    console.log(`Signed transaction: ${signedTx.slice(0, 66)}...`);

    // Broadcast the transaction
    const hash = await broadcastRawTransaction(signedTx);
    evidence.signedTxHash = hash;

    console.log(`\n🎉 Transaction broadcast successfully!`);
    console.log(`   TX Hash: ${hash}`);
    console.log(`   Explorer: ${EXPLORER_BASE_URL}/tx/${hash}`);

    expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  }, 180_000);

  // ============================================================
  // Test 8: Verify balance reduced after gas
  // ============================================================

  it('should have reduced balance after transaction', async () => {
    const balance = await getEthBalance(ethAddress);
    console.log(`Balance after tx: ${balance}`);

    // Should have less than we funded (gas was spent)
    expect(parseFloat(balance)).toBeLessThan(parseFloat(ETH_FUND_AMOUNT));
    expect(parseFloat(balance)).toBeGreaterThan(0);
  }, 30_000);
});
