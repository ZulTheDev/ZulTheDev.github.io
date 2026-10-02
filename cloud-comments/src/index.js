const ALLOWED_ORIGINS = new Set([
  'https://zulthedev.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]);

const COMMENT_HASH = 'portfolio:comments:data';
const MAX_REPLY_COUNT = 10;

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin);

  return {
    'Access-Control-Allow-Origin': allowed
      ? origin
      : 'https://zulthedev.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status = 200, origin = '') {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  );
}

function validTerm(term) {
  return (
    term.startsWith('portfolio:') &&
    term.length <= 200
  );
}

function validAnonymousId(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9-]{20,100}$/.test(value)
  );
}

function commentIndex(term) {
  return `portfolio:comments:index:${term}`;
}

async function redisCommand(env, command) {
  if (
    !env.UPSTASH_REDIS_REST_URL ||
    !env.UPSTASH_REDIS_REST_TOKEN
  ) {
    throw new Error('redis_not_configured');
  }

  const response = await fetch(
    env.UPSTASH_REDIS_REST_URL,
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    }
  );

  if (!response.ok) {
    throw new Error(
      `redis_http_${response.status}`
    );
  }

  const data = await response.json();

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.result;
}

async function redisPipeline(env, commands) {
  if (
    !env.UPSTASH_REDIS_REST_URL ||
    !env.UPSTASH_REDIS_REST_TOKEN
  ) {
    throw new Error('redis_not_configured');
  }

  const response = await fetch(
    `${env.UPSTASH_REDIS_REST_URL}/pipeline`,
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    }
  );

  if (!response.ok) {
    throw new Error(
      `redis_pipeline_http_${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('redis_pipeline_invalid');
  }

  return data;
}

function publicComment(item, ownerId) {
  return {
    id: item.id,
    term: item.term,
    name: item.name,
    comment: item.comment,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || null,
    parentId: item.parentId || null,
    deleted: Boolean(item.deleted),
    canEdit:
      Boolean(ownerId) &&
      item.ownerId === ownerId &&
      !item.deleted,
  };
}

async function readTermComments(env, term, ownerId) {
  const ids = await redisCommand(
    env,
    [
      'ZRANGE',
      commentIndex(term),
      '0',
      '-1',
      'REV',
    ]
  );

  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const pipeline = await redisPipeline(
    env,
    ids.map((id) => [
      'HGET',
      COMMENT_HASH,
      id,
    ])
  );

  return pipeline
    .map((entry) =>
      typeof entry?.result === 'string'
        ? JSON.parse(entry.result)
        : null
    )
    .filter(Boolean)
    .map((item) =>
      publicComment(item, ownerId)
    );
}

async function findParent(env, term, parentId) {
  const value = await redisCommand(
    env,
    [
      'HGET',
      COMMENT_HASH,
      parentId,
    ]
  );

  if (!value) {
    return null;
  }

  const parent = JSON.parse(value);

  return parent.term === term
    ? parent
    : null;
}

function countSessionReplies(
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

async function saveComment(env, item) {
  await redisPipeline(env, [
    [
      'HSET',
      COMMENT_HASH,
      item.id,
      JSON.stringify(item),
    ],
    [
      'ZADD',
      commentIndex(item.term),
      Date.parse(item.createdAt) || Date.now(),
      item.id,
    ],
  ]);
}

async function handle(request, env) {
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (
    pathname === '/api/health' &&
    request.method === 'GET'
  ) {
    return json(
      {
        ok: true,
        service: 'portfolio-comments',
        redisConfigured: Boolean(
          env.UPSTASH_REDIS_REST_URL &&
          env.UPSTASH_REDIS_REST_TOKEN
        ),
        chatbot: false,
        storesOnlyComments: true,
      },
      200,
      origin
    );
  }

  if (
    pathname !== '/api/comments' &&
    !pathname.startsWith('/api/comments/')
  ) {
    return json(
      { error: 'not_found' },
      404,
      origin
    );
  }

  try {
    if (
      pathname === '/api/comments' &&
      request.method === 'GET'
    ) {
      const term = String(
        url.searchParams.get('term') || ''
      ).trim();

      const ownerId = String(
        url.searchParams.get('deviceId') || ''
      ).trim();

      const sessionId = String(
        url.searchParams.get('sessionId') || ''
      ).trim();

      if (!term || !validTerm(term)) {
        return json(
          { error: 'invalid_term' },
          400,
          origin
        );
      }

      const comments =
        await readTermComments(
          env,
          term,
          ownerId
        );

      return json(
        {
          comments,
          replyCount:
            validAnonymousId(ownerId) &&
            validAnonymousId(sessionId)
              ? countSessionReplies(
                  comments.map((item) => ({
                    ...item,
                    ownerId:
                      item.canEdit
                        ? ownerId
                        : null,
                  })),
                  ownerId,
                  sessionId
                )
              : 0,
        },
        200,
        origin
      );
    }

    if (
      pathname === '/api/comments' &&
      request.method === 'POST'
    ) {
      const body =
        await request.json().catch(
          () => ({})
        );

      const term = String(
        body?.term || ''
      ).trim();

      const name = String(
        body?.name || ''
      ).trim();

      const comment = String(
        body?.comment || ''
      ).trim();

      const parentId = body?.parentId
        ? String(body.parentId).trim()
        : null;

      const ownerId = String(
        body?.deviceId || ''
      ).trim();

      const sessionId = String(
        body?.sessionId || ''
      ).trim();

      if (!term || !validTerm(term)) {
        return json(
          { error: 'invalid_term' },
          400,
          origin
        );
      }

      if (
        !validAnonymousId(ownerId) ||
        !validAnonymousId(sessionId)
      ) {
        return json(
          { error: 'invalid_anonymous_id' },
          400,
          origin
        );
      }

      if (!name) {
        return json(
          { error: 'name_required' },
          400,
          origin
        );
      }

      if (!comment) {
        return json(
          { error: 'comment_required' },
          400,
          origin
        );
      }

      if (name.length > 50) {
        return json(
          { error: 'name_too_long' },
          400,
          origin
        );
      }

      if (comment.length > 2000) {
        return json(
          { error: 'comment_too_long' },
          400,
          origin
        );
      }

      if (
        parentId &&
        !/^[a-zA-Z0-9-]{10,100}$/.test(
          parentId
        )
      ) {
        return json(
          { error: 'invalid_parent' },
          400,
          origin
        );
      }

      const existing =
        await readTermComments(
          env,
          term,
          ownerId
        );

      if (parentId) {
        const parent =
          await findParent(
            env,
            term,
            parentId
          );

        if (!parent) {
          return json(
            { error: 'parent_not_found' },
            404,
            origin
          );
        }

        if (parent.deleted) {
          return json(
            { error: 'parent_deleted' },
            400,
            origin
          );
        }

        const replies =
          countSessionReplies(
            existing.map((item) => ({
              ...item,
              ownerId:
                item.canEdit
                  ? ownerId
                  : null,
            })),
            ownerId,
            sessionId
          );

        if (replies >= MAX_REPLY_COUNT) {
          return json(
            {
              error:
                'reply_limit_reached',
              message:
                'Reply limit reached for this session (10).',
            },
            429,
            origin
          );
        }
      }

      const now =
        new Date().toISOString();

      const item = {
        id: crypto.randomUUID(),
        term,
        name,
        comment,
        createdAt: now,
        updatedAt: null,
        parentId,
        deleted: false,
        ownerId,
        authorSessionId: sessionId,
      };

      await saveComment(
        env,
        item
      );

      return json(
        {
          ok: true,
          comment:
            publicComment(
              item,
              ownerId
            ),
        },
        201,
        origin
      );
    }

    const id =
      decodeURIComponent(
        pathname.slice(
          '/api/comments/'.length
        )
      ).trim();

    if (
      !id ||
      !/^[a-zA-Z0-9-]{10,100}$/.test(id)
    ) {
      return json(
        { error: 'invalid_comment_id' },
        400,
        origin
      );
    }

    const body =
      await request.json().catch(
        () => ({})
      );

    const ownerId = String(
      body?.deviceId || ''
    ).trim();

    if (!validAnonymousId(ownerId)) {
      return json(
        { error: 'invalid_anonymous_id' },
        400,
        origin
      );
    }

    const raw =
      await redisCommand(
        env,
        [
          'HGET',
          COMMENT_HASH,
          id,
        ]
      );

    if (!raw) {
      return json(
        { error: 'comment_not_found' },
        404,
        origin
      );
    }

    const item = JSON.parse(raw);

    if (item.ownerId !== ownerId) {
      return json(
        { error: 'comment_not_owned' },
        403,
        origin
      );
    }

    if (request.method === 'PUT') {
      const comment = String(
        body?.comment || ''
      ).trim();

      if (!comment) {
        return json(
          { error: 'comment_required' },
          400,
          origin
        );
      }

      if (comment.length > 2000) {
        return json(
          { error: 'comment_too_long' },
          400,
          origin
        );
      }

      if (item.deleted) {
        return json(
          { error: 'comment_deleted' },
          400,
          origin
        );
      }

      item.comment = comment;
      item.updatedAt =
        new Date().toISOString();

      await saveComment(
        env,
        item
      );

      return json(
        {
          ok: true,
          comment:
            publicComment(
              item,
              ownerId
            ),
        },
        200,
        origin
      );
    }

    if (request.method === 'DELETE') {
      if (item.deleted) {
        return json(
          {
            error:
              'comment_already_deleted',
          },
          400,
          origin
        );
      }

      item.deleted = true;
      item.comment = '';
      item.updatedAt =
        new Date().toISOString();

      await saveComment(
        env,
        item
      );

      return json(
        {
          ok: true,
          deleted: true,
          id,
        },
        200,
        origin
      );
    }

    return json(
      { error: 'method_not_allowed' },
      405,
      origin
    );
  } catch (error) {
    console.error(
      'Cloud comment API error:',
      error?.message || error
    );

    return json(
      {
        error: 'cloud_comments_unavailable',
      },
      503,
      origin
    );
  }
}

export default {
  async fetch(request, env) {
    return handle(
      request,
      env
    );
  },
};
