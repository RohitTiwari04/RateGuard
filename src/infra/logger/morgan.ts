import morgan from 'morgan';
import { logger } from './logger';

// Direct Morgan log streams through Winston logger
const stream = {
  write: (message: string) => logger.info(message.trim()),
};

// Skip health and readiness checks from log bloating in production
const skip = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'production';
};

// Morgan request logging middleware
export const morganMiddleware = morgan(
  ':remote-addr :method :url :status :res[content-length] - :response-time ms',
  { stream, skip }
);
