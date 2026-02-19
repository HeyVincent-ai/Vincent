import express, { Express, Request } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { env } from './utils/env.js';
import { errorHandler } from './api/middleware/errorHandler.js';
import { requestLogger } from './api/middleware/requestLogger.js';
import { sendSuccess } from './utils/response.js';
import apiRouter from './api/routes/index.js';
import docsRouter from './docs/docs.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // Trust proxy (Railway, etc.) so req.ip returns the real client IP
  app.set('trust proxy', true);

  // Redirect www to non-www (bare domain)
  app.use((req, res, next) => {
    const host = req.get('host');
    if (host && host.startsWith('www.')) {
      const newHost = host.slice(4); // Remove 'www.'
      return res.redirect(301, `https://${newHost}${req.originalUrl}`);
    }
    next();
  });

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: [
            "'self'",
            'https://*.stytch.com',
            'https://*.walletconnect.org',
            'wss://*.walletconnect.org',
            'https://*.web3modal.org',
            'https://*.walletconnect.com',
            'https://*.merkle.io',
            'https://*.ingest.us.sentry.io',
            'https://*.zerodev.app',
            'https://*.zendesk.com',
            'https://*.zdassets.com',
            'wss://*.zendesk.com',
            'https://*.polymarket.com',
          ],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://static.zdassets.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          workerSrc: ["'self'", 'blob:'],
          frameSrc: ["'self'", 'https://*.vps.ovh.us'],
        },
      },
    })
  );

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
    validate: { trustProxy: false }, // Suppress ERR_ERL_PERMISSIVE_TRUST_PROXY — Railway is a trusted reverse proxy
  });
  app.use(limiter);

  // Body parsing
  // Capture raw body for Stripe webhook signature verification
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
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
      message: 'Vincent API',
      version: '1.0.0',
      endpoints: {
        secrets: '/api/secrets',
        health: '/health',
      },
    });
  });

  // Mount API routes
  app.use('/api', apiRouter);

  // Mount API docs (Scalar UI)
  app.use('/docs', docsRouter);

  // Serve frontend in production
  if (env.NODE_ENV === 'production') {
    const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
    app.use(express.static(frontendPath));

    // SPA catch-all: serve index.html for client-side routing
    // Skip paths with file extensions - let those 404 if not found by express.static
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.match(/\.\w+$/)) {
        // Path has a file extension - don't serve index.html, let it 404
        return next();
      }
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  // Sentry error handler must be before other error handlers
  Sentry.setupExpressErrorHandler(app);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
