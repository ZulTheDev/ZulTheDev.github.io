import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { createClient } from 'redis';
import {
  writeupDraftDir,
  writeupPublishDir,
  safeSlug,
  saveDraft,
  readDraft,
  listDrafts,
  deleteDraft,
  publishWriteup,
  r2Configured,
  checkR2Connection,
  createUploadUrl,
  createReadUrl,
  deleteR2Object,
  listR2Objects,
  r2PublicUrl,
  safeR2Key,
  safeR2Prefix,
} from './writeups.js';

import {
  checkGitHubAppConnection,
  githubAppConfigured,
  publishFilesWithGitHubApp,
  uploadGitHubAppMedia,
} from './github-app.js';

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
    limit: '25mb',
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

function countRawUserReplies(
  comments,
  deviceId
) {
  return comments.filter(
    (item) =>
      item.parentId &&
      item.ownerId === deviceId
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
              )
                ? countRawUserReplies(
                    rawComments,
                    deviceId
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
          )
            ? countRawUserReplies(
                rawComments,
                deviceId
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
              countRawUserReplies(
                existing,
                deviceId
              );

            if (replies >= 10) {
              return response
                .status(429)
                .json({
                  error:
                    'reply_limit_reached',
                  message:
                    'Reply limit reached for this anonymous browser (10).',
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
                countRawUserReplies(
                  allComments[term] || [],
                  deviceId
                );

              if (replies >= 10) {
                return {
                  status: 429,
                  body: {
                    error:
                      'reply_limit_reached',
                    message:
                      'Reply limit reached for this anonymous browser (10).',
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
   CTF WRITEUPS + R2
========================================================= */

app.post(
  '/api/judge0/run',
  async (request, response) => {
    const sourceCode = String(request.body?.source_code || '');
    const stdin = String(request.body?.stdin || '');
    const languageId = Number(request.body?.language_id);

    if (
      !sourceCode ||
      sourceCode.length > 12000 ||
      !Number.isInteger(languageId) ||
      languageId < 1 ||
      languageId > 1000 ||
      stdin.length > 4000
    ) {
      return response.status(400).json({
        error: 'invalid_code_request',
      });
    }

    const judgeUrl = String(
      process.env.JUDGE0_URL || 'https://ce.judge0.com'
    ).replace(/\/+$/, '');

    const headers = {
      'Content-Type': 'application/json',
    };

    if (process.env.JUDGE0_AUTH_TOKEN) {
      headers['X-Auth-Token'] = process.env.JUDGE0_AUTH_TOKEN;
    }

    if (process.env.JUDGE0_AUTH_USER) {
      headers['X-Auth-User'] = process.env.JUDGE0_AUTH_USER;
    }

    async function fetchJson(url, options) {
      const upstream = await fetch(url, options);
      const raw = await upstream.text();

      let data = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      return { upstream, data };
    }

    try {
      const created = await fetchJson(
        judgeUrl +
          '/submissions/?base64_encoded=false&wait=false',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source_code: sourceCode,
            language_id: languageId,
            stdin,
            cpu_time_limit: 2,
            wall_time_limit: 5,
            memory_limit: 128000,
          }),
        }
      );

      if (
        !created.upstream.ok ||
        !created.data?.token
      ) {
        return response.status(502).json({
          error: 'judge0_error',
          detail:
            created.data?.error ||
            created.data?.message ||
            'Judge0 rejected the submission.',
        });
      }

      const token = created.data.token;
      let result = null;

      for (
        let attempt = 0;
        attempt < 20;
        attempt += 1
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500)
        );

        const polled = await fetchJson(
          judgeUrl +
            '/submissions/' +
            encodeURIComponent(token) +
            '?base64_encoded=false&fields=stdout,stderr,compile_output,message,status,time,memory',
          {
            method: 'GET',
            headers,
          }
        );

        if (!polled.upstream.ok) {
          return response.status(502).json({
            error: 'judge0_poll_error',
          });
        }

        result = polled.data;

        if (
          result.status &&
          ![1, 2].includes(
            Number(result.status.id)
          )
        ) {
          break;
        }
      }

      if (!result) {
        return response.status(504).json({
          error: 'judge0_timeout',
        });
      }

      return response.json({
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        compile_output:
          result.compile_output || '',
        message: result.message || '',
        status: result.status || null,
        time: result.time || null,
        memory: result.memory || null,
        token,
      });
    } catch (error) {
      console.error(
        'Judge0 proxy error:',
        error?.message || error
      );

      return response.status(503).json({
        error: 'judge0_unavailable',
      });
    }
  }
);


function writeupId(value) {
  return safeSlug(value);
}

function validateWriteupPayload(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.title === 'string' &&
    typeof value.slug === 'string' &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.blocks) &&
    value.workspace &&
    typeof value.workspace === 'object'
  );
}

app.get(
  '/api/writeups',
  async (request, response) => {
    try {
      return response.json({
        drafts: await listDrafts(),
      });
    } catch (error) {
      console.error('Writeup list error:', error?.message || error);
      return response.status(500).json({
        error: 'writeups_unavailable',
      });
    }
  }
);

app.get(
  '/api/writeups/:slug',
  async (request, response) => {
    try {
      return response.json(
        await readDraft(writeupId(request.params.slug))
      );
    } catch (error) {
      return response.status(404).json({
        error: 'writeup_not_found',
      });
    }
  }
);

app.put(
  '/api/writeups/:slug',
  async (request, response) => {
    const slug = writeupId(request.params.slug);
    const payload = request.body || {};

    if (
      !validateWriteupPayload(payload) ||
      writeupId(payload.slug) !== slug
    ) {
      return response.status(400).json({
        error: 'invalid_writeup',
      });
    }

    try {
      const next = {
        ...payload,
        slug,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      };

      await saveDraft(next);

      return response.json({
        ok: true,
        writeup: next,
        draftFile: path.relative(
          process.cwd(),
          path.join(writeupDraftDir, slug + '.json')
        ),
      });
    } catch (error) {
      console.error('Writeup save error:', error?.message || error);
      return response.status(500).json({
        error: 'writeup_save_failed',
      });
    }
  }
);

app.delete(
  '/api/writeups/:slug',
  async (request, response) => {
    try {
      await deleteDraft(writeupId(request.params.slug));
      return response.json({
        ok: true,
      });
    } catch (error) {
      return response.status(500).json({
        error: 'writeup_delete_failed',
      });
    }
  }
);

app.post(
  '/api/writeups/:slug/publish',
  async (request, response) => {
    try {
      const draft = await readDraft(writeupId(request.params.slug));
      const published = await publishWriteup(draft);

      return response.json({
        ok: true,
        writeup: published,
        url:
          '/ctf_blog/' +
          published.slug,
        deploy: published.deploy || null,
      });
    } catch (error) {
      console.error('Writeup publish error:', error?.message || error);
      return response.status(500).json({
        error: 'writeup_publish_failed',
        message: error?.message || 'publish failed',
      });
    }
  }
);

app.get(
  '/api/r2/status',
  async (request, response) => {
    const configured = r2Configured();

    if (!configured) {
      return response.json({
        configured: false,
        reachable: false,
        publicBaseUrl:
          process.env.R2_PUBLIC_BASE_URL || '',
      });
    }

    try {
      await checkR2Connection();

      return response.json({
        configured: true,
        reachable: true,
        publicBaseUrl:
          process.env.R2_PUBLIC_BASE_URL || '',
      });
    } catch (error) {
      console.error(
        'R2 status check failed:',
        error?.message || error
      );

      return response.status(503).json({
        configured: true,
        reachable: false,
        publicBaseUrl:
          process.env.R2_PUBLIC_BASE_URL || '',
        error: 'r2_unreachable',
        detail: error?.message || 'R2 connection failed',
      });
    }
  }
);

app.get(
  '/api/github-app/status',
  async (request, response) => {
    try {
      return response.json(
        await checkGitHubAppConnection()
      );
    } catch (error) {
      console.error(
        'GitHub App status check failed:',
        error?.message || error
      );

      return response.status(503).json({
        configured: true,
        reachable: false,
        repository:
          process.env.GITHUB_OWNER &&
          process.env.GITHUB_REPO
            ? process.env.GITHUB_OWNER +
              '/' +
              process.env.GITHUB_REPO
            : null,
        branch:
          process.env.GITHUB_BRANCH ||
          'main',
        error:
          error?.message ||
          'github_app_unreachable',
      });
    }
  }
);


app.get(
  '/api/r2/objects',
  async (request, response) => {
    try {
      const rawPrefix = String(
        request.query.prefix || 'ctf_blog/'
      ).slice(0, 200);

      const prefix = safeR2Prefix(rawPrefix);

      return response.json({
        objects: await listR2Objects(prefix),
      });
    } catch (error) {
      return response.status(503).json({
        error: error?.message || 'r2_unavailable',
      });
    }
  }
);

app.post(
  '/api/r2/upload-url',
  async (request, response) => {
    const filename = String(
      request.body?.filename || ''
    ).trim();

    const contentType = String(
      request.body?.contentType ||
      'application/octet-stream'
    ).trim();

    const writeupSlug = String(
      request.body?.writeupSlug ||
      'general'
    ).trim();

    if (
      !filename ||
      filename.length > 180 ||
      contentType.length > 120
    ) {
      return response.status(400).json({
        error: 'invalid_upload_request',
      });
    }

    let slug;

    try {
      slug = writeupId(writeupSlug);
    } catch {
      return response.status(400).json({
        error: 'invalid_writeup_slug',
      });
    }

    try {
      const safeName = filename
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^\.+$/, '');

      if (!safeName) {
        return response.status(400).json({
          error: 'invalid_filename',
        });
      }

      const key =
        'ctf_blog/' +
        slug +
        '/' +
        Date.now() +
        '-' +
        safeName;

      const uploadUrl = await createUploadUrl({
        key,
        contentType,
      });

      return response.json({
        key,
        uploadUrl,
        publicUrl: r2PublicUrl(key),
        expiresIn: 3600,
      });
    } catch (error) {
      console.error('R2 upload URL error:', error?.message || error);
      return response.status(503).json({
        error: error?.message || 'r2_unavailable',
      });
    }
  }
);



app.post(
  '/api/repo/media/upload',
  async (request, response) => {
    const folder =
      String(
        request.body?.folder ||
          'portfolio-media'
      )
        .trim()
        .replace(/^\/+|\/+$/g, '');

    const filename =
      String(
        request.body?.filename || ''
      ).trim();

    const contentBase64 =
      String(
        request.body?.contentBase64 || ''
      ).trim();

    if (
      folder !== 'certs' &&
      !/^portfolio-media\/[a-z0-9-]{1,80}$/.test(
        folder
      )
    ) {
      return response.status(400).json({
        error:
          'invalid_repository_media_folder',
      });
    }

    const safeName =
      path
        .basename(filename)
        .replace(
          /[^a-zA-Z0-9._ -]/g,
          '-'
        )
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .slice(0, 160);

    if (!safeName) {
      return response.status(400).json({
        error:
          'invalid_repository_media_filename',
      });
    }

    if (
      !contentBase64 ||
      contentBase64.length > 24_000_000
    ) {
      return response.status(400).json({
        error:
          'repository_media_too_large_or_empty',
      });
    }

    try {
      const data =
        await uploadGitHubAppMedia({
          path:
            'client/public/' +
            folder +
            '/' +
            Date.now() +
            '-' +
            safeName,
          contentBase64,
          message:
            'Add portfolio media: ' +
            safeName,
        });

      return response.json(data);
    } catch (error) {
      console.error(
        'Repository media upload error:',
        error?.message || error
      );

      return response.status(503).json({
        error:
          error?.message ||
          'repository_media_upload_failed',
      });
    }
  }
);

app.delete(
  '/api/r2/objects',
  async (request, response) => {
    const rawKey = String(request.body?.key || '').trim();

    if (!rawKey || rawKey.length > 500) {
      return response.status(400).json({
        error: 'invalid_r2_key',
      });
    }

    let key;

    try {
      key = safeR2Key(rawKey);
    } catch {
      return response.status(400).json({
        error: 'invalid_r2_key',
      });
    }

    try {
      await deleteR2Object(key);

      return response.json({
        ok: true,
        key,
      });
    } catch (error) {
      console.error(
        'R2 delete error:',
        error?.message || error
      );

      return response.status(503).json({
        error: error?.message || 'r2_unavailable',
      });
    }
  }
);

app.get(
  '/api/r2/read-url',
  async (request, response) => {
    const rawKey = String(request.query.key || '').trim();

    if (!rawKey || rawKey.length > 500) {
      return response.status(400).json({
        error: 'invalid_r2_key',
      });
    }

    let key;

    try {
      key = safeR2Key(rawKey);
    } catch {
      return response.status(400).json({
        error: 'invalid_r2_key',
      });
    }

    try {
      return response.json({
        key,
        url: await createReadUrl({
          key,
          expiresIn: 900,
        }),
      });
    } catch (error) {
      return response.status(503).json({
        error: error?.message || 'r2_unavailable',
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
        'https://www.googleapis.com/auth/drive',
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

      let deploy = null;

      if (
        String(process.env.GITHUB_APP_AUTO_PUSH || '')
          .toLowerCase() === 'true'
      ) {
        if (!githubAppConfigured()) {
          deploy = {
            pushed: false,
            provider: 'github-app',
            message:
              'Content saved locally, but GitHub App publishing is not configured.',
          };
        } else {
          try {
            const contentText =
              JSON.stringify(nextContent, null, 2) + '\n';

            deploy =
              await publishFilesWithGitHubApp({
                title: 'Update portfolio content',
                files: [
                  {
                    path:
                      'client/public/content.json',
                    content: contentText,
                  },
                ],
              });
          } catch (deployError) {
            console.error(
              'Portfolio content GitHub App publish error:',
              deployError?.message ||
                deployError
            );

            deploy = {
              pushed: false,
              provider: 'github-app',
              error:
                deployError?.message ||
                'github_app_publish_failed',
              message:
                'Content saved locally, but the GitHub App push failed.',
            };
          }
        }
      }

      response.json({
        ok: true,
        content: nextContent,
        deploy,
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

const APPROVED_DRIVE_ROOT_ID =
  String(
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
      '10XU8zeRpx9Ladh501vWjZepzm0j7ZOq6'
  ).trim();

async function getDriveFileMeta(d, fileId) {
  const result = await d.files.get({
    fileId,
    fields:
      'id,name,mimeType,parents,trashed',
    supportsAllDrives: true,
  });

  return result.data || {};
}

async function driveItemWithinRoot(
  d,
  fileId,
  rootFolderId =
    APPROVED_DRIVE_ROOT_ID
) {
  if (!fileId || !rootFolderId) {
    return false;
  }

  if (fileId === rootFolderId) {
    return true;
  }

  const queue = [fileId];
  const visited = new Set();

  while (
    queue.length &&
    visited.size < 80
  ) {
    const currentId = queue.shift();

    if (
      !currentId ||
      visited.has(currentId)
    ) {
      continue;
    }

    if (currentId === rootFolderId) {
      return true;
    }

    visited.add(currentId);

    let item;

    try {
      item =
        await getDriveFileMeta(
          d,
          currentId
        );
    } catch {
      continue;
    }

    for (const parentId of
      item.parents || []) {
      if (
        parentId === rootFolderId
      ) {
        return true;
      }

      if (!visited.has(parentId)) {
        queue.push(parentId);
      }
    }
  }

  return false;
}

async function requireDriveParent(
  d,
  candidateId
) {
  const parentId =
    String(
      candidateId ||
        APPROVED_DRIVE_ROOT_ID
    ).trim();

  const allowed =
    await driveItemWithinRoot(
      d,
      parentId
    );

  if (!allowed) {
    const error =
      new Error(
        'drive_parent_outside_approved_root'
      );
    error.status = 403;
    throw error;
  }

  const meta =
    await getDriveFileMeta(
      d,
      parentId
    );

  if (
    meta.trashed ||
    meta.mimeType !==
      'application/vnd.google-apps.folder'
  ) {
    const error =
      new Error(
        'drive_parent_not_folder'
      );
    error.status = 400;
    throw error;
  }

  return parentId;
}

app.get(
  '/api/drive/folders',
  async (request, response) => {
    const d = drive();

    if (!d || !APPROVED_DRIVE_ROOT_ID) {
      return response.status(503).json({
        error: 'drive_not_configured',
      });
    }

    try {
      const parentId =
        await requireDriveParent(
          d,
          request.query.parentId
        );

      const result =
        await d.files.list({
          q:
            `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields:
            'files(id,name,mimeType,parents,modifiedTime)',
          pageSize: 100,
          orderBy: 'name',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

      return response.json({
        rootId:
          APPROVED_DRIVE_ROOT_ID,
        parentId,
        folders:
          result.data.files || [],
      });
    } catch (error) {
      return response.status(
        Number(error?.status) || 500
      ).json({
        error:
          error?.message ||
          'drive_folder_list_failed',
      });
    }
  }
);

app.post(
  '/api/drive/folders',
  async (request, response) => {
    const d = drive();

    if (!d || !APPROVED_DRIVE_ROOT_ID) {
      return response.status(503).json({
        error: 'drive_not_configured',
      });
    }

    const name =
      String(
        request.body?.name || ''
      ).trim();

    if (
      !name ||
      name.length > 160
    ) {
      return response.status(400).json({
        error: 'invalid_folder_name',
      });
    }

    try {
      const parentId =
        await requireDriveParent(
          d,
          request.body?.parentId
        );

      const result =
        await d.files.create({
          requestBody: {
            name,
            mimeType:
              'application/vnd.google-apps.folder',
            parents: [parentId],
          },
          fields:
            'id,name,mimeType,parents,webViewLink',
          supportsAllDrives: true,
        });

      return response
        .status(201)
        .json({
          ok: true,
          folder: result.data,
        });
    } catch (error) {
      return response.status(
        Number(error?.status) || 500
      ).json({
        error:
          error?.message ||
          'drive_folder_create_failed',
      });
    }
  }
);

app.post(
  '/api/drive/upload',
  async (request, response) => {
    const d = drive();

    if (!d || !APPROVED_DRIVE_ROOT_ID) {
      return response.status(503).json({
        error: 'drive_not_configured',
      });
    }

    const name =
      String(
        request.body?.name || ''
      ).trim();

    const mimeType =
      String(
        request.body?.mimeType ||
          'application/octet-stream'
      ).trim();

    const contentBase64 =
      String(
        request.body?.contentBase64 ||
          ''
      ).trim();

    if (
      !name ||
      !contentBase64
    ) {
      return response.status(400).json({
        error: 'drive_upload_missing_data',
      });
    }

    let buffer;

    try {
      buffer =
        Buffer.from(
          contentBase64,
          'base64'
        );
    } catch {
      return response.status(400).json({
        error: 'drive_upload_invalid_base64',
      });
    }

    if (
      !buffer.length ||
      buffer.length >
        15 * 1024 * 1024
    ) {
      return response.status(413).json({
        error: 'drive_upload_too_large',
      });
    }

    try {
      const parentId =
        await requireDriveParent(
          d,
          request.body?.parentId
        );

      const {
        Readable,
      } =
        await import('node:stream');

      const result =
        await d.files.create({
          requestBody: {
            name,
            parents: [parentId],
          },
          media: {
            mimeType,
            body:
              Readable.from(buffer),
          },
          fields:
            'id,name,mimeType,parents,size,webViewLink,thumbnailLink,modifiedTime',
          supportsAllDrives: true,
        });

      return response
        .status(201)
        .json({
          ok: true,
          file: result.data,
        });
    } catch (error) {
      return response.status(
        Number(error?.status) || 500
      ).json({
        error:
          error?.message ||
          'drive_upload_failed',
      });
    }
  }
);

app.patch(
  '/api/drive/files/:id',
  async (request, response) => {
    const d = drive();
    const fileId =
      String(
        request.params.id || ''
      ).trim();

    if (!d || !APPROVED_DRIVE_ROOT_ID) {
      return response.status(503).json({
        error: 'drive_not_configured',
      });
    }

    if (
      !/^[a-zA-Z0-9_-]{10,200}$/.test(
        fileId
      )
    ) {
      return response.status(400).json({
        error: 'invalid_drive_file_id',
      });
    }

    try {
      const inside =
        await driveItemWithinRoot(
          d,
          fileId
        );

      if (!inside) {
        return response.status(403).json({
          error:
            'drive_file_outside_approved_root',
        });
      }

      const current =
        await getDriveFileMeta(
          d,
          fileId
        );

      const nextName =
        String(
          request.body?.name || ''
        ).trim();

      const requestedParent =
        String(
          request.body?.parentId || ''
        ).trim();

      const updateOptions = {
        fileId,
        supportsAllDrives: true,
        fields:
          'id,name,mimeType,parents,webViewLink,thumbnailLink,modifiedTime',
      };

      if (nextName) {
        updateOptions.requestBody = {
          name:
            nextName.slice(0, 180),
        };
      }

      if (requestedParent) {
        const parentId =
          await requireDriveParent(
            d,
            requestedParent
          );

        updateOptions.addParents =
          parentId;

        if (
          Array.isArray(
            current.parents
          ) &&
          current.parents.length
        ) {
          updateOptions.removeParents =
            current.parents.join(',');
        }
      }

      const result =
        await d.files.update(
          updateOptions
        );

      return response.json({
        ok: true,
        file: result.data,
      });
    } catch (error) {
      return response.status(
        Number(error?.status) || 500
      ).json({
        error:
          error?.message ||
          'drive_file_update_failed',
      });
    }
  }
);

/* =========================================================
   GOOGLE DRIVE MEDIA
========================================================= */

async function resolveDriveMediaFolder(d, rootFolderId) {
  const configured =
    String(
      process.env.GOOGLE_DRIVE_MEDIA_FOLDER_ID ||
        ''
    ).trim();

  if (configured) {
    return configured;
  }

  const result = await d.files.list({
    q:
      `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name,mimeType)',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const mediaFolder =
    (result.data.files || []).find(
      (item) =>
        String(item.name || '')
          .trim()
          .toLowerCase() === 'media'
    );

  return mediaFolder?.id || rootFolderId;
}

async function listDriveMediaRecursive(d, rootFolderId) {
  const queue = [rootFolderId];
  const files = [];

  while (queue.length && files.length < 250) {
    const parentId = queue.shift();
    let pageToken;

    do {
      const result = await d.files.list({
        q:
          `'${parentId}' in parents and trashed=false`,
        fields:
          'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,size,parents)',
        pageSize: 100,
        orderBy: 'modifiedTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageToken,
      });

      for (const item of result.data.files || []) {
        if (
          item.mimeType ===
          'application/vnd.google-apps.folder'
        ) {
          queue.push(item.id);
          continue;
        }

        const type =
          String(item.mimeType || '').toLowerCase();

        if (
          type.startsWith('image/') ||
          type.startsWith('video/') ||
          type.startsWith('audio/') ||
          type === 'application/pdf'
        ) {
          files.push({
            ...item,
            proxyUrl:
              '/api/drive/image/' +
              encodeURIComponent(item.id),
          });
        }

        if (files.length >= 250) {
          break;
        }
      }

      pageToken =
        result.data.nextPageToken || undefined;
    } while (pageToken && files.length < 250);
  }

  return files;
}

app.get(
  '/api/drive/media',
  async (request, response) => {
    const d = drive();

    const rootFolderId =
      APPROVED_DRIVE_ROOT_ID;

    if (!d || !rootFolderId) {
      return response.status(503).json({
        error: 'drive_not_configured',
      });
    }

    try {
      const mediaFolderId =
        await resolveDriveMediaFolder(
          d,
          rootFolderId
        );

      const files =
        await listDriveMediaRecursive(
          d,
          mediaFolderId
        );

      response.json(files);
    } catch (error) {
      console.error(
        'Google Drive media error:',
        error?.message || error
      );

      response.status(500).json({
        error: 'drive_error',
      });
    }
  }
);

app.get(
  '/api/drive/image/:id',
  async (request, response) => {
    const d = drive();

    if (!d) {
      return response.status(503).json({
        error: 'drive_not_configured',
      });
    }

    const fileId =
      String(request.params.id || '').trim();

    if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) {
      return response.status(400).json({
        error: 'invalid_drive_file_id',
      });
    }

    try {
      const metadata = await d.files.get({
        fileId,
        fields:
          'id,name,mimeType,size,trashed',
        supportsAllDrives: true,
      });

      const file = metadata.data || {};
      const mimeType =
        String(file.mimeType || '')
          .toLowerCase();

      if (
        file.trashed ||
        !(
          mimeType.startsWith('image/') ||
          mimeType.startsWith('video/') ||
          mimeType.startsWith('audio/') ||
          mimeType === 'application/pdf'
        )
      ) {
        return response.status(404).json({
          error: 'drive_media_not_found',
        });
      }

      const media = await d.files.get(
        {
          fileId,
          alt: 'media',
          supportsAllDrives: true,
        },
        {
          responseType: 'stream',
        }
      );

      response.setHeader(
        'Content-Type',
        file.mimeType ||
          'application/octet-stream'
      );
      response.setHeader(
        'Cache-Control',
        'private, max-age=300'
      );

      media.data.on('error', (error) => {
        console.error(
          'Drive media stream error:',
          error?.message || error
        );

        if (!response.headersSent) {
          response.status(502).end();
        } else {
          response.destroy(error);
        }
      });

      media.data.pipe(response);
    } catch (error) {
      console.error(
        'Google Drive media proxy error:',
        error?.message || error
      );

      response.status(
        Number(error?.code) === 404
          ? 404
          : 502
      ).json({
        error: 'drive_media_unavailable',
      });
    }
  }
);

/* =========================================================
   AI STATUS
========================================================= */

app.get(
  '/api/ai-status',
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
Format answers for a compact chat interface using short paragraphs,
small headings when useful, and bullet lists for multiple points.
Avoid one giant paragraph. Markdown-style bold and inline code are
allowed; do not output raw HTML.

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
