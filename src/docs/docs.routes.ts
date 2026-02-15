import { Router } from 'express';
import { createRequire } from 'module';
import helmet from 'helmet';
import { apiReference } from '@scalar/express-api-reference';

const require = createRequire(import.meta.url);
const spec = require('./openapi.json');

const router = Router();

// Relaxed CSP only for the docs UI — does not affect the rest of the app
router.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
        connectSrc: ["'self'"],
      },
    },
  })
);

router.get('/openapi.json', (_req, res) => res.json(spec));
router.use('/', apiReference({ content: spec }));

export default router;
