import { randomUUID } from 'node:crypto';
import {
  countUserReplies,
  publicComment,
  MAX_REPLY_COUNT,
  validAnonymousId,
  validTerm,
} from '../lib/comments.js';
import {
  findComment,
  readCommentsForTerm,
  redisConfigured,
  saveComment,
} from '../lib/redis.js';
import {
  applyCors,
  handleOptions,
} from '../lib/cors.js';

export default async function handler(
  request,
  response
) {
  applyCors(response, request);

  if (handleOptions(request, response)) {
    return;
  }

  try {
    if (request.method === 'GET') {
      const term = String(
        request.query?.term || ''
      ).trim();
      const deviceId = String(
        request.query?.deviceId || ''
      ).trim();

      if (!term || !validTerm(term)) {
        return response.status(400).json({
          error: 'invalid_term',
        });
      }

      if (!redisConfigured()) {
        return response.status(503).json({
          error: 'redis_not_configured',
        });
      }

      const comments =
        await readCommentsForTerm(term);
      const replyCount =
        validAnonymousId(deviceId)
          ? countUserReplies(
              comments,
              deviceId
            )
          : 0;

      return response.status(200).json({
        comments:
          comments.map((item) =>
            publicComment(
              item,
              deviceId
            )
          ),
        replyCount,
      });
    }

    if (request.method === 'POST') {
      const term = String(
        request.body?.term || ''
      ).trim();
      const name = String(
        request.body?.name || ''
      ).trim();
      const comment = String(
        request.body?.comment || ''
      ).trim();
      const parentId =
        request.body?.parentId
          ? String(
              request.body.parentId
            ).trim()
          : null;
      const deviceId = String(
        request.body?.deviceId || ''
      ).trim();

      if (!term || !validTerm(term)) {
        return response.status(400).json({
          error: 'invalid_term',
        });
      }

      if (!validAnonymousId(deviceId)) {
        return response.status(400).json({
          error: 'invalid_anonymous_id',
        });
      }

      if (!name) {
        return response.status(400).json({
          error: 'name_required',
        });
      }

      if (name.length > 50) {
        return response.status(400).json({
          error: 'name_too_long',
        });
      }

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

      if (
        parentId &&
        !/^[a-zA-Z0-9-]{10,100}$/.test(
          parentId
        )
      ) {
        return response.status(400).json({
          error: 'invalid_parent',
        });
      }

      if (parentId) {
        const parent =
          await findComment(parentId);

        if (
          !parent ||
          parent.term !== term
        ) {
          return response.status(404).json({
            error: 'parent_not_found',
          });
        }

        if (parent.deleted) {
          return response.status(400).json({
            error: 'parent_deleted',
          });
        }

        const comments =
          await readCommentsForTerm(term);
        const replyCount =
          countUserReplies(
            comments,
            deviceId
          );

        if (
          replyCount >=
          MAX_REPLY_COUNT
        ) {
          return response.status(429).json({
            error: 'reply_limit_reached',
            message:
              'Reply limit reached for this anonymous browser (10).',
          });
        }
      }

      const now =
        new Date().toISOString();

      const item = {
        id: randomUUID(),
        term,
        name,
        comment,
        createdAt: now,
        updatedAt: null,
        parentId,
        deleted: false,
        ownerId: deviceId,
      };

      await saveComment(item);

      return response.status(201).json({
        ok: true,
        comment:
          publicComment(
            item,
            deviceId
          ),
      });
    }

    return response.status(405).json({
      error: 'method_not_allowed',
    });
  } catch (error) {
    console.error(
      'Online comment API error:',
      error?.message || error
    );

    return response.status(503).json({
      error: 'comments_unavailable',
    });
  }
}
