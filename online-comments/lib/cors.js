import { config } from './config.js';

const ALLOWED_ORIGINS = new Set([
  config.clientOrigin,
  'https://zulthedev.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]);

export function applyCors(response, request) {
  const origin = String(request.headers.origin || '');
  const selected = ALLOWED_ORIGINS.has(origin)
    ? origin
    : config.clientOrigin;

  response.setHeader(
    'Access-Control-Allow-Origin',
    selected
  );
  response.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS'
  );
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );
  response.setHeader(
    'Access-Control-Max-Age',
    '86400'
  );
  response.setHeader('Vary', 'Origin');
}

export function handleOptions(request, response) {
  applyCors(response, request);

  if (request.method !== 'OPTIONS') {
    return false;
  }

  response.status(200).json({ ok: true });
  return true;
}
