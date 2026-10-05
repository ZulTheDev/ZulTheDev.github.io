import { createSign } from 'node:crypto';
import { config } from './config.js';

const MAX_FILES = 80;
const MAX_TOTAL_CHARS = 90000;
const FILE_MAX_CHARS = 18000;

let accessToken = '';
let accessTokenExpiresAt = 0;

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\\+/g, '-')
    .replace(/\\//g, '_')
    .replace(/=+$/g, '');
}

function cleanText(value, limit = 12000) {
  return String(value ?? '')
    .replace(/\\u0000/g, '')
    .replace(/\\r/g, '')
    .slice(0, limit);
}

async function fetchText(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(
        `Google Drive request failed with HTTP ${response.status}`
      );
    }

    return raw;
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken() {
  if (
    accessToken &&
    Date.now() < accessTokenExpiresAt
  ) {
    return accessToken;
  }

  const {
    serviceAccountEmail,
    privateKey,
  } = config.drive;

  if (!serviceAccountEmail || !privateKey) {
    return '';
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
    })
  );
  const claim = base64url(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope:
        'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: issuedAt,
      exp: issuedAt + 3600,
    })
  );

  const unsignedToken = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(privateKey)
    .toString('base64')
    .replace(/\\+/g, '-')
    .replace(/\\//g, '_')
    .replace(/=+$/g, '');

  const tokenResponse = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:
          'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion:
          `${unsignedToken}.${signature}`,
      }),
    }
  );

  const tokenData = await tokenResponse
    .json()
    .catch(() => ({}));

  if (
    !tokenResponse.ok ||
    !tokenData.access_token
  ) {
    throw new Error(
      'Google service-account authentication failed.'
    );
  }

  accessToken = tokenData.access_token;
  accessTokenExpiresAt =
    Date.now() +
    Math.max(
      60,
      Number(tokenData.expires_in || 3600) - 60
    ) *
      1000;

  return accessToken;
}

async function listDriveFiles(token, rootFolderId) {
  const discovered = [];
  const queue = [rootFolderId];

  while (
    queue.length &&
    discovered.length < MAX_FILES
  ) {
    const parentId = queue.shift();
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q:
          `'${parentId}' in parents and trashed = false`,
        pageSize: '100',
        fields:
          'nextPageToken,files(id,name,mimeType,modifiedTime,description)',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const raw = await fetchText(
        'https://www.googleapis.com/drive/v3/files?' +
          params.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = JSON.parse(raw);

      for (const file of data.files || []) {
        if (
          file.mimeType ===
          'application/vnd.google-apps.folder'
        ) {
          queue.push(file.id);
          continue;
        }

        discovered.push(file);

        if (discovered.length >= MAX_FILES) {
          break;
        }
      }

      pageToken = data.nextPageToken || '';
    } while (
      pageToken &&
      discovered.length < MAX_FILES
    );
  }

  return discovered;
}

async function readFile(token, file) {
  const mimeType = String(file.mimeType || '');
  let url = '';

  if (
    mimeType ===
    'application/vnd.google-apps.document'
  ) {
    url =
      'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(file.id) +
      '/export?mimeType=text/plain';
  } else if (
    mimeType ===
    'application/vnd.google-apps.spreadsheet'
  ) {
    url =
      'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(file.id) +
      '/export?mimeType=text/csv';
  } else if (
    mimeType ===
    'application/vnd.google-apps.presentation'
  ) {
    url =
      'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(file.id) +
      '/export?mimeType=text/plain';
  } else if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  ) {
    url =
      'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(file.id) +
      '?alt=media';
  } else {
    return '';
  }

  return cleanText(
    await fetchText(
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      12000
    ),
    FILE_MAX_CHARS
  );
}

export function driveKnowledgeConfigured() {
  return Boolean(
    config.drive.folderId &&
      config.drive.serviceAccountEmail &&
      config.drive.privateKey
  );
}

export async function loadDriveKnowledge(query = '') {
  if (!driveKnowledgeConfigured()) {
    return {
      configured: false,
      documents: [],
    };
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error(
      'Google Drive is configured but could not authenticate.'
    );
  }

  const files = await listDriveFiles(
    token,
    config.drive.folderId
  );
  const documents = [];
  let totalChars = 0;

  const terms = String(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);

  const scored = files
    .map((file) => {
      const haystack =
        `${file.name} ${file.description || ''}`.toLowerCase();

      const score = terms.reduce(
        (total, term) =>
          total +
          (haystack.includes(term) ? 1 : 0),
        0
      );

      return { file, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.file.name.localeCompare(b.file.name)
    );

  for (const { file } of scored) {
    try {
      const content = await readFile(
        token,
        file
      );

      if (!content) {
        continue;
      }

      documents.push({
        name: cleanText(file.name, 300),
        mimeType: cleanText(file.mimeType, 200),
        modifiedTime:
          file.modifiedTime || '',
        content,
      });

      totalChars += content.length;

      if (totalChars >= MAX_TOTAL_CHARS) {
        break;
      }
    } catch (error) {
      console.warn(
        'Drive knowledge file skipped:',
        file.name,
        error?.message || error
      );
    }
  }

  return {
    configured: true,
    documents,
  };
}
