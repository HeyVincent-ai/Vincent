/**
 * Integration Test: Ownership Routes & Service
 *
 * Tests the full take-ownership flow through the HTTP API:
 *   GET  /api/secrets/:secretId/take-ownership/status
 *   POST /api/secrets/:secretId/take-ownership/challenge
 *   POST /api/secrets/:secretId/take-ownership/verify
 *
 * Auth is mocked (Stytch bypassed). ZeroDev executeRecovery is mocked
 * so no real chain interaction is needed.
 *
 * Required env vars:
 *   DATABASE_URL
 *
 * Run: npx vitest run src/e2e/ownership.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex, Address } from 'viem';
import prisma from '../db/client.js';
import type { User } from '@prisma/client';

// ============================================================
// Mocks — must be before imports that use them
// ============================================================

// Mock auth so we can bypass Stytch
vi.mock('../services/auth.service.js', () => ({
  validateSession: vi.fn(),
  syncSession: vi.fn(),
  revokeSession: vi.fn(),
}));

// Mock ZeroDev so we don't hit real chains
vi.mock('../skills/zerodev.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skills/zerodev.service.js')>();
  return {
    ...actual,
    executeRecovery: vi.fn(),
  };
});

// Import after mocks
import { validateSession } from '../services/auth.service.js';
import { executeRecovery } from '../skills/zerodev.service.js';
import { createApp } from '../app.js';

// ============================================================
// Constants
// ============================================================

const TEST_TOKEN = 'test-session-token-ownership-e2e';
const SMART_ACCOUNT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const CHAIN_ID = 84532; // Base Sepolia

// ============================================================
// Test suite
// ============================================================

describe('Ownership Routes & Service Integration', () => {
  let app: ReturnType<typeof createApp>;
  let request: supertest.Agent;
  let testUser: User;
  let secretId: string;
  let userPrivateKey: Hex;
  let userAddress: Address;

  // ----------------------------------------------------------
  // Setup
  // ----------------------------------------------------------

  beforeAll(async () => {
    await prisma.$connect();

    // Generate a random EOA to act as the user taking ownership
    userPrivateKey = generatePrivateKey();
    userAddress = privateKeyToAccount(userPrivateKey).address;

    // Create test user
    testUser = await prisma.user.upsert({
      where: { email: 'ownership-e2e-test@test.local' },
      update: {},
      create: {
        email: 'ownership-e2e-test@test.local',
        stytchUserId: 'stytch-ownership-e2e-test',
      },
    });

    // Mock auth to return our test user
    vi.mocked(validateSession).mockResolvedValue(testUser);

    // Mock executeRecovery to return a fake tx hash
    vi.mocked(executeRecovery).mockResolvedValue(
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`
    );

    // Create a secret with wallet metadata, owned by our test user
    const secret = await prisma.secret.create({
      data: {
        userId: testUser.id,
        type: 'EVM_WALLET',
        value: generatePrivateKey(), // dummy key, won't be used for real txs
        memo: 'Ownership integration test wallet',
        claimedAt: new Date(),
        walletMetadata: {
          create: {
            smartAccountAddress: SMART_ACCOUNT_ADDRESS,
            canTakeOwnership: true,
            ownershipTransferred: false,
            chainsUsed: [CHAIN_ID],
            sessionKeyData: 'mock-session-key-data',
          },
        },
      },
    });
    secretId = secret.id;

    // Create app and agent
    app = createApp();
    request = supertest.agent(app);

    console.log('\n========================================');
    console.log('  OWNERSHIP INTEGRATION TEST');
    console.log('========================================');
    console.log(`  Test user: ${testUser.id}`);
    console.log(`  Secret: ${secretId}`);
    console.log(`  User EOA: ${userAddress}`);
    console.log('========================================\n');
  }, 30_000);

  // ----------------------------------------------------------
  // Teardown
  // ----------------------------------------------------------

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { secretId } }).catch(() => {});
    await prisma.ownershipChallenge.deleteMany({ where: { secretId } }).catch(() => {});
    await prisma.walletSecretMetadata.deleteMany({ where: { secretId } }).catch(() => {});
    await prisma.secret.delete({ where: { id: secretId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.$disconnect();
  }, 30_000);

  // Reset mocks between tests (keep default behavior)
  beforeEach(() => {
    vi.mocked(validateSession).mockResolvedValue(testUser);
    vi.mocked(executeRecovery).mockResolvedValue(
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`
    );
  });

  // ============================================================
  // GET /status
  // ============================================================

  describe('GET /status', () => {
    it('should return ownership status (not transferred)', async () => {
      const res = await request
        .get(`/api/secrets/${secretId}/take-ownership/status`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.canTakeOwnership).toBe(true);
      expect(res.body.data.ownershipTransferred).toBe(false);
      expect(res.body.data.ownerAddress).toBeNull();
      expect(res.body.data.chainsUsed).toEqual([CHAIN_ID]);
    });

    it('should reject unauthenticated requests', async () => {
      vi.mocked(validateSession).mockResolvedValueOnce(null);

      await request
        .get(`/api/secrets/${secretId}/take-ownership/status`)
        .set('Authorization', 'Bearer bad-token')
        .expect(401);
    });

    it('should reject requests from non-owner', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'ownership-e2e-other@test.local',
          stytchUserId: 'stytch-ownership-e2e-other',
        },
      });

      vi.mocked(validateSession).mockResolvedValueOnce(otherUser);

      await request
        .get(`/api/secrets/${secretId}/take-ownership/status`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .expect(403);

      await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => {});
    });
  });

  // ============================================================
  // POST /challenge
  // ============================================================

  describe('POST /challenge', () => {
    it('should generate a challenge message', async () => {
      const res = await request
        .post(`/api/secrets/${secretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.challenge).toContain('SafeSkills Ownership Verification');
      expect(res.body.data.challenge).toContain(SMART_ACCOUNT_ADDRESS);
      expect(res.body.data.challenge).toContain(userAddress);
      expect(res.body.data.expiresAt).toBeDefined();
      expect(res.body.data.chainsToTransfer).toEqual([CHAIN_ID]);

      // Verify challenge was stored in DB
      const stored = await prisma.ownershipChallenge.findUnique({
        where: {
          secretId_address: {
            secretId,
            address: userAddress.toLowerCase(),
          },
        },
      });
      expect(stored).not.toBeNull();
      expect(stored!.challenge).toBe(res.body.data.challenge);
    });

    it('should reject invalid Ethereum address', async () => {
      const res = await request
        .post(`/api/secrets/${secretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: 'not-an-address' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject if address is missing', async () => {
      await request
        .post(`/api/secrets/${secretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({})
        .expect(400);
    });
  });

  // ============================================================
  // POST /verify — happy path
  // ============================================================

  describe('POST /verify', () => {
    it('should verify signature and transfer ownership', async () => {
      // Step 1: Request challenge
      const challengeRes = await request
        .post(`/api/secrets/${secretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(200);

      const { challenge } = challengeRes.body.data;

      // Step 2: Sign challenge with user's private key (real signature)
      const userAccount = privateKeyToAccount(userPrivateKey);
      const signature = await userAccount.signMessage({ message: challenge });

      // Step 3: Verify and transfer
      const verifyRes = await request
        .post(`/api/secrets/${secretId}/take-ownership/verify`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress, signature })
        .expect(200);

      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.message).toContain('successfully');
      expect(verifyRes.body.data.newOwner).toBe(userAddress);
      expect(verifyRes.body.data.txHashes[CHAIN_ID]).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      );

      // Verify executeRecovery was called with correct args
      expect(executeRecovery).toHaveBeenCalledWith(
        expect.any(String), // privateKey
        CHAIN_ID,
        SMART_ACCOUNT_ADDRESS,
        userAddress
      );

      // Verify DB updated
      const metadata = await prisma.walletSecretMetadata.findUnique({
        where: { secretId },
      });
      expect(metadata!.ownershipTransferred).toBe(true);
      expect(metadata!.ownerAddress).toBe(userAddress);
      expect(metadata!.transferredAt).toBeDefined();
      expect(metadata!.transferTxHash).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      );

      // Verify challenge was consumed (deleted from DB)
      const challenge2 = await prisma.ownershipChallenge.findUnique({
        where: {
          secretId_address: {
            secretId,
            address: userAddress.toLowerCase(),
          },
        },
      });
      expect(challenge2).toBeNull();
    });

    it('should show transferred status after ownership transfer', async () => {
      const res = await request
        .get(`/api/secrets/${secretId}/take-ownership/status`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .expect(200);

      expect(res.body.data.ownershipTransferred).toBe(true);
      expect(res.body.data.ownerAddress).toBe(userAddress);
      expect(res.body.data.transferredAt).toBeDefined();
    });

    it('should reject challenge request after already transferred', async () => {
      const res = await request
        .post(`/api/secrets/${secretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(409);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /verify — error cases (use a fresh wallet)
  // ============================================================

  describe('POST /verify error cases', () => {
    let freshSecretId: string;

    beforeAll(async () => {
      // Create a fresh secret for error case tests
      const secret = await prisma.secret.create({
        data: {
          userId: testUser.id,
          type: 'EVM_WALLET',
          value: generatePrivateKey(),
          memo: 'Ownership error cases test wallet',
          claimedAt: new Date(),
          walletMetadata: {
            create: {
              smartAccountAddress: '0xaabbccddaabbccddaabbccddaabbccddaabbccdd',
              canTakeOwnership: true,
              ownershipTransferred: false,
              chainsUsed: [CHAIN_ID],
              sessionKeyData: 'mock-session-key-data-2',
            },
          },
        },
      });
      freshSecretId = secret.id;
    });

    afterAll(async () => {
      await prisma.auditLog.deleteMany({ where: { secretId: freshSecretId } }).catch(() => {});
      await prisma.ownershipChallenge.deleteMany({ where: { secretId: freshSecretId } }).catch(() => {});
      await prisma.walletSecretMetadata.deleteMany({ where: { secretId: freshSecretId } }).catch(() => {});
      await prisma.secret.delete({ where: { id: freshSecretId } }).catch(() => {});
    });

    it('should reject verify without a prior challenge', async () => {
      const userAccount = privateKeyToAccount(userPrivateKey);
      const signature = await userAccount.signMessage({ message: 'bogus message' });

      const res = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/verify`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress, signature })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject verify with wrong signature (different signer)', async () => {
      // Request challenge
      const challengeRes = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(200);

      const { challenge } = challengeRes.body.data;

      // Sign with a DIFFERENT key
      const wrongKey = generatePrivateKey();
      const wrongAccount = privateKeyToAccount(wrongKey);
      const wrongSignature = await wrongAccount.signMessage({ message: challenge });

      const res = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/verify`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress, signature: wrongSignature })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject expired challenge', async () => {
      // Request challenge
      const challengeRes = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(200);

      const { challenge } = challengeRes.body.data;

      // Manually expire the challenge in DB
      await prisma.ownershipChallenge.updateMany({
        where: { secretId: freshSecretId, address: userAddress.toLowerCase() },
        data: { expiresAt: new Date(Date.now() - 1000) }, // 1 second ago
      });

      // Sign and verify
      const userAccount = privateKeyToAccount(userPrivateKey);
      const signature = await userAccount.signMessage({ message: challenge });

      const res = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/verify`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress, signature })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid signature format', async () => {
      const res = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/verify`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress, signature: 'not-a-hex-signature' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should handle executeRecovery failure gracefully', async () => {
      vi.mocked(executeRecovery).mockRejectedValueOnce(new Error('Bundler error: insufficient funds'));

      // Request and sign challenge
      const challengeRes = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(200);

      const userAccount = privateKeyToAccount(userPrivateKey);
      const signature = await userAccount.signMessage({
        message: challengeRes.body.data.challenge,
      });

      const res = await request
        .post(`/api/secrets/${freshSecretId}/take-ownership/verify`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress, signature })
        .expect(500);

      expect(res.body.success).toBe(false);

      // Verify ownership was NOT transferred
      const metadata = await prisma.walletSecretMetadata.findUnique({
        where: { secretId: freshSecretId },
      });
      expect(metadata!.ownershipTransferred).toBe(false);
    });
  });

  // ============================================================
  // Edge cases: wallet not eligible
  // ============================================================

  describe('Eligibility edge cases', () => {
    it('should reject challenge for wallet with canTakeOwnership=false', async () => {
      const secret = await prisma.secret.create({
        data: {
          userId: testUser.id,
          type: 'EVM_WALLET',
          value: generatePrivateKey(),
          memo: 'Legacy wallet (no self-custody)',
          claimedAt: new Date(),
          walletMetadata: {
            create: {
              smartAccountAddress: '0x1111111111111111111111111111111111111111',
              canTakeOwnership: false,
              ownershipTransferred: false,
              chainsUsed: [CHAIN_ID],
            },
          },
        },
      });

      const res = await request
        .post(`/api/secrets/${secret.id}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(400);

      expect(res.body.success).toBe(false);

      // Cleanup
      await prisma.walletSecretMetadata.deleteMany({ where: { secretId: secret.id } });
      await prisma.secret.delete({ where: { id: secret.id } });
    });

    it('should reject challenge for wallet with no chains used', async () => {
      const secret = await prisma.secret.create({
        data: {
          userId: testUser.id,
          type: 'EVM_WALLET',
          value: generatePrivateKey(),
          memo: 'Unused wallet',
          claimedAt: new Date(),
          walletMetadata: {
            create: {
              smartAccountAddress: '0x2222222222222222222222222222222222222222',
              canTakeOwnership: true,
              ownershipTransferred: false,
              chainsUsed: [], // No chains used
            },
          },
        },
      });

      const res = await request
        .post(`/api/secrets/${secret.id}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(400);

      expect(res.body.success).toBe(false);

      // Cleanup
      await prisma.walletSecretMetadata.deleteMany({ where: { secretId: secret.id } });
      await prisma.secret.delete({ where: { id: secret.id } });
    });

    it('should call executeRecovery for each chain in chainsUsed', async () => {
      const multiChainSecret = await prisma.secret.create({
        data: {
          userId: testUser.id,
          type: 'EVM_WALLET',
          value: generatePrivateKey(),
          memo: 'Multi-chain wallet',
          claimedAt: new Date(),
          walletMetadata: {
            create: {
              smartAccountAddress: '0x3333333333333333333333333333333333333333',
              canTakeOwnership: true,
              ownershipTransferred: false,
              chainsUsed: [84532, 11155111], // Base Sepolia + Sepolia
              sessionKeyData: 'mock-session-key-data-multi',
            },
          },
        },
      });

      vi.mocked(executeRecovery)
        .mockResolvedValueOnce('0xaaaa000000000000000000000000000000000000000000000000000000000001' as `0x${string}`)
        .mockResolvedValueOnce('0xbbbb000000000000000000000000000000000000000000000000000000000002' as `0x${string}`);

      // Request challenge
      const challengeRes = await request
        .post(`/api/secrets/${multiChainSecret.id}/take-ownership/challenge`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress })
        .expect(200);

      expect(challengeRes.body.data.chainsToTransfer).toEqual([84532, 11155111]);

      // Sign and verify
      const userAccount = privateKeyToAccount(userPrivateKey);
      const signature = await userAccount.signMessage({
        message: challengeRes.body.data.challenge,
      });

      const verifyRes = await request
        .post(`/api/secrets/${multiChainSecret.id}/take-ownership/verify`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ address: userAddress, signature })
        .expect(200);

      // Should have tx hashes for both chains
      expect(verifyRes.body.data.txHashes[84532]).toBe(
        '0xaaaa000000000000000000000000000000000000000000000000000000000001'
      );
      expect(verifyRes.body.data.txHashes[11155111]).toBe(
        '0xbbbb000000000000000000000000000000000000000000000000000000000002'
      );

      // Should have been called once per chain (2 chains)
      // Use the calls from this test only — filter by the multi-chain smart account address
      const recoveryCalls = vi.mocked(executeRecovery).mock.calls.filter(
        (call) => call[2] === '0x3333333333333333333333333333333333333333'
      );
      expect(recoveryCalls).toHaveLength(2);

      // Cleanup
      await prisma.auditLog.deleteMany({ where: { secretId: multiChainSecret.id } }).catch(() => {});
      await prisma.ownershipChallenge.deleteMany({ where: { secretId: multiChainSecret.id } }).catch(() => {});
      await prisma.walletSecretMetadata.deleteMany({ where: { secretId: multiChainSecret.id } });
      await prisma.secret.delete({ where: { id: multiChainSecret.id } });
    });
  });
});
