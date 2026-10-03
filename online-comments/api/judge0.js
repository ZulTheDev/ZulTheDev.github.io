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
