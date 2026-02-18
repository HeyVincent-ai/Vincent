import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import { errors, sendError } from '../../utils/response.js';
import { AuthenticatedRequest } from '../../types/index.js';

// Custom error class for application errors
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Prisma error type
interface PrismaError extends Error {
  code: string;
  meta?: { target?: string[] };
}

function isPrismaError(err: unknown): err is PrismaError {
  return err instanceof Error && err.name === 'PrismaClientKnownRequestError' && 'code' in err;
}

/**
 * Get trace ID from request (set by request logger middleware).
 */
function getTraceId(req: Request): string | undefined {
  return (req as AuthenticatedRequest).traceId;
}

// Error handler middleware
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const traceId = getTraceId(req);

  // Log error with trace ID for debugging
  // Use safe stringify to avoid circular reference errors
  const errorLog = {
    traceId,
    name: err.name,
    message: err.message,
    code: err instanceof AppError ? err.code : undefined,
    details: err instanceof AppError ? err.details : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  };

  try {
    console.error('[ERROR]', JSON.stringify(errorLog));
  } catch {
    // If stringify fails due to circular references, log simpler version
    console.error('[ERROR]', {
      traceId,
      name: err.name,
      message: err.message,
      path: req.path,
      method: req.method,
      note: 'Full error details omitted due to circular references',
    });
  }

  // Handle Zod validation errors (don't report to Sentry - client error)
  if (err instanceof ZodError) {
    errors.validation(res, err.issues);
    return;
  }

  // Handle custom application errors
  if (err instanceof AppError) {
    // Only report 5xx errors to Sentry
    if (err.statusCode >= 500) {
      Sentry.captureException(err, {
        extra: {
          code: err.code,
          details: err.details,
          traceId,
        },
        tags: {
          errorType: 'AppError',
          traceId: traceId || 'unknown',
        },
      });
    }
    sendError(res, err.code, err.message, err.statusCode, err.details, traceId);
    return;
  }

  // Handle Prisma errors (don't report constraint violations - client errors)
  if (isPrismaError(err)) {
    if (err.code === 'P2002') {
      errors.conflict(res, `Duplicate entry for ${err.meta?.target?.join(', ') || 'field'}`);
      return;
    }
    if (err.code === 'P2025') {
      errors.notFound(res);
      return;
    }
    // Report unexpected Prisma errors
    Sentry.captureException(err, {
      extra: {
        prismaCode: err.code,
        traceId,
      },
      tags: {
        errorType: 'PrismaError',
        traceId: traceId || 'unknown',
      },
    });
  }

  // Report unexpected errors to Sentry with trace ID
  Sentry.captureException(err, {
    extra: { traceId },
    tags: {
      errorType: 'UnhandledError',
      traceId: traceId || 'unknown',
    },
  });

  // Default to internal server error - include trace ID
  sendError(
    res,
    'INTERNAL_ERROR',
    process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    500,
    undefined,
    traceId
  );
}

// Async handler wrapper to catch async errors
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
