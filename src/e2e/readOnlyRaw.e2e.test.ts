/**
 * E2E Test: Read-only raw access
 *
 * Verifies:
 * - minting read-only tokens from API keys
 * - raw endpoints are GET-only
 * - raw tokens are scoped to allowed secrets
 * - API keys are rejected on raw endpoints
 * - policy data is readable via raw
 * - raw domain isolation blocks non-raw routes
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import prisma from '../db/client.js';
import type { User } from '@prisma/client';

// Mock the auth service so we can bypass Stytch
vi.mock('../services/auth.service.js', () => ({
  validateSession: vi.fn(),
  syncSession: vi.fn(),
  revokeSession: vi.fn(),
}));

import { validateSession } from '../services/auth.service.js';
import { createApp } from '../app.js';

const TEST_TOKEN = 'test-session-token-raw-e2e';

let app: ReturnType<typeof createApp>;
let request: supertest.Agent;
let testUser: User;

let secretId1: string;
let secretId2: string;
let apiKey1: string;
let apiKey2: string;
let readOnlyToken: string;

describe('Read-only raw access', () => {
  beforeAll(async () => {
    await prisma.$connect();

    testUser = await prisma.user.upsert({
      where: { email: 'raw-e2e-test@test.local' },
      update: {},
      create: {
        email: 'raw-e2e-test@test.local',
        stytchUserId: 'stytch-raw-e2e-test',
      },
    });

    vi.mocked(validateSession).mockResolvedValue(testUser);

    app = createApp();
    request = supertest.agent(app);

    // Create first secret
    const createRes1 = await request.post('/api/secrets').send({ type: 'API_KEY' }).expect(201);
    secretId1 = createRes1.body.data.secret.id;
    apiKey1 = createRes1.body.data.apiKey.key;
    const claimUrl1 = createRes1.body.data.claimUrl as string;
    const token1 = new URL(claimUrl1).searchParams.get('token') as string;

    // Create second secret
    const createRes2 = await request.post('/api/secrets').send({ type: 'API_KEY' }).expect(201);
    secretId2 = createRes2.body.data.secret.id;
    apiKey2 = createRes2.body.data.apiKey.key;
    const claimUrl2 = createRes2.body.data.claimUrl as string;
    const token2 = new URL(claimUrl2).searchParams.get('token') as string;

    // Claim both secrets for test user
    await request
      .post(`/api/secrets/${secretId1}/claim`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ claimToken: token1 })
      .expect(200);

    await request
      .post(`/api/secrets/${secretId2}/claim`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ claimToken: token2 })
      .expect(200);

    // Create a policy on secret 1
    await request
      .post(`/api/secrets/${secretId1}/policies`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ policyType: 'REQUIRE_APPROVAL', policyConfig: { enabled: true } })
      .expect(201);

    // Mint read-only token scoped to secret 1
    const mintRes = await request
      .post('/api/read-only-tokens/mint')
      .send({ apiKeys: [apiKey1] })
      .expect(201);

    readOnlyToken = mintRes.body.data.token;
  }, 30_000);

  afterAll(async () => {
    await prisma.readOnlyTokenSecret.deleteMany().catch(() => {});
    await prisma.readOnlyToken.deleteMany().catch(() => {});
    await prisma.policy.deleteMany({ where: { secretId: { in: [secretId1, secretId2] } } }).catch(() => {});
    await prisma.apiKey.deleteMany({ where: { secretId: { in: [secretId1, secretId2] } } }).catch(() => {});
    await prisma.secret.deleteMany({ where: { id: { in: [secretId1, secretId2] } } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.$disconnect();
  }, 30_000);

  it('allows raw access to an allowed secret', async () => {
    const res = await request
      .get(`/api/raw/secrets/${secretId1}`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.secret.id).toBe(secretId1);
    expect(res.body.data.meta.schema_version).toBeDefined();
  });

  it('denies raw access to a secret outside scope', async () => {
    const res = await request
      .get(`/api/raw/secrets/${secretId2}`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('rejects API keys on raw endpoints', async () => {
    const res = await request
      .get(`/api/raw/secrets/${secretId1}`)
      .set('Authorization', `Bearer ${apiKey1}`)
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('enforces GET-only on raw endpoints', async () => {
    const res = await request
      .post(`/api/raw/secrets/${secretId1}`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .expect(405);

    expect(res.body.success).toBe(false);
  });

  it('exposes policy data read-only', async () => {
    const res = await request
      .get(`/api/raw/secrets/${secretId1}/policies`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.policies.length).toBeGreaterThan(0);
    expect(res.body.data.policies[0].policyType).toBe('REQUIRE_APPROVAL');
  });

  it('blocks non-raw routes on raw host', async () => {
    await request
      .get('/api/user/profile')
      .set('Host', 'raw.heyvincent.ai')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(404);
  });
});
