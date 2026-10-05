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
      'portfolio-online-services',
    redisConfigured:
      redisConfigured(),
    chatbot:
      Boolean(
        process.env.DEEPSEEK_API_KEY
      ),
    model:
      process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    driveKnowledge:
      Boolean(
        process.env.GOOGLE_DRIVE_CHATBOT_FOLDER_ID
      ),
    commentStorage:
      'redis',
    chatStorage:
      'browser-session-only',
  });
}
