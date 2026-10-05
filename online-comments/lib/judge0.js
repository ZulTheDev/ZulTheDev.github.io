import { config } from './config.js';

export function judge0Configured() {
  return Boolean(config.judge0.url);
}

export async function submitCode(payload) {
  if (!judge0Configured()) {
    throw new Error('judge0_not_configured');
  }

  const base = config.judge0.url.replace(
    /\\/$/,
    ''
  );

  const response = await fetch(
    base + '/submissions?wait=true',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `judge0_upstream_${response.status}`
    );
  }

  return data;
}
