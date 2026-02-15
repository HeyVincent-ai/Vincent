import { Router } from 'express';
import { apiReference } from '@scalar/express-api-reference';
import spec from './openapi.json' with { type: 'json' };

const router = Router();

router.get('/openapi.json', (_req, res) => res.json(spec));
router.use('/', apiReference({ content: spec }));

export default router;
