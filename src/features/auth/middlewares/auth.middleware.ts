import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { authService, TokenPayload } from '../services/auth.service';
import { UnauthorizedError, ForbiddenError } from '../../../core/errors/http.error';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_rateguard_prod_123';

/**
 * Combined authentication middleware supporting JWT Bearer token and API Keys.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    // 1. Try JWT Bearer Authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
        (req as any).user = decoded;
        return next();
      } catch (err) {
        throw new UnauthorizedError('Invalid or expired JWT token.');
      }
    }

    // 2. Try API Key Authentication
    if (apiKeyHeader) {
      const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
      const identity = await authService.validateApiKey(apiKey);
      (req as any).user = identity;
      return next();
    }

    // If neither is present, request is unauthorized
    throw new UnauthorizedError('Authentication credentials (JWT token or API Key) are required.');
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware factory for Role-Based Access Control (RBAC).
 */
export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    if (!allowedRoles.includes(user.role)) {
      return next(new ForbiddenError('You do not have permission to access this resource.'));
    }

    next();
  };
}
