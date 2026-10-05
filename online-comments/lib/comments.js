import { config } from './config.js';
import {
  applyCors,
} from './cors.js';

export const MAX_REPLY_COUNT = 10;

export function validTerm(term) {
  return (
    term.startsWith('portfolio:') &&
    term.length <= 200
  );
}

export function validAnonymousId(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9-]{20,100}$/.test(value)
  );
}

export function publicComment(item, ownerId) {
  return {
    id: item.id,
    term: item.term,
    name: item.name,
    comment: item.comment,
    createdAt: item.createdAt,
    updatedAt:
      item.updatedAt || null,
    parentId: item.parentId || null,
    deleted: Boolean(item.deleted),
    canEdit:
      Boolean(ownerId) &&
      item.ownerId === ownerId &&
      !item.deleted,
  };
}

export function countUserReplies(
  comments,
  ownerId
) {
  return comments.filter(
    (item) =>
      item.parentId &&
      item.ownerId === ownerId
  ).length;
}

export function corsHeaders(origin) {
  const headers = {};
  const fakeResponse = {
    setHeader(key, value) {
      headers[key] = value;
    },
  };

  applyCors(
    fakeResponse,
    {
      headers: {
        origin,
      },
    }
  );

  return headers;
}

export function json(
  data,
  status = 200,
  origin = ''
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type':
          'application/json; charset=utf-8',
      },
    }
  );
}

export function allowedClientOrigin() {
  return config.clientOrigin;
}
