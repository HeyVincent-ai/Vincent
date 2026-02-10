import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../types/index.js';

interface RequestLogEntry {
  traceId: string;
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
  ip: string | undefined;
  userAgent: string | undefined;
  apiKeyId?: string;
  secretId?: string;
}

interface ResponseLogEntry {
  traceId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  responseBody?: unknown;
}

/**
 * Sanitize request body to remove sensitive fields before logging.
 */
function sanitizeBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;

  const sanitized = { ...body } as Record<string, unknown>;

  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'privateKey', 'apiKey', 'authorization'];
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Capture response body by intercepting res.json().
 */
function captureResponseBody(res: Response): { getBody: () => unknown } {
  let capturedBody: unknown;
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    capturedBody = body;
    return originalJson(body);
  };

  return {
    getBody: () => capturedBody,
  };
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Generate unique trace ID for this request
  const traceId = randomUUID();
  (req as AuthenticatedRequest).traceId = traceId;

  // Also set trace ID in response header for client reference
  res.setHeader('X-Trace-Id', traceId);

  // Capture response body
  const responseCapture = captureResponseBody(res);

  // Log request immediately
  const requestLog: RequestLogEntry = {
    traceId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query as Record<string, unknown>,
    body: sanitizeBody(req.body),
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
  };

  // Log request (skip health checks for noise reduction)
  if (req.path !== '/health') {
    console.log('[REQUEST]', JSON.stringify(requestLog));
  }

  // Log response after it's sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;

    // Get API key and secret IDs if available (set by auth middleware)
    const authReq = req as AuthenticatedRequest;

    const responseLog: ResponseLogEntry = {
      traceId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: status,
      durationMs: duration,
    };

    // Include response body for errors (4xx, 5xx) to help with debugging
    if (status >= 400) {
      responseLog.responseBody = responseCapture.getBody();
    }

    // Skip health checks for noise reduction
    if (req.path !== '/health') {
      const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
      const reset = '\x1b[0m';
      console.log(`${color}[RESPONSE]${reset}`, JSON.stringify(responseLog));
    }
  });

  next();
}
