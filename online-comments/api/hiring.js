const ALLOWED_ORIGINS = [
  'https://zulthedev.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
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

function compactItems(content) {
  const make = (
    key,
    items,
    fields
  ) =>
    (Array.isArray(items) ? items : [])
      .map((item) => {
        const result = {
          type: key,
          id: item.id,
        };

        for (const field of fields) {
          if (item[field] !== undefined) {
            result[field] = item[field];
          }
        }

        return result;
      })
      .filter((item) => item.id);

  return [
    ...make('experience', content.experience, [
      'company',
      'role',
      'location',
      'summary',
      'elaboration',
      'reflection',
      'skills',
      'start',
      'end',
    ]),
    ...make('projects', content.projects, [
      'title',
      'category',
      'description',
      'issuer',
      'date',
    ]),
    ...make(
      'certifications',
      content.certifications,
      [
        'title',
        'category',
        'description',
        'issuer',
        'date',
      ]
    ),
    ...make('achievements', content.achievements, [
      'title',
      'category',
      'description',
      'issuer',
      'date',
    ]),
    ...make('awards', content.awards, [
      'title',
      'category',
      'description',
      'issuer',
      'date',
    ]),
    ...make('education', content.education, [
      'school',
      'qualification',
      'description',
      'period',
    ]),
  ];
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(
        text.slice(start, end + 1)
      );
    }

    throw new Error(
      'invalid_ai_json'
    );
  }
}

function cleanSelection(selection, catalog) {
  const allowed = new Map(
    catalog.map((item) => [
      item.type + ':' + item.id,
      item,
    ])
  );

  const clean = (type) =>
    Array.isArray(selection?.[type])
      ? selection[type]
          .map((id) => String(id))
          .filter((id) =>
            allowed.has(
              type + ':' + id
            )
          )
      : [];

  const ids = {
    experience: clean('experience'),
    projects: clean('projects'),
    certifications: clean(
      'certifications'
    ),
    achievements: clean(
      'achievements'
    ),
    awards: clean('awards'),
    education: clean('education'),
  };

  return ids;
}

export default async function handler(
  request,
  response
) {
  const origin = request.headers.origin || '';

  cors(response, origin);

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  if (request.method !== 'POST') {
    return response
      .status(405)
      .json({
        error: 'method_not_allowed',
      });
  }

  const apiKey =
    process.env.DEEPSEEK_API_KEY || '';

  if (!apiKey) {
    return response
      .status(503)
      .json({
        error: 'ai_not_configured',
      });
  }

  try {
    const target = String(
      request.body?.target || ''
    ).trim();

    if (target.length > 200) {
      return response
        .status(400)
        .json({
          error: 'target_too_long',
        });
    }

    const content =
      request.body?.content || {};

    const catalog =
      compactItems(content);

    const model =
      process.env.DEEPSEEK_MODEL ||
      'deepseek-chat';

    const system =
      "You are a hiring-oriented portfolio filter. Given a requested work type and a catalog of portfolio evidence, select only the evidence that is materially relevant. Do not rewrite, invent or modify the source information. Return strict JSON with these array keys only: experience, projects, certifications, achievements, awards, education. Each value must contain only IDs already present in the catalog. Prefer direct relevance and transferable evidence. Keep the selection focused rather than returning everything.";

    const user =
      'TARGET WORK TYPE:\n' +
      (target || 'general hiring') +
      '\n\nCATALOG:\n' +
      JSON.stringify(catalog);

    const upstream = await fetch(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
          Authorization:
            'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: system,
            },
            {
              role: 'user',
              content: user,
            },
          ],
          temperature: 0.1,
          response_format: {
            type: 'json_object',
          },
        }),
      }
    );

    const raw = await upstream.text();

    let data = {};

    try {
      data = raw
        ? JSON.parse(raw)
        : {};
    } catch {
      data = {};
    }

    if (!upstream.ok) {
      console.error(
        'DeepSeek hiring filter error:',
        upstream.status,
        data?.error?.message || 'unknown'
      );

      return response
        .status(502)
        .json({
          error: 'hiring_ai_error',
        });
    }

    const text =
      data?.choices?.[0]?.message?.content ||
      '';

    const selection =
      cleanSelection(
        parseJsonObject(text),
        catalog
      );

    return response.json(selection);
  } catch (error) {
    console.error(
      'Hiring filter error:',
      error?.message || error
    );

    return response
      .status(503)
      .json({
        error: 'hiring_filter_unavailable',
      });
  }
};
