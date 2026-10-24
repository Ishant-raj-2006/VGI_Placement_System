import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :5000 and is proxied, so the browser sees a single origin (no CORS setup needed).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, _req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: { code: 'API_UNAVAILABLE', message: 'The API server is unavailable. Start the backend and try again.' },
              }));
            }
          });
        },
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
