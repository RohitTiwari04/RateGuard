import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp-up to 20 users
    { duration: '20s', target: 50 }, // Spike to 50 users
    { duration: '10s', target: 0 },  // Ramp-down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'], // 95% of requests must complete within 100ms
    http_req_failed: ['rate<0.8'],    // We expect some requests to fail with 429 under load
  },
};

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'rateguard_free_api_key_sample';

export default function () {
  const params = {
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
  };

  const res = http.get(`${API_BASE_URL}/api/v1/test/free`, params);

  // Assert that responses are either HTTP 200 (Allowed) or HTTP 429 (Rate Limited)
  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'has rate limit headers': (r) => r.headers['X-Ratelimit-Limit'] !== undefined,
  });

  // Short sleep to simulate real user click pacing (100ms - 300ms)
  sleep(Math.random() * 0.2 + 0.1);
}
