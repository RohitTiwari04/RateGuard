import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors/http.error';
import { logger } from '../../infra/logger/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // 1. Handle custom HTTP errors
  if (err instanceof HttpError) {
    logger.warn(`HTTP ${err.statusCode} - ${err.message}`, {
      path: req.path,
      method: req.method,
      details: err.details,
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
        details: err.details || null,
      },
    });
    return;
  }

  // 2. Handle unexpected exceptions
  logger.error('Unhandled internal server error:', err, {
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal Server Error',
      statusCode: 500,
      details: process.env.NODE_ENV === 'development' ? err.stack : null,
    },
  });
}
