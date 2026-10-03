import {
  consumeJudge0RateLimit,
  fingerprintJudgeRequest,
  getClientIp,
  rateLimitKeyPreview,
} from '../lib/rate-limit.js';

const ALLOWED_ORIGINS = [
  'https://zulthedev.github.io',
];

function cors(response, origin) {
  const selected = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  response.setHeader(
    'Access-Control-Allow-Origin',
    selected
  );
  response.setHeader(
    'Access-Control-Allow-Methods',
    'POST,OPTIONS'
  );
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );
  response.setHeader('Vary', 'Origin');
}

export default async function handler(request, response) {
  const origin = request.headers.origin || '';
  cors(response, origin);

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({
      error: 'method_not_allowed',
    });
  }

  const contentLength = Number(
    request.headers['content-length'] || 0
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > 64 * 1024
  ) {
    return response.status(413).json({
      error: 'request_too_large',
    });
  }

  const sourceCode = String(request.body?.source_code || '');
  const stdin = String(request.body?.stdin || '');
  const languageId = Number(request.body?.language_id);

  const allowedLanguageIds = new Set([
    46, // Bash
    50, // C
    54, // C++
    60, // Go
    62, // Java
    63, // JavaScript
    71, // Python 3
    72, // Ruby
    73, // Rust
    74, // TypeScript
  ]);

  if (
    !sourceCode ||
    sourceCode.length > 12000 ||
    !Number.isInteger(languageId) ||
    !allowedLanguageIds.has(languageId) ||
    stdin.length > 4000
  ) {
    return response.status(400).json({
      error: 'invalid_code_request',
    });
  }

  const clientIp = getClientIp(request);
  const fingerprint =
    fingerprintJudgeRequest({
      sourceCode,
      stdin,
      languageId,
    });

  let rateLimit;

  try {
    rateLimit = await consumeJudge0RateLimit({
      ip: clientIp,
      fingerprint,
    });
  } catch (error) {
    console.error(
      'Judge0 rate limiter unavailable:',
      error?.message || error
    );

    return response.status(503).json({
      error: 'rate_limit_unavailable',
    });
  }

  if (!rateLimit.allowed) {
    const retryAfter =
      rateLimit.retryAfterSeconds;

    response.setHeader(
      'Retry-After',
      String(retryAfter)
    );
    response.setHeader(
      'X-RateLimit-Limit',
      String(rateLimit.limit)
    );
    response.setHeader(
      'X-RateLimit-Remaining',
      '0'
    );

    console.warn(
      'Judge0 rate limited request:',
      rateLimitKeyPreview(clientIp)
    );

    return response.status(429).json({
      error: 'rate_limited',
      message:
        'Code execution rate limit reached. Try again later.',
      retryAfter,
    });
  }

  response.setHeader(
    'X-RateLimit-Limit',
    String(rateLimit.limit)
  );
  response.setHeader(
    'X-RateLimit-Remaining',
    String(rateLimit.remaining)
  );

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

    return {
      upstream,
      data,
    };
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
      compile_output: result.compile_output || '',
      message: result.message || '',
      status: result.status || null,
      time: result.time || null,
      memory: result.memory || null,
      token,
    });
  } catch (error) {
    console.error(
      'Online Judge0 proxy error:',
      error?.message || error
    );

    return response.status(503).json({
      error: 'judge0_unavailable',
    });
  }
};
