// Reject SPA/login/proxy HTML before it can masquerade as API data.
export async function readApiJson(response) {
  const type = response.headers.get('content-type') || '';
  const location = response.url ? new URL(response.url).origin + new URL(response.url).pathname : 'API endpoint';
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(type)) {
    throw new Error(`${location} returned ${type || 'an unknown content type'} (HTTP ${response.status}), not JSON. Check the private API URL/proxy; it may point to the frontend or a login page.`);
  }
  try { return await response.json(); }
  catch { throw new Error(`${location} returned invalid JSON (HTTP ${response.status}).`); }
}

export function validateContent(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)) {
    throw new Error('The endpoint did not return portfolio content. Use the private content API, not the Vercel public-services API.');
  }
  return data;
}

export function serviceAvailable(kind, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) return false;
  if (kind === 'private') return data.ok === true && data.service === 'portfolio-private-admin-api';
  if (kind === 'online') return data.ok === true && data.service === 'portfolio-online-services';
  if (kind === 'integration') return data.configured === true && data.reachable === true;
  if (kind === 'ai') return data.deepseekConfigured === true || data.backupConfigured === true;
  if (kind === 'drive') return Array.isArray(data.folders);
  return false;
}
