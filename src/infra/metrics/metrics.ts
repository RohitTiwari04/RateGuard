import client from 'prom-client';

// Create a Registry to register metrics
export const register = new client.Registry();

// Enable default metrics (CPU, Memory, event loop lag, etc.)
client.collectDefaultMetrics({ register });

// 1. Rate Limit Request Counter
export const rateLimitRequestsCounter = new client.Counter({
  name: 'rateguard_rate_limit_requests_total',
  help: 'Total number of rate limit requests processed',
  labelNames: ['endpoint', 'limit_by', 'allowed', 'algorithm'],
});

// 2. Latency Histogram for Rate Limit Checks
export const rateLimitCheckDuration = new client.Histogram({
  name: 'rateguard_rate_limit_check_duration_seconds',
  help: 'Latency of rate limiting evaluation in seconds',
  labelNames: ['endpoint', 'algorithm'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0], // millisecond-level resolution
});

// Register metrics
register.registerMetric(rateLimitRequestsCounter);
register.registerMetric(rateLimitCheckDuration);
