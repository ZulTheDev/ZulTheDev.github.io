import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(
  fileURLToPath(import.meta.url)
);

const assetRoot = path.join(
  here,
  'assets'
);

const outputRoot = path.join(
  here,
  'public',
  'images'
);

const assets = [
  {
    name:
      'blog-hero-sakura-catgirl.webp',
    parts: [
      'blog-hero-sakura-catgirl.b64.part1',
      'blog-hero-sakura-catgirl.b64.part2',
      'blog-hero-sakura-catgirl.b64.part3',
    ],
  },
  {
    name:
      'blog-clueless-cat.webp',
    parts: [
      'blog-clueless-cat.b64.part1',
      'blog-clueless-cat.b64.part2',
    ],
  },
];

await fs.mkdir(
  outputRoot,
  { recursive: true }
);

for (const asset of assets) {
  const chunks =
    await Promise.all(
      asset.parts.map(
        (part) =>
          fs.readFile(
            path.join(
              assetRoot,
              part
            ),
            'utf8'
          )
      )
    );

  const encoded =
    chunks
      .join('')
      .replace(/\s+/g, '');

  if (
    !encoded ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      encoded
    )
  ) {
    throw new Error(
      'Invalid blog image data: ' +
        asset.name
    );
  }

  const buffer =
    Buffer.from(
      encoded,
      'base64'
    );

  if (
    buffer.length < 1000 ||
    buffer
      .subarray(0, 4)
      .toString('ascii') !== 'RIFF' ||
    buffer
      .subarray(8, 12)
      .toString('ascii') !== 'WEBP'
  ) {
    throw new Error(
      'Decoded blog image is not WebP: ' +
        asset.name
    );
  }

  const outputPath =
    path.join(
      outputRoot,
      asset.name
    );

  await fs.writeFile(
    outputPath,
    buffer
  );

  console.log(
    'Built ' +
      asset.name +
      ' (' +
      buffer.length +
      ' bytes)'
  );
}
