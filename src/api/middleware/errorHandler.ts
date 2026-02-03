import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import { errors, sendError } from '../../utils/response';

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

// Error handler middleware
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log error for debugging
  console.error('Error:', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

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
        extra: { code: err.code, details: err.details },
        tags: { errorType: 'AppError' },
      });
    }
    sendError(res, err.code, err.message, err.statusCode, err.details);
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
      extra: { prismaCode: err.code },
      tags: { errorType: 'PrismaError' },
    });
  }

  // Report unexpected errors to Sentry
  Sentry.captureException(err, {
    tags: { errorType: 'UnhandledError' },
  });

  // Default to internal server error
  errors.internal(res, process.env.NODE_ENV === 'development' ? err.message : undefined);
}

// Async handler wrapper to catch async errors
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
