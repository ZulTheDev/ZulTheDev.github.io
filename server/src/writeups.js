import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  githubAppConfigured,
  publishFilesWithGitHubApp,
} from './github-app.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const writeupDraftDir = path.join(repoRoot, 'server', 'writeups');
export const writeupPublishDir = path.join(repoRoot, 'client', 'public', 'ctf_blog');

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function safeSlug(value) {
  const slug = slugify(value);
  if (!slug) throw new Error('invalid_writeup_slug');
  return slug;
}

export async function ensureWriteupDirs() {
  await fs.mkdir(writeupDraftDir, { recursive: true });
  await fs.mkdir(writeupPublishDir, { recursive: true });
}

export async function saveDraft(writeup) {
  await ensureWriteupDirs();
  const slug = safeSlug(writeup.slug || writeup.title);
  const file = path.join(writeupDraftDir, slug + '.json');
  await fs.writeFile(file, JSON.stringify(writeup, null, 2) + '\n', 'utf8');
  return { slug, file };
}

export async function readDraft(slug) {
  await ensureWriteupDirs();
  const file = path.join(writeupDraftDir, safeSlug(slug) + '.json');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function listDrafts() {
  await ensureWriteupDirs();
  const entries = await fs.readdir(writeupDraftDir, { withFileTypes: true });
  const drafts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      drafts.push(JSON.parse(await fs.readFile(path.join(writeupDraftDir, entry.name), 'utf8')));
    } catch {}
  }

  return drafts.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function deleteDraft(slug) {
  await ensureWriteupDirs();
  await fs.rm(path.join(writeupDraftDir, safeSlug(slug) + '.json'), { force: true });
}

async function readPublishedIndex() {
  await ensureWriteupDirs();
  try {
    return JSON.parse(await fs.readFile(path.join(writeupPublishDir, 'index.json'), 'utf8'));
  } catch {
    return { version: 1, writeups: [] };
  }
}

async function deployPublishedWriteup(title, files) {
  const githubAppAutoPush =
    String(process.env.GITHUB_APP_AUTO_PUSH || '')
      .toLowerCase() === 'true';

  if (!githubAppAutoPush) {
    return {
      pushed: false,
      provider: 'github-app',
      message:
        'Published locally. Set GITHUB_APP_AUTO_PUSH=true to publish through the GitHub App.',
    };
  }

  if (!githubAppConfigured()) {
    return {
      pushed: false,
      provider: 'github-app',
      message:
        'Published locally, but the GitHub App is not configured on the local server.',
    };
  }

  try {
    return await publishFilesWithGitHubApp({
      title,
      files,
    });
  } catch (error) {
    console.error(
      'GitHub App publish error:',
      error?.message || error
    );

    return {
      pushed: false,
      provider: 'github-app',
      error:
        error?.message ||
        'github_app_publish_failed',
      message:
        'Published locally, but GitHub App publishing failed.',
    };
  }
}

export async function publishWriteup(writeup) {
  await ensureWriteupDirs();

  const slug = safeSlug(writeup.slug || writeup.title);
  const publicBase =
    String(process.env.R2_PUBLIC_BASE_URL || '')
      .trim()
      .replace(/\/+$/, '');

  const next = {
    ...writeup,
    slug,
    status: 'published',
    publishedAt: writeup.publishedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (Array.isArray(next.blocks)) {
    next.blocks = next.blocks.map((block) => {
      if (
        block?.type !== 'media' ||
        !block.media ||
        !block.media.key ||
        block.media.url
      ) {
        return block;
      }

      if (!publicBase) {
        throw new Error(
          'r2_public_base_url_required'
        );
      }

      return {
        ...block,
        media: {
          ...block.media,
          url: publicBase + '/' + block.media.key,
        },
      };
    });
  }

  const publishedWriteupPath =
    'client/public/ctf_blog/' +
    slug +
    '.json';

  const publishedWriteupContent =
    JSON.stringify(next, null, 2) + '\n';

  await fs.writeFile(
    path.join(writeupPublishDir, slug + '.json'),
    publishedWriteupContent,
    'utf8'
  );

  const index = await readPublishedIndex();
  const existing = Array.isArray(index.writeups) ? index.writeups : [];
  const summary = {
    slug,
    title: next.title || slug,
    excerpt: next.excerpt || '',
    tags: Array.isArray(next.tags) ? next.tags : [],
    updatedAt: next.updatedAt,
    publishedAt: next.publishedAt,
  };

  const filtered = existing.filter((item) => item.slug !== slug);
  filtered.push(summary);
  filtered.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const publishedIndexContent =
    JSON.stringify(
      { version: 1, writeups: filtered },
      null,
      2
    ) + '\n';

  await fs.writeFile(
    path.join(writeupPublishDir, 'index.json'),
    publishedIndexContent,
    'utf8'
  );

  const deploy = await deployPublishedWriteup(
    next.title,
    [
      {
        path: publishedWriteupPath,
        content: publishedWriteupContent,
      },
      {
        path: 'client/public/ctf_blog/index.json',
        content: publishedIndexContent,
      },
    ]
  );

  return {
    ...next,
    deploy,
  };
}

export function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

function r2Client() {
  if (!r2Configured()) throw new Error('r2_not_configured');

  return new S3Client({
    region: 'auto',
    endpoint: 'https://' + process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function safeR2Key(value) {
  const key = String(value || '').trim().replace(/^\/+/, '');
  const isCurrent = key.startsWith('ctf_blog/');
  const isLegacy = key.startsWith('ctf-blog/');

  if (
    !key ||
    key.includes('..') ||
    (!isCurrent && !isLegacy)
  ) {
    throw new Error('invalid_r2_key');
  }

  return key;
}

export function safeR2Prefix(value = 'ctf_blog/') {
  const prefix = String(value || '').trim().replace(/^\/+/, '');
  const isCurrent =
    prefix === 'ctf_blog/' ||
    prefix.startsWith('ctf_blog/');
  const isLegacy =
    prefix === 'ctf-blog/' ||
    prefix.startsWith('ctf-blog/');

  if (
    !prefix ||
    prefix.includes('..') ||
    (!isCurrent && !isLegacy)
  ) {
    throw new Error('invalid_r2_prefix');
  }

  return prefix;
}

export async function checkR2Connection() {
  await r2Client().send(
    new HeadBucketCommand({
      Bucket: process.env.R2_BUCKET_NAME,
    })
  );

  return true;
}

export async function createUploadUrl({ key, contentType, expiresIn = 3600 }) {
  const safeKey = safeR2Key(key);

  return getSignedUrl(
    r2Client(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: safeKey,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

export async function createReadUrl({ key, expiresIn = 900 }) {
  const safeKey = safeR2Key(key);

  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: safeKey,
    }),
    { expiresIn }
  );
}

export async function deleteR2Object(key) {
  const safeKey = safeR2Key(key);

  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: safeKey,
    })
  );

  return { key: safeKey };
}

export function r2PublicUrl(key) {
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');

  if (!publicBase) return '';

  return publicBase + '/' +
    safeR2Key(key)
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
}

export async function listR2Objects(prefix = 'ctf_blog/') {
  const safePrefix = safeR2Prefix(prefix);

  const result = await r2Client().send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: safePrefix,
      MaxKeys: 1000,
    })
  );

  return Array.isArray(result.Contents)
    ? result.Contents.map((item) => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
      }))
    : [];
}
