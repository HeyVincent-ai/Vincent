import { z, ZodError } from 'zod';
import { AuditLogStatus, SecretType, type User } from '@prisma/client';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { auditService } from '../audit/index.js';
import type { SecretSafeData } from '../types/index.js';
import * as evmWallet from '../skills/evmWallet.service.js';
import * as polymarketSkill from '../skills/polymarketSkill.service.js';
import * as rawSigner from '../skills/rawSigner.service.js';
import { webSearch, newsSearch, webSearchSchema, newsSearchSchema } from '../dataSources/brave/handler.js';
import {
  searchTweets,
  searchTweetsSchema,
  getTweet,
  getTweetSchema,
  getUserByUsername,
  getUserSchema,
  getUserTweets,
  getUserTweetsSchema,
} from '../dataSources/twitter/handler.js';
import { getEndpointCost } from '../dataSources/registry.js';
import { checkCredit, deductCredit } from '../dataSources/credit.service.js';
import { logUsage } from '../dataSources/usage.service.js';

export interface ToolContext {
  secret: SecretSafeData;
  apiKeyId?: string;
  ipAddress?: string;
  userAgent?: string;
  traceId?: string;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  secretTypes: SecretType[];
  handler: (args: unknown, ctx: ToolContext) => Promise<unknown>;
}

const walletTransferSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
  token: z.string().optional(),
  chainId: z.coerce.number().int().positive(),
});

const walletSendSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data'),
  value: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Value must be a numeric string')
    .optional(),
  chainId: z.coerce.number().int().positive(),
});

const walletSwapSchema = z.object({
  sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid sell token address'),
  buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid buy token address'),
  sellAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
  chainId: z.coerce.number().int().positive(),
  slippageBps: z.coerce.number().int().min(0).max(10000).optional(),
});

const walletBalancesSchema = z.object({
  chainIds: z.array(z.coerce.number().int().positive()).optional(),
});

const polymarketBetSchema = z.object({
  tokenId: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  amount: z.number().positive(),
  price: z.number().min(0.001).max(0.999).optional(),
});

const polymarketMarketSchema = z.object({
  conditionId: z.string().min(1),
});

const polymarketOrderbookSchema = z.object({
  tokenId: z.string().min(1),
});

const polymarketSearchSchema = z.object({
  query: z.string().optional(),
  active: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional(),
  nextCursor: z.string().optional(),
});

const polymarketMarketFilterSchema = z.object({
  market: z.string().optional(),
});

const polymarketCancelSchema = z.object({
  orderId: z.string().min(1),
});

const rawSignerSignSchema = z.object({
  message: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Message must be hex-encoded (0x...)'),
  curve: z.enum(['ethereum', 'solana']),
});

function toolError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError('INVALID_PARAMS', 'Invalid tool arguments', 400, error.issues);
  }
  return new AppError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', 500);
}

async function requireDataSourceUser(secret: SecretSafeData): Promise<User> {
  if (secret.type !== 'DATA_SOURCES') {
    throw new AppError('FORBIDDEN', 'API key is not scoped to a DATA_SOURCES secret', 403);
  }

  if (!secret.userId) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    throw new AppError(
      'NOT_CLAIMED',
      `Secret not claimed. Visit ${baseUrl}/claim/${secret.id} to claim and activate.`,
      403
    );
  }

  const user = await prisma.user.findUnique({ where: { id: secret.userId } });
  if (!user) {
    throw new AppError('NOT_FOUND', 'Secret owner not found', 404);
  }

  const hasCredit = user.dataSourceCreditUsd.toNumber() > 0;
  const hasPaymentMethod = !!user.stripeCustomerId;

  if (!hasCredit && !hasPaymentMethod) {
    throw new AppError(
      'PAYMENT_REQUIRED',
      'Credit card required. Please add a payment method to continue using data sources.',
      402
    );
  }

  return user;
}

async function runDataSourceTool<T extends z.ZodTypeAny>(
  ctx: ToolContext,
  dataSourceId: string,
  endpointId: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<unknown>,
  args: unknown
): Promise<unknown> {
  const start = Date.now();
  const user = await requireDataSourceUser(ctx.secret);
  const cost = getEndpointCost(dataSourceId, endpointId);
  if (cost === undefined) {
    throw new AppError('UNKNOWN_ENDPOINT', `Unknown endpoint: ${dataSourceId}/${endpointId}`, 404);
  }

  const params = schema.parse(args ?? {});

  const hasCredit = await checkCredit(user.id, cost);
  if (!hasCredit) {
    throw new AppError(
      'INSUFFICIENT_CREDIT',
      `Insufficient data source credit. Balance: $${user.dataSourceCreditUsd.toFixed(2)}, required: $${cost.toFixed(4)}`,
      402,
      { balance: user.dataSourceCreditUsd.toNumber(), required: cost }
    );
  }

  try {
    const result = await handler(params);
    const newBalance = await deductCredit(user.id, cost);

    logUsage({
      userId: user.id,
      secretId: ctx.secret.id,
      apiKeyId: ctx.apiKeyId,
      dataSource: dataSourceId,
      endpoint: endpointId,
      costUsd: cost,
      metadata: { params },
    }).catch(console.error);

    auditService
      .log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        userId: user.id,
        action: `datasource.${dataSourceId}.${endpointId}`,
        inputData: { params },
        status: AuditLogStatus.SUCCESS,
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      .catch(console.error);

    return {
      ...(result as object),
      _vincent: {
        cost: cost.toFixed(6),
        balance: newBalance.toFixed(2),
      },
    };
  } catch (err: unknown) {
    auditService
      .log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        userId: user.id,
        action: `datasource.${dataSourceId}.${endpointId}`,
        inputData: { params },
        status: AuditLogStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      .catch(console.error);
    throw err;
  }
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'vincent_wallet_transfer',
    title: 'Transfer tokens',
    description: 'Transfer native tokens or ERC-20 tokens from an EVM wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient EVM address (0x...)' },
        amount: { type: 'string', description: 'Amount as a numeric string' },
        token: { type: 'string', description: 'Token contract address (optional)' },
        chainId: { type: 'integer', description: 'EVM chain ID' },
      },
      required: ['to', 'amount', 'chainId'],
      additionalProperties: false,
    },
    secretTypes: ['EVM_WALLET'],
    handler: async (args, ctx) => {
      const body = walletTransferSchema.parse(args);
      const start = Date.now();
      const result = await evmWallet.executeTransfer({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        to: body.to,
        amount: body.amount,
        token: body.token,
        chainId: body.chainId,
      });

      auditService.log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        action: 'mcp.wallet.transfer',
        inputData: body,
        outputData: result,
        status:
          result.status === 'denied'
            ? AuditLogStatus.FAILED
            : result.status === 'pending_approval'
              ? AuditLogStatus.PENDING
              : AuditLogStatus.SUCCESS,
        errorMessage: result.status === 'denied' ? result.reason : undefined,
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return result;
    },
  },
  {
    name: 'vincent_wallet_send_transaction',
    title: 'Send transaction',
    description: 'Send an arbitrary EVM transaction with custom calldata.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target contract address (0x...)' },
        data: { type: 'string', description: 'Hex-encoded calldata (0x...)' },
        value: { type: 'string', description: 'ETH value as numeric string (optional)' },
        chainId: { type: 'integer', description: 'EVM chain ID' },
      },
      required: ['to', 'data', 'chainId'],
      additionalProperties: false,
    },
    secretTypes: ['EVM_WALLET'],
    handler: async (args, ctx) => {
      const body = walletSendSchema.parse(args);
      const start = Date.now();
      const result = await evmWallet.executeSendTransaction({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        to: body.to,
        data: body.data,
        value: body.value,
        chainId: body.chainId,
      });

      auditService.log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        action: 'mcp.wallet.send_transaction',
        inputData: body,
        outputData: result,
        status:
          result.status === 'denied'
            ? AuditLogStatus.FAILED
            : result.status === 'pending_approval'
              ? AuditLogStatus.PENDING
              : AuditLogStatus.SUCCESS,
        errorMessage: result.status === 'denied' ? result.reason : undefined,
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return result;
    },
  },
  {
    name: 'vincent_wallet_balances',
    title: 'Get balances',
    description: 'Get portfolio balances for an EVM wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        chainIds: { type: 'array', items: { type: 'integer' } },
      },
      required: [],
      additionalProperties: false,
    },
    secretTypes: ['EVM_WALLET'],
    handler: async (args, ctx) => {
      const body = walletBalancesSchema.parse(args ?? {});
      return evmWallet.getPortfolioBalances(ctx.secret.id, body.chainIds);
    },
  },
  {
    name: 'vincent_wallet_address',
    title: 'Get wallet address',
    description: 'Get the smart account address for the EVM wallet.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    secretTypes: ['EVM_WALLET'],
    handler: async (_args, ctx) => evmWallet.getAddress(ctx.secret.id),
  },
  {
    name: 'vincent_wallet_swap_preview',
    title: 'Preview swap',
    description: 'Preview a token swap using 0x pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        sellToken: { type: 'string' },
        buyToken: { type: 'string' },
        sellAmount: { type: 'string' },
        chainId: { type: 'integer' },
        slippageBps: { type: 'integer' },
      },
      required: ['sellToken', 'buyToken', 'sellAmount', 'chainId'],
      additionalProperties: false,
    },
    secretTypes: ['EVM_WALLET'],
    handler: async (args, ctx) => {
      const body = walletSwapSchema.parse(args);
      const start = Date.now();
      const result = await evmWallet.previewSwap({
        secretId: ctx.secret.id,
        sellToken: body.sellToken,
        buyToken: body.buyToken,
        sellAmount: body.sellAmount,
        chainId: body.chainId,
        slippageBps: body.slippageBps,
      });

      auditService.log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        action: 'mcp.wallet.swap_preview',
        inputData: body,
        outputData: result,
        status: AuditLogStatus.SUCCESS,
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return result;
    },
  },
  {
    name: 'vincent_wallet_swap_execute',
    title: 'Execute swap',
    description: 'Execute a token swap using 0x.',
    inputSchema: {
      type: 'object',
      properties: {
        sellToken: { type: 'string' },
        buyToken: { type: 'string' },
        sellAmount: { type: 'string' },
        chainId: { type: 'integer' },
        slippageBps: { type: 'integer' },
      },
      required: ['sellToken', 'buyToken', 'sellAmount', 'chainId'],
      additionalProperties: false,
    },
    secretTypes: ['EVM_WALLET'],
    handler: async (args, ctx) => {
      const body = walletSwapSchema.parse(args);
      const start = Date.now();
      const result = await evmWallet.executeSwap({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        sellToken: body.sellToken,
        buyToken: body.buyToken,
        sellAmount: body.sellAmount,
        chainId: body.chainId,
        slippageBps: body.slippageBps,
      });

      auditService.log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        action: 'mcp.wallet.swap_execute',
        inputData: body,
        outputData: result,
        status:
          result.status === 'denied'
            ? AuditLogStatus.FAILED
            : result.status === 'pending_approval'
              ? AuditLogStatus.PENDING
              : AuditLogStatus.SUCCESS,
        errorMessage: result.status === 'denied' ? result.reason : undefined,
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return result;
    },
  },
  {
    name: 'vincent_polymarket_bet',
    title: 'Place a Polymarket bet',
    description: 'Place a buy or sell order on Polymarket.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenId: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        amount: { type: 'number' },
        price: { type: 'number' },
      },
      required: ['tokenId', 'side', 'amount'],
      additionalProperties: false,
    },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (args, ctx) => {
      const body = polymarketBetSchema.parse(args);
      const start = Date.now();
      const result = await polymarketSkill.placeBet({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        tokenId: body.tokenId,
        side: body.side,
        amount: body.amount,
        price: body.price,
      });

      auditService.log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        action: 'mcp.polymarket.bet',
        inputData: body,
        outputData: result,
        status:
          result.status === 'denied'
            ? AuditLogStatus.FAILED
            : result.status === 'pending_approval'
              ? AuditLogStatus.PENDING
              : AuditLogStatus.SUCCESS,
        errorMessage: result.status === 'denied' ? result.reason : undefined,
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return result;
    },
  },
  {
    name: 'vincent_polymarket_markets',
    title: 'Search Polymarket markets',
    description: 'Search or list Polymarket markets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        active: { type: 'boolean' },
        limit: { type: 'integer' },
        nextCursor: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (args, ctx) => {
      const body = polymarketSearchSchema.parse(args ?? {});
      return polymarketSkill.searchMarkets({
        query: body.query,
        active: body.active,
        limit: body.limit ?? 50,
        nextCursor: body.nextCursor,
      });
    },
  },
  {
    name: 'vincent_polymarket_market',
    title: 'Get Polymarket market',
    description: 'Fetch market details by condition ID.',
    inputSchema: {
      type: 'object',
      properties: { conditionId: { type: 'string' } },
      required: ['conditionId'],
      additionalProperties: false,
    },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (args, ctx) => {
      const body = polymarketMarketSchema.parse(args);
      return polymarketSkill.getMarketInfo(body.conditionId);
    },
  },
  {
    name: 'vincent_polymarket_orderbook',
    title: 'Get Polymarket orderbook',
    description: 'Fetch orderbook for a market token.',
    inputSchema: {
      type: 'object',
      properties: { tokenId: { type: 'string' } },
      required: ['tokenId'],
      additionalProperties: false,
    },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (args) => {
      const body = polymarketOrderbookSchema.parse(args);
      return polymarketSkill.getOrderBook(body.tokenId);
    },
  },
  {
    name: 'vincent_polymarket_positions',
    title: 'Get Polymarket positions',
    description: 'Fetch open positions and orders.',
    inputSchema: {
      type: 'object',
      properties: { market: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (args, ctx) => {
      const body = polymarketMarketFilterSchema.parse(args ?? {});
      return polymarketSkill.getPositions(ctx.secret.id, body.market);
    },
  },
  {
    name: 'vincent_polymarket_holdings',
    title: 'Get Polymarket holdings',
    description: 'Fetch Polymarket holdings.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (_args, ctx) => polymarketSkill.getHoldings(ctx.secret.id),
  },
  {
    name: 'vincent_polymarket_trades',
    title: 'Get Polymarket trades',
    description: 'Fetch trade history for a market or all.',
    inputSchema: {
      type: 'object',
      properties: { market: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (args, ctx) => {
      const body = polymarketMarketFilterSchema.parse(args ?? {});
      return polymarketSkill.getTrades(ctx.secret.id, body.market);
    },
  },
  {
    name: 'vincent_polymarket_balance',
    title: 'Get Polymarket balance',
    description: 'Fetch Polymarket wallet collateral balance.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (_args, ctx) => polymarketSkill.getBalance(ctx.secret.id),
  },
  {
    name: 'vincent_polymarket_cancel_order',
    title: 'Cancel Polymarket order',
    description: 'Cancel a specific Polymarket order.',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
      additionalProperties: false,
    },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (args, ctx) => {
      const body = polymarketCancelSchema.parse(args);
      return polymarketSkill.cancelOrder(ctx.secret.id, body.orderId);
    },
  },
  {
    name: 'vincent_polymarket_cancel_all',
    title: 'Cancel all Polymarket orders',
    description: 'Cancel all open Polymarket orders.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    secretTypes: ['POLYMARKET_WALLET'],
    handler: async (_args, ctx) => polymarketSkill.cancelAllOrders(ctx.secret.id),
  },
  {
    name: 'vincent_raw_signer_sign',
    title: 'Sign message',
    description: 'Sign a hex-encoded message using a raw signer.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Hex-encoded message (0x...)' },
        curve: { type: 'string', enum: ['ethereum', 'solana'] },
      },
      required: ['message', 'curve'],
      additionalProperties: false,
    },
    secretTypes: ['RAW_SIGNER'],
    handler: async (args, ctx) => {
      const body = rawSignerSignSchema.parse(args);
      const start = Date.now();
      const result = await rawSigner.sign({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        message: body.message,
        curve: body.curve,
      });

      auditService.log({
        secretId: ctx.secret.id,
        apiKeyId: ctx.apiKeyId,
        action: 'mcp.raw_signer.sign',
        inputData: {
          curve: body.curve,
          messageLength: body.message.length,
          messagePreview: body.message.slice(0, 66) + (body.message.length > 66 ? '...' : ''),
        },
        outputData: result,
        status:
          result.status === 'denied'
            ? AuditLogStatus.FAILED
            : result.status === 'pending_approval'
              ? AuditLogStatus.PENDING
              : AuditLogStatus.SUCCESS,
        errorMessage: result.status === 'denied' ? result.reason : undefined,
        durationMs: Date.now() - start,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return result;
    },
  },
  {
    name: 'vincent_raw_signer_addresses',
    title: 'Get signer addresses',
    description: 'Get addresses for the raw signer.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    secretTypes: ['RAW_SIGNER'],
    handler: async (_args, ctx) => rawSigner.getAddresses(ctx.secret.id),
  },
  {
    name: 'vincent_brave_web_search',
    title: 'Brave web search',
    description: 'Search the web with Brave Search.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        count: { type: 'integer' },
        offset: { type: 'integer' },
        freshness: { type: 'string', enum: ['pd', 'pw', 'pm', 'py'] },
        country: { type: 'string' },
      },
      required: ['q'],
      additionalProperties: false,
    },
    secretTypes: ['DATA_SOURCES'],
    handler: async (args, ctx) =>
      runDataSourceTool(
        ctx,
        'brave',
        'web',
        webSearchSchema,
        webSearch,
        args
      ),
  },
  {
    name: 'vincent_brave_news_search',
    title: 'Brave news search',
    description: 'Search news with Brave Search.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        count: { type: 'integer' },
        freshness: { type: 'string', enum: ['pd', 'pw', 'pm', 'py'] },
      },
      required: ['q'],
      additionalProperties: false,
    },
    secretTypes: ['DATA_SOURCES'],
    handler: async (args, ctx) =>
      runDataSourceTool(
        ctx,
        'brave',
        'news',
        newsSearchSchema,
        newsSearch,
        args
      ),
  },
  {
    name: 'vincent_twitter_search',
    title: 'Search tweets',
    description: 'Search recent tweets from X/Twitter.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        max_results: { type: 'integer' },
        start_time: { type: 'string' },
        end_time: { type: 'string' },
      },
      required: ['q'],
      additionalProperties: false,
    },
    secretTypes: ['DATA_SOURCES'],
    handler: async (args, ctx) =>
      runDataSourceTool(
        ctx,
        'twitter',
        'search',
        searchTweetsSchema,
        searchTweets,
        args
      ),
  },
  {
    name: 'vincent_twitter_get_tweet',
    title: 'Get tweet',
    description: 'Fetch a tweet by ID.',
    inputSchema: {
      type: 'object',
      properties: { tweetId: { type: 'string' } },
      required: ['tweetId'],
      additionalProperties: false,
    },
    secretTypes: ['DATA_SOURCES'],
    handler: async (args, ctx) =>
      runDataSourceTool(
        ctx,
        'twitter',
        'get-tweet',
        getTweetSchema,
        (params) => getTweet(params.tweetId),
        args
      ),
  },
  {
    name: 'vincent_twitter_get_user',
    title: 'Get user profile',
    description: 'Fetch a Twitter/X profile by username.',
    inputSchema: {
      type: 'object',
      properties: { username: { type: 'string' } },
      required: ['username'],
      additionalProperties: false,
    },
    secretTypes: ['DATA_SOURCES'],
    handler: async (args, ctx) =>
      runDataSourceTool(
        ctx,
        'twitter',
        'get-user',
        getUserSchema,
        (params) => getUserByUsername(params.username),
        args
      ),
  },
  {
    name: 'vincent_twitter_user_tweets',
    title: 'Get user tweets',
    description: 'Fetch recent tweets for a user by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        max_results: { type: 'integer' },
      },
      required: ['userId'],
      additionalProperties: false,
    },
    secretTypes: ['DATA_SOURCES'],
    handler: async (args, ctx) =>
      runDataSourceTool(
        ctx,
        'twitter',
        'user-tweets',
        getUserTweetsSchema,
        (params) => getUserTweets(params.userId, params.max_results),
        args
      ),
  },
];

export function listToolsForSecret(secret: SecretSafeData): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.secretTypes.includes(secret.type));
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export function parseToolError(err: unknown): AppError {
  return toolError(err);
}
