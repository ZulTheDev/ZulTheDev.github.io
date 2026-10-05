import { config } from './config.js';

export function r2Configured() {
  return Boolean(
    config.r2.publicBaseUrl ||
      (config.r2.accountId &&
        config.r2.accessKeyId &&
        config.r2.secretAccessKey &&
        config.r2.bucketName)
  );
}

export function r2PublicUrl(objectKey = '') {
  const base = config.r2.publicBaseUrl;
  if (!base) {
    return '';
  }

  const cleanBase = base.replace(/\\/$/, '');
  const cleanKey = String(objectKey)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return cleanKey
    ? `${cleanBase}/${cleanKey}`
    : cleanBase;
}
