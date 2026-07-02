import http from 'http';
import app from './app';
import { redisManager } from './infra/redis/redis';
import { ruleService } from './features/rules/services/rule.service';
import { analyticsWorker } from './features/analytics/workers/analytics.worker';
import { prisma } from './infra/database/prisma';
import { logger } from './infra/logger/logger';

const PORT = process.env.PORT || 3000;

let server: http.Server;

async function bootstrap() {
  try {
    logger.info('Starting RateGuard Rate Limiting Server...');

    // 1. Establish Database Connection (Prisma)
    await prisma.$connect();
    logger.info('Database connection established successfully.');

    // 2. Preload Redis Lua scripts
    await redisManager.loadScripts();

    // 3. Initialize cache & subscribe to Redis Pub/Sub invalidations
    await ruleService.init();

    // 4. Start BullMQ Background Analytics Workers
    analyticsWorker.start();

    // 5. Start HTTP Server listener
    server = app.listen(PORT, () => {
      logger.info(`RateGuard service successfully listening on port ${PORT}`);
      logger.info(`OpenAPI docs available at http://localhost:${PORT}/api-docs`);
    });

    // 6. Graceful Shutdown Handlers
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Set timeout to force process termination if shutdown hangs
      const forceExitTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timed out, force terminating.');
        process.exit(1);
      }, 10000);

      if (server) {
        server.close(() => {
          logger.info('HTTP server closed.');
        });
      }

      try {
        // Shutdown background workers
        await analyticsWorker.close();

        // Disconnect Redis
        await redisManager.disconnect();

        // Disconnect DB client
        await prisma.$disconnect();
        logger.info('Database connections disconnected.');

        clearTimeout(forceExitTimeout);
        logger.info('Graceful shutdown completed. Exiting cleanly.');
        process.exit(0);
      } catch (err) {
        logger.error('Error encountered during graceful shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('Fatal error occurred during server bootstrap:', err);
    process.exit(1);
  }
}

bootstrap();
