import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const writeupDraftDir = path.resolve(process.cwd(), 'server', 'writeups');
export const writeupPublishDir = path.resolve(process.cwd(), 'client', 'public', 'ctf-blog');

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

export async function publishWriteup(writeup) {
  await ensureWriteupDirs();

  const slug = safeSlug(writeup.slug || writeup.title);
  const next = {
    ...writeup,
    slug,
    status: 'published',
    publishedAt: writeup.publishedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(writeupPublishDir, slug + '.json'),
    JSON.stringify(next, null, 2) + '\n',
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

  await fs.writeFile(
    path.join(writeupPublishDir, 'index.json'),
    JSON.stringify({ version: 1, writeups: filtered }, null, 2) + '\n',
    'utf8'
  );

  return next;
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

export async function createUploadUrl({ key, contentType, expiresIn = 3600 }) {
  return getSignedUrl(
    r2Client(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

export async function createReadUrl({ key, expiresIn = 3600 }) {
  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }),
    { expiresIn }
  );
}

export async function listR2Objects(prefix = '') {
  const result = await r2Client().send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: prefix,
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
