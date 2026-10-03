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

  try {
    const upstream = await fetch(
      judgeUrl + '/submissions/?base64_encoded=false&wait=true',
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

    const raw = await upstream.text();

    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!upstream.ok) {
      return response.status(502).json({
        error: 'judge0_error',
        detail:
          data?.error ||
          data?.message ||
          'Judge0 rejected the submission.',
      });
    }

    return response.json({
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      compile_output: data.compile_output || '',
      message: data.message || '',
      status: data.status || null,
      time: data.time || null,
      memory: data.memory || null,
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
