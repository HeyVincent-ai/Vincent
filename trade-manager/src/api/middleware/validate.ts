import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export const validateBody =
  <T extends z.ZodTypeAny>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
