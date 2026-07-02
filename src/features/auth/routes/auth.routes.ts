import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: dev@rateguard.io
 *               password:
 *                 type: string
 *                 example: devPassword123!
 *               plan:
 *                 type: string
 *                 enum: [FREE, PREMIUM, ENTERPRISE]
 *                 example: FREE
 *     responses:
 *       201:
 *         description: Registered successfully
 *       400:
 *         description: Validation failed or email exists
 */
router.post('/register', authController.register);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user and return JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: dev@rateguard.io
 *               password:
 *                 type: string
 *                 example: devPassword123!
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authController.login);

/**
 * @openapi
 * /api/v1/auth/keys:
 *   post:
 *     summary: Generate a new API Key for client requests
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label]
 *             properties:
 *               label:
 *                 type: string
 *                 example: My Application Key
 *     responses:
 *       201:
 *         description: API Key created
 *       401:
 *         description: Unauthorized
 */
router.post('/keys', authenticate, authController.generateApiKey);

export const authRouter = router;
