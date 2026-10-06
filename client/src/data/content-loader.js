import fs from 'node:fs';
import path from 'node:path';

const CONTENT_CANDIDATES = [
  path.resolve(process.cwd(), 'public/content.json'),
  path.resolve(process.cwd(), 'client/public/content.json'),
];

export function loadInitialContent() {
  const contentPath = CONTENT_CANDIDATES.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!contentPath) {
    throw new Error(
      'client/public/content.json could not be found from the Astro build root.'
    );
  }

  return JSON.parse(fs.readFileSync(contentPath, 'utf8'));
}
