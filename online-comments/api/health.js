import {
  corsHeaders,
} from '../lib/comments.js';
import {
  redisConfigured,
} from '../lib/redis.js';

export default async function handler(
  request,
  response
) {
  for (const [key, value] of Object.entries(
    corsHeaders(
      request.headers.origin || ''
    )
  )) {
    response.setHeader(key, value);
  }

  return response.json({
    ok: true,
    service:
      'portfolio-comment-backup',
    redisConfigured:
      redisConfigured(),
    chatbot: false,
    storesCommentsOnly: true,
  });
}
