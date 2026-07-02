import { RateLimitRule, LimitType } from '@prisma/client';
import { ruleRepository } from '../repositories/rule.repository';
import { redisClient, redisSubClient } from '../../../infra/redis/redis';
import { logger } from '../../../infra/logger/logger';

export class RuleService {
  private activeRules: RateLimitRule[] = [];
  private static CHANNEL_NAME = 'channels:rules:update';

  constructor() {
    // Note: reloadRules should be called during server bootstrap
  }

  /**
   * Initializes cache and subscribes to Redis Pub/Sub for updates
   */
  public async init() {
    await this.reloadRules();
    await this.subscribeToRuleUpdates();
  }

  /**
   * Reloads rules from PostgreSQL into local memory cache
   */
  public async reloadRules() {
    try {
      logger.info('Reloading rate limit rules from database...');
      this.activeRules = await ruleRepository.findAllActive();
      logger.info(`Successfully cached ${this.activeRules.length} active rate limit rules.`);
    } catch (err) {
      logger.error('Error reloading rate limit rules:', err);
    }
  }

  /**
   * Subscribes this instance to Redis Pub/Sub channel to sync changes
   */
  private async subscribeToRuleUpdates() {
    try {
      await redisSubClient.subscribe(RuleService.CHANNEL_NAME);
      logger.info(`Subscribed to Redis channel: ${RuleService.CHANNEL_NAME}`);

      redisSubClient.on('message', async (channel, message) => {
        if (channel === RuleService.CHANNEL_NAME) {
          logger.info(`Received cache invalidation event on ${channel}: ${message}`);
          await this.reloadRules();
        }
      });
    } catch (err) {
      logger.error('Failed to subscribe to Redis Pub/Sub:', err);
    }
  }

  /**
   * Publishes a rule update notification to synchronize other nodes
   */
  public async publishRuleUpdate(action: string, ruleId?: string) {
    try {
      const payload = JSON.stringify({ action, ruleId, timestamp: Date.now() });
      await redisClient.publish(RuleService.CHANNEL_NAME, payload);
      logger.info(`Published rule update event to Redis: ${payload}`);
    } catch (err) {
      logger.error('Failed to publish rule update event:', err);
    }
  }

  /**
   * Matches request metadata against active cached rules.
   * Evaluates all matching rules to ensure complete security boundary enforcement.
   */
  public getMatchingRules(context: {
    endpoint: string;
    userId?: string;
    apiKey?: string;
    ipAddress: string;
    plan?: string;
  }): RateLimitRule[] {
    const matched: RateLimitRule[] = [];

    for (const rule of this.activeRules) {
      let isMatch = false;

      switch (rule.limitBy) {
        case LimitType.ENDPOINT:
          // Match direct endpoint paths
          isMatch = context.endpoint.toLowerCase() === rule.value.toLowerCase();
          break;
        case LimitType.USER_ID:
          isMatch = !!context.userId && context.userId === rule.value;
          break;
        case LimitType.API_KEY:
          isMatch = !!context.apiKey && context.apiKey === rule.value;
          break;
        case LimitType.IP_ADDRESS:
          isMatch = context.ipAddress === rule.value;
          break;
        case LimitType.PLAN:
          isMatch = !!context.plan && context.plan.toUpperCase() === rule.value.toUpperCase();
          break;
      }

      if (isMatch) {
        matched.push(rule);
      }
    }

    // Sort: most specific (ENDPOINT, USER, KEY, IP) first, then general (PLAN) last.
    // This allows middleware to report the most constraining limits in HTTP Headers.
    return matched.sort((a, b) => {
      const priority: Record<LimitType, number> = {
        [LimitType.ENDPOINT]: 1,
        [LimitType.USER_ID]: 2,
        [LimitType.API_KEY]: 3,
        [LimitType.IP_ADDRESS]: 4,
        [LimitType.PLAN]: 5,
      };
      return priority[a.limitBy] - priority[b.limitBy];
    });
  }
}

export const ruleService = new RuleService();
