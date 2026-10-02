import { randomUUID } from 'node:crypto';
import {
  countSessionReplies,
  corsHeaders,
  json,
  MAX_REPLY_COUNT,
  publicComment,
  validAnonymousId,
  validTerm,
} from '../lib/comments.js';
import {
  findComment,
  readCommentsForTerm,
  redisConfigured,
  saveComment,
} from '../lib/redis.js';

export default async function handler(
  request,
  response
) {
  const origin =
    request.headers.origin || '';

  if (request.method === 'OPTIONS') {
    for (const [key, value] of Object.entries(
      corsHeaders(origin)
    )) {
      response.setHeader(key, value);
    }

    return response.status(204).end();
  }

  try {
    if (request.method === 'GET') {
      const term = String(
        request.query?.term || ''
      ).trim();

      const deviceId = String(
        request.query?.deviceId || ''
      ).trim();

      const sessionId = String(
        request.query?.sessionId || ''
      ).trim();

      if (!term || !validTerm(term)) {
        return response
          .status(400)
          .json({
            error: 'invalid_term',
          });
      }

      if (!redisConfigured()) {
        return response
          .status(503)
          .json({
            error: 'redis_not_configured',
          });
      }

      const comments =
        await readCommentsForTerm(term);

      const replyCount =
        validAnonymousId(deviceId) &&
        validAnonymousId(sessionId)
          ? countSessionReplies(
              comments,
              deviceId,
              sessionId
            )
          : 0;

      for (const [key, value] of Object.entries(
        corsHeaders(origin)
      )) {
        response.setHeader(key, value);
      }

      return response.json({
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

      const sessionId = String(
        request.body?.sessionId || ''
      ).trim();

      if (!term || !validTerm(term)) {
        return response
          .status(400)
          .json({
            error: 'invalid_term',
          });
      }

      if (
        !validAnonymousId(deviceId) ||
        !validAnonymousId(sessionId)
      ) {
        return response
          .status(400)
          .json({
            error:
              'invalid_anonymous_id',
          });
      }

      if (!name) {
        return response
          .status(400)
          .json({
            error: 'name_required',
          });
      }

      if (name.length > 50) {
        return response
          .status(400)
          .json({
            error: 'name_too_long',
          });
      }

      if (!comment) {
        return response
          .status(400)
          .json({
            error: 'comment_required',
          });
      }

      if (comment.length > 2000) {
        return response
          .status(400)
          .json({
            error: 'comment_too_long',
          });
      }

      if (
        parentId &&
        !/^[a-zA-Z0-9-]{10,100}$/.test(
          parentId
        )
      ) {
        return response
          .status(400)
          .json({
            error: 'invalid_parent',
          });
      }

      if (parentId) {
        const parent =
          await findComment(
            parentId
          );

        if (
          !parent ||
          parent.term !== term
        ) {
          return response
            .status(404)
            .json({
              error:
                'parent_not_found',
            });
        }

        if (parent.deleted) {
          return response
            .status(400)
            .json({
              error:
                'parent_deleted',
            });
        }

        const comments =
          await readCommentsForTerm(
            term
          );

        const replyCount =
          countSessionReplies(
            comments,
            deviceId,
            sessionId
          );

        if (
          replyCount >=
          MAX_REPLY_COUNT
        ) {
          return response
            .status(429)
            .json({
              error:
                'reply_limit_reached',
              message:
                'Reply limit reached for this session (10).',
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
        authorSessionId:
          sessionId,
      };

      await saveComment(item);

      for (const [key, value] of Object.entries(
        corsHeaders(origin)
      )) {
        response.setHeader(key, value);
      }

      return response
        .status(201)
        .json({
          ok: true,
          comment:
            publicComment(
              item,
              deviceId
            ),
        });
    }

    for (const [key, value] of Object.entries(
      corsHeaders(origin)
    )) {
      response.setHeader(key, value);
    }

    return response
      .status(405)
      .json({
        error:
          'method_not_allowed',
      });
  } catch (error) {
    console.error(
      'Online comment API error:',
      error?.message || error
    );

    for (const [key, value] of Object.entries(
      corsHeaders(origin)
    )) {
      response.setHeader(key, value);
    }

    return response
      .status(503)
      .json({
        error:
          'comments_unavailable',
      });
  }
}
