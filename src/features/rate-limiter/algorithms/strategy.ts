import { RateLimitRule, Algorithm } from '@prisma/client';
import crypto from 'crypto';
import { redisManager } from '../../../infra/redis/redis';
import { logger } from '../../../infra/logger/logger';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
}

export interface RateLimiterStrategy {
  limit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult>;
}

// 1. Fixed Window Counter Strategy
export class FixedWindowStrategy implements RateLimiterStrategy {
  async limit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const key = `rl:${identifier}:${rule.id}`;
    const result = await redisManager.runScript('fixed-window', 1, [key], [rule.limitValue, rule.windowSize]);
    
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2],
    };
  }
}

// 2. Sliding Window Counter Strategy
export class SlidingWindowCounterStrategy implements RateLimiterStrategy {
  async limit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    // Cluster-friendly hashtag grouping
    const currentKey = `{rl:${identifier}:${rule.id}}:current`;
    const previousKey = `{rl:${identifier}:${rule.id}}:previous`;
    
    const result = await redisManager.runScript(
      'sliding-window-counter',
      2,
      [currentKey, previousKey],
      [rule.limitValue, rule.windowSize]
    );

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2],
    };
  }
}

// 3. Sliding Window Log Strategy
export class SlidingWindowLogStrategy implements RateLimiterStrategy {
  async limit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const key = `{rl:${identifier}:${rule.id}}`;
    const requestId = crypto.randomUUID(); // Unique identifier to prevent sorted set deduplication

    const result = await redisManager.runScript(
      'sliding-window-log',
      1,
      [key],
      [rule.limitValue, rule.windowSize, requestId]
    );

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2],
    };
  }
}

// 4. Token Bucket Strategy
export class TokenBucketStrategy implements RateLimiterStrategy {
  async limit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const key = `{rl:${identifier}:${rule.id}}`;
    
    // Fallbacks if database columns are unset
    const capacity = rule.bucketCapacity || rule.limitValue;
    const refillRate = rule.refillRate || (rule.limitValue / rule.windowSize);

    const result = await redisManager.runScript(
      'token-bucket',
      1,
      [key],
      [capacity, refillRate, 1] // Consume 1 token
    );

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2],
    };
  }
}

// 5. Leaky Bucket Strategy
export class LeakyBucketStrategy implements RateLimiterStrategy {
  async limit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const key = `{rl:${identifier}:${rule.id}}`;

    const capacity = rule.bucketCapacity || rule.limitValue;
    const leakRate = rule.refillRate || (rule.limitValue / rule.windowSize); // Leak rate is refillRate representation

    const result = await redisManager.runScript(
      'leaky-bucket',
      1,
      [key],
      [capacity, leakRate, 1] // Add 1 unit of load
    );

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2],
    };
  }
}

// Strategy Context / Registry Factory
export class RateLimiterExecutor {
  private strategies = new Map<Algorithm, RateLimiterStrategy>();

  constructor() {
    this.strategies.set(Algorithm.FIXED_WINDOW, new FixedWindowStrategy());
    this.strategies.set(Algorithm.SLIDING_WINDOW_COUNTER, new SlidingWindowCounterStrategy());
    this.strategies.set(Algorithm.SLIDING_WINDOW_LOG, new SlidingWindowLogStrategy());
    this.strategies.set(Algorithm.TOKEN_BUCKET, new TokenBucketStrategy());
    this.strategies.set(Algorithm.LEAKY_BUCKET, new LeakyBucketStrategy());
  }

  public async execute(
    algorithm: Algorithm,
    identifier: string,
    rule: RateLimitRule
  ): Promise<RateLimitResult> {
    const strategy = this.strategies.get(algorithm);
    if (!strategy) {
      logger.warn(`Strategy not found for algorithm: ${algorithm}. Falling back to default Token Bucket.`);
      const defaultStrategy = this.strategies.get(Algorithm.TOKEN_BUCKET)!;
      return defaultStrategy.limit(identifier, rule);
    }
    return strategy.limit(identifier, rule);
  }
}

export const rateLimiterExecutor = new RateLimiterExecutor();
