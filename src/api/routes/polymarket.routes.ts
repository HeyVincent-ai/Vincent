import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types/index.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as polymarketSkill from '../../skills/polymarketSkill.service.js';
import { auditService } from '../../audit/index.js';

const router = Router();

// All Polymarket skill routes require API key auth
router.use(apiKeyAuthMiddleware);

// ============================================================
// POST /api/skills/polymarket/bet
// ============================================================

const betSchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required'),
  side: z.enum(['BUY', 'SELL']),
  amount: z.number().positive('Amount must be positive'),
  price: z.number().min(0.001).max(0.999).optional(), // Limit order price (0-1 range)
});

router.post(
  '/bet',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = betSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await polymarketSkill.placeBet({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      tokenId: body.tokenId,
      side: body.side,
      amount: body.amount,
      price: body.price,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.polymarket_bet',
      inputData: body,
      outputData: result,
      status:
        result.status === 'denied'
          ? 'FAILED'
          : result.status === 'pending_approval'
            ? 'PENDING'
            : 'SUCCESS',
      errorMessage: result.status === 'denied' ? result.reason : undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    const statusCode = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 202;
    sendSuccess(res, result, statusCode);
  })
);

// ============================================================
// GET /api/skills/polymarket/positions
// ============================================================

router.get(
  '/positions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const market = typeof req.query.market === 'string' ? req.query.market : undefined;
    const result = await polymarketSkill.getPositions(req.secret.id, market);
    sendSuccess(res, result);
  })
);

// ============================================================
// GET /api/skills/polymarket/trades
// ============================================================

router.get(
  '/trades',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const market = typeof req.query.market === 'string' ? req.query.market : undefined;
    const trades = await polymarketSkill.getTrades(req.secret.id, market);
    sendSuccess(res, { trades });
  })
);

// ============================================================
// GET /api/skills/polymarket/markets
// Supports: ?query=text&active=true&limit=50&next_cursor=xyz
// ============================================================

router.get(
  '/markets',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    const activeParam = req.query.active;
    const active = activeParam === 'false' ? false : true; // Default to true
    const limitParam =
      typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    const limit = limitParam && !isNaN(limitParam) ? Math.min(limitParam, 100) : 50;
    const nextCursor =
      typeof req.query.next_cursor === 'string' ? req.query.next_cursor : undefined;

    const result = await polymarketSkill.searchMarkets({ query, active, limit, nextCursor });
    sendSuccess(res, result);
  })
);

// ============================================================
// GET /api/skills/polymarket/market/:conditionId
// ============================================================

router.get(
  '/market/:conditionId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const { conditionId } = req.params as Record<string, string>;
    const result = await polymarketSkill.getMarketInfo(conditionId);
    sendSuccess(res, result);
  })
);

// ============================================================
// GET /api/skills/polymarket/orderbook/:tokenId
// ============================================================

router.get(
  '/orderbook/:tokenId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const { tokenId } = req.params as Record<string, string>;
    const result = await polymarketSkill.getOrderBook(tokenId);
    sendSuccess(res, result);
  })
);

// ============================================================
// GET /api/skills/polymarket/balance
// ============================================================

router.get(
  '/balance',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const result = await polymarketSkill.getBalance(req.secret.id);
    sendSuccess(res, result);
  })
);

// ============================================================
// DELETE /api/skills/polymarket/orders/:orderId
// ============================================================

router.delete(
  '/orders/:orderId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const { orderId } = req.params as Record<string, string>;

    const start = Date.now();
    const result = await polymarketSkill.cancelOrder(req.secret.id, orderId);

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.polymarket_cancel_order',
      inputData: { orderId },
      outputData: result,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    sendSuccess(res, result);
  })
);

// ============================================================
// DELETE /api/skills/polymarket/orders
// ============================================================

router.delete(
  '/orders',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await polymarketSkill.cancelAllOrders(req.secret.id);

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.polymarket_cancel_all',
      inputData: {},
      outputData: result,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    sendSuccess(res, result);
  })
);

export default router;
