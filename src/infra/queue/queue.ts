import { Queue } from 'bullmq';
import { logger } from '../logger/logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

export const ANALYTICS_QUEUE_NAME = 'analytics-log-queue';

export const analyticsQueue = new Queue(ANALYTICS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true, // Don't bloat Redis with completed jobs
    removeOnFail: 1000,     // Retain failed logs for debug
  },
});

logger.info(`BullMQ Queue '${ANALYTICS_QUEUE_NAME}' initialized.`);
