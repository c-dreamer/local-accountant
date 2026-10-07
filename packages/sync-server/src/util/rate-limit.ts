import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { config } from '#load-config';

// Rate limit configuration from environment
const RATE_LIMIT_WINDOW_MS = config.get('rateLimit.windowMs');
const RATE_LIMIT_MAX = config.get('rateLimit.max');
const UPLOAD_RATE_LIMIT_MAX = config.get('rateLimit.uploadMax');

// Global rate limiter (applied to all routes except health checks)
export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  legacyHeaders: false,
  standardHeaders: true,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      status: 'error',
      reason: 'too-many-requests',
      details: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000} seconds.`,
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for health check endpoints
    return (
      req.path === '/health' ||
      req.path === '/health/live' ||
      req.path === '/health/ready'
    );
  },
});

// Upload-specific rate limiter (stricter limits for file uploads)
export const uploadRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: UPLOAD_RATE_LIMIT_MAX,
  legacyHeaders: false,
  standardHeaders: true,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      status: 'error',
      reason: 'too-many-requests',
      details: `Upload rate limit exceeded. Maximum ${UPLOAD_RATE_LIMIT_MAX} uploads per ${RATE_LIMIT_WINDOW_MS / 1000} seconds.`,
    });
  },
});

export function applyRateLimiters(app: Express): void {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'test'
  ) {
    app.use(globalRateLimiter);

    // Login already has a failure-only limiter in app-account. Restrict large
    // file uploads separately without throttling the frequent /sync requests.
    app.use('/sync/upload-user-file', uploadRateLimiter);
  }
}
