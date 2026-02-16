import { Router } from 'express';
import { asyncHandler } from '../../api/middleware/errorHandler.js';
import { wrapProxy } from '../proxy.js';
import { webSearch, webSearchSchema, newsSearch, newsSearchSchema } from './handler.js';

const router = Router();

/**
 * GET /api/data-sources/brave/web
 */
router.get(
  '/web',
  asyncHandler(
    wrapProxy('brave', 'web', async (req) => {
      const params = webSearchSchema.parse(req.query);
      return webSearch(params);
    })
  )
);

/**
 * GET /api/data-sources/brave/news
 */
router.get(
  '/news',
  asyncHandler(
    wrapProxy('brave', 'news', async (req) => {
      const params = newsSearchSchema.parse(req.query);
      return newsSearch(params);
    })
  )
);

export default router;
