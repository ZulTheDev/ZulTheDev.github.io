import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';

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
   COMMENTS
========================================================= */

async function readComments() {
  try {
    return JSON.parse(
      await fs.readFile(commentsFile, 'utf8')
    );
  } catch {
    return {};
  }
}

async function writeComments(data) {
  await fs.mkdir(
    path.dirname(commentsFile),
    { recursive: true }
  );

  const tempFile = `${commentsFile}.tmp`;

  await fs.writeFile(
    tempFile,
    `${JSON.stringify(data, null, 2)}\n`,
    'utf8'
  );

  await fs.rename(
    tempFile,
    commentsFile
  );
}

function validCommentTerm(term) {
  return (
    term.startsWith('portfolio:') &&
    term.length <= 200
  );
}

app.get(
  '/api/comments',
  async (request, response) => {
    const term = String(
      request.query.term || ''
    ).trim();

    if (!term || !validCommentTerm(term)) {
      return response.status(400).json({
        error: 'invalid_term',
      });
    }

    try {
      const allComments =
        await readComments();

      response.json({
        comments:
          Array.isArray(allComments[term])
            ? allComments[term]
            : [],
      });
    } catch (error) {
      console.error(
        'Comments read error:',
        error?.message || error
      );

      response.status(500).json({
        error: 'comments_unavailable',
      });
    }
  }
);

app.post(
  '/api/comments',
  async (request, response) => {
    const term = String(
      request.body?.term || ''
    ).trim();

    const name = String(
      request.body?.name || ''
    ).trim();

    const comment = String(
      request.body?.comment || ''
    ).trim();

    if (!term || !validCommentTerm(term)) {
      return response.status(400).json({
        error: 'invalid_term',
      });
    }

    if (!name) {
      return response.status(400).json({
        error: 'name_required',
      });
    }

    if (!comment) {
      return response.status(400).json({
        error: 'comment_required',
      });
    }

    if (name.length > 50) {
      return response.status(400).json({
        error: 'name_too_long',
      });
    }

    if (comment.length > 2000) {
      return response.status(400).json({
        error: 'comment_too_long',
      });
    }

    try {
      const allComments =
        await readComments();

      if (!Array.isArray(allComments[term])) {
        allComments[term] = [];
      }

      const newComment = {
        id: randomUUID(),
        term,
        name,
        comment,
        createdAt: new Date().toISOString(),
      };

      allComments[term].unshift(
        newComment
      );

      await writeComments(
        allComments
      );

      response.status(201).json({
        ok: true,
        comment: newComment,
      });
    } catch (error) {
      console.error(
        'Comment write error:',
        error?.message || error
      );

      response.status(500).json({
        error: 'comment_write_failed',
      });
    }
  }
);

/* =========================================================
   ADMIN AUTH
========================================================= */

function isWriteAuthorized(request) {
  const secret =
    process.env.ADMIN_WRITE_SECRET;

  if (!secret) {
    return true;
  }

  return (
    request.get('X-Admin-Secret') === secret
  );
}

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
  async (request, response) => {
    if (!isWriteAuthorized(request)) {
      return response.status(401).json({
        error: 'admin_unauthorized',
      });
    }

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
