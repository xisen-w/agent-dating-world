import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /auth and /api are served by the BFF (server/) so session cookies stay
// same-origin during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/auth': 'http://localhost:8787',
      '/api': 'http://localhost:8787',
    },
  },
});
