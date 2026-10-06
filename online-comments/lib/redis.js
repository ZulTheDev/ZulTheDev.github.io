import { createClient } from 'redis';
import { config } from './config.js';

let clientPromise = null;

export function redisConfigured() {
  return Boolean(
    config.redis.url
  );
}

export async function getRedis() {
  if (!redisConfigured()) {
    throw new Error(
      'redis_not_configured'
    );
  }

  if (!clientPromise) {
    const client = createClient({
      url: config.redis.url,
    });

    client.on('error', (error) => {
      console.error(
        'Redis client error:',
        error?.message || error
      );
    });

    clientPromise = client
      .connect()
      .then(() => client)
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }

  return clientPromise;
}

export async function readCommentsForTerm(
  term
) {
  const redis = await getRedis();

  const ids = await redis.zRange(
    `portfolio:comments:index:${term}`,
    0,
    -1,
    { REV: true }
  );

  if (!ids.length) {
    return [];
  }

  const values = await Promise.all(
    ids.map((id) =>
      redis.hGet(
        'portfolio:comments:data',
        id
      )
    )
  );

  return values
    .map((value) => {
      try {
        return value
          ? JSON.parse(value)
          : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function findComment(id) {
  const redis = await getRedis();
  const value = await redis.hGet(
    'portfolio:comments:data',
    id
  );

  if (!value) {
    return null;
  }

  return JSON.parse(value);
}

export async function saveComment(item) {
  const redis = await getRedis();

  await redis.hSet(
    'portfolio:comments:data',
    item.id,
    JSON.stringify(item)
  );

  await redis.zAdd(
    `portfolio:comments:index:${item.term}`,
    {
      score:
        Date.parse(item.createdAt) ||
        Date.now(),
      value: item.id,
    }
  );

  return item;
}
