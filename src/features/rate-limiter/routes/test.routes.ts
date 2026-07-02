import { Router } from 'express';
import { authenticate } from '../../auth/middlewares/auth.middleware';
import { rateLimiterMiddleware } from '../middlewares/rate-limiter.middleware';

const router = Router();

// Test router: all endpoints require authentication and evaluate rate limits

/**
 * @openapi
 * /api/v1/test/free:
 *   get:
 *     summary: Verify Free plan rate limit (Token Bucket default)
 *     tags: [Test Limits]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Request allowed
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/free', authenticate, rateLimiterMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Success! You accessed the Free plan endpoint.',
    user: (req as any).user,
  });
});

/**
 * @openapi
 * /api/v1/test/premium:
 *   get:
 *     summary: Verify Premium plan rate limit
 *     tags: [Test Limits]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Request allowed
 */
router.get('/premium', authenticate, rateLimiterMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Success! You accessed the Premium plan endpoint.',
    user: (req as any).user,
  });
});

/**
 * @openapi
 * /api/v1/test/auth/login:
 *   get:
 *     summary: Verify login endpoint path limit (Fixed Window Counter)
 *     tags: [Test Limits]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Request allowed
 */
router.get('/auth/login', authenticate, rateLimiterMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Success! You accessed the login simulation path.',
  });
});

/**
 * @openapi
 * /api/v1/test/heavy:
 *   get:
 *     summary: Verify heavy operations path limit (Leaky Bucket)
 *     tags: [Test Limits]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Request allowed
 */
router.get('/heavy', authenticate, rateLimiterMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Success! You accessed the heavy database operation simulation path.',
  });
});

/**
 * @openapi
 * /api/v1/test/search:
 *   get:
 *     summary: Verify search path limit (Sliding Window Counter)
 *     tags: [Test Limits]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Request allowed
 */
router.get('/search', authenticate, rateLimiterMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Success! You accessed the search simulation path.',
  });
});

/**
 * @openapi
 * /api/v1/test/payment/checkout:
 *   get:
 *     summary: Verify checkout path limit (Sliding Window Log)
 *     tags: [Test Limits]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Request allowed
 */
router.get('/payment/checkout', authenticate, rateLimiterMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Success! You accessed the checkout payment path.',
  });
});

export const testRouter = router;
