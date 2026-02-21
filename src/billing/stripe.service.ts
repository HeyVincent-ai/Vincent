import Stripe from 'stripe';
import { env } from '../utils/env.js';
import prisma from '../db/client.js';
import * as referralService from '../services/referral.service.js';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/**
 * Extract period dates from a Stripe Subscription object.
 * In Stripe API v2026+, current_period_start/end moved to subscription items.
 */
function extractPeriodDates(sub: Stripe.Subscription): { start: Date; end: Date } {
  const firstItem = sub.items?.data?.[0];
  if (firstItem) {
    return {
      start: new Date(firstItem.current_period_start * 1000),
      end: new Date(firstItem.current_period_end * 1000),
    };
  }
  // Fallback: use billing_cycle_anchor + 30 days
  const start = new Date(sub.created * 1000);
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Extract subscription ID from an invoice (Stripe v2026+ API).
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const subDetails = invoice.parent?.subscription_details;
  if (!subDetails?.subscription) return null;
  return typeof subDetails.subscription === 'string'
    ? subDetails.subscription
    : subDetails.subscription.id;
}

/**
 * Get or create a Stripe customer for a user.
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Create a Stripe Checkout session for the $10/month subscription.
 */
export async function createCheckoutSession(
  userId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId);

  if (!env.STRIPE_PRICE_ID) {
    throw new Error('STRIPE_PRICE_ID is not configured');
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    payment_method_collection: 'if_required',
    allow_promotion_codes: true,
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });

  return { sessionId: session.id, url: session.url! };
}

/**
 * Get active subscription for a user.
 */
export async function getSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      currentPeriodEnd: { gte: new Date() },
    },
  });
}

/**
 * Cancel a user's subscription at period end.
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE' },
  });

  if (!subscription) {
    throw new Error('No active subscription found');
  }

  const stripe = getStripe();
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { canceledAt: new Date() },
  });
}

/**
 * Handle Stripe webhook events.
 */
export async function handleWebhookEvent(
  rawBody: Buffer,
  signature: string
): Promise<{ type: string; handled: boolean }> {
  const stripe = getStripe();

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return { type: event.type, handled: true };

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return { type: event.type, handled: true };

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return { type: event.type, handled: true };

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return { type: event.type, handled: true };

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return { type: event.type, handled: true };

    default:
      return { type: event.type, handled: false };
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const checkoutType = session.metadata?.type;
  const deploymentId = session.metadata?.deploymentId;

  // Handle one-time credit purchases (no subscription involved)
  if (checkoutType === 'openclaw_credits' && deploymentId && userId) {
    const amountCents = session.amount_total;
    if (!amountCents) return;
    const amountUsd = amountCents / 100;
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) return;

    console.log(
      `[stripe] OpenClaw credit checkout completed: $${amountUsd} for deployment ${deploymentId}`
    );
    const openclawService = await import('../services/openclaw.service.js');
    await openclawService.fulfillCreditPurchase(deploymentId, amountUsd, paymentIntentId);
    return;
  }

  // Handle data source credit purchases
  if (checkoutType === 'data_source_credits' && userId) {
    const amountCents = session.amount_total;
    if (!amountCents) return;
    const amountUsd = amountCents / 100;
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) return;

    console.log(`[stripe] Data source credit checkout completed: $${amountUsd} for user ${userId}`);
    const creditService = await import('../dataSources/credit.service.js');
    await creditService.addCredits(userId, amountUsd, paymentIntentId);
    return;
  }

  if (!userId || !session.subscription) return;

  const stripe = getStripe();
  const stripeSubscription = await stripe.subscriptions.retrieve(
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  );

  const period = extractPeriodDates(stripeSubscription);

  // Check if this is an OpenClaw deployment checkout
  if (checkoutType === 'openclaw' && deploymentId) {
    console.log(`[stripe] OpenClaw checkout completed for deployment ${deploymentId}`);
    const openclawService = await import('../services/openclaw.service.js');
    await openclawService.startProvisioning(deploymentId, stripeSubscription.id, period.end);
    return;
  }

  // Default: standard subscription checkout
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: stripeSubscription.id },
    create: {
      userId,
      stripeSubscriptionId: stripeSubscription.id,
      status: 'ACTIVE',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    },
    update: {
      status: 'ACTIVE',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const amountPaidUsd = Number(invoice.amount_paid ?? 0) / 100;
  if (amountPaidUsd <= 0) {
    console.log('[stripe] Skipping referral fulfillment for non-paid invoice');
  }

  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE' },
    });

    if (amountPaidUsd > 0) {
      try {
        await referralService.fulfillReferralReward(sub.userId);
      } catch (err: unknown) {
        console.error(
          '[stripe] Failed to fulfill referral reward:',
          err instanceof Error ? err.message : err
        );
      }
    }
    return;
  }

  const openclawDeployment = await prisma.openClawDeployment.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { userId: true },
  });

  if (openclawDeployment && amountPaidUsd > 0) {
    try {
      await referralService.fulfillReferralReward(openclawDeployment.userId);
    } catch (err: unknown) {
      console.error(
        '[stripe] Failed to fulfill referral reward:',
        err instanceof Error ? err.message : err
      );
    }
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  // Check if this is an OpenClaw subscription
  const openclawDeployment = await prisma.openClawDeployment.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (openclawDeployment) {
    console.log(`[stripe] OpenClaw invoice payment failed for deployment ${openclawDeployment.id}`);
    await prisma.openClawDeployment.update({
      where: { id: openclawDeployment.id },
      data: { statusMessage: 'Payment failed — please update your payment method' },
    });
    return;
  }

  // Default: standard subscription
  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'PAST_DUE' },
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Check if this is an OpenClaw subscription
  const openclawDeployment = await prisma.openClawDeployment.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (openclawDeployment) {
    console.log(`[stripe] OpenClaw subscription deleted for deployment ${openclawDeployment.id}`);
    const openclawService = await import('../services/openclaw.service.js');
    await openclawService.handleSubscriptionExpired(subscription.id);
    return;
  }

  // Default: standard subscription
  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
  }
}

/**
 * Create a Stripe Checkout session for a one-time credit purchase.
 * Uses a custom_unit_amount price so the customer enters their desired amount
 * on the Stripe Checkout page. Works even without a saved payment method.
 */
export async function createCreditsCheckoutSession(
  userId: string,
  deploymentId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  if (!env.STRIPE_CREDIT_PRICE_ID) {
    throw new Error('STRIPE_CREDIT_PRICE_ID is not configured');
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: env.STRIPE_CREDIT_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      deploymentId,
      type: 'openclaw_credits',
    },
  });

  return { sessionId: session.id, url: session.url! };
}

/**
 * Create a Stripe Checkout session for a one-time data-source credit purchase.
 * Uses a custom_unit_amount price so the customer enters their desired amount
 * on the Stripe Checkout page.
 */
export async function createDataSourceCreditsCheckoutSession(
  userId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  if (!env.STRIPE_DATASOURCES_CREDITS_PRICE_ID) {
    throw new Error('STRIPE_DATASOURCES_CREDITS_PRICE_ID is not configured');
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: env.STRIPE_DATASOURCES_CREDITS_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      type: 'data_source_credits',
    },
  });

  return { sessionId: session.id, url: session.url! };
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // Sync period dates for OpenClaw deployments (e.g. trial → active transition)
  const openclawDeployment = await prisma.openClawDeployment.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (openclawDeployment) {
    const period = extractPeriodDates(subscription);
    await prisma.openClawDeployment.update({
      where: { id: openclawDeployment.id },
      data: { currentPeriodEnd: period.end },
    });
  }

  // Standard subscription handling
  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!sub) return;

  const statusMap: Record<string, string> = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    trialing: 'TRIALING',
    incomplete: 'INCOMPLETE',
  };

  const period = extractPeriodDates(subscription);

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: (statusMap[subscription.status] ?? 'ACTIVE') as
        | 'ACTIVE'
        | 'CANCELED'
        | 'PAST_DUE'
        | 'TRIALING'
        | 'INCOMPLETE',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    },
  });
}
