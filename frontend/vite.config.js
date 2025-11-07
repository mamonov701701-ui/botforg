import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'disable-host-check',
      configureServer(server) {
        // Отключаем проверку хоста для туннелей
        server.middlewares.use((req, res, next) => {
          delete req.headers['host'];
          req.headers['host'] = 'localhost:5173';
          next();
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    proxy: {
      '/blocks': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/me': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/scenarios': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
