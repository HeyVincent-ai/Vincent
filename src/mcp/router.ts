import { Router, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { listToolsForSecret, getTool, parseToolError, type ToolContext } from './tools.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { validateApiKey, trackApiKeyUsage } from '../services/apiKey.service.js';
import prisma from '../db/client.js';

const MCP_PROTOCOL_VERSION = '2024-11-05';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const router = Router();

router.get('/', (_req, res) => {
  res
    .set('Allow', 'POST')
    .status(405)
    .json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32601,
        message: 'MCP server expects JSON-RPC POST requests',
      },
    });
});

router.post('/', async (req: Request, res: Response) => {
  const payload = req.body as JsonRpcRequest;
  if (!payload || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid JSON-RPC request',
      },
    });
  }

  // JSON-RPC 2.0: requests without an id are notifications and must not receive a response
  if (payload.id === undefined) {
    return res.status(204).end();
  }

  const id = payload.id ?? null;

  try {
    const authReq = req as AuthenticatedRequest;
    await authenticateMcpRequest(authReq);
    if (!authReq.secret) {
      throw new AppError('UNAUTHORIZED', 'Missing API key', 401);
    }

    const ctx: ToolContext = {
      secret: authReq.secret,
      apiKeyId: authReq.apiKey?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      traceId: authReq.traceId,
    };

    switch (payload.method) {
      case 'initialize': {
        return res.json(
          buildResult(id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            serverInfo: {
              name: 'Vincent MCP',
              version: process.env.npm_package_version || '1.0.0',
            },
            capabilities: {
              tools: { listChanged: false },
            },
            instructions:
              'This MCP server exposes Vincent skills based on the API key scope. Use tools/list to see available tools.',
          })
        );
      }
      case 'tools/list': {
        const tools = listToolsForSecret(ctx.secret).map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }));
        return res.json(buildResult(id, { tools }));
      }
      case 'tools/call': {
        const params = payload.params as { name?: string; arguments?: unknown };
        if (!params?.name) {
          throw new AppError('INVALID_PARAMS', 'Missing tool name', 400);
        }

        const tool = getTool(params.name);
        if (!tool) {
          throw new AppError('NOT_FOUND', `Unknown tool: ${params.name}`, 404);
        }

        if (!tool.secretTypes.includes(ctx.secret.type)) {
          throw new AppError(
            'FORBIDDEN',
            `Tool ${params.name} is not available for ${ctx.secret.type} API keys`,
            403
          );
        }

        const result = await tool.handler(params.arguments ?? {}, ctx);
        return res.json(
          buildResult(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          })
        );
      }
      default:
        return res.status(404).json(buildError(id, -32601, 'Method not found'));
    }
  } catch (error) {
    const appError = parseToolError(error);
    return res.status(mapStatus(appError)).json(
      buildError(id, mapErrorCode(appError), appError.message, {
        code: appError.code,
        status: appError.statusCode,
        details: appError.details,
      })
    );
  }
});

router.delete('/', (_req, res) => {
  res
    .set('Allow', 'POST')
    .status(405)
    .json(buildError(null, -32601, 'Session termination is not supported'));
});

function buildResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function buildError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

function mapErrorCode(err: AppError): number {
  if (err.code === 'INVALID_PARAMS') return -32602;
  if (err.code === 'NOT_FOUND') return -32601;
  if (err.code === 'UNAUTHORIZED') return -32001;
  if (err.code === 'FORBIDDEN') return -32003;
  if (err.code === 'PAYMENT_REQUIRED') return -32004;
  return -32000;
}

function mapStatus(err: AppError): number {
  if (err.statusCode >= 500) return 500;
  if (err.statusCode >= 400) return err.statusCode;
  return 400;
}

async function authenticateMcpRequest(req: AuthenticatedRequest): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppError('UNAUTHORIZED', 'Missing Authorization header', 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new AppError(
      'UNAUTHORIZED',
      'Invalid Authorization header format. Expected: Bearer <api_key>',
      401
    );
  }

  const apiKeyValue = parts[1];
  const result = await validateApiKey(apiKeyValue);

  if (!result.valid || !result.apiKey || !result.secretId) {
    throw new AppError('UNAUTHORIZED', 'Invalid or revoked API key', 401);
  }

  const secret = await prisma.secret.findFirst({
    where: {
      id: result.secretId,
      deletedAt: null,
    },
    select: {
      id: true,
      userId: true,
      type: true,
      memo: true,
      claimedAt: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!secret) {
    throw new AppError('UNAUTHORIZED', 'Secret not found or deleted', 401);
  }

  trackApiKeyUsage(result.apiKey.id).catch(console.error);

  req.apiKey = result.apiKey;
  req.secret = secret;
}

export default router;
