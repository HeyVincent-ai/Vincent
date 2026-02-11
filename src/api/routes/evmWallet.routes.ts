import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types/index.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as evmWallet from '../../skills/evmWallet.service.js';
import * as relayService from '../../skills/relay.service.js';
import { auditService } from '../../audit/index.js';

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
  chainId: z.number().int().positive(),
});

router.post(
  '/transfer',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = transferSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await evmWallet.executeTransfer({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      to: body.to,
      amount: body.amount,
      token: body.token,
      chainId: body.chainId,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.transfer',
      inputData: { to: body.to, amount: body.amount, token: body.token },
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
// POST /api/skills/evm-wallet/send-transaction
// ============================================================

const sendTxSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data'),
  value: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Value must be a numeric string')
    .optional(),
  chainId: z.number().int().positive(),
});

router.post(
  '/send-transaction',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = sendTxSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await evmWallet.executeSendTransaction({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      to: body.to,
      data: body.data,
      value: body.value,
      chainId: body.chainId,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.send_transaction',
      inputData: { to: body.to, data: body.data, value: body.value },
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
// GET /api/skills/evm-wallet/balances (Alchemy Portfolio)
// ============================================================

router.get(
  '/balances',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    // Optional: comma-separated chain IDs
    const chainIdsParam = req.query.chainIds;
    const chainIds =
      typeof chainIdsParam === 'string' && chainIdsParam
        ? chainIdsParam
            .split(',')
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !isNaN(id))
        : undefined;

    const result = await evmWallet.getPortfolioBalances(req.secret.id, chainIds);
    sendSuccess(res, result);
  })
);

// ============================================================
// POST /api/skills/evm-wallet/swap/preview
// ============================================================

const swapPreviewSchema = z.object({
  sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid sell token address'),
  buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid buy token address'),
  sellAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
  chainId: z.number().int().positive(),
  slippageBps: z.number().int().min(0).max(10000).optional(),
});

router.post(
  '/swap/preview',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = swapPreviewSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await evmWallet.previewSwap({
      secretId: req.secret.id,
      sellToken: body.sellToken,
      buyToken: body.buyToken,
      sellAmount: body.sellAmount,
      chainId: body.chainId,
      slippageBps: body.slippageBps,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.swap_preview',
      inputData: body,
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
// POST /api/skills/evm-wallet/swap/execute
// ============================================================

const swapExecuteSchema = z.object({
  sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid sell token address'),
  buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid buy token address'),
  sellAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
  chainId: z.number().int().positive(),
  slippageBps: z.number().int().min(0).max(10000).optional(),
});

router.post(
  '/swap/execute',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = swapExecuteSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await evmWallet.executeSwap({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      sellToken: body.sellToken,
      buyToken: body.buyToken,
      sellAmount: body.sellAmount,
      chainId: body.chainId,
      slippageBps: body.slippageBps,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.swap_execute',
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
// POST /api/skills/evm-wallet/fund/preview
// ============================================================

const fundSchema = z.object({
  tokenIn: z.string(),
  sourceChainId: z.number().int().positive(),
  depositChainId: z.number().int().positive(),
  depositWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address'),
  tokenInAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be numeric'),
  tokenOut: z.string(),
  slippage: z.number().int().min(0).max(10000).optional(),
});

router.post(
  '/fund/preview',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = fundSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await evmWallet.previewFund({
      secretId: req.secret.id,
      ...body,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.fund_preview',
      inputData: body,
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
// POST /api/skills/evm-wallet/fund/execute
// ============================================================

router.post(
  '/fund/execute',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = fundSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await evmWallet.executeFund({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      ...body,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.fund_execute',
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

    const statusCode = ['executed', 'cross_chain_pending'].includes(result.status)
      ? 200
      : result.status === 'denied'
        ? 403
        : 202;
    sendSuccess(res, result, statusCode);
  })
);

// ============================================================
// GET /api/skills/evm-wallet/fund/status/:requestId
// ============================================================

router.get(
  '/fund/status/:requestId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const requestId = req.params.requestId as string;

    const start = Date.now();
    const result = await relayService.getStatus(requestId);

    auditService.log({
      secretId: req.secret?.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.fund_status',
      inputData: { requestId },
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
