import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 9000,
    proxy: {
      '/api': 'http://localhost:9001',
      '/compiled': 'http://localhost:9001',
    },
  },
  appType: 'spa',
});
