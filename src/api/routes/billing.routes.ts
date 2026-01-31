import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types';
import { sessionAuthMiddleware } from '../middleware/sessionAuth';
import { sendSuccess, sendError, errors } from '../../utils/response';
import * as stripeService from '../../billing/stripe.service';
import * as gasAggregation from '../../billing/gasAggregation.service';

const router = Router();

// --- Subscription endpoints (require session auth) ---

/**
 * GET /api/billing/subscription
 * Get current subscription status.
 */
router.get(
  '/subscription',
  sessionAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const subscription = await stripeService.getSubscription(req.user!.id);

      sendSuccess(res, {
        hasSubscription: !!subscription,
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              canceledAt: subscription.canceledAt,
            }
          : null,
      });
    } catch (error) {
      console.error('Get subscription error:', error);
      errors.internal(res);
    }
  }
);

const subscribeSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/**
 * POST /api/billing/subscribe
 * Create a Stripe Checkout session for subscription.
 */
router.post(
  '/subscribe',
  sessionAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      errors.validation(res, parsed.error.format());
      return;
    }

    try {
      const existing = await stripeService.getSubscription(req.user!.id);
      if (existing) {
        sendError(res, 'ALREADY_SUBSCRIBED', 'You already have an active subscription', 409);
        return;
      }

      const { sessionId, url } = await stripeService.createCheckoutSession(
        req.user!.id,
        parsed.data.successUrl,
        parsed.data.cancelUrl
      );

      sendSuccess(res, { sessionId, checkoutUrl: url });
    } catch (error) {
      console.error('Create checkout error:', error);
      errors.internal(res);
    }
  }
);

/**
 * POST /api/billing/cancel
 * Cancel the user's subscription at period end.
 */
router.post('/cancel', sessionAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await stripeService.cancelSubscription(req.user!.id);
    sendSuccess(res, { message: 'Subscription will be canceled at end of billing period' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to cancel subscription';
    sendError(res, 'CANCEL_FAILED', msg, 400);
  }
});

// --- Webhook endpoint (no session auth, uses Stripe signature) ---

/**
 * POST /api/billing/webhook
 * Stripe webhook handler. Must receive raw body.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    errors.badRequest(res, 'Missing stripe-signature header');
    return;
  }

  try {
    // req.body is a Buffer when express.raw() is used for this route
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      errors.badRequest(res, 'Missing raw body for webhook verification');
      return;
    }

    const result = await stripeService.handleWebhookEvent(rawBody, signature);
    sendSuccess(res, result);
  } catch (error) {
    console.error('Webhook error:', error);
    sendError(res, 'WEBHOOK_ERROR', 'Webhook processing failed', 400);
  }
});

// --- Usage endpoints (require session auth) ---

/**
 * GET /api/billing/usage
 * Get current month gas usage for the authenticated user.
 */
router.get('/usage', sessionAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const usage = await gasAggregation.getCurrentMonthUsage(req.user!.id);
    sendSuccess(res, usage);
  } catch (error) {
    console.error('Get usage error:', error);
    errors.internal(res);
  }
});

/**
 * GET /api/billing/usage/history
 * Get historical gas usage summaries by month.
 */
router.get(
  '/usage/history',
  sessionAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const history = await gasAggregation.getGasUsageHistory(req.user!.id);
      sendSuccess(
        res,
        history.map((h) => ({
          id: h.id,
          month: h.month,
          totalCostUsd: h.totalCostUsd.toNumber(),
          billed: h.billed,
          stripeInvoiceId: h.stripeInvoiceId,
        }))
      );
    } catch (error) {
      console.error('Get usage history error:', error);
      errors.internal(res);
    }
  }
);

/**
 * GET /api/billing/invoices
 * List past invoices from Stripe.
 */
router.get(
  '/invoices',
  sessionAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      if (!user.stripeCustomerId) {
        sendSuccess(res, []);
        return;
      }

      // Fetch invoices from the MonthlyGasSummary records
      const summaries = await gasAggregation.getGasUsageHistory(user.id);
      const invoices = summaries
        .filter((s) => s.billed)
        .map((s) => ({
          month: s.month,
          totalCostUsd: s.totalCostUsd.toNumber(),
          stripeInvoiceId: s.stripeInvoiceId,
        }));

      sendSuccess(res, invoices);
    } catch (error) {
      console.error('Get invoices error:', error);
      errors.internal(res);
    }
  }
);

export default router;
