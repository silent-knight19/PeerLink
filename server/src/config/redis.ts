import Redis from 'ioredis';
import { env } from './env';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      enableOfflineQueue: true,
      enableReadyCheck: true,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redis.on('connect', () => {
      console.log('Connected to Redis');
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  if (client.status === 'ready' || client.status === 'connecting') return;
}

export async function disconnectRedis(): Promise<void> {
  if (redis && redis.status !== 'end') {
    await redis.quit();
    redis = null;
  }
}
