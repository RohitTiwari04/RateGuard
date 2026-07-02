import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { BadRequestError } from '../../../core/errors/http.error';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  plan: z.enum(['FREE', 'PREMIUM', 'ENTERPRISE']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const apiKeySchema = z.object({
  label: z.string().min(1, 'Label is required'),
});

export class AuthController {
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.format());
      }

      const { email, password, plan } = parsed.data;
      const user = await authService.register(email, password, plan as any);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.format());
      }

      const { email, password } = parsed.data;
      const result = await authService.login(email, password);

      res.status(200).json({
        success: true,
        message: 'Logged in successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async generateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = apiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.format());
      }

      const user = (req as any).user;
      if (!user) {
        throw new BadRequestError('User context not found in request');
      }

      const apiKey = await authService.generateApiKey(user.id, parsed.data.label);

      res.status(201).json({
        success: true,
        message: 'API Key generated successfully',
        data: { apiKey: apiKey.key, label: apiKey.label, createdAt: apiKey.createdAt },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
