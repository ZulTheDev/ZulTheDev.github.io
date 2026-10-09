import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.ADMIN_PROXY_TARGET || 'http://127.0.0.1:8787',
          changeOrigin: true,
          configure(proxy) {
            proxy.on('error', (_error, _request, response) => {
              if (!response.headersSent && typeof response.writeHead === 'function') {
                response.writeHead(502, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ error: 'private_api_unreachable', message: 'Start server with npm run dev, or check ADMIN_PROXY_TARGET.' }));
              }
            });
          },
        },
      },
    },
  };
});
