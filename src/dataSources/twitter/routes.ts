import { Router } from 'express';
import { asyncHandler } from '../../api/middleware/errorHandler.js';
import { wrapProxy } from '../proxy.js';
import {
  searchTweets,
  searchTweetsSchema,
  getTweet,
  getTweetSchema,
  getUserByUsername,
  getUserSchema,
  getUserTweets,
  getUserTweetsSchema,
} from './handler.js';

const router = Router();

/**
 * GET /api/data-sources/twitter/search
 */
router.get(
  '/search',
  asyncHandler(
    wrapProxy('twitter', 'search', async (req) => {
      const params = searchTweetsSchema.parse(req.query);
      return searchTweets(params);
    })
  )
);

/**
 * GET /api/data-sources/twitter/tweets/:tweetId
 */
router.get(
  '/tweets/:tweetId',
  asyncHandler(
    wrapProxy('twitter', 'get-tweet', async (req) => {
      const { tweetId } = getTweetSchema.parse(req.params);
      return getTweet(tweetId);
    })
  )
);

/**
 * GET /api/data-sources/twitter/users/:username
 */
router.get(
  '/users/:username',
  asyncHandler(
    wrapProxy('twitter', 'get-user', async (req) => {
      const { username } = getUserSchema.parse(req.params);
      return getUserByUsername(username);
    })
  )
);

/**
 * GET /api/data-sources/twitter/users/:userId/tweets
 */
router.get(
  '/users/:userId/tweets',
  asyncHandler(
    wrapProxy('twitter', 'user-tweets', async (req) => {
      const params = getUserTweetsSchema.parse({ ...req.params, ...req.query });
      return getUserTweets(params.userId, params.max_results);
    })
  )
);

export default router;
