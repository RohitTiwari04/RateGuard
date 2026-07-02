import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/infra/database/prisma';
import { redisManager, redisClient } from '../src/infra/redis/redis';
import { ruleService } from '../src/features/rules/services/rule.service';
import { analyticsQueue } from '../src/infra/queue/queue';
import { Algorithm, LimitType } from '@prisma/client';

// 1. Mock Database and Redis Infrastructure
jest.mock('../src/infra/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    apiKey: {
      findUnique: jest.fn(),
    },
    rateLimitRule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    rateLimitLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../src/infra/redis/redis', () => ({
  __esModule: true,
  redisManager: {
    runScript: jest.fn(),
    loadScripts: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    publish: jest.fn(),
  },
  redisSubClient: {
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  },
}));

jest.mock('../src/infra/queue/queue', () => ({
  __esModule: true,
  analyticsQueue: {
    add: jest.fn(),
  },
  ANALYTICS_QUEUE_NAME: 'mock-analytics-queue',
}));

describe('RateGuard API Rate Limiter Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Set explicit mock implementation for analyticsQueue.add inside beforeEach
    (analyticsQueue.add as jest.Mock).mockResolvedValue({ id: 'mock-job-id' });

    // Clear and mock rules cache
    const mockRule = {
      id: 'rule-free-test',
      name: 'Free Plan Rule Test',
      limitBy: LimitType.PLAN,
      value: 'FREE',
      algorithm: Algorithm.TOKEN_BUCKET,
      limitValue: 5,
      windowSize: 60,
      bucketCapacity: 5,
      refillRate: 0.0833,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (prisma.rateLimitRule.findMany as jest.Mock).mockResolvedValue([mockRule]);
    await ruleService.reloadRules();
  });

  describe('Authentication Enforcement', () => {
    it('should reject requests without auth credentials with 401', async () => {
      const res = await request(app).get('/api/v1/test/free');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Authentication credentials');
    });

    it('should allow requests with a valid API key', async () => {
      // Mock API key cache miss
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      // Mock database lookup
      const mockApiKeyRecord = {
        id: 'apikey-id-123',
        key: 'rg_valid_test_key_abc',
        label: 'Test Key',
        userId: 'user-id-123',
        user: {
          id: 'user-id-123',
          email: 'test@rateguard.io',
          role: 'USER',
          plan: 'FREE',
        },
      };
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKeyRecord);

      // Mock Redis Lua Script execution: Allow the request (1, remaining=4, resetTime=future)
      const nowSeconds = Math.floor(Date.now() / 1000);
      (redisManager.runScript as jest.Mock).mockResolvedValue([1, 4, nowSeconds + 60]);

      const res = await request(app)
        .get('/api/v1/test/free')
        .set('x-api-key', 'rg_valid_test_key_abc');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['x-ratelimit-limit']).toBe('5');
      expect(res.headers['x-ratelimit-remaining']).toBe('4');
    });
  });

  describe('Rate Limiter Algorithm Assertions', () => {
    const mockApiKeyRecord = {
      id: 'apikey-id-123',
      key: 'rg_valid_test_key_abc',
      label: 'Test Key',
      userId: 'user-id-123',
      user: {
        id: 'user-id-123',
        email: 'test@rateguard.io',
        role: 'USER',
        plan: 'FREE',
      },
    };

    beforeEach(() => {
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKeyRecord);
    });

    it('should block request and return 429 when rate limit is exceeded', async () => {
      // Mock Redis Lua Script: Deny the request (0, remaining=0, resetTime=future)
      const nowSeconds = Math.floor(Date.now() / 1000);
      (redisManager.runScript as jest.Mock).mockResolvedValue([0, 0, nowSeconds + 45]);

      const res = await request(app)
        .get('/api/v1/test/free')
        .set('x-api-key', 'rg_valid_test_key_abc');

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Rate limit exceeded');
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('Admin Operations Security Check', () => {
    it('should block rules access if user is not an admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/rules')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });
});
