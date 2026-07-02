import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ruleRepository } from '../repositories/rule.repository';
import { ruleService } from '../services/rule.service';
import { BadRequestError, NotFoundError } from '../../../core/errors/http.error';

const createRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  limitBy: z.enum(['USER_ID', 'API_KEY', 'IP_ADDRESS', 'ENDPOINT', 'PLAN']),
  value: z.string().min(1, 'Value pattern is required'),
  algorithm: z.enum(['TOKEN_BUCKET', 'FIXED_WINDOW', 'SLIDING_WINDOW_COUNTER', 'SLIDING_WINDOW_LOG', 'LEAKY_BUCKET']),
  limitValue: z.number().int().positive('Limit value must be a positive integer'),
  windowSize: z.number().int().positive('Window size must be a positive integer'),
  bucketCapacity: z.number().int().positive().optional(),
  refillRate: z.number().positive().optional(),
  active: z.boolean().optional(),
});

const updateRuleSchema = createRuleSchema.partial();

export class RuleController {
  public async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rules = await ruleRepository.findAll();
      res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const rule = await ruleRepository.findById(id);
      if (!rule) {
        throw new NotFoundError('Rate limit rule not found.');
      }
      res.status(200).json({
        success: true,
        data: rule,
      });
    } catch (err) {
      next(err);
    }
  }

  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.format());
      }

      const rule = await ruleRepository.create(parsed.data as any);
      
      // Update local cache & broadcast invalidation to other instances
      await ruleService.reloadRules();
      await ruleService.publishRuleUpdate('CREATE', rule.id);

      res.status(201).json({
        success: true,
        message: 'Rate limit rule created successfully',
        data: rule,
      });
    } catch (err) {
      next(err);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.format());
      }

      // Check if rule exists
      const existing = await ruleRepository.findById(id);
      if (!existing) {
        throw new NotFoundError('Rate limit rule not found.');
      }

      const rule = await ruleRepository.update(id, parsed.data as any);
      
      // Sync caches
      await ruleService.reloadRules();
      await ruleService.publishRuleUpdate('UPDATE', rule.id);

      res.status(200).json({
        success: true,
        message: 'Rate limit rule updated successfully',
        data: rule,
      });
    } catch (err) {
      next(err);
    }
  }

  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      const existing = await ruleRepository.findById(id);
      if (!existing) {
        throw new NotFoundError('Rate limit rule not found.');
      }

      await ruleRepository.delete(id);
      
      // Sync caches
      await ruleService.reloadRules();
      await ruleService.publishRuleUpdate('DELETE', id);

      res.status(200).json({
        success: true,
        message: 'Rate limit rule deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  public async toggleActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      const existing = await ruleRepository.findById(id);
      if (!existing) {
        throw new NotFoundError('Rate limit rule not found.');
      }

      const rule = await ruleRepository.update(id, { active: !existing.active });
      
      // Sync caches
      await ruleService.reloadRules();
      await ruleService.publishRuleUpdate('TOGGLE', id);

      res.status(200).json({
        success: true,
        message: `Rate limit rule ${rule.active ? 'enabled' : 'disabled'} successfully`,
        data: rule,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const ruleController = new RuleController();
