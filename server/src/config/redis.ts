import Redis from 'ioredis';
import { env } from './env';

let redis: Redis | null = null;
let redisAvailable = false;

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      enableOfflineQueue: true,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
      redisAvailable = false;
    });

    redis.on('connect', () => {
      console.log('Connected to Redis');
      redisAvailable = true;
    });

    redis.on('close', () => {
      redisAvailable = false;
    });
  }

  return redis;
}

export async function connectRedis(): Promise<void> {
  if (!env.REDIS_URL) {
    console.warn('REDIS_URL not set — Redis features disabled');
    return;
  }

  try {
    const client = getRedis();
    if (!client) return;
    if (client.status === 'ready' || client.status === 'connecting') return;
    await client.connect();
  } catch (error) {
    redisAvailable = false;
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis && redis.status !== 'end') {
    await redis.quit();
    redis = null;
    redisAvailable = false;
  }
}
