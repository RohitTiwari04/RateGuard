import { Request, Response, NextFunction } from 'express';
import { ruleService } from '../../rules/services/rule.service';
import { rateLimiterExecutor, RateLimitResult } from '../algorithms/strategy';
import { analyticsQueue } from '../../../infra/queue/queue';
import { rateLimitRequestsCounter, rateLimitCheckDuration } from '../../../infra/metrics/metrics';
import { TooManyRequestsError } from '../../../core/errors/http.error';
import { logger } from '../../../infra/logger/logger';
import { RateLimitRule } from '@prisma/client';

/**
 * Main Rate Limiting Middleware.
 * Intercepts requests, evaluates rules, executes Redis atomic operations, and sets headers.
 */
export async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const startTime = Date.now();
  const endpoint = req.originalUrl.split('?')[0];

  // 1. Resolve Identity Context
  const user = (req as any).user;
  const userId = user?.id;
  const apiKey = user?.apiKeyId;
  const ipAddress = (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
  const plan = user?.plan || 'FREE';

  // 2. Query Rules Engine (Cache-backed)
  const matchedRules = ruleService.getMatchingRules({
    endpoint,
    userId,
    apiKey,
    ipAddress,
    plan,
  });

  // If no rules matched, pass through
  if (matchedRules.length === 0) {
    return next();
  }

  let mostRestrictiveRule: RateLimitRule | null = null;
  let mostRestrictiveResult: RateLimitResult | null = null;

  try {
    // 3. Evaluate each matched rule (composite limits verification)
    for (const rule of matchedRules) {
      // Determine Redis rate limiting key based on Rule Limit Type
      let identifier = '';
      switch (rule.limitBy) {
        case 'USER_ID':
          identifier = `usr:${userId}`;
          break;
        case 'API_KEY':
          identifier = `key:${apiKey}`;
          break;
        case 'IP_ADDRESS':
          identifier = `ip:${ipAddress}`;
          break;
        case 'PLAN':
          // Plan-based rule applies per user/client
          identifier = `plan:${rule.value}:${userId || ipAddress}`;
          break;
        case 'ENDPOINT':
          // Endpoint rule applies per user/client on that specific route
          identifier = `ep:${rule.value}:${userId || ipAddress}`;
          break;
      }

      // 4. Run atomic strategy check in Redis
      const result = await rateLimiterExecutor.execute(rule.algorithm, identifier, rule);

      // Track metric counts
      rateLimitRequestsCounter.inc({
        endpoint,
        limit_by: rule.limitBy,
        allowed: String(result.allowed),
        algorithm: rule.algorithm,
      });

      // 5. Enqueue analytics log job to BullMQ queue asynchronously
      analyticsQueue.add('log', {
        ruleId: rule.id,
        identifier,
        ipAddress,
        endpoint,
        allowed: result.allowed,
        timestamp: new Date().toISOString(),
      }).catch((queueErr) => {
        logger.error('Failed to enqueue analytics log to BullMQ:', queueErr);
      });

      // Determine if this is the most restrictive rule (to set standard headers)
      if (
        !mostRestrictiveResult ||
        result.remaining < mostRestrictiveResult.remaining ||
        (result.remaining === mostRestrictiveResult.remaining && result.resetTime > mostRestrictiveResult.resetTime)
      ) {
        mostRestrictiveResult = result;
        mostRestrictiveRule = rule;
      }

      // If any of the composite rules are violated, reject request immediately
      if (!result.allowed) {
        res.setHeader('Retry-After', Math.max(0, result.resetTime - Math.floor(Date.now() / 1000)));
        res.setHeader('X-RateLimit-Limit', rule.limitValue);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', result.resetTime);
        
        throw new TooManyRequestsError(`Rate limit exceeded on rule: ${rule.name}. Try again later.`, {
          ruleName: rule.name,
          limit: rule.limitValue,
          resetTime: new Date(result.resetTime * 1000).toISOString(),
        });
      }
    }

    // 6. Set HTTP headers for successful request
    if (mostRestrictiveRule && mostRestrictiveResult) {
      res.setHeader('X-RateLimit-Limit', mostRestrictiveRule.limitValue);
      res.setHeader('X-RateLimit-Remaining', mostRestrictiveResult.remaining);
      res.setHeader('X-RateLimit-Reset', mostRestrictiveResult.resetTime);
    }

    // Observe execution duration
    if (mostRestrictiveRule) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      rateLimitCheckDuration.observe(
        { endpoint, algorithm: mostRestrictiveRule.algorithm },
        durationSeconds
      );
    }

    next();
  } catch (err) {
    if (mostRestrictiveRule) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      rateLimitCheckDuration.observe(
        { endpoint, algorithm: mostRestrictiveRule.algorithm },
        durationSeconds
      );
    }
    next(err);
  }
}
