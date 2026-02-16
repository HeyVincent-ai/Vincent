import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../../utils/httpError.js';

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', details: error.flatten() });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message, details: error.details });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
};
