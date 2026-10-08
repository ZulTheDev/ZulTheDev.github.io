import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://zulthedev.github.io',
  base: '/blog',
  outDir: '../dist/blog',
  publicDir: '../public/blog',
  build: {
    format: 'directory',
  },
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
