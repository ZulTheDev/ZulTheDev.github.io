/*
 * Resilient chat transport.
 *
 * Tries each backend in order and NEVER throws. A backend that answers with a
 * 5xx, times out or is unreachable is put on a short cool-down ("circuit
 * breaker") so a broken API is not hammered on every message.
 *
 * Result shapes:
 *   { type: 'reply', reply, base }       live AI answered
 *   { type: 'rejected', message }        server refused THIS message (400/429);
 *                                        retrying elsewhere would not help
 *   { type: 'unavailable', reason }      every backend is down -> use fallback
 */

const COOL_DOWN_MS = 60_000;
const TIMEOUT_MS = 25_000;
const breaker = new Map(); // base -> timestamp until which it is skipped

const REJECTION_TEXT = {
  message_required: 'Please type a question first.',
  message_too_long: 'That message is too long. Please keep it under 2000 characters.',
  portfolio_identity_mismatch: 'The chat could not verify the portfolio data. Please refresh the page.',
};

export function isCoolingDown(base, now = Date.now()) {
  return (breaker.get(base) || 0) > now;
}

export function resetBreaker() {
  breaker.clear();
}

export function allBackendsCoolingDown(bases, now = Date.now()) {
  return bases.length > 0 && bases.every((base) => isCoolingDown(base, now));
}

async function callBackend(base, payload, { fetchImpl, timeoutMs, signal }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetchImpl(base.replace(/\/+$/, '') + '/api/chat', {
      method: 'POST',
      // text/plain is CORS-safelisted: no preflight needed for this POST.
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function requestChatReply({
  bases,
  payload,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = TIMEOUT_MS,
  signal,
  now = () => Date.now(),
}) {
  let lastReason = 'no_backend';

  for (const base of bases) {
    if (isCoolingDown(base, now())) {
      lastReason = 'cooling_down';
      continue;
    }

    try {
      const { ok, status, data } = await callBackend(base, payload, { fetchImpl, timeoutMs, signal });

      if (ok && typeof data?.reply === 'string' && data.reply.trim()) {
        return { type: 'reply', reply: data.reply, base };
      }

      // The server understood the request and refused it: do not retry.
      if (status === 429) {
        return { type: 'rejected', message: 'Too many questions in a short time. Please wait a moment and try again.' };
      }
      if (status === 400 || status === 413) {
        return { type: 'rejected', message: REJECTION_TEXT[data?.error] || 'The chat could not accept that message.' };
      }

      // 5xx, 404, empty reply, etc. -> this backend is unhealthy.
      lastReason = `http_${status}`;
      breaker.set(base, now() + COOL_DOWN_MS);
    } catch (error) {
      if (signal?.aborted) {
        return { type: 'unavailable', reason: 'aborted' };
      }
      // Network error, CORS block or timeout.
      lastReason = error?.name === 'AbortError' ? 'timeout' : 'network';
      breaker.set(base, now() + COOL_DOWN_MS);
    }
  }

  return { type: 'unavailable', reason: lastReason };
}
