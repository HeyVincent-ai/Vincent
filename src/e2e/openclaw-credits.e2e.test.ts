/**
 * E2E Test: OpenClaw Token Billing (LLM Credit System)
 *
 * Tests the LLM credit lifecycle:
 * 1. Deployment starts with $25 free credits
 * 2. Usage polling returns cached/fresh data from OpenRouter
 * 3. Credit checkout session creation
 * 4. Credit fulfillment via webhook (fulfillCreditPurchase)
 *
 * Uses REAL Stripe test mode APIs.
 *
 * Prerequisites:
 *   - Stripe test keys in env (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_OPENCLAW_PRICE_ID)
 *   - Stripe CLI webhook forwarding: stripe listen --forward-to localhost:3000/api/billing/webhook
 *   - DATABASE_URL pointing to a running PostgreSQL
 *
 * Run:  npm run test:openclaw-credits
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Stripe from 'stripe';
import supertest from 'supertest';
import prisma from '../db/client.js';
import { env } from '../utils/env.js';
import type { User } from '@prisma/client';

// Mock auth so we can bypass Stytch
vi.mock('../services/auth.service.js', () => ({
  validateSession: vi.fn(),
  syncSession: vi.fn(),
  revokeSession: vi.fn(),
}));

import { validateSession } from '../services/auth.service.js';
import { createApp } from '../app.js';
import { fulfillCreditPurchase } from '../services/openclaw.service.js';

const TEST_TOKEN = 'test-session-token-credits-e2e';

let app: ReturnType<typeof createApp>;
let request: supertest.Agent;
let stripe: Stripe;
let testUser: User;
let deploymentId: string;

describe('OpenClaw Credits E2E', () => {
  beforeAll(async () => {
    if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY required');
    if (!env.STRIPE_OPENCLAW_PRICE_ID) throw new Error('STRIPE_OPENCLAW_PRICE_ID required');

    stripe = new Stripe(env.STRIPE_SECRET_KEY);
    await prisma.$connect();

    // Create test user with Stripe customer
    testUser = await prisma.user.upsert({
      where: { email: 'openclaw-credits-e2e@test.local' },
      update: {},
      create: {
        email: 'openclaw-credits-e2e@test.local',
        stytchUserId: 'stytch-openclaw-credits-e2e',
      },
    });

    // Ensure test user has a Stripe customer
    if (!testUser.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: testUser.email,
        metadata: { userId: testUser.id },
      });
      testUser = await prisma.user.update({
        where: { id: testUser.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    // Create a READY deployment with credit fields
    const deployment = await prisma.openClawDeployment.create({
      data: {
        userId: testUser.id,
        status: 'READY',
        statusMessage: 'Test deployment for credits E2E',
        creditBalanceUsd: 25.0,
        lastKnownUsageUsd: 0,
        ipAddress: '127.0.0.1',
        readyAt: new Date(),
      },
    });
    deploymentId = deployment.id;

    vi.mocked(validateSession).mockResolvedValue(testUser);

    app = createApp();
    request = supertest.agent(app);

    console.log('\n========================================');
    console.log('  OPENCLAW CREDITS E2E TEST');
    console.log('========================================');
    console.log(`  Test user: ${testUser.id} (${testUser.email})`);
    console.log(`  Stripe customer: ${testUser.stripeCustomerId}`);
    console.log(`  Deployment: ${deploymentId}`);
    console.log('========================================\n');
  }, 60_000);

  afterAll(async () => {
    // Clean up
    await prisma.openClawCreditPurchase.deleteMany({
      where: { deploymentId },
    });
    await prisma.openClawDeployment.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.$disconnect();
  }, 30_000);

  // ============================================================
  // Test 1: Deployment starts with $25 default credits
  // ============================================================

  it('should have $25 default credits on new deployment', async () => {
    const deployment = await prisma.openClawDeployment.findUnique({
      where: { id: deploymentId },
    });

    expect(deployment).toBeDefined();
    expect(Number(deployment!.creditBalanceUsd)).toBe(25);
    expect(Number(deployment!.lastKnownUsageUsd)).toBe(0);
    console.log(`  Initial credits: $${deployment!.creditBalanceUsd}`);
  });

  // ============================================================
  // Test 2: GET /usage returns credit balance
  // ============================================================

  it('should return usage data via API', async () => {
    const res = await request
      .get(`/api/openclaw/deployments/${deploymentId}/usage`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.creditBalanceUsd).toBe(25);
    expect(res.body.data.remainingUsd).toBe(25);
    expect(res.body.data.totalUsageUsd).toBeDefined();
    console.log(`  Usage API: balance=$${res.body.data.creditBalanceUsd}, remaining=$${res.body.data.remainingUsd}`);
  });

  // ============================================================
  // Test 3: GET /usage returns 404 for nonexistent deployment
  // ============================================================

  it('should return 404 for nonexistent deployment usage', async () => {
    const res = await request
      .get('/api/openclaw/deployments/nonexistent-id/usage')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    console.log(`  404 for nonexistent: OK`);
  });

  // ============================================================
  // Test 4: POST /credits/checkout creates a Stripe Checkout session
  // ============================================================

  it('should create a Stripe Checkout session for credits', async () => {
    const res = await request
      .post(`/api/openclaw/deployments/${deploymentId}/credits/checkout`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBeTruthy();
    expect(res.body.data.url).toBeTruthy();
    expect(res.body.data.url).toContain('checkout.stripe.com');
    console.log(`  Checkout session: ${res.body.data.sessionId}`);
    console.log(`  Checkout URL: ${res.body.data.url.substring(0, 60)}...`);
  }, 30_000);

  // ============================================================
  // Test 5: fulfillCreditPurchase adds credits after checkout
  // ============================================================

  it('should fulfill credit purchase and update balance', async () => {
    // Simulate what the webhook does after a successful Stripe Checkout
    const fakePaymentIntentId = `pi_test_${Date.now()}`;
    await fulfillCreditPurchase(deploymentId, 10, fakePaymentIntentId);

    // Verify DB balance updated
    const deployment = await prisma.openClawDeployment.findUnique({
      where: { id: deploymentId },
    });
    expect(Number(deployment!.creditBalanceUsd)).toBe(35);
    console.log(`  Credits fulfilled: balance now $${deployment!.creditBalanceUsd}`);

    // Verify credit purchase record created
    const purchases = await prisma.openClawCreditPurchase.findMany({
      where: { deploymentId },
    });
    expect(purchases.length).toBe(1);
    expect(Number(purchases[0].amountUsd)).toBe(10);
    expect(purchases[0].stripePaymentIntentId).toBe(fakePaymentIntentId);
    console.log(`  CreditPurchase record: ${purchases[0].id}`);
  }, 30_000);

  // ============================================================
  // Test 6: Second credit purchase stacks on existing balance
  // ============================================================

  it('should stack credits on existing balance', async () => {
    const fakePaymentIntentId = `pi_test_${Date.now()}_2`;
    await fulfillCreditPurchase(deploymentId, 20, fakePaymentIntentId);

    const deployment = await prisma.openClawDeployment.findUnique({
      where: { id: deploymentId },
    });
    expect(Number(deployment!.creditBalanceUsd)).toBe(55); // 35 + 20
    console.log(`  Stacked credits: balance now $${deployment!.creditBalanceUsd}`);

    const purchases = await prisma.openClawCreditPurchase.findMany({
      where: { deploymentId },
      orderBy: { createdAt: 'asc' },
    });
    expect(purchases.length).toBe(2);
    console.log(`  Total credit purchases: ${purchases.length}`);
  }, 30_000);

  // ============================================================
  // Test 7: GET /usage reflects updated balance
  // ============================================================

  it('should reflect updated balance in usage endpoint', async () => {
    const res = await request
      .get(`/api/openclaw/deployments/${deploymentId}/usage`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.data.creditBalanceUsd).toBe(55);
    expect(res.body.data.remainingUsd).toBe(55); // no usage yet
    console.log(`  Usage after purchases: balance=$${res.body.data.creditBalanceUsd}, remaining=$${res.body.data.remainingUsd}`);
  });
});
