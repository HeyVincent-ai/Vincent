import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, errors } from '../../utils/response';
import * as evmWallet from '../../skills/evmWallet.service';

const router = Router();

// All EVM wallet skill routes require API key auth
router.use(apiKeyAuthMiddleware);

// ============================================================
// POST /api/skills/evm-wallet/transfer
// ============================================================

const transferSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
  token: z.string().optional(), // Token address or "ETH"
});

router.post(
  '/transfer',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = transferSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const result = await evmWallet.executeTransfer({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      to: body.to,
      amount: body.amount,
      token: body.token,
    });

    const statusCode = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 202;
    sendSuccess(res, result, statusCode);
  })
);

// ============================================================
// POST /api/skills/evm-wallet/send-transaction
// ============================================================

const sendTxSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data'),
  value: z.string().regex(/^\d+(\.\d+)?$/, 'Value must be a numeric string').optional(),
});

router.post(
  '/send-transaction',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = sendTxSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const result = await evmWallet.executeSendTransaction({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      to: body.to,
      data: body.data,
      value: body.value,
    });

    const statusCode = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 202;
    sendSuccess(res, result, statusCode);
  })
);

// ============================================================
// GET /api/skills/evm-wallet/balance
// ============================================================

router.get(
  '/balance',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    // Optional: query param for token addresses (comma-separated)
    const tokensParam = req.query.tokens;
    const tokenAddresses = typeof tokensParam === 'string' && tokensParam
      ? tokensParam.split(',').map((t) => t.trim())
      : undefined;

    const result = await evmWallet.getBalance(req.secret.id, tokenAddresses);
    sendSuccess(res, result);
  })
);

// ============================================================
// GET /api/skills/evm-wallet/address
// ============================================================

router.get(
  '/address',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const result = await evmWallet.getAddress(req.secret.id);
    sendSuccess(res, result);
  })
);

export default router;
