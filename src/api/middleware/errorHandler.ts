import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
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

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    errors.validation(res, err.issues);
    return;
  }

  // Handle custom application errors
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  // Handle Prisma errors
  if (isPrismaError(err)) {
    if (err.code === 'P2002') {
      errors.conflict(res, `Duplicate entry for ${err.meta?.target?.join(', ') || 'field'}`);
      return;
    }
    if (err.code === 'P2025') {
      errors.notFound(res);
      return;
    }
  }

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
