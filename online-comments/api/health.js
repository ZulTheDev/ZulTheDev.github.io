import {
  config,
  integrationStatus,
} from '../lib/config.js';
import { applyCors, handleOptions } from '../lib/cors.js';

export default function handler(
  request,
  response
) {
  applyCors(response, request);

  if (handleOptions(request, response)) {
    return;
  }

  return response.status(200).json({
    ok: true,
    service: 'portfolio-online-services',
    redisConfigured:
      integrationStatus.redisConfigured,
    chatbot:
      integrationStatus.chatbot,
    model:
      config.deepseek.model,
    driveKnowledge:
      integrationStatus.driveKnowledge,
    driveScope: 'single-folder-recursive',
    driveScopeLocked: true,
    commentStorage: 'redis',
    chatStorage: 'browser-session-only',
  });
}
