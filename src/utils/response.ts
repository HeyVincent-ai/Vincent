import { Response } from 'express';
import { ApiResponse, PaginationMeta } from '../types/index.js';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  pagination?: PaginationMeta
): void {
  const response: ApiResponse<T> & { pagination?: PaginationMeta } = {
    success: true,
    data,
  };

  if (pagination) {
    response.pagination = pagination;
  }

  res.status(statusCode).json(response);
}

/**
 * Send an error response with trace ID for debugging.
 * The trace ID can be used to look up the request in logs or Sentry.
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown,
  traceId?: string
): void {
  // Get trace ID from response header if not provided (set by request logger)
  const resolvedTraceId = traceId || (res.getHeader('X-Trace-Id') as string | undefined);

  const response: ApiResponse & { traceId?: string } = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };

  // Include trace ID in error responses for user debugging
  if (resolvedTraceId) {
    response.traceId = resolvedTraceId;
  }

  res.status(statusCode).json(response);
}

// Common error responses
export const errors = {
  notFound: (res: Response, resource = 'Resource') =>
    sendError(res, 'NOT_FOUND', `${resource} not found`, 404),

  unauthorized: (res: Response, message = 'Unauthorized') =>
    sendError(res, 'UNAUTHORIZED', message, 401),

  forbidden: (res: Response, message = 'Forbidden') => sendError(res, 'FORBIDDEN', message, 403),

  badRequest: (res: Response, message: string, details?: unknown) =>
    sendError(res, 'BAD_REQUEST', message, 400, details),

  validation: (res: Response, details: unknown) =>
    sendError(res, 'VALIDATION_ERROR', 'Validation failed', 400, details),

  internal: (res: Response, message = 'Internal server error') =>
    sendError(res, 'INTERNAL_ERROR', message, 500),

  rateLimit: (res: Response) => sendError(res, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 429),

  conflict: (res: Response, message: string) => sendError(res, 'CONFLICT', message, 409),
};
