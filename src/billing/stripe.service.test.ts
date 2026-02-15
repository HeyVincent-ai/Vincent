import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

// Stripe mock — we build a fake Stripe instance returned by the constructor
const mockStripeInstance = {
  webhooks: { constructEvent: vi.fn() },
  customers: { create: vi.fn(), retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
  paymentIntents: { create: vi.fn() },
};

vi.mock('stripe', () => {
  // Must use a function declaration (not arrow) so it can be called with `new`
  function StripeMock() {
    return mockStripeInstance;
  }
  return { default: StripeMock };
});

vi.mock('../utils/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    STRIPE_PRICE_ID: 'price_test_fake',
  },
}));

vi.mock('../db/client', () => {
  const mockPrisma = {
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    subscription: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    openClawDeployment: { findFirst: vi.fn(), update: vi.fn() },
  };
  return { default: mockPrisma };
});

vi.mock('../services/openclaw.service', () => ({
  startProvisioning: vi.fn(),
  handleSubscriptionExpired: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────
import prisma from '../db/client';
import * as openclawService from '../services/openclaw.service';
import {
  handleWebhookEvent,
  getOrCreateStripeCustomer,
  createCheckoutSession,
  getSubscription,
  cancelSubscription,
  chargeCustomerOffSession,
} from './stripe.service';

const db = vi.mocked(prisma);
const mockedOpenClaw = vi.mocked(openclawService);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// Helper: build a mock Stripe event
// ═══════════════════════════════════════════════════════════════════
function buildEvent(type: string, data: Record<string, any>) {
  return { type, data: { object: data } };
}

function buildSubscription(overrides: Record<string, any> = {}) {
  return {
    id: 'sub_test_1',
    status: 'active',
    created: Math.floor(Date.now() / 1000),
    items: {
      data: [
        {
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      ],
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// getOrCreateStripeCustomer
// ═══════════════════════════════════════════════════════════════════
describe('getOrCreateStripeCustomer', () => {
  it('returns existing customer ID', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      stripeCustomerId: 'cus_existing',
    } as any);

    const result = await getOrCreateStripeCustomer('user-1');
    expect(result).toBe('cus_existing');
    expect(mockStripeInstance.customers.create).not.toHaveBeenCalled();
  });

  it('creates and saves a new Stripe customer', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      stripeCustomerId: null,
    } as any);

    mockStripeInstance.customers.create.mockResolvedValue({ id: 'cus_new_123' } as any);

    const result = await getOrCreateStripeCustomer('user-1');

    expect(result).toBe('cus_new_123');
    expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
      email: 'test@test.com',
      metadata: { userId: 'user-1' },
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { stripeCustomerId: 'cus_new_123' },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// handleWebhookEvent — dispatch + signature verification
// ═══════════════════════════════════════════════════════════════════
describe('handleWebhookEvent', () => {
  it('returns handled: false for unknown event types', async () => {
    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('unknown.event', {})
    );

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig_test');

    expect(result).toEqual({ type: 'unknown.event', handled: false });
  });

  it('throws when webhook secret is invalid (constructEvent throws)', async () => {
    mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Webhook signature verification failed');
    });

    await expect(handleWebhookEvent(Buffer.from('body'), 'bad_sig')).rejects.toThrow(
      'Webhook signature verification failed'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// checkout.session.completed — Standard subscription
// ═══════════════════════════════════════════════════════════════════
describe('checkout.session.completed (standard subscription)', () => {
  it('creates a subscription record via upsert', async () => {
    const sub = buildSubscription();
    mockStripeInstance.subscriptions.retrieve.mockResolvedValue(sub);

    const session = {
      metadata: { userId: 'user-1' },
      subscription: 'sub_test_1',
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('checkout.session.completed', session)
    );

    db.subscription.upsert.mockResolvedValue({} as any);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'checkout.session.completed', handled: true });

    // Should upsert the subscription
    expect(db.subscription.upsert).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_test_1' },
      create: expect.objectContaining({
        userId: 'user-1',
        stripeSubscriptionId: 'sub_test_1',
        status: 'ACTIVE',
      }),
      update: expect.objectContaining({
        status: 'ACTIVE',
      }),
    });
  });

  it('no-ops when session has no userId', async () => {
    const session = { metadata: {}, subscription: 'sub_test_1' };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('checkout.session.completed', session)
    );

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'checkout.session.completed', handled: true });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it('no-ops when session has no subscription', async () => {
    const session = { metadata: { userId: 'user-1' }, subscription: null };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('checkout.session.completed', session)
    );

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'checkout.session.completed', handled: true });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// checkout.session.completed — OpenClaw deployment
// ═══════════════════════════════════════════════════════════════════
describe('checkout.session.completed (OpenClaw checkout)', () => {
  it('starts provisioning and does not upsert standard subscription', async () => {
    const sub = buildSubscription();
    mockStripeInstance.subscriptions.retrieve.mockResolvedValue(sub);

    const session = {
      metadata: { userId: 'user-1', type: 'openclaw', deploymentId: 'deploy-1' },
      subscription: 'sub_test_1',
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('checkout.session.completed', session)
    );

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'checkout.session.completed', handled: true });

    // Should NOT upsert standard subscription
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// invoice.paid
// ═══════════════════════════════════════════════════════════════════
describe('invoice.paid', () => {
  it('reactivates subscription to ACTIVE', async () => {
    const invoice = {
      parent: { subscription_details: { subscription: 'sub_test_1' } },
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('invoice.paid', invoice)
    );

    db.subscription.findUnique.mockResolvedValue({ id: 'sub-db-1' } as any);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'invoice.paid', handled: true });
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-db-1' },
      data: { status: 'ACTIVE' },
    });
  });

  it('no-ops when subscription ID cannot be extracted', async () => {
    const invoice = { parent: {} };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('invoice.paid', invoice)
    );

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result.handled).toBe(true);
    expect(db.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('no-ops when subscription is not in our database', async () => {
    const invoice = {
      parent: { subscription_details: { subscription: 'sub_unknown' } },
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('invoice.paid', invoice)
    );

    db.subscription.findUnique.mockResolvedValue(null);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result.handled).toBe(true);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// invoice.payment_failed
// ═══════════════════════════════════════════════════════════════════
describe('invoice.payment_failed', () => {
  it('marks OpenClaw deployment status message on payment failure', async () => {
    const invoice = {
      parent: { subscription_details: { subscription: 'sub_openclaw_1' } },
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('invoice.payment_failed', invoice)
    );

    db.openClawDeployment.findFirst.mockResolvedValue({ id: 'deploy-1' } as any);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'invoice.payment_failed', handled: true });
    expect(db.openClawDeployment.update).toHaveBeenCalledWith({
      where: { id: 'deploy-1' },
      data: { statusMessage: 'Payment failed — please update your payment method' },
    });
    // Should NOT touch standard subscription
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it('marks standard subscription as PAST_DUE on payment failure', async () => {
    const invoice = {
      parent: { subscription_details: { subscription: 'sub_standard_1' } },
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('invoice.payment_failed', invoice)
    );

    // No OpenClaw deployment for this subscription
    db.openClawDeployment.findFirst.mockResolvedValue(null);
    db.subscription.findUnique.mockResolvedValue({ id: 'sub-db-1' } as any);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'invoice.payment_failed', handled: true });
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-db-1' },
      data: { status: 'PAST_DUE' },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// customer.subscription.deleted
// ═══════════════════════════════════════════════════════════════════
describe('customer.subscription.deleted', () => {
  it('handles OpenClaw subscription deletion via openclaw service', async () => {
    const sub = { id: 'sub_openclaw_1' };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('customer.subscription.deleted', sub)
    );

    db.openClawDeployment.findFirst.mockResolvedValue({ id: 'deploy-1' } as any);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'customer.subscription.deleted', handled: true });
    // Should NOT update standard subscription
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it('marks standard subscription as CANCELED', async () => {
    const sub = { id: 'sub_standard_1' };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('customer.subscription.deleted', sub)
    );

    db.openClawDeployment.findFirst.mockResolvedValue(null);
    db.subscription.findUnique.mockResolvedValue({ id: 'sub-db-1' } as any);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'customer.subscription.deleted', handled: true });
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-db-1' },
      data: { status: 'CANCELED', canceledAt: expect.any(Date) },
    });
  });

  it('no-ops when deleted subscription is not in our database', async () => {
    const sub = { id: 'sub_unknown' };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('customer.subscription.deleted', sub)
    );

    db.openClawDeployment.findFirst.mockResolvedValue(null);
    db.subscription.findUnique.mockResolvedValue(null);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result.handled).toBe(true);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// customer.subscription.updated
// ═══════════════════════════════════════════════════════════════════
describe('customer.subscription.updated', () => {
  it('syncs period end for OpenClaw deployment', async () => {
    const sub = buildSubscription({ id: 'sub_openclaw_1', status: 'active' });

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('customer.subscription.updated', sub)
    );

    db.openClawDeployment.findFirst.mockResolvedValue({ id: 'deploy-1' } as any);
    db.subscription.findUnique.mockResolvedValue(null);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result).toEqual({ type: 'customer.subscription.updated', handled: true });
    expect(db.openClawDeployment.update).toHaveBeenCalledWith({
      where: { id: 'deploy-1' },
      data: { currentPeriodEnd: expect.any(Date) },
    });
  });

  it('maps Stripe status to our subscription status', async () => {
    const sub = buildSubscription({ id: 'sub_standard_1', status: 'past_due' });

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('customer.subscription.updated', sub)
    );

    db.openClawDeployment.findFirst.mockResolvedValue(null);
    db.subscription.findUnique.mockResolvedValue({ id: 'sub-db-1' } as any);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result.handled).toBe(true);
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-db-1' },
      data: expect.objectContaining({ status: 'PAST_DUE' }),
    });
  });

  it('no-ops when subscription is not tracked', async () => {
    const sub = buildSubscription({ id: 'sub_unknown' });

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(
      buildEvent('customer.subscription.updated', sub)
    );

    db.openClawDeployment.findFirst.mockResolvedValue(null);
    db.subscription.findUnique.mockResolvedValue(null);

    const result = await handleWebhookEvent(Buffer.from('body'), 'sig');

    expect(result.handled).toBe(true);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// chargeCustomerOffSession
// ═══════════════════════════════════════════════════════════════════
describe('chargeCustomerOffSession', () => {
  it('charges using default payment method', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      stripeCustomerId: 'cus_123',
    } as any);

    mockStripeInstance.customers.retrieve.mockResolvedValue({
      deleted: false,
      invoice_settings: { default_payment_method: 'pm_default' },
    } as any);

    mockStripeInstance.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_1',
    } as any);

    const result = await chargeCustomerOffSession('user-1', 1000, 'LLM credits');

    expect(result).toEqual({ success: true, paymentIntentId: 'pi_test_1' });
    expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith({
      amount: 1000,
      currency: 'usd',
      customer: 'cus_123',
      payment_method: 'pm_default',
      off_session: true,
      confirm: true,
      description: 'LLM credits',
      metadata: { userId: 'user-1' },
    });
  });

  it('throws when user has no Stripe customer', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      stripeCustomerId: null,
    } as any);

    await expect(chargeCustomerOffSession('user-1', 1000, 'test')).rejects.toThrow(
      'User has no Stripe customer'
    );
  });

  it('throws when no default payment method exists', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      stripeCustomerId: 'cus_123',
    } as any);

    mockStripeInstance.customers.retrieve.mockResolvedValue({
      deleted: false,
      invoice_settings: {},
      default_source: null,
    } as any);

    await expect(chargeCustomerOffSession('user-1', 1000, 'test')).rejects.toThrow(
      'No default payment method'
    );
  });

  it('returns requiresAction when 3DS is needed', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      stripeCustomerId: 'cus_123',
    } as any);

    mockStripeInstance.customers.retrieve.mockResolvedValue({
      deleted: false,
      invoice_settings: { default_payment_method: 'pm_default' },
    } as any);

    const authError = Object.assign(new Error('auth required'), {
      code: 'authentication_required',
      raw: { payment_intent: { id: 'pi_3ds', client_secret: 'cs_secret' } },
    });
    mockStripeInstance.paymentIntents.create.mockRejectedValue(authError);

    const result = await chargeCustomerOffSession('user-1', 1000, 'test');

    expect(result).toEqual({
      success: false,
      requiresAction: true,
      clientSecret: 'cs_secret',
      paymentIntentId: 'pi_3ds',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// cancelSubscription
// ═══════════════════════════════════════════════════════════════════
describe('cancelSubscription', () => {
  it('cancels subscription at period end', async () => {
    db.subscription.findFirst.mockResolvedValue({
      id: 'sub-db-1',
      stripeSubscriptionId: 'sub_stripe_1',
    } as any);

    await cancelSubscription('user-1');

    expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith('sub_stripe_1', {
      cancel_at_period_end: true,
    });
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-db-1' },
      data: { canceledAt: expect.any(Date) },
    });
  });

  it('throws when no active subscription exists', async () => {
    db.subscription.findFirst.mockResolvedValue(null);

    await expect(cancelSubscription('user-1')).rejects.toThrow('No active subscription found');
  });
});
