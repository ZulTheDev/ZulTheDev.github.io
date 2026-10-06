import { createSign } from 'node:crypto';
import { config } from './config.js';

const MAX_FILES = 80;
const MAX_TOTAL_CHARS = 70000;
const FILE_MAX_CHARS = 16000;
const MAX_KNOWLEDGE_READS = 5;
const MAX_MEDIA_FILES = 250;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

let accessToken = '';
let accessTokenExpiresAt = 0;
let discoveredMediaFolderId = '';
let discoveredMediaFolderAt = 0;

const folderCache = new Map();

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function cleanText(value, limit = 12000) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .slice(0, limit);
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 12000
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(
  url,
  options = {},
  timeoutMs = 12000
) {
  const response = await fetchWithTimeout(
    url,
    options,
    timeoutMs
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Google Drive request failed with HTTP ${response.status}`
    );
  }

  return raw;
}

async function fetchJson(
  url,
  options = {},
  timeoutMs = 12000
) {
  const raw = await fetchText(
    url,
    options,
    timeoutMs
  );

  return raw ? JSON.parse(raw) : {};
}

export async function getAccessToken() {
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
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const tokenResponse = await fetchWithTimeout(
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
    },
    12000
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
          'nextPageToken,files(id,name,mimeType,modifiedTime,description,parents,size)',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const data = await fetchJson(
        'https://www.googleapis.com/drive/v3/files?' +
          params.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

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

function isReadableKnowledgeMime(mimeType) {
  const type = String(mimeType || '');

  return (
    type === 'application/vnd.google-apps.document' ||
    type === 'application/vnd.google-apps.spreadsheet' ||
    type === 'application/vnd.google-apps.presentation' ||
    type.startsWith('text/') ||
    type === 'application/json' ||
    type === 'application/xml'
  );
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
      10000
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

  const terms = String(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);

  const scored = files
    .filter((file) =>
      isReadableKnowledgeMime(file.mimeType)
    )
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
    )
    .slice(0, MAX_KNOWLEDGE_READS);

  const loaded = await Promise.all(
    scored.map(async ({ file }) => {
      try {
        const content = await readFile(
          token,
          file
        );

        if (!content) {
          return null;
        }

        return {
          name: cleanText(file.name, 300),
          mimeType: cleanText(file.mimeType, 200),
          modifiedTime:
            file.modifiedTime || '',
          content,
        };
      } catch (error) {
        console.warn(
          'Drive knowledge file skipped:',
          file.name,
          error?.message || error
        );

        return null;
      }
    })
  );

  const documents = [];
  let totalChars = 0;

  for (const document of loaded) {
    if (!document) {
      continue;
    }

    documents.push(document);
    totalChars += document.content.length;

    if (totalChars >= MAX_TOTAL_CHARS) {
      break;
    }
  }

  return {
    configured: true,
    documents,
  };
}

function isAllowedMediaMime(mimeType) {
  const type = String(mimeType || '').toLowerCase();

  return (
    type.startsWith('image/') ||
    type.startsWith('video/') ||
    type.startsWith('audio/') ||
    type === 'application/pdf'
  );
}

async function getDriveMetadata(token, fileId) {
  if (folderCache.has(fileId)) {
    return folderCache.get(fileId);
  }

  const params = new URLSearchParams({
    fields:
      'id,name,mimeType,modifiedTime,parents,size,trashed',
    supportsAllDrives: 'true',
  });

  const data = await fetchJson(
    'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(fileId) +
      '?' +
      params.toString(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  folderCache.set(fileId, data);
  return data;
}

async function discoverMediaFolderId(token) {
  if (config.drive.mediaFolderId) {
    return config.drive.mediaFolderId;
  }

  if (
    discoveredMediaFolderId &&
    Date.now() - discoveredMediaFolderAt <
      10 * 60 * 1000
  ) {
    return discoveredMediaFolderId;
  }

  const rootFolderId = config.drive.folderId;

  if (!rootFolderId) {
    return '';
  }

  const params = new URLSearchParams({
    q:
      `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    pageSize: '100',
    fields: 'files(id,name,mimeType)',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });

  const data = await fetchJson(
    'https://www.googleapis.com/drive/v3/files?' +
      params.toString(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const mediaFolder = (data.files || []).find(
    (file) =>
      String(file.name || '')
        .trim()
        .toLowerCase() === 'media'
  );

  discoveredMediaFolderId =
    mediaFolder?.id || rootFolderId;
  discoveredMediaFolderAt = Date.now();

  return discoveredMediaFolderId;
}

async function fileIsWithinFolder(
  token,
  file,
  boundaryFolderId
) {
  const queue = [
    ...(Array.isArray(file.parents)
      ? file.parents
      : []),
  ];
  const visited = new Set();
  let depth = 0;

  while (queue.length && depth < 30) {
    const parentId = queue.shift();

    if (
      !parentId ||
      visited.has(parentId)
    ) {
      continue;
    }

    if (parentId === boundaryFolderId) {
      return true;
    }

    visited.add(parentId);
    depth += 1;

    try {
      const parent = await getDriveMetadata(
        token,
        parentId
      );

      for (const nextParent of parent.parents || []) {
        if (!visited.has(nextParent)) {
          queue.push(nextParent);
        }
      }
    } catch {
      // If a parent cannot be inspected, keep checking
      // the remaining known ancestry instead of widening access.
    }
  }

  return false;
}

export async function listDriveMediaFiles() {
  if (!driveKnowledgeConfigured()) {
    return {
      configured: false,
      folderId: '',
      files: [],
    };
  }

  const token = await getAccessToken();
  const mediaFolderId =
    await discoverMediaFolderId(token);

  if (!mediaFolderId) {
    return {
      configured: true,
      folderId: '',
      files: [],
    };
  }

  const queue = [mediaFolderId];
  const files = [];

  while (
    queue.length &&
    files.length < MAX_MEDIA_FILES
  ) {
    const parentId = queue.shift();
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q:
          `'${parentId}' in parents and trashed = false`,
        pageSize: '100',
        fields:
          'nextPageToken,files(id,name,mimeType,modifiedTime,parents,size)',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const data = await fetchJson(
        'https://www.googleapis.com/drive/v3/files?' +
          params.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      for (const file of data.files || []) {
        if (
          file.mimeType ===
          'application/vnd.google-apps.folder'
        ) {
          queue.push(file.id);
          continue;
        }

        if (isAllowedMediaMime(file.mimeType)) {
          files.push({
            id: file.id,
            name: cleanText(file.name, 300),
            mimeType: cleanText(file.mimeType, 120),
            modifiedTime: file.modifiedTime || '',
            size: Number(file.size || 0),
          });
        }

        if (files.length >= MAX_MEDIA_FILES) {
          break;
        }
      }

      pageToken = data.nextPageToken || '';
    } while (
      pageToken &&
      files.length < MAX_MEDIA_FILES
    );
  }

  return {
    configured: true,
    folderId: mediaFolderId,
    files,
  };
}

export async function getDriveMediaFile(fileId) {
  if (!driveKnowledgeConfigured()) {
    const error = new Error('drive_not_configured');
    error.status = 503;
    throw error;
  }

  const id = String(fileId || '').trim();

  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(id)) {
    const error = new Error('invalid_drive_file_id');
    error.status = 400;
    throw error;
  }

  const token = await getAccessToken();
  const boundaryFolderId =
    await discoverMediaFolderId(token);

  const file = await getDriveMetadata(
    token,
    id
  );

  if (
    file.trashed ||
    !isAllowedMediaMime(file.mimeType)
  ) {
    const error = new Error('drive_media_not_found');
    error.status = 404;
    throw error;
  }

  const allowed = await fileIsWithinFolder(
    token,
    file,
    boundaryFolderId
  );

  if (!allowed) {
    const error = new Error('drive_media_not_allowed');
    error.status = 403;
    throw error;
  }

  const size = Number(file.size || 0);

  if (size && size > MAX_MEDIA_BYTES) {
    const error = new Error('drive_media_too_large');
    error.status = 413;
    throw error;
  }

  const response = await fetchWithTimeout(
    'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(id) +
      '?alt=media&supportsAllDrives=true',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    15000
  );

  if (!response.ok) {
    const error = new Error(
      `drive_media_http_${response.status}`
    );
    error.status =
      response.status === 404
        ? 404
        : 502;
    throw error;
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.length > MAX_MEDIA_BYTES) {
    const error = new Error('drive_media_too_large');
    error.status = 413;
    throw error;
  }

  return {
    buffer,
    id,
    name: cleanText(file.name, 300),
    mimeType:
      cleanText(
        file.mimeType,
        120
      ) ||
      'application/octet-stream',
    modifiedTime: file.modifiedTime || '',
    size: buffer.length,
  };
}
