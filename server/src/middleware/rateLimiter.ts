import rateLimit from 'express-rate-limit';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedis } from '../config/redis';

/**
 * Creates a Redis-backed store for rate limiting.
 * Falls back to in-memory store if Redis is unavailable.
 */
function createStore(prefix: string) {
  try {
    return new RedisStore({
      sendCommand: (...args: string[]) => {
        const redis = getRedis();
        return redis.call(args[0], ...args.slice(1)) as any;
      },
      prefix: `ratelimit:${prefix}:`,
    });
  } catch {
    console.warn(`Failed to create Redis store for rate limiter: ${prefix}. Falling back to memory store.`);
    return undefined;
  }
}

const defaultOptions = {
  standardHeaders: true,
  legacyHeaders: false,
} as const;

export const globalLimiter: RateLimitRequestHandler = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 1000,
  max: 60,
  store: createStore('global'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
    },
  },
});

export const registerLimiter: RateLimitRequestHandler = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 60 * 1000,
  max: 3,
  store: createStore('register'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many registration attempts. Please try again later.',
      statusCode: 429,
    },
  },
});

export const loginLimiter: RateLimitRequestHandler = rateLimit({
  ...defaultOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: createStore('login'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.',
      statusCode: 429,
    },
  },
});

export const forgotPasswordLimiter: RateLimitRequestHandler = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 60 * 1000,
  max: 3,
  store: createStore('forgot-password'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many password reset requests. Please try again later.',
      statusCode: 429,
    },
  },
});

export const refreshLimiter: RateLimitRequestHandler = rateLimit({
  ...defaultOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: createStore('refresh'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many refresh requests. Please try again later.',
      statusCode: 429,
    },
  },
});

export const changePasswordLimiter: RateLimitRequestHandler = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 60 * 1000,
  max: 3,
  store: createStore('change-password'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many password change attempts. Please try again later.',
      statusCode: 429,
    },
  },
});

export const verifyEmailLimiter: RateLimitRequestHandler = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
  store: createStore('verify-email'),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many verification attempts. Please try again later.',
      statusCode: 429,
    },
  },
});
