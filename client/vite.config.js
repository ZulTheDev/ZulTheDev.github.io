import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // This repository is the user GitHub Pages site:
  // https://zulthedev.github.io/
  base: '/',
  plugins: [react()],
});
