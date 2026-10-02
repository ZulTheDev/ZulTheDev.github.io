import {
  corsHeaders,
} from '../../lib/comments.js';
import {
  findComment,
  redisConfigured,
  saveComment,
} from '../../lib/redis.js';

export default async function handler(
  request,
  response
) {
  const origin =
    request.headers.origin || '';

  for (const [key, value] of Object.entries(
    corsHeaders(origin)
  )) {
    response.setHeader(key, value);
  }

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  if (!redisConfigured()) {
    return response.status(503).json({
      error: 'redis_not_configured',
    });
  }

  const id = String(
    request.query?.id || ''
  ).trim();

  const deviceId = String(
    request.body?.deviceId || ''
  ).trim();

  if (!id || !deviceId) {
    return response.status(400).json({
      error: 'invalid_request',
    });
  }

  try {
    const item =
      await findComment(id);

    if (!item) {
      return response.status(404).json({
        error: 'comment_not_found',
      });
    }

    if (item.ownerId !== deviceId) {
      return response.status(403).json({
        error: 'comment_not_owned',
      });
    }

    if (request.method === 'PUT') {
      const comment = String(
        request.body?.comment || ''
      ).trim();

      if (!comment) {
        return response.status(400).json({
          error: 'comment_required',
        });
      }

      if (comment.length > 2000) {
        return response.status(400).json({
          error: 'comment_too_long',
        });
      }

      if (item.deleted) {
        return response.status(400).json({
          error: 'comment_deleted',
        });
      }

      item.comment = comment;
      item.updatedAt =
        new Date().toISOString();

      await saveComment(item);

      return response.json({
        ok: true,
        comment: {
          ...item,
          canEdit: true,
        },
      });
    }

    if (request.method === 'DELETE') {
      if (item.deleted) {
        return response.status(400).json({
          error:
            'comment_already_deleted',
        });
      }

      item.deleted = true;
      item.comment = '';
      item.updatedAt =
        new Date().toISOString();

      await saveComment(item);

      return response.json({
        ok: true,
        deleted: true,
        id,
      });
    }

    return response.status(405).json({
      error: 'method_not_allowed',
    });
  } catch (error) {
    console.error(
      'Comment ownership API error:',
      error?.message || error
    );

    return response.status(503).json({
      error: 'comments_unavailable',
    });
  }
}
