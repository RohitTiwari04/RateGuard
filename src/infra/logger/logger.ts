import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage to maintain Correlation IDs across request executions
export const correlationContext = new AsyncLocalStorage<string>();

const { combine, timestamp, json, colorize, printf } = winston.format;

// Custom console format for development
const devFormat = printf(({ level, message, timestamp, correlationId, ...meta }) => {
  const cid = correlationId ? ` [CorrelationID: ${correlationId}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${cid}${metaStr}`;
});

// Create Winston Logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format((info) => {
      // Automatically pull Correlation ID from storage context if available
      const storeCorrelationId = correlationContext.getStore();
      if (storeCorrelationId) {
        info.correlationId = storeCorrelationId;
      }
      return info;
    })(),
    process.env.NODE_ENV === 'production' ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
    }),
  ],
  exitOnError: false,
});
