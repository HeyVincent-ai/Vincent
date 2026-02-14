import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionOrApiKeyAuth } from '../middleware/sessionOrApiKeyAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import { tradeIntentSchema, createTradeIntent } from '../../services/alpacaTradeGateway.service.js';
import { auditService } from '../../audit/index.js';
import * as alpacaConnections from '../../services/alpacaConnections.service.js';
import * as alpacaApi from '../../services/alpaca.service.js';

const router = Router();

router.use(sessionOrApiKeyAuth);

// GET /api/trading/alpaca/account
router.get(
  '/account',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id ?? req.secret?.userId ?? null;
    if (!userId) {
      errors.forbidden(res, 'No user is associated with this token');
      return;
    }

    const connectionId = typeof req.query.connectionId === 'string' ? req.query.connectionId : undefined;
    const connection = await alpacaConnections.getConnection(userId, connectionId);
    if (!connection || !connection.isActive) {
      errors.badRequest(res, 'No active Alpaca connection found');
      return;
    }

    const start = Date.now();
    const creds = alpacaConnections.getDecryptedCredentials(connection);
    const account = await alpacaApi.getAccount(creds);

    auditService.log({
      userId,
      apiKeyId: req.apiKey?.id,
      action: 'alpaca.account',
      inputData: { connectionId },
      outputData: { connectionId: connection.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    sendSuccess(res, { connection: alpacaConnections.toPublicData(connection), account });
  })
);

// POST /api/trading/alpaca/intents
router.post(
  '/intents',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = tradeIntentSchema.parse(req.body);

    const userId = req.user?.id ?? req.secret?.userId ?? null;
    if (!userId) {
      errors.forbidden(res, 'No user is associated with this token');
      return;
    }

    const start = Date.now();
    const result = await createTradeIntent({
      userId,
      apiKeyId: req.apiKey?.id,
      input,
    });

    const status = result.intent.status;
    const statusCode = status === 'REJECTED' ? 403 : status === 'PENDING_POLICY' ? 202 : 200;

    auditService.log({
      userId,
      apiKeyId: req.apiKey?.id,
      action: 'alpaca.trade_intent',
      inputData: input,
      outputData: {
        intentId: result.intent.id,
        status,
        alpacaOrderId: result.intent.alpacaOrderId,
        idempotent: result.idempotent ?? false,
      },
      status: status === 'REJECTED' || status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    sendSuccess(res, { intent: result.intent, order: (result as any).order, idempotent: result.idempotent }, statusCode);
  })
);

export default router;
