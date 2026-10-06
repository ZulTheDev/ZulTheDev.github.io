const text = (value) => String(value ?? '').trim();

export const PORTFOLIO_DRIVE_SCOPE_ID =
  '10XU8zeRpx9Ladh501vWjZepzm0j7ZOq6';

export const config = Object.freeze({
  portfolioId: 'zulfaqar-jamal',
  portfolioName: 'Zulfaqar Jamal',
  siteContentUrl:
    text(process.env.PORTFOLIO_CONTENT_URL) ||
    'https://zulthedev.github.io/content.json',

  deepseek: {
    apiKey: text(process.env.DEEPSEEK_API_KEY),
    model:
      text(process.env.DEEPSEEK_MODEL) ||
      'deepseek-chat',
    baseUrl:
      text(process.env.DEEPSEEK_BASE_URL) ||
      'https://api.deepseek.com',
  },

  drive: {
    // Deliberately fixed to one approved portfolio folder.
    // Environment variables cannot widen the AI's Drive scope.
    folderId: PORTFOLIO_DRIVE_SCOPE_ID,
    mediaFolderId:
      text(process.env.GOOGLE_DRIVE_MEDIA_FOLDER_ID),
    serviceAccountEmail:
      text(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    privateKey:
      String(
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ''
      ).replace(/\\n/g, '\n'),
  },

  redis: {
    url: text(process.env.REDIS_URL),
  },

  r2: {
    accountId: text(process.env.R2_ACCOUNT_ID),
    accessKeyId: text(process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: text(process.env.R2_SECRET_ACCESS_KEY),
    bucketName: text(process.env.R2_BUCKET_NAME),
    publicBaseUrl: text(process.env.R2_PUBLIC_BASE_URL),
  },

  judge0: {
    url: text(process.env.JUDGE0_URL),
  },

  clientOrigin:
    text(process.env.CLIENT_ORIGIN) ||
    'https://zulthedev.github.io',
});

export const integrationStatus = Object.freeze({
  redisConfigured: Boolean(config.redis.url),
  chatbot: Boolean(config.deepseek.apiKey),
  driveKnowledge: Boolean(
    config.drive.folderId &&
      config.drive.serviceAccountEmail &&
      config.drive.privateKey
  ),
  r2Configured: Boolean(
    config.r2.publicBaseUrl ||
      (config.r2.accountId &&
        config.r2.accessKeyId &&
        config.r2.secretAccessKey &&
        config.r2.bucketName)
  ),
  judge0Configured: Boolean(config.judge0.url),
});
