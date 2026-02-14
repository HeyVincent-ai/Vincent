import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import * as alpacaConnections from '../../services/alpacaConnections.service.js';
import * as alpacaApi from '../../services/alpaca.service.js';
import { auditService } from '../../audit/index.js';

const router = Router();

router.use(sessionAuthMiddleware);

const connectSchema = z.object({
  environment: z.enum(['paper', 'live']),
  apiKeyId: z.string().min(1),
  apiSecretKey: z.string().min(1),
  name: z.string().max(100).optional(),
});

// GET /api/integrations/alpaca
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const includeAccount = req.query.includeAccount === 'true';
    const connection = await alpacaConnections.getConnection(req.user!.id);
    if (!connection) {
      sendSuccess(res, { connection: null });
      return;
    }

    const publicConnection = alpacaConnections.toPublicData(connection);
    if (!includeAccount) {
      sendSuccess(res, { connection: publicConnection });
      return;
    }

    const creds = alpacaConnections.getDecryptedCredentials(connection);
    const account = await alpacaApi.getAccount(creds);
    sendSuccess(res, { connection: publicConnection, account });
  })
);

// POST /api/integrations/alpaca/test
router.post(
  '/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = connectSchema.parse(req.body);
    const result = await alpacaConnections.testConnection({
      userId: req.user!.id,
      name: body.name,
      environment: body.environment,
      apiKeyId: body.apiKeyId,
      apiSecretKey: body.apiSecretKey,
    });
    sendSuccess(res, { account: result.account });
  })
);

// POST /api/integrations/alpaca/connect
router.post(
  '/connect',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = connectSchema.parse(req.body);
    const start = Date.now();

    const result = await alpacaConnections.connect({
      userId: req.user!.id,
      name: body.name,
      environment: body.environment,
      apiKeyId: body.apiKeyId,
      apiSecretKey: body.apiSecretKey,
    });

    auditService.log({
      userId: req.user!.id,
      action: 'alpaca.connect',
      inputData: { environment: body.environment, name: body.name },
      outputData: { connectionId: result.connection.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    sendSuccess(res, result, 201);
  })
);

// DELETE /api/integrations/alpaca/:connectionId
router.delete(
  '/:connectionId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { connectionId } = req.params as Record<string, string>;
    const start = Date.now();

    const connection = await alpacaConnections.disconnect(req.user!.id, connectionId);

    auditService.log({
      userId: req.user!.id,
      action: 'alpaca.disconnect',
      inputData: { connectionId },
      outputData: { connectionId },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    sendSuccess(res, { connection });
  })
);

export default router;
