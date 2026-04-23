import { createClient } from 'redis';
import { logger } from '../utils/logger';

let client: any;

export async function initializeRedis() {
  try {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    client = createClient({
      url: `redis://${host}:${port}`,
    });

    await client.connect();
    logger.info('Redis connection established');
  } catch (error) {
    logger.error('Redis connection failed:', error);
    // Don't throw - Redis is optional for now
  }
}

export async function getRedisClient() {
  return client;
}

export async function setCache(key: string, value: any, ttl = 3600) {
  if (!client) return;
  try {
    await client.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    logger.error('Redis set error:', error);
  }
}

export async function getCache(key: string) {
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis get error:', error);
    return null;
  }
}
