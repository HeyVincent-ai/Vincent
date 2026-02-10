/**
 * E2E Test: OpenClaw Billing Flow (Stripe Integration)
 *
 * Tests the Stripe billing lifecycle for OpenClaw deployments:
 * 1. Deploy creates PENDING_PAYMENT record + Stripe Checkout session
 * 2. Simulated checkout.session.completed webhook → starts provisioning
 * 3. Cancel sets cancel_at_period_end on subscription → CANCELING status
 * 4. Simulated customer.subscription.deleted webhook → destroys deployment
 *
 * This uses REAL Stripe test mode APIs. No actual VPS is ordered —
 * we stop after verifying the webhook triggers provisioning.
 *
 * Prerequisites:
 *   - Stripe test keys in env (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_OPENCLAW_PRICE_ID)
 *   - Stripe CLI webhook forwarding: stripe listen --forward-to localhost:3000/api/billing/webhook
 *   - DATABASE_URL pointing to a running PostgreSQL
 *
 * Run:  npm run test:openclaw-billing
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Stripe from 'stripe';
import supertest from 'supertest';
import prisma from '../db/client.js';
import { env } from '../utils/env.js';
import type { User, OpenClawDeployment } from '@prisma/client';

// Mock auth so we can bypass Stytch
vi.mock('../services/auth.service.js', () => ({
  validateSession: vi.fn(),
  syncSession: vi.fn(),
  revokeSession: vi.fn(),
}));

import { validateSession } from '../services/auth.service.js';
import { createApp } from '../app.js';

const TEST_TOKEN = 'test-session-token-billing-e2e';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

let app: ReturnType<typeof createApp>;
let request: supertest.Agent;
let stripe: Stripe;
let testUser: User;
let deploymentId: string | null = null;
let stripeSubscriptionId: string | null = null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('OpenClaw Billing E2E', () => {
  beforeAll(async () => {
    // Validate env
    if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY required');
    if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET required');
    if (!env.STRIPE_OPENCLAW_PRICE_ID) throw new Error('STRIPE_OPENCLAW_PRICE_ID required');

    stripe = new Stripe(env.STRIPE_SECRET_KEY);
    await prisma.$connect();

    // Create test user with a Stripe customer
    testUser = await prisma.user.upsert({
      where: { email: 'openclaw-billing-e2e@test.local' },
      update: {},
      create: {
        email: 'openclaw-billing-e2e@test.local',
        stytchUserId: 'stytch-openclaw-billing-e2e',
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

    // Mock validateSession to return our test user
    vi.mocked(validateSession).mockResolvedValue(testUser);

    // Create Express app and supertest agent
    app = createApp();
    request = supertest.agent(app);

    console.log('\n========================================');
    console.log('  OPENCLAW BILLING E2E TEST');
    console.log('========================================');
    console.log(`  Test user: ${testUser.id} (${testUser.email})`);
    console.log(`  Stripe customer: ${testUser.stripeCustomerId}`);
    console.log(`  Price ID: ${env.STRIPE_OPENCLAW_PRICE_ID}`);
    console.log('========================================\n');
  }, 30_000);

  afterAll(async () => {
    // Cancel any test subscriptions
    if (stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
        console.log(`  Cleaned up Stripe subscription: ${stripeSubscriptionId}`);
      } catch (e: any) {
        console.log(`  Subscription cleanup: ${e.message}`);
      }
    }

    // Clean up test deployments
    await prisma.openClawDeployment.deleteMany({
      where: { userId: testUser.id },
    });

    // Clean up test user
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.$disconnect();

    console.log('\n========================================');
    console.log('  OPENCLAW BILLING E2E TEST COMPLETE');
    console.log('========================================\n');
  }, 60_000);

  // ============================================================
  // Test 1: POST /deploy creates PENDING_PAYMENT + Checkout URL
  // ============================================================

  it('should create deployment in PENDING_PAYMENT state with checkout URL', async () => {
    const res = await request
      .post('/api/openclaw/deploy')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({
        successUrl: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://example.com/cancel',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deploymentId).toBeTruthy();
    expect(res.body.data.checkoutUrl).toBeTruthy();
    expect(res.body.data.checkoutUrl).toContain('checkout.stripe.com');

    deploymentId = res.body.data.deploymentId;
    console.log(`  Deployment created: ${deploymentId}`);
    console.log(`  Checkout URL: ${res.body.data.checkoutUrl.slice(0, 80)}...`);

    // Verify DB state
    const deployment = await prisma.openClawDeployment.findUnique({
      where: { id: deploymentId! },
    });
    expect(deployment).toBeDefined();
    expect(deployment!.status).toBe('PENDING_PAYMENT');
    expect(deployment!.userId).toBe(testUser.id);
    console.log(`  DB status: ${deployment!.status}`);
  }, 30_000);

  // ============================================================
  // Test 2: Verify deployment shows up in listings as PENDING_PAYMENT
  // ============================================================

  it('should list deployment in PENDING_PAYMENT state', async () => {
    if (!deploymentId) return;

    const res = await request
      .get('/api/openclaw/deployments')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    const found = res.body.data.deployments.find((d: any) => d.id === deploymentId);
    expect(found).toBeDefined();
    expect(found.status).toBe('PENDING_PAYMENT');
    console.log(`  Listed OK — status: ${found.status}`);
  }, 10_000);

  // ============================================================
  // Test 3: Simulate Stripe checkout.session.completed webhook
  // ============================================================

  it('should transition to PENDING/provisioning on checkout completion', async () => {
    if (!deploymentId) return;

    // Create a real Stripe subscription via the API (bypassing Checkout UI)
    // This simulates what happens when a user completes the Checkout session.
    const subscription = await stripe.subscriptions.create({
      customer: testUser.stripeCustomerId!,
      items: [{ price: env.STRIPE_OPENCLAW_PRICE_ID! }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: {
        userId: testUser.id,
        deploymentId: deploymentId!,
        type: 'openclaw',
      },
    });

    stripeSubscriptionId = subscription.id;
    console.log(`  Created test subscription: ${stripeSubscriptionId}`);
    console.log(`  Subscription status: ${subscription.status}`);

    // Extract period end from subscription items
    const firstItem = subscription.items?.data?.[0];
    const periodEnd = firstItem
      ? new Date(firstItem.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Directly call startProvisioning (simulates what the webhook handler does)
    // We do this instead of faking a webhook because:
    // 1. The subscription is 'incomplete' (no payment method on test customer)
    // 2. We want to test the service layer, not Stripe's webhook delivery
    const { startProvisioning } = await import('../services/openclaw.service.js');
    await startProvisioning(deploymentId!, stripeSubscriptionId, periodEnd);

    console.log(`  Called startProvisioning() for deployment ${deploymentId}`);

    // Poll until deployment transitions past PENDING_PAYMENT
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let deployment: OpenClawDeployment | null = null;

    while (Date.now() < deadline) {
      deployment = await prisma.openClawDeployment.findUnique({
        where: { id: deploymentId! },
      });

      if (deployment && deployment.status !== 'PENDING_PAYMENT') {
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    expect(deployment).toBeDefined();
    expect(deployment!.status).not.toBe('PENDING_PAYMENT');
    expect(deployment!.stripeSubscriptionId).toBe(stripeSubscriptionId);
    expect(deployment!.currentPeriodEnd).toBeDefined();

    console.log(`  Deployment transitioned to: ${deployment!.status}`);
    console.log(`  Stripe sub stored: ${deployment!.stripeSubscriptionId}`);
    console.log(`  Period end: ${deployment!.currentPeriodEnd?.toISOString()}`);

    // The status should be one of the provisioning states (PENDING, ORDERING, etc.)
    // or ERROR if OVH credentials are not configured. Either way, it's past PENDING_PAYMENT.
    const validPostPaymentStatuses = [
      'PENDING',
      'ORDERING',
      'PROVISIONING',
      'INSTALLING',
      'READY',
      'ERROR',
    ];
    expect(validPostPaymentStatuses).toContain(deployment!.status);
  }, 60_000);

  // ============================================================
  // Test 4: GET /deployments/:id returns billing fields
  // ============================================================

  it('should include billing fields in deployment response', async () => {
    if (!deploymentId) return;

    const res = await request
      .get(`/api/openclaw/deployments/${deploymentId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    const d = res.body.data.deployment;
    expect(d.stripeSubscriptionId).toBe(stripeSubscriptionId);
    expect(d.currentPeriodEnd).toBeTruthy();
    console.log(`  Billing fields present in API response`);
    console.log(`  stripeSubscriptionId: ${d.stripeSubscriptionId}`);
    console.log(`  currentPeriodEnd: ${d.currentPeriodEnd}`);
  }, 10_000);

  // ============================================================
  // Test 5: POST /deployments/:id/cancel sets cancel_at_period_end
  // ============================================================

  it('should cancel subscription at period end', async () => {
    if (!deploymentId || !stripeSubscriptionId) return;

    // First, force the deployment to READY so cancel is allowed
    await prisma.openClawDeployment.update({
      where: { id: deploymentId },
      data: { status: 'READY', statusMessage: 'Forced to READY for cancel test' },
    });

    const res = await request
      .post(`/api/openclaw/deployments/${deploymentId}/cancel`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deployment.status).toBe('CANCELING');
    expect(res.body.data.deployment.canceledAt).toBeTruthy();
    expect(res.body.data.currentPeriodEnd).toBeTruthy();

    console.log(`  Deployment status: ${res.body.data.deployment.status}`);
    console.log(`  Canceled at: ${res.body.data.deployment.canceledAt}`);
    console.log(`  Active until: ${res.body.data.currentPeriodEnd}`);

    // Verify Stripe subscription has cancel_at_period_end set
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    expect(sub.cancel_at_period_end).toBe(true);
    console.log(`  Stripe cancel_at_period_end: ${sub.cancel_at_period_end}`);
  }, 30_000);

  // ============================================================
  // Test 6: Restart still works while CANCELING
  // ============================================================

  it('should allow restart when CANCELING (VPS still running)', async () => {
    if (!deploymentId) return;

    // The deployment is CANCELING but would normally still have a running VPS.
    // Since we don't have a real VPS, this will fail at the SSH level.
    // That's OK — we're just verifying the route allows it.
    const res = await request
      .post(`/api/openclaw/deployments/${deploymentId}/restart`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    // Should NOT be 404 (the route accepts CANCELING status)
    expect(res.status).not.toBe(404);
    console.log(`  Restart on CANCELING deployment: HTTP ${res.status} (expected non-404)`);
  }, 10_000);

  // ============================================================
  // Test 7: handleSubscriptionExpired destroys deployment
  // ============================================================

  it('should destroy deployment when subscription expires', async () => {
    if (!deploymentId || !stripeSubscriptionId) return;

    // Simulate the webhook by calling handleSubscriptionExpired directly
    const { handleSubscriptionExpired } = await import('../services/openclaw.service.js');
    await handleSubscriptionExpired(stripeSubscriptionId);

    // Check deployment is destroyed
    const deployment = await prisma.openClawDeployment.findUnique({
      where: { id: deploymentId },
    });

    expect(deployment).toBeDefined();
    expect(['DESTROYING', 'DESTROYED']).toContain(deployment!.status);
    console.log(`  Status after subscription expired: ${deployment!.status}`);
    console.log(`  destroyedAt: ${deployment!.destroyedAt?.toISOString() || 'null'}`);
  }, 30_000);

  // ============================================================
  // Test 8: DELETE /deployments/:id cancels Stripe subscription
  // ============================================================

  it('should cancel Stripe subscription on immediate destroy', async () => {
    // Create a fresh deployment for this test
    const freshRes = await request
      .post('/api/openclaw/deploy')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
      .expect(201);

    const freshId = freshRes.body.data.deploymentId;
    console.log(`  Created fresh deployment for destroy test: ${freshId}`);

    // Create subscription and attach to deployment
    const sub = await stripe.subscriptions.create({
      customer: testUser.stripeCustomerId!,
      items: [{ price: env.STRIPE_OPENCLAW_PRICE_ID! }],
      payment_behavior: 'default_incomplete',
      metadata: { type: 'openclaw', deploymentId: freshId, userId: testUser.id },
    });

    await prisma.openClawDeployment.update({
      where: { id: freshId },
      data: {
        status: 'READY',
        stripeSubscriptionId: sub.id,
        statusMessage: 'Ready for destroy test',
      },
    });

    // Destroy via API
    const destroyRes = await request
      .delete(`/api/openclaw/deployments/${freshId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(['DESTROYING', 'DESTROYED']).toContain(destroyRes.body.data.deployment.status);
    console.log(`  Destroy result: ${destroyRes.body.data.deployment.status}`);

    // Verify Stripe subscription was canceled (or expired since test subs have no payment method)
    const canceledSub = await stripe.subscriptions.retrieve(sub.id);
    expect(['canceled', 'incomplete_expired']).toContain(canceledSub.status);
    console.log(`  Stripe subscription status: ${canceledSub.status}`);
  }, 30_000);

  // ============================================================
  // Test 9: Deploy requires successUrl and cancelUrl
  // ============================================================

  it('should reject deploy without URLs', async () => {
    const res = await request
      .post('/api/openclaw/deploy')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({})
      .expect(400);

    expect(res.body.success).toBe(false);
    console.log(
      `  Validation error: ${JSON.stringify(res.body.error?.code || res.body.error?.message)}`
    );
  }, 10_000);
});
