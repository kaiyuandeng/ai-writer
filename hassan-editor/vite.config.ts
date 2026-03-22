import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 7710,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:7771',
      '/compiled': 'http://localhost:7771',
    },
  },
  appType: 'spa',
});
