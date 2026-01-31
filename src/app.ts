import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './utils/env';
import { errorHandler } from './api/middleware/errorHandler';
import { requestLogger } from './api/middleware/requestLogger';
import { sendSuccess } from './utils/response';
import apiRouter from './api/routes';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : '*',
      credentials: true,
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use(requestLogger);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    sendSuccess(res, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // API info endpoint
  app.get('/api', (_req, res) => {
    sendSuccess(res, {
      message: 'SafeSkills API',
      version: '1.0.0',
      endpoints: {
        secrets: '/api/secrets',
        health: '/health',
      },
    });
  });

  // Mount API routes
  app.use('/api', apiRouter);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
