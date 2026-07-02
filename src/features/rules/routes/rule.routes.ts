import { Router } from 'express';
import { Role } from '@prisma/client';
import { ruleController } from '../controllers/rule.controller';
import { authenticate, requireRole } from '../../auth/middlewares/auth.middleware';
import { prisma } from '../../../infra/database/prisma';

const router = Router();

// Apply auth and admin RBAC checks on all routes in this router
router.use(authenticate, requireRole([Role.ADMIN]));

// Execution Logs retrieval and management for Dashboard
router.get('/logs/history', async (req, res, next) => {
  try {
    const logs = await prisma.rateLimitLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

router.delete('/logs/history', async (req, res, next) => {
  try {
    await prisma.rateLimitLog.deleteMany({});
    res.status(200).json({ success: true, message: 'All logs cleared successfully.' });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/admin/rules:
 *   get:
 *     summary: Retrieve all rate limiting rules
 *     tags: [Admin Rules]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of rules returned
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin role required)
 */
router.get('/', ruleController.getAll);

/**
 * @openapi
 * /api/v1/admin/rules/{id}:
 *   get:
 *     summary: Retrieve a specific rule by ID
 *     tags: [Admin Rules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rule returned
 *       404:
 *         description: Rule not found
 */
router.get('/:id', ruleController.getById);

/**
 * @openapi
 * /api/v1/admin/rules:
 *   post:
 *     summary: Create a new rate limiting rule
 *     tags: [Admin Rules]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, limitBy, value, algorithm, limitValue, windowSize]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Free Plan Global limit
 *               limitBy:
 *                 type: string
 *                 enum: [USER_ID, API_KEY, IP_ADDRESS, ENDPOINT, PLAN]
 *                 example: PLAN
 *               value:
 *                 type: string
 *                 example: FREE
 *               algorithm:
 *                 type: string
 *                 enum: [TOKEN_BUCKET, FIXED_WINDOW, SLIDING_WINDOW_COUNTER, SLIDING_WINDOW_LOG, LEAKY_BUCKET]
 *                 example: TOKEN_BUCKET
 *               limitValue:
 *                 type: integer
 *                 example: 10
 *               windowSize:
 *                 type: integer
 *                 example: 60
 *               bucketCapacity:
 *                 type: integer
 *                 example: 10
 *               refillRate:
 *                 type: number
 *                 example: 0.166
 *     responses:
 *       201:
 *         description: Rule created successfully
 */
router.post('/', ruleController.create);

/**
 * @openapi
 * /api/v1/admin/rules/{id}:
 *   put:
 *     summary: Update an existing rule
 *     tags: [Admin Rules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               limitValue:
 *                 type: integer
 *               windowSize:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Rule updated successfully
 */
router.put('/:id', ruleController.update);

/**
 * @openapi
 * /api/v1/admin/rules/{id}:
 *   delete:
 *     summary: Delete a rule
 *     tags: [Admin Rules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rule deleted successfully
 */
router.delete('/:id', ruleController.delete);

/**
 * @openapi
 * /api/v1/admin/rules/{id}/toggle:
 *   patch:
 *     summary: Toggle rule active/inactive status
 *     tags: [Admin Rules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rule toggled successfully
 */
router.patch('/:id/toggle', ruleController.toggleActive);

export const adminRouter = router;
