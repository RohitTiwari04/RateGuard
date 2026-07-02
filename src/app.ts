import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { correlationContext } from './infra/logger/logger';
import { morganMiddleware } from './infra/logger/morgan';
import { register } from './infra/metrics/metrics';
import { errorHandler } from './core/middlewares/error.middleware';
import { authRouter } from './features/auth/routes/auth.routes';
import { adminRouter } from './features/rules/routes/rule.routes';
import { testRouter } from './features/rate-limiter/routes/test.routes';
import { swaggerSpec } from './config/swagger';
import { prisma } from './infra/database/prisma';
import { redisClient } from './infra/redis/redis';
import { NotFoundError } from './core/errors/http.error';

const app = express();

// 1. Basic Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// 2. Correlation ID & AsyncLocalStorage Context Tracing
app.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Correlation-ID', correlationId);
  correlationContext.run(correlationId, () => next());
});

// 3. Morgan HTTP Request Logger (integrated with Winston)
app.use(morganMiddleware);

// 4. OpenAPI / Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 5. Prometheus Metrics Scraper Endpoint
app.get('/metrics', async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    next(err);
  }
});

// 6. Health & Readiness Probes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    // Check DB
    await prisma.$queryRaw`SELECT 1`;
    // Check Redis
    await redisClient.ping();

    res.status(200).json({
      status: 'READY',
      services: {
        database: 'UP',
        redis: 'UP',
      },
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'DOWN',
      error: err.message || err,
    });
  }
});

// 7. Feature Router Registration
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin/rules', adminRouter);
app.use('/api/v1/test', testRouter);

// Serve static assets from public folder
app.use(express.static(path.join(process.cwd(), 'public')));

// 8. Catch-all for undefined routes
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found.`));
});

// 9. Global Custom Error Handler
app.use(errorHandler);

export default app;
