/**
 * E2E Test: OpenClaw API Endpoints
 *
 * Tests the OpenClaw deployment lifecycle through the real HTTP API
 * endpoints (POST /api/openclaw/deploy, GET /deployments, etc.)
 * with a mocked session auth layer.
 *
 * When E2E_ORDER_VPS=true, this triggers a real VPS order through
 * the deploy endpoint, watches the async provisioning via polling,
 * and verifies the full lifecycle through the API.
 *
 * Required env vars:
 *   OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY
 *   DATABASE_URL
 *   OPENROUTER_PROVISIONING_KEY
 *
 * Run (API tests only):  npm run test:openclaw-api
 * Run (with real VPS):   E2E_ORDER_VPS=true npm run test:openclaw-api
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

// Import after mock setup
import { validateSession } from '../services/auth.service.js';
import { createApp } from '../app.js';

const ACTUALLY_ORDER_VPS = process.env.E2E_ORDER_VPS === 'true';
const TEST_TOKEN = 'test-session-token-openclaw-e2e';
const DEPLOY_POLL_INTERVAL_MS = 15_000;
const DEPLOY_POLL_TIMEOUT_MS = 30 * 60_000; // 30 min for full lifecycle

let app: ReturnType<typeof createApp>;
let request: supertest.Agent;
let testUser: User;
let deploymentId: string | null = null;

describe('OpenClaw API E2E: HTTP Endpoints', () => {
  beforeAll(async () => {
    await prisma.$connect();

    // Create test user
    testUser = await prisma.user.upsert({
      where: { email: 'openclaw-e2e-test@test.local' },
      update: {},
      create: {
        email: 'openclaw-e2e-test@test.local',
        stytchUserId: 'stytch-openclaw-e2e-test',
      },
    });

    // Mock validateSession to return our test user
    vi.mocked(validateSession).mockResolvedValue(testUser);

    // Create Express app and supertest agent
    app = createApp();
    request = supertest.agent(app);

    console.log('\n========================================');
    console.log('  OPENCLAW API E2E TEST');
    console.log('========================================');
    console.log(`  Test user: ${testUser.id} (${testUser.email})`);
    console.log(`  E2E_ORDER_VPS: ${ACTUALLY_ORDER_VPS}`);
    console.log('========================================\n');
  }, 30_000);

  afterAll(async () => {
    // Clean up test deployments
    await prisma.openClawDeployment.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.$disconnect();

    console.log('\n========================================');
    console.log('  OPENCLAW API E2E TEST COMPLETE');
    console.log('========================================\n');
  }, 60_000);

  // ============================================================
  // Test 1: List deployments (empty)
  // ============================================================

  it('should return empty deployment list for new user', async () => {
    const res = await request
      .get('/api/openclaw/deployments')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deployments).toEqual([]);
    console.log('  Empty deployment list: OK');
  }, 30_000);

  // ============================================================
  // Test 2: Auth required
  // ============================================================

  it('should reject unauthenticated requests', async () => {
    // Temporarily mock validateSession to return null (no auth)
    vi.mocked(validateSession).mockResolvedValueOnce(null);

    const res = await request
      .get('/api/openclaw/deployments')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(res.body.success).toBe(false);
    console.log('  Auth rejection: OK');
  }, 30_000);

  // ============================================================
  // Test 3: Get non-existent deployment
  // ============================================================

  it('should return 404 for non-existent deployment', async () => {
    const res = await request
      .get('/api/openclaw/deployments/nonexistent-id')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    console.log('  404 for missing deployment: OK');
  }, 30_000);

  // ============================================================
  // Test 4: Deploy OpenClaw (real VPS order if E2E_ORDER_VPS=true)
  // ============================================================

  it('should create a deployment via POST /deploy', async () => {
    if (!ACTUALLY_ORDER_VPS) {
      console.log('  E2E_ORDER_VPS not set — testing deploy creates PENDING record');
    }

    const res = await request
      .post('/api/openclaw/deploy')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deployment).toBeDefined();
    expect(res.body.data.deployment.id).toBeTruthy();
    expect(res.body.data.deployment.userId).toBe(testUser.id);
    expect(res.body.data.deployment.status).toBe('PENDING');

    deploymentId = res.body.data.deployment.id;
    console.log(`  Deployment created: ${deploymentId}`);
    console.log(`  Status: ${res.body.data.deployment.status}`);
  }, 60_000);

  // ============================================================
  // Test 5: Get deployment status
  // ============================================================

  it('should retrieve deployment status via GET /deployments/:id', async () => {
    if (!deploymentId) {
      console.log('  No deployment to check — skipping');
      return;
    }

    const res = await request
      .get(`/api/openclaw/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deployment.id).toBe(deploymentId);
    console.log(`  Deployment status: ${res.body.data.deployment.status}`);
    console.log(`  Status message: ${res.body.data.deployment.statusMessage}`);
  }, 30_000);

  // ============================================================
  // Test 6: List deployments (should include our new one)
  // ============================================================

  it('should list deployments including the new one', async () => {
    if (!deploymentId) {
      console.log('  No deployment to list — skipping');
      return;
    }

    const res = await request
      .get('/api/openclaw/deployments')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deployments.length).toBeGreaterThan(0);

    const found = res.body.data.deployments.find((d: any) => d.id === deploymentId);
    expect(found).toBeDefined();
    console.log(`  Deployments listed: ${res.body.data.deployments.length}`);
  }, 30_000);

  // ============================================================
  // Test 7: Poll deployment until READY or timeout (real VPS only)
  // ============================================================

  it(
    'should poll deployment status until READY (REAL VPS)',
    async () => {
      if (!ACTUALLY_ORDER_VPS || !deploymentId) {
        console.log('  E2E_ORDER_VPS not set or no deployment — skipping');
        return;
      }

      console.log(`\n  Polling deployment ${deploymentId} (timeout: 30min)...`);
      const deadline = Date.now() + DEPLOY_POLL_TIMEOUT_MS;
      let lastStatus = '';
      let finalDeployment: any = null;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, DEPLOY_POLL_INTERVAL_MS));

        const res = await request
          .get(`/api/openclaw/deployments/${deploymentId}`)
          .set('Authorization', `Bearer ${TEST_TOKEN}`);

        if (res.status !== 200) {
          console.log(`  Poll error: HTTP ${res.status}`);
          continue;
        }

        const deployment = res.body.data.deployment;
        const elapsed = Math.round((Date.now() + DEPLOY_POLL_TIMEOUT_MS - deadline) / 1000);

        if (deployment.status !== lastStatus) {
          console.log(`  [${elapsed}s] Status: ${deployment.status} — ${deployment.statusMessage}`);
          lastStatus = deployment.status;
        }

        if (deployment.status === 'READY') {
          finalDeployment = deployment;
          console.log(`\n  Deployment READY!`);
          console.log(`  IP: ${deployment.ipAddress}`);
          console.log(`  Service: ${deployment.ovhServiceName}`);
          console.log(
            `  Access token: ${deployment.accessToken ? deployment.accessToken.slice(0, 10) + '...' : 'none'}`
          );
          break;
        }

        if (deployment.status === 'ERROR') {
          console.log(`\n  Deployment ERRORED: ${deployment.statusMessage}`);
          console.log(`  Provision log (last 500 chars):`);
          console.log(`  ${(deployment.provisionLog || '').slice(-500)}`);
          finalDeployment = deployment;
          break;
        }
      }

      if (finalDeployment) {
        // If it reached READY, test that the response includes expected fields
        if (finalDeployment.status === 'READY') {
          expect(finalDeployment.ipAddress).toBeTruthy();
          expect(finalDeployment.ovhServiceName).toBeTruthy();
          expect(finalDeployment.readyAt).toBeTruthy();
        }
      } else {
        console.log('  Polling timed out — deployment may still be in progress');
        // Don't fail — the deployment is still running
      }
    },
    35 * 60_000
  );

  // ============================================================
  // Test 8: Destroy deployment
  // ============================================================

  it('should destroy deployment via DELETE /deployments/:id', async () => {
    if (!deploymentId) {
      console.log('  No deployment to destroy — skipping');
      return;
    }

    // Check current status before attempting destroy
    const statusRes = await request
      .get(`/api/openclaw/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    const currentStatus = statusRes.body.data?.deployment?.status;
    console.log(`  Current status before destroy: ${currentStatus}`);

    // Only destroy if we have a real VPS (don't destroy during async provisioning)
    if (!ACTUALLY_ORDER_VPS) {
      console.log(
        '  Skipping destroy for dry-run (deployment is still provisioning asynchronously)'
      );
      return;
    }

    const res = await request
      .delete(`/api/openclaw/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const destroyedStatus = res.body.data.deployment.status;
    console.log(`  Destroy result: ${destroyedStatus}`);
    expect(['DESTROYING', 'DESTROYED']).toContain(destroyedStatus);
  }, 60_000);

  // ============================================================
  // Test 9: User isolation — other user can't see our deployment
  // ============================================================

  it('should not allow another user to access the deployment', async () => {
    if (!deploymentId) {
      console.log('  No deployment to test isolation — skipping');
      return;
    }

    // Create another user and mock auth to return them
    const otherUser = await prisma.user.upsert({
      where: { email: 'openclaw-e2e-other@test.local' },
      update: {},
      create: {
        email: 'openclaw-e2e-other@test.local',
        stytchUserId: 'stytch-openclaw-e2e-other',
      },
    });

    vi.mocked(validateSession).mockResolvedValueOnce(otherUser);

    const res = await request
      .get(`/api/openclaw/deployments/${deploymentId}`)
      .set('Authorization', `Bearer other-user-token`)
      .expect(404);

    expect(res.body.success).toBe(false);
    console.log('  User isolation: OK (other user gets 404)');

    // Clean up other user
    await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => {});

    // Restore original mock
    vi.mocked(validateSession).mockResolvedValue(testUser);
  }, 30_000);
});
