import { createHash, randomUUID } from 'node:crypto';
import { getRedis } from './redis.js';

const LUA_RATE_LIMIT = `
local now = tonumber(ARGV[1])
local request_id = ARGV[2]
local count = #KEYS
local allowed = 1
local retry_ms = 0
local remaining = 9007199254740991

for i = 1, count do
  local window_ms = tonumber(ARGV[3 + ((i - 1) * 2)])
  local limit = tonumber(ARGV[4 + ((i - 1) * 2)])
  local key = KEYS[i]

  redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)

  local current = redis.call('ZCARD', key)
  local available = math.max(0, limit - current)

  if available < remaining then
    remaining = available
  end

  if current >= limit then
    allowed = 0

    local pttl = redis.call('PTTL', key)
    if pttl > retry_ms then
      retry_ms = pttl
    end
  end
end

if allowed == 0 then
  return {0, 0, retry_ms}
end

for i = 1, count do
  local window_ms = tonumber(ARGV[3 + ((i - 1) * 2)])
  local limit = tonumber(ARGV[4 + ((i - 1) * 2)])
  local key = KEYS[i]

  redis.call('ZADD', key, now, request_id .. ':' .. i)
  redis.call('PEXPIRE', key, window_ms)
  remaining = limit
end

return {1, math.max(0, remaining - 1), 0}
`;

const DEFAULT_LIMITS = [
  {
    name: 'ip-minute',
    limit: 8,
    windowSeconds: 60,
  },
  {
    name: 'ip-hour',
    limit: 40,
    windowSeconds: 60 * 60,
  },
  {
    name: 'fingerprint',
    limit: 2,
    windowSeconds: 15,
  },
  {
    name: 'global-minute',
    limit: 120,
    windowSeconds: 60,
  },
];

function hashIdentifier(value) {
  const secret =
    process.env.RATE_LIMIT_HASH_SECRET ||
    'portfolio-judge0-rate-limit-v1';

  return createHash('sha256')
    .update(secret)
    .update(':')
    .update(String(value || ''))
    .digest('hex');
}

export function getClientIp(request) {
  const value =
    request.headers['x-vercel-forwarded-for'] ||
    request.headers['x-forwarded-for'] ||
    request.headers['x-real-ip'] ||
    '';

  const first =
    String(value)
      .split(',')[0]
      .trim();

  return first || 'unknown';
}

export function fingerprintJudgeRequest({
  sourceCode,
  stdin,
  languageId,
}) {
  return hashIdentifier(
    String(languageId) +
      ':' +
      String(sourceCode || '') +
      ':' +
      String(stdin || '')
  );
}

export async function consumeJudge0RateLimit({
  ip,
  fingerprint,
}) {
  const redis = await getRedis();
  const now = Date.now();
  const requestId = randomUUID();

  const ipHash = hashIdentifier(ip);
  const keys = [
    'portfolio:judge0:rl:v1:ip:m:' + ipHash,
    'portfolio:judge0:rl:v1:ip:h:' + ipHash,
    'portfolio:judge0:rl:v1:fingerprint:' +
      hashIdentifier(fingerprint),
    'portfolio:judge0:rl:v1:global:m',
  ];

  const args = [String(now), requestId];

  for (const item of DEFAULT_LIMITS) {
    args.push(
      String(item.windowSeconds * 1000),
      String(item.limit)
    );
  }

  const result = await redis.eval(
    LUA_RATE_LIMIT,
    {
      keys,
      arguments: args,
    }
  );

  const allowed =
    Number(result?.[0] || 0) === 1;

  const retryAfterMs =
    Math.max(
      0,
      Number(result?.[2] || 0)
    );

  const minuteLimit =
    DEFAULT_LIMITS[0].limit;

  const approximateRemaining = Math.max(
    0,
    minuteLimit -
      Number(result?.[1] || 0)
  );

  return {
    allowed,
    limit: minuteLimit,
    remaining: allowed
      ? approximateRemaining
      : 0,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil(retryAfterMs / 1000)
    ),
  };
}

export function rateLimitKeyPreview(ip) {
  return hashIdentifier(ip).slice(0, 16);
}
