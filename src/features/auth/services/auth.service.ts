import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, ApiKey, Plan, Role } from '@prisma/client';
import { prisma } from '../../../infra/database/prisma';
import { redisClient } from '../../../infra/redis/redis';
import { UnauthorizedError, BadRequestError } from '../../../core/errors/http.error';
import { logger } from '../../../infra/logger/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_rateguard_prod_123';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const API_KEY_CACHE_TTL = 300; // 5 minutes cache TTL

export interface TokenPayload {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
}

export class AuthService {
  /**
   * Registers a new user.
   */
  public async register(email: string, passwordHashRaw: string, plan: Plan = Plan.FREE): Promise<Omit<User, 'passwordHash'>> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestError('Email already registered.');
    }

    const hashedPassword = await bcrypt.hash(passwordHashRaw, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        plan,
        role: Role.USER,
      },
    });

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Authenticates user email/password, returning JWT token.
   */
  public async login(email: string, passwordHashRaw: string): Promise<{ token: string; user: Omit<User, 'passwordHash'> }> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const isMatch = await bcrypt.compare(passwordHashRaw, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const payload: TokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });

    const { passwordHash, ...userWithoutPassword } = user;
    return { token, user: userWithoutPassword };
  }

  /**
   * Validates and returns an API Key's user details.
   * Utilizes Redis cache to bypass database lookup on every request.
   */
  public async validateApiKey(key: string): Promise<TokenPayload & { apiKeyId: string }> {
    const cacheKey = `cache:apikey:${key}`;

    try {
      // 1. Try Cache-aside lookup in Redis
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn(`Redis lookup failed during API Key validation: ${err}`);
    }

    // 2. Fetch from DB on cache-miss
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key, active: true },
      include: { user: true },
    });

    if (!apiKeyRecord || !apiKeyRecord.user) {
      throw new UnauthorizedError('Invalid or inactive API Key.');
    }

    const result = {
      apiKeyId: apiKeyRecord.id,
      id: apiKeyRecord.user.id,
      email: apiKeyRecord.user.email,
      role: apiKeyRecord.user.role,
      plan: apiKeyRecord.user.plan,
    };

    try {
      // 3. Write-back to Redis cache
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', API_KEY_CACHE_TTL);
    } catch (err) {
      logger.warn(`Failed to cache API Key details in Redis: ${err}`);
    }

    return result;
  }

  /**
   * Generates a new API Key for a user.
   */
  public async generateApiKey(userId: string, label: string): Promise<ApiKey> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestError('User not found.');
    }

    // Secure random string key generation
    const key = `rg_${crypto.randomBytes(24).toString('hex')}`;

    return prisma.apiKey.create({
      data: {
        key,
        label,
        userId,
      },
    });
  }
}

export const authService = new AuthService();
