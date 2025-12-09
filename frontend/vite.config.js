import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'disable-host-check',
      configureServer(server) {
        // Отключаем проверку хоста для туннелей
        // Важно: выполняется ДО прокси, не влияет на проксированные запросы
        server.middlewares.use((req, res, next) => {
          // Подменяем host только для статических файлов, не для API
          if (
            !req.url.startsWith('/api') &&
            !req.url.startsWith('/auth') &&
            !req.url.startsWith('/me') &&
            !req.url.startsWith('/bots') &&
            !req.url.startsWith('/analytics') &&
            !req.url.startsWith('/blocks') &&
            !req.url.startsWith('/scenarios')
          ) {
            req.headers['host'] = 'localhost:5173';
          }
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
        secure: false,
      },
      '/auth': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/me': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/bots': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/scenarios': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/analytics': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
