import { Worker, Job } from 'bullmq';
import { prisma } from '../../../infra/database/prisma';
import { logger } from '../../../infra/logger/logger';
import { ANALYTICS_QUEUE_NAME } from '../../../infra/queue/queue';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

export interface AnalyticsLogJobData {
  ruleId?: string;
  identifier: string;
  ipAddress: string;
  endpoint: string;
  allowed: boolean;
  timestamp: string; // ISO string
}

export class AnalyticsWorker {
  private worker!: Worker;

  public start() {
    const connection = {
      host: REDIS_HOST,
      port: REDIS_PORT,
    };

    this.worker = new Worker(
      ANALYTICS_QUEUE_NAME,
      async (job: Job<AnalyticsLogJobData>) => {
        const { ruleId, identifier, ipAddress, endpoint, allowed, timestamp } = job.data;

        logger.debug(`Processing analytics job ${job.id} for identifier ${identifier}`);

        try {
          await prisma.rateLimitLog.create({
            data: {
              ruleId,
              identifier,
              ipAddress,
              endpoint,
              allowed,
              timestamp: new Date(timestamp),
            },
          });
        } catch (dbErr) {
          logger.error(`Database write failed for job ${job.id}:`, dbErr);
          throw dbErr; // Let BullMQ handle retries
        }
      },
      {
        connection,
        concurrency: 5, // Concurrent job processors
      }
    );

    this.worker.on('completed', (job) => {
      logger.debug(`Background job ${job.id} completed successfully.`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Background job ${job?.id} failed:`, err);
    });

    logger.info('BullMQ Analytics worker started.');
  }

  public async close() {
    if (this.worker) {
      await this.worker.close();
      logger.info('BullMQ Analytics worker stopped.');
    }
  }
}

export const analyticsWorker = new AnalyticsWorker();
