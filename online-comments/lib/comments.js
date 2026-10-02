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
    parentId:
      item.parentId || null,
    deleted:
      Boolean(item.deleted),
    canEdit:
      Boolean(ownerId) &&
      item.ownerId === ownerId &&
      !item.deleted,
  };
}

export function countSessionReplies(
  comments,
  ownerId,
  sessionId
) {
  return comments.filter(
    (item) =>
      item.parentId &&
      item.ownerId === ownerId &&
      item.authorSessionId === sessionId
  ).length;
}

export function corsHeaders(origin) {
  const allowed = [
    'https://zulthedev.github.io',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
  ];

  const selected =
    allowed.includes(origin)
      ? origin
      : allowed[0];

  return {
    'Access-Control-Allow-Origin':
      selected,
    'Access-Control-Allow-Methods':
      'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type',
    'Access-Control-Max-Age':
      '86400',
    Vary: 'Origin',
  };
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
