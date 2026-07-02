import { RateLimitRule } from '@prisma/client';
import { prisma } from '../../../infra/database/prisma';

export class RuleRepository {
  public async findAllActive(): Promise<RateLimitRule[]> {
    return prisma.rateLimitRule.findMany({
      where: { active: true },
    });
  }

  public async findAll(): Promise<RateLimitRule[]> {
    return prisma.rateLimitRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  public async findById(id: string): Promise<RateLimitRule | null> {
    return prisma.rateLimitRule.findUnique({
      where: { id },
    });
  }

  public async create(data: {
    name: string;
    limitBy: any; // LimitType enum
    value: string;
    algorithm: any; // Algorithm enum
    limitValue: number;
    windowSize: number;
    bucketCapacity?: number;
    refillRate?: number;
    active?: boolean;
  }): Promise<RateLimitRule> {
    return prisma.rateLimitRule.create({
      data,
    });
  }

  public async update(
    id: string,
    data: Partial<{
      name: string;
      limitBy: any;
      value: string;
      algorithm: any;
      limitValue: number;
      windowSize: number;
      bucketCapacity: number | null;
      refillRate: number | null;
      active: boolean;
    }>
  ): Promise<RateLimitRule> {
    return prisma.rateLimitRule.update({
      where: { id },
      data,
    });
  }

  public async delete(id: string): Promise<RateLimitRule> {
    return prisma.rateLimitRule.delete({
      where: { id },
    });
  }
}

export const ruleRepository = new RuleRepository();
