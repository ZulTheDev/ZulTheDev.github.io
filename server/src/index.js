import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import { createClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
});

const app = express();
const port = Number(process.env.PORT || 8787);

const content = path.resolve(
  __dirname,
  '..',
  '..',
  'client',
  'public',
  'content.json'
);

const commentsFile = path.join(
  __dirname,
  '..',
  'comments.json'
);

const visitorsFile = path.join(
  __dirname,
  '..',
  'visitors.json'
);

let commentsWriteQueue = Promise.resolve();
let visitorsWriteQueue = Promise.resolve();

/* =========================================================
   LOCAL ADMIN AUTH + RBAC
========================================================= */

const ADMIN_SESSION_TTL_MS =
  Number(process.env.ADMIN_SESSION_TTL_MINUTES || 480) * 60 * 1000;

const ADMIN_ROLES = new Set([
  'admin',
  'editor',
  'moderator',
  'diagnostics',
]);

const ROLE_PERMISSIONS = {
  admin: new Set(['content', 'comments', 'diagnostics']),
  editor: new Set(['content']),
  moderator: new Set(['comments']),
  diagnostics: new Set(['diagnostics']),
};

const adminSessions = new Map();

function parseAdminAccounts() {
  const raw = String(process.env.ADMIN_ACCOUNTS_JSON || '').trim();

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('ADMIN_ACCOUNTS_JSON must be an array');
    }

    return parsed
      .filter((item) =>
        item &&
        typeof item === 'object' &&
        typeof item.username === 'string' &&
        typeof item.passwordHash === 'string' &&
        ADMIN_ROLES.has(item.role)
      )
      .map((item) => ({
        username: item.username.trim(),
        passwordHash: item.passwordHash.trim(),
        role: item.role,
      }))
      .filter((item) => item.username);
  } catch (error) {
    console.error(
      'ADMIN_ACCOUNTS_JSON error:',
      error?.message || error
    );
    return [];
  }
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');

  if (
    parts.length !== 4 ||
    parts[0] !== 'scrypt'
  ) {
    return false;
  }

  const params = Object.fromEntries(
    parts[1]
      .split(',')
      .map((entry) => entry.split('='))
  );

  const cost = Number(params.N);
  const blockSize = Number(params.r);
  const parallelization = Number(params.p);
  const salt = parts[2];
  const expected = parts[3];

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    !salt ||
    !expected
  ) {
    return false;
  }

  try {
    const derived = scryptSync(
      String(password),
      Buffer.from(salt, 'base64'),
      32,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: 256 * 1024 * 1024,
      }
    );

    const expectedBuffer = Buffer.from(
      expected,
      'base64'
    );

    return (
      expectedBuffer.length === derived.length &&
      timingSafeEqual(
        expectedBuffer,
        derived
      )
    );
  } catch {
    return false;
  }
}

function parseCookies(request) {
  const header = request.get('Cookie') || '';

  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');

        if (index < 0) {
          return [part, ''];
        }

        return [
          part.slice(0, index),
          decodeURIComponent(
            part.slice(index + 1)
          ),
        ];
      })
  );
}

function setAdminCookie(response, token) {
  const secure =
    process.env.NODE_ENV === 'production'
      ? '; Secure'
      : '';

  response.setHeader(
    'Set-Cookie',
    'admin_session=' +
      encodeURIComponent(token) +
      '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
      Math.floor(
        ADMIN_SESSION_TTL_MS / 1000
      ) +
      secure
  );
}

function clearAdminCookie(response) {
  response.setHeader(
    'Set-Cookie',
    'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );
}

function getAdminSession(request) {
  const token =
    parseCookies(request).admin_session;

  if (!token) {
    return null;
  }

  const session =
    adminSessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }

  return {
    token,
    ...session,
  };
}

function requireAdminRole(permission) {
  return (
    request,
    response,
    next
  ) => {
    const session =
      getAdminSession(request);

    if (!session) {
      return response.status(401).json({
        error: 'admin_unauthorized',
      });
    }

    const allowed =
      ROLE_PERMISSIONS[session.role]?.has(
        permission
      );

    if (!allowed) {
      return response.status(403).json({
        error: 'admin_forbidden',
        role: session.role,
        permission,
      });
    }

    request.admin = session;
    return next();
  };
}

function cleanupAdminSessions() {
  const now = Date.now();

  for (
    const [token, session]
    of adminSessions
  ) {
    if (session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

setInterval(
  cleanupAdminSessions,
  15 * 60 * 1000
).unref();

function withCommentsLock(task) {
  const run =
    commentsWriteQueue.then(
      task,
      task
    );

  commentsWriteQueue =
    run.catch(() => {});

  return run;
}

function withVisitorsLock(task) {
  const run =
    visitorsWriteQueue.then(
      task,
      task
    );

  visitorsWriteQueue =
    run.catch(() => {});

  return run;
}

const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  [
    'https://zulthedev.github.io',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
  ].join(',')
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (
        /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
          origin
        )
      ) {
        return callback(null, true);
      }

      console.warn(`Blocked CORS origin: ${origin}`);

      return callback(
        new Error(`CORS origin not allowed: ${origin}`)
      );
    },
  })
);

app.use(
  express.json({
    limit: '4mb',
  })
);

/* =========================================================
   CONTENT
========================================================= */

async function readContent() {
  return JSON.parse(
    await fs.readFile(content, 'utf8')
  );
}

async function writeContent(data) {
  await fs.mkdir(
    path.dirname(content),
    { recursive: true }
  );

  const tempFile = `${content}.tmp`;

  await fs.writeFile(
    tempFile,
    `${JSON.stringify(data, null, 2)}\n`,
    'utf8'
  );

  await fs.rename(tempFile, content);
}

/* =========================================================
   COMMENTS + ANONYMOUS ACCESS
========================================================= */

const REDIS_URL =
  process.env.REDIS_URL || '';

const REDIS_COMMENT_HASH =
  'portfolio:comments:data';

let redisClientPromise = null;

function redisConfigured() {
  return Boolean(
    REDIS_URL
  );
}

async function getRedis() {
  if (!redisConfigured()) {
    throw new Error(
      'redis_not_configured'
    );
  }

  if (!redisClientPromise) {
    const client = createClient({
      url: REDIS_URL,
    });

    client.on(
      'error',
      (error) => {
        console.error(
          'Redis client error:',
          error?.message ||
            error
        );
      }
    );

    redisClientPromise =
      client
        .connect()
        .then(() => client)
        .catch((error) => {
          redisClientPromise = null;
          throw error;
        });
  }

  return redisClientPromise;
}

async function redisCommand(
  command
) {
  const redis =
    await getRedis();

  return redis.sendCommand(
    command
  );
}

async function redisPipeline(
  commands
) {
  const redis =
    await getRedis();

  const results = [];

  for (
    const command of commands
  ) {
    results.push(
      await redis.sendCommand(
        command
      )
    );
  }

  return results;
}

async function readComments() {
  try {
    const data = JSON.parse(
      await fs.readFile(
        commentsFile,
        'utf8'
      )
    );

    return data &&
      typeof data === 'object' &&
      !Array.isArray(data)
      ? data
      : {};
  } catch {
    return {};
  }
}

async function writeComments(data) {
  await fs.mkdir(
    path.dirname(commentsFile),
    { recursive: true }
  );

  const tempFile =
    `${commentsFile}.tmp`;

  await fs.writeFile(
    tempFile,
    `${JSON.stringify(
      data,
      null,
      2
    )}\n`,
    'utf8'
  );

  await fs.rename(
    tempFile,
    commentsFile
  );
}

async function readRedisTermComments(term) {
  const ids =
    await redisCommand([
      'ZRANGE',
      `portfolio:comments:index:${term}`,
      '0',
      '-1',
      'REV',
    ]);

  if (
    !Array.isArray(ids) ||
    ids.length === 0
  ) {
    return [];
  }

  const pipeline =
    await redisPipeline(
      ids.map((id) => [
        'HGET',
        REDIS_COMMENT_HASH,
        id,
      ])
    );

  return pipeline
    .map((item) =>
      typeof item?.result === 'string'
        ? JSON.parse(item.result)
        : null
    )
    .filter(Boolean);
}

async function saveRedisComment(
  item
) {
  await redisPipeline([
    [
      'HSET',
      REDIS_COMMENT_HASH,
      item.id,
      JSON.stringify(item),
    ],
    [
      'ZADD',
      `portfolio:comments:index:${item.term}`,
      Date.parse(item.createdAt) ||
        Date.now(),
      item.id,
    ],
  ]);
}

async function migrateTermToRedis(
  term,
  localComments
) {
  if (
    !redisConfigured() ||
    !Array.isArray(localComments) ||
    localComments.length === 0
  ) {
    return;
  }

  await redisPipeline(
    localComments.flatMap((item) => [
      [
        'HSET',
        REDIS_COMMENT_HASH,
        item.id,
        JSON.stringify(item),
      ],
      [
        'ZADD',
        `portfolio:comments:index:${term}`,
        Date.parse(item.createdAt) ||
          Date.now(),
        item.id,
      ],
    ])
  );
}

async function readVisitors() {
  try {
    const data = JSON.parse(
      await fs.readFile(
        visitorsFile,
        'utf8'
      )
    );

    return data &&
      typeof data === 'object' &&
      !Array.isArray(data)
      ? data
      : {};
  } catch {
    return {};
  }
}

async function writeVisitors(data) {
  await fs.mkdir(
    path.dirname(visitorsFile),
    { recursive: true }
  );

  const tempFile =
    `${visitorsFile}.tmp`;

  await fs.writeFile(
    tempFile,
    `${JSON.stringify(
      data,
      null,
      2
    )}\n`,
    'utf8'
  );

  await fs.rename(
    tempFile,
    visitorsFile
  );
}

function validCommentTerm(term) {
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

function flattenComments(
  allComments
) {
  return Object.values(allComments)
    .filter(Array.isArray)
    .flat();
}

function countSessionReplies(
  allComments,
  deviceId,
  sessionId
) {
  return flattenComments(allComments)
    .filter(
      (item) =>
        item.parentId &&
        item.ownerId === deviceId &&
        item.authorSessionId === sessionId
    )
    .length;
}

function countRawSessionReplies(
  comments,
  deviceId,
  sessionId
) {
  return comments.filter(
    (item) =>
      item.parentId &&
      item.ownerId === deviceId &&
      item.authorSessionId === sessionId
  ).length;
}

function publicComment(
  item,
  deviceId
) {
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
      Boolean(deviceId) &&
      item.ownerId === deviceId &&
      !item.deleted,
  };
}

app.post(
  '/api/access/track',
  async (request, response) => {
    const deviceId =
      String(
        request.body?.deviceId || ''
      ).trim();

    const sessionId =
      String(
        request.body?.sessionId || ''
      ).trim();

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

    try {
      await withVisitorsLock(
        async () => {
          const visitors =
            await readVisitors();

          const now =
            new Date().toISOString();

          const current =
            visitors[deviceId];

          visitors[deviceId] = {
            firstSeen:
              current?.firstSeen ||
              now,
            lastSeen: now,
            visits:
              Number(
                current?.visits || 0
              ) + 1,
            sessions:
              Number(
                current?.sessions || 0
              ) +
              (current?.lastSessionId ===
              sessionId
                ? 0
                : 1),
            lastSessionId:
              sessionId,
            comments:
              Number(
                current?.comments || 0
              ),
            replies:
              Number(
                current?.replies || 0
              ),
          };

          await writeVisitors(
            visitors
          );
        }
      );

      response.json({
        ok: true,
      });
    } catch (error) {
      console.error(
        'Access tracker error:',
        error?.message || error
      );

      response
        .status(500)
        .json({
          error:
            'access_tracker_failed',
        });
    }
  }
);

app.get(
  '/api/comments',
  async (request, response) => {
    const term =
      String(
        request.query.term || ''
      ).trim();

    const deviceId =
      String(
        request.query.deviceId || ''
      ).trim();

    const sessionId =
      String(
        request.query.sessionId || ''
      ).trim();

    if (
      !term ||
      !validCommentTerm(term)
    ) {
      return response
        .status(400)
        .json({
          error: 'invalid_term',
        });
    }

    try {
      if (redisConfigured()) {
        try {
          let rawComments =
            await readRedisTermComments(
              term
            );

          const local =
            await readComments();

          const localTerm =
            Array.isArray(local[term])
              ? local[term]
              : [];

          if (localTerm.length > 0) {
            const remoteIds =
              new Set(
                rawComments.map(
                  (item) => item.id
                )
              );

            const missingLocal =
              localTerm.filter(
                (item) =>
                  item?.id &&
                  !remoteIds.has(
                    item.id
                  )
              );

            if (
              missingLocal.length > 0
            ) {
              await migrateTermToRedis(
                term,
                missingLocal
              );

              rawComments = [
                ...rawComments,
                ...missingLocal,
              ].sort(
                (a, b) =>
                  (Date.parse(
                    b.createdAt
                  ) || 0) -
                  (Date.parse(
                    a.createdAt
                  ) || 0)
              );
            }
          }

          return response.json({
            comments:
              rawComments.map(
                (item) =>
                  publicComment(
                    item,
                    deviceId
                  )
              ),
            replyCount:
              validAnonymousId(
                deviceId
              ) &&
              validAnonymousId(
                sessionId
              )
                ? countRawSessionReplies(
                    rawComments,
                    deviceId,
                    sessionId
                  )
                : 0,
          });
        } catch (redisError) {
          console.warn(
            'Redis comment read failed; using local JSON:',
            redisError?.message ||
              redisError
          );
        }
      }

      const allComments =
        await readComments();

      const rawComments =
        Array.isArray(
          allComments[term]
        )
          ? allComments[term]
          : [];

      response.json({
        comments:
          rawComments.map(
            (item) =>
              publicComment(
                item,
                deviceId
              )
          ),
        replyCount:
          validAnonymousId(
            deviceId
          ) &&
          validAnonymousId(
            sessionId
          )
            ? countSessionReplies(
                allComments,
                deviceId,
                sessionId
              )
            : 0,
      });
    } catch (error) {
      console.error(
        'Comments read error:',
        error?.message || error
      );

      response
        .status(500)
        .json({
          error:
            'comments_unavailable',
        });
    }
  }
);

app.post(
  '/api/comments',
  async (request, response) => {
    const term =
      String(
        request.body?.term || ''
      ).trim();

    const name =
      String(
        request.body?.name || ''
      ).trim();

    const comment =
      String(
        request.body?.comment || ''
      ).trim();

    const parentId =
      request.body?.parentId
        ? String(
            request.body.parentId
          ).trim()
        : null;

    const deviceId =
      String(
        request.body?.deviceId || ''
      ).trim();

    const sessionId =
      String(
        request.body?.sessionId || ''
      ).trim();

    if (
      !term ||
      !validCommentTerm(term)
    ) {
      return response
        .status(400)
        .json({
          error: 'invalid_term',
        });
    }

    if (
      !validAnonymousId(
        deviceId
      ) ||
      !validAnonymousId(
        sessionId
      )
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

    if (!comment) {
      return response
        .status(400)
        .json({
          error: 'comment_required',
        });
    }

    if (name.length > 50) {
      return response
        .status(400)
        .json({
          error: 'name_too_long',
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

    try {
      if (redisConfigured()) {
        try {
          const existing =
            await readRedisTermComments(
              term
            );

          if (parentId) {
            const parent =
              await redisCommand([
                'HGET',
                REDIS_COMMENT_HASH,
                parentId,
              ]);

            if (!parent) {
              return response
                .status(404)
                .json({
                  error:
                    'parent_not_found',
                });
            }

            const parentItem =
              JSON.parse(parent);

            if (
              parentItem.term !== term
            ) {
              return response
                .status(404)
                .json({
                  error:
                    'parent_not_found',
                });
            }

            if (
              parentItem.deleted
            ) {
              return response
                .status(400)
                .json({
                  error:
                    'parent_deleted',
                });
            }

            const replies =
              countRawSessionReplies(
                existing,
                deviceId,
                sessionId
              );

            if (replies >= 10) {
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

          const newComment = {
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

          await saveRedisComment(
            newComment
          );

          return response
            .status(201)
            .json({
              ok: true,
              comment:
                publicComment(
                  newComment,
                  deviceId
                ),
            });
        } catch (redisError) {
          console.warn(
            'Redis comment write failed; using local JSON:',
            redisError?.message ||
              redisError
          );
        }
      }

      const result =
        await withCommentsLock(
          async () => {
            const allComments =
              await readComments();

            if (
              !Array.isArray(
                allComments[term]
              )
            ) {
              allComments[term] = [];
            }

            if (parentId) {
              const parent =
                flattenComments(
                  allComments
                ).find(
                  (item) =>
                    item.id ===
                      parentId &&
                    item.term === term
                );

              if (!parent) {
                return {
                  status: 404,
                  body: {
                    error:
                      'parent_not_found',
                  },
                };
              }

              if (parent.deleted) {
                return {
                  status: 400,
                  body: {
                    error:
                      'parent_deleted',
                  },
                };
              }

              const replies =
                countSessionReplies(
                  allComments,
                  deviceId,
                  sessionId
                );

              if (replies >= 10) {
                return {
                  status: 429,
                  body: {
                    error:
                      'reply_limit_reached',
                    message:
                      'Reply limit reached for this session (10).',
                  },
                };
              }
            }

            const now =
              new Date().toISOString();

            const newComment = {
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

            allComments[
              term
            ].unshift(
              newComment
            );

            await writeComments(
              allComments
            );

            return {
              status: 201,
              body: {
                ok: true,
                comment:
                  publicComment(
                    newComment,
                    deviceId
                  ),
              },
            };
          }
        );

      return response
        .status(result.status)
        .json(result.body);
    } catch (error) {
      console.error(
        'Comment write error:',
        error?.message || error
      );

      response
        .status(500)
        .json({
          error:
            'comment_write_failed',
        });
    }
  }
);

app.put(
  '/api/comments/:id',
  async (request, response) => {
    const id =
      String(
        request.params.id || ''
      ).trim();

    const deviceId =
      String(
        request.body?.deviceId || ''
      ).trim();

    const comment =
      String(
        request.body?.comment || ''
      ).trim();

    if (
      !id ||
      !/^[a-zA-Z0-9-]{10,100}$/.test(
        id
      )
    ) {
      return response
        .status(400)
        .json({
          error:
            'invalid_comment_id',
        });
    }

    if (
      !validAnonymousId(
        deviceId
      )
    ) {
      return response
        .status(400)
        .json({
          error:
            'invalid_anonymous_id',
        });
    }

    if (!comment) {
      return response
        .status(400)
        .json({
          error:
            'comment_required',
        });
    }

    if (comment.length > 2000) {
      return response
        .status(400)
        .json({
          error:
            'comment_too_long',
        });
    }

    try {
      if (redisConfigured()) {
        try {
          const raw =
            await redisCommand([
              'HGET',
              REDIS_COMMENT_HASH,
              id,
            ]);

          if (!raw) {
            return response
              .status(404)
              .json({
                error:
                  'comment_not_found',
              });
          }

          const item =
            JSON.parse(raw);

          if (
            item.ownerId !==
            deviceId
          ) {
            return response
              .status(403)
              .json({
                error:
                  'comment_not_owned',
              });
          }

          if (item.deleted) {
            return response
              .status(400)
              .json({
                error:
                  'comment_deleted',
              });
          }

          item.comment =
            comment;
          item.updatedAt =
            new Date().toISOString();

          await saveRedisComment(
            item
          );

          return response.json({
            ok: true,
            comment:
              publicComment(
                item,
                deviceId
              ),
          });
        } catch (redisError) {
          console.warn(
            'Redis comment edit failed; using local JSON:',
            redisError?.message ||
              redisError
          );
        }
      }

      const result =
        await withCommentsLock(
          async () => {
            const allComments =
              await readComments();

            const item =
              flattenComments(
                allComments
              ).find(
                (entry) =>
                  entry.id === id
              );

            if (!item) {
              return {
                status: 404,
                body: {
                  error:
                    'comment_not_found',
                },
              };
            }

            if (
              item.ownerId !==
              deviceId
            ) {
              return {
                status: 403,
                body: {
                  error:
                    'comment_not_owned',
                },
              };
            }

            if (item.deleted) {
              return {
                status: 400,
                body: {
                  error:
                    'comment_deleted',
                },
              };
            }

            item.comment =
              comment;
            item.updatedAt =
              new Date().toISOString();

            await writeComments(
              allComments
            );

            return {
              status: 200,
              body: {
                ok: true,
                comment:
                  publicComment(
                    item,
                    deviceId
                  ),
              },
            };
          }
        );

      return response
        .status(result.status)
        .json(result.body);
    } catch (error) {
      console.error(
        'Comment edit error:',
        error?.message || error
      );

      response
        .status(500)
        .json({
          error:
            'comment_edit_failed',
        });
    }
  }
);

app.delete(
  '/api/comments/:id',
  async (request, response) => {
    const id =
      String(
        request.params.id || ''
      ).trim();

    const deviceId =
      String(
        request.body?.deviceId || ''
      ).trim();

    if (
      !id ||
      !/^[a-zA-Z0-9-]{10,100}$/.test(
        id
      )
    ) {
      return response
        .status(400)
        .json({
          error:
            'invalid_comment_id',
        });
    }

    if (
      !validAnonymousId(
        deviceId
      )
    ) {
      return response
        .status(400)
        .json({
          error:
            'invalid_anonymous_id',
        });
    }

    try {
      if (redisConfigured()) {
        try {
          const raw =
            await redisCommand([
              'HGET',
              REDIS_COMMENT_HASH,
              id,
            ]);

          if (!raw) {
            return response
              .status(404)
              .json({
                error:
                  'comment_not_found',
              });
          }

          const item =
            JSON.parse(raw);

          if (
            item.ownerId !==
            deviceId
          ) {
            return response
              .status(403)
              .json({
                error:
                  'comment_not_owned',
              });
          }

          if (item.deleted) {
            return response
              .status(400)
              .json({
                error:
                  'comment_already_deleted',
              });
          }

          item.deleted = true;
          item.comment = '';
          item.updatedAt =
            new Date().toISOString();

          await saveRedisComment(
            item
          );

          return response.json({
            ok: true,
            deleted: true,
            id,
          });
        } catch (redisError) {
          console.warn(
            'Redis comment delete failed; using local JSON:',
            redisError?.message ||
              redisError
          );
        }
      }

      const result =
        await withCommentsLock(
          async () => {
            const allComments =
              await readComments();

            const item =
              flattenComments(
                allComments
              ).find(
                (entry) =>
                  entry.id === id
              );

            if (!item) {
              return {
                status: 404,
                body: {
                  error:
                    'comment_not_found',
                },
              };
            }

            if (
              item.ownerId !==
              deviceId
            ) {
              return {
                status: 403,
                body: {
                  error:
                    'comment_not_owned',
                },
              };
            }

            if (item.deleted) {
              return {
                status: 400,
                body: {
                  error:
                    'comment_already_deleted',
                },
              };
            }

            item.deleted = true;
            item.comment = '';
            item.updatedAt =
              new Date().toISOString();

            await writeComments(
              allComments
            );

            return {
              status: 200,
              body: {
                ok: true,
                deleted: true,
                id,
              },
            };
          }
        );

      return response
        .status(result.status)
        .json(result.body);
    } catch (error) {
      console.error(
        'Comment delete error:',
        error?.message || error
      );

      response
        .status(500)
        .json({
          error:
            'comment_delete_failed',
        });
    }
  }
);

/* =========================================================
   ADMIN AUTH ROUTES
========================================================= */

app.post(
  '/api/admin/login',
  (request, response) => {
    const username = String(
      request.body?.username || ''
    ).trim();

    const password = String(
      request.body?.password || ''
    );

    if (!username || !password) {
      return response.status(400).json({
        error: 'credentials_required',
      });
    }

    const accounts = parseAdminAccounts();

    let account = accounts.find(
      (item) => item.username === username
    );

    // Legacy local-secret compatibility while roles are being configured.
    if (
      !account &&
      accounts.length === 0 &&
      process.env.ADMIN_WRITE_SECRET &&
      username === 'admin'
    ) {
      const provided = Buffer.from(password);
      const expected = Buffer.from(process.env.ADMIN_WRITE_SECRET);

      if (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
      ) {
        account = {
          username: 'admin',
          role: 'admin',
          passwordHash: '',
        };
      }
    }

    if (
      !account ||

      (account.passwordHash &&
        !verifyPassword(
          password,
          account.passwordHash
        ))
    ) {
      return response.status(401).json({
        error: 'invalid_credentials',
      });
    }

    const token =
      randomBytes(32).toString('base64url');

    const expiresAt =
      Date.now() + ADMIN_SESSION_TTL_MS;

    adminSessions.set(token, {
      username: account.username,
      role: account.role,
      expiresAt,
    });

    setAdminCookie(response, token);

    return response.json({
      ok: true,
      user: {
        username: account.username,
        role: account.role,
      },
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }
);

app.post(
  '/api/admin/logout',
  (request, response) => {
    const token = parseCookies(request).admin_session;

    if (token) {
      adminSessions.delete(token);
    }

    clearAdminCookie(response);

    return response.json({
      ok: true,
    });
  }
);

app.get(
  '/api/admin/me',
  (request, response) => {
    const session = getAdminSession(request);

    if (!session) {
      return response.status(401).json({
        error: 'admin_unauthorized',
      });
    }

    return response.json({
      ok: true,
      user: {
        username: session.username,
        role: session.role,
      },
      expiresAt: new Date(session.expiresAt).toISOString(),
      permissions: [
        ...(ROLE_PERMISSIONS[session.role] || []),
      ],
    });
  }
);

/* =========================================================
   ADMIN COMMENT MODERATION
========================================================= */

function adminPublicComment(item) {
  return {
    id: item.id,
    term: item.term,
    name: item.name,
    comment: item.comment,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || null,
    parentId: item.parentId || null,
    deleted: Boolean(item.deleted),
  };
}

app.get(
  '/api/admin/comments',
  requireAdminRole('comments'),
  async (request, response) => {

    try {
      let items = [];

      if (redisConfigured()) {
        try {
          const values = await redisCommand([
            'HGETALL',
            REDIS_COMMENT_HASH,
          ]);

          if (Array.isArray(values)) {
            for (let i = 0; i < values.length; i += 2) {
              try {
                const value = values[i + 1];
                if (typeof value === 'string') {
                  const parsed = JSON.parse(value);
                  if (parsed?.id) items.push(parsed);
                }
              } catch {}
            }
          }
        } catch (error) {
          console.warn(
            'Admin Redis comment read failed; using local JSON:',
            error?.message || error
          );
        }
      }

      if (!items.length) {
        const local = await readComments();
        items = flattenComments(local);
      }

      items.sort(
        (a, b) =>
          (Date.parse(b.createdAt) || 0) -
          (Date.parse(a.createdAt) || 0)
      );

      return response.json({
        comments: items.map(adminPublicComment),
        totals: {
          all: items.length,
          active: items.filter((item) => !item.deleted).length,
          deleted: items.filter((item) => item.deleted).length,
          replies: items.filter((item) => item.parentId).length,
        },
      });
    } catch (error) {
      console.error(
        'Admin comment read error:',
        error?.message || error
      );

      return response.status(500).json({
        error: 'admin_comments_unavailable',
      });
    }
  }
);

app.delete(
  '/api/admin/comments/:id',
  requireAdminRole('comments'),
  async (request, response) => {

    const id = String(
      request.params.id || ''
    ).trim();

    if (
      !id ||
      !/^[a-zA-Z0-9-]{10,100}$/.test(id)
    ) {
      return response.status(400).json({
        error: 'invalid_comment_id',
      });
    }

    try {
      if (redisConfigured()) {
        try {
          const raw = await redisCommand([
            'HGET',
            REDIS_COMMENT_HASH,
            id,
          ]);

          if (raw) {
            const item = JSON.parse(raw);

            if (!item.deleted) {
              item.deleted = true;
              item.comment = '';
              item.updatedAt =
                new Date().toISOString();

              await saveRedisComment(item);
            }

            return response.json({
              ok: true,
              deleted: true,
              id,
            });
          }
        } catch (error) {
          console.warn(
            'Admin Redis comment moderation failed; using local JSON:',
            error?.message || error
          );
        }
      }

      const result = await withCommentsLock(
        async () => {
          const allComments =
            await readComments();

          const item =
            flattenComments(allComments).find(
              (entry) => entry.id === id
            );

          if (!item) {
            return {
              status: 404,
              body: {
                error: 'comment_not_found',
              },
            };
          }

          item.deleted = true;
          item.comment = '';
          item.updatedAt =
            new Date().toISOString();

          await writeComments(allComments);

          return {
            status: 200,
            body: {
              ok: true,
              deleted: true,
              id,
            },
          };
        }
      );

      return response
        .status(result.status)
        .json(result.body);
    } catch (error) {
      console.error(
        'Admin comment delete error:',
        error?.message || error
      );

      return response.status(500).json({
        error: 'admin_comment_delete_failed',
      });
    }
  }
);

/* =========================================================
   GOOGLE DRIVE
========================================================= */

function drive() {
  const email =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  const privateKey =
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    return null;
  }

  const auth =
    new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey.replace(
          /\\n/g,
          '\n'
        ),
      },
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });

  return google.drive({
    version: 'v3',
    auth,
  });
}

/* =========================================================
   HEALTH
========================================================= */

app.get('/api/health', (request, response) => {
  response.json({
    ok: true,
    contentFile: content,
    commentsFile: commentsFile,
    allowedOrigins,
  });
});

/* =========================================================
   CONTENT API
========================================================= */

app.get(
  '/api/content',
  async (request, response) => {
    try {
      response.json(await readContent());
    } catch (error) {
      console.error(
        'Content read error:',
        error?.message || error
      );

      response.status(500).json({
        error: 'content_unavailable',
      });
    }
  }
);

app.put(
  '/api/content',
  requireAdminRole('content'),
  async (request, response) => {
    const nextContent = request.body;

    if (
      !nextContent ||
      typeof nextContent !== 'object' ||
      Array.isArray(nextContent)
    ) {
      return response.status(400).json({
        error: 'invalid_content',
      });
    }

    try {
      await writeContent(nextContent);

      response.json({
        ok: true,
        content: nextContent,
      });
    } catch (error) {
      console.error(
        'Content write error:',
        error?.message || error
      );

      response.status(500).json({
        error: 'content_write_failed',
      });
    }
  }
);

/* =========================================================
   GOOGLE DRIVE MEDIA
========================================================= */

app.get(
  '/api/drive/media',
  requireAdminRole('content'),
  async (request, response) => {
    const d = drive();

    const folderId =
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

    if (!d || !folderId) {
      return response.status(503).json({
        error: 'drive_not_configured',
      });
    }

    try {
      const result =
        await d.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields:
            'files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime)',
          pageSize: 100,
          orderBy:
            'modifiedTime desc',
        });

      response.json(
        result.data.files || []
      );
    } catch (error) {
      console.error(
        'Google Drive error:',
        error?.message || error
      );

      response.status(500).json({
        error: 'drive_error',
      });
    }
  }
);

/* =========================================================
   AI STATUS
========================================================= */

app.get(
  '/api/ai-status',
  requireAdminRole('diagnostics'),
  (request, response) => {
    response.json({
      deepseekConfigured:
        Boolean(
          process.env.DEEPSEEK_API_KEY
        ),

      backupConfigured:
        Boolean(
          process.env.TAILSCALE_AI_URL &&
          process.env.TAILSCALE_AI_SHARED_SECRET
        ),

      apiBase:
        process.env.DEEPSEEK_BASE_URL ||
        'https://api.deepseek.com',

      model:
        process.env.DEEPSEEK_MODEL ||
        'deepseek-chat',
    });
  }
);

/* =========================================================
   CHAT
========================================================= */

app.post(
  '/api/chat',
  async (request, response) => {
    const message = String(
      request.body?.message || ''
    ).trim();

    if (!message) {
      return response.status(400).json({
        error: 'message_required',
      });
    }

    let c;

    try {
      c = await readContent();
    } catch (error) {
      console.error(
        'Chat content error:',
        error?.message || error
      );

      return response.status(500).json({
        error: 'content_unavailable',
      });
    }

    const deepseekKey =
      process.env.DEEPSEEK_API_KEY;

    const deepseekBase =
      process.env.DEEPSEEK_BASE_URL ||
      'https://api.deepseek.com';

    const deepseekModel =
      process.env.DEEPSEEK_MODEL ||
      'deepseek-chat';

    const backupUrl =
      process.env.TAILSCALE_AI_URL;

    const backupSecret =
      process.env.TAILSCALE_AI_SHARED_SECRET;

    if (deepseekKey) {
      const body = {
        model: deepseekModel,
        messages: [
          {
            role: 'system',
            content:
              `You are Zulfaqar Jamal's portfolio assistant.
Answer only from this portfolio JSON.
Never invent facts.
If the JSON does not contain the answer, say that the
information is not available in the portfolio.

PORTFOLIO JSON:
${JSON.stringify(c)}`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.2,
      };

      try {
        const controller =
          new AbortController();

        const timeout =
          setTimeout(
            () => controller.abort(),
            30000
          );

        let r;

        try {
          r = await fetch(
            `${deepseekBase}/chat/completions`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${deepseekKey}`,
              },
              body:
                JSON.stringify(body),
              signal:
                controller.signal,
            }
          );
        } finally {
          clearTimeout(timeout);
        }

        const raw =
          await r.text();

        let d = {};

        try {
          d = raw
            ? JSON.parse(raw)
            : {};
        } catch {
          d = {
            raw,
          };
        }

        if (!r.ok) {
          throw new Error(
            `DeepSeek HTTP ${r.status}: ${d?.error?.message || d?.message || 'unknown error'}`
          );
        }

        const reply =
          d?.choices?.[0]?.message
            ?.content;

        if (!reply) {
          throw new Error(
            'DeepSeek returned no message'
          );
        }

        return response.json({
          reply,
          provider: 'deepseek',
        });
      } catch (error) {
        console.error(
          'DeepSeek failed:',
          error?.message ||
            error
        );
      }
    } else {
      console.error(
        'DEEPSEEK_API_KEY is not configured.'
      );
    }

    if (
      backupUrl &&
      backupSecret
    ) {
      try {
        const controller =
          new AbortController();

        const timeout =
          setTimeout(
            () => controller.abort(),
            30000
          );

        let r;

        try {
          r = await fetch(
            backupUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                'X-Backup-Secret':
                  backupSecret,
              },
              body:
                JSON.stringify({
                  message,
                  context: c,
                }),
              signal:
                controller.signal,
            }
          );
        } finally {
          clearTimeout(timeout);
        }

        const raw =
          await r.text();

        let d = {};

        try {
          d = raw
            ? JSON.parse(raw)
            : {};
        } catch {
          d = {
            raw,
          };
        }

        if (!r.ok) {
          throw new Error(
            `Backup AI HTTP ${r.status}`
          );
        }

        if (!d?.reply) {
          throw new Error(
            'Backup AI returned no reply'
          );
        }

        return response.json({
          reply: d.reply,
          provider: 'tailscale-backup',
        });
      } catch (error) {
        console.error(
          'Backup AI failed:',
          error?.message ||
            error
        );
      }
    } else {
      console.warn(
        'Backup AI is not configured.'
      );
    }

    return response.status(502).json({
      error: 'ai_unavailable',
      message:
        'The AI service is temporarily unavailable.',
    });
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  port,
  '0.0.0.0',
  () => {
    console.log(
      `API listening on http://localhost:${port}`
    );

    console.log(
      `Content file: ${content}`
    );

    console.log(
      `Comments file: ${commentsFile}`
    );

    console.log(
      `Allowed CORS origins: ${allowedOrigins.join(', ')}`
    );

    console.log(
      `DeepSeek configured: ${Boolean(
        process.env.DEEPSEEK_API_KEY
      )}`
    );

    console.log(
      `Backup AI configured: ${Boolean(
        process.env.TAILSCALE_AI_URL &&
        process.env.TAILSCALE_AI_SHARED_SECRET
      )}`
    );
  }
);
