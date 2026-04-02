import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
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
            !req.url.startsWith('/scenarios') &&
            !req.url.startsWith('/chat') &&
            !req.url.startsWith('/legal') &&
            !req.url.startsWith('/privacy')
          ) {
            req.headers['host'] = 'localhost:5173';
          }
          next();
        });
      },
    },
  ],
  server: {
    // ВАЖНО: dev-порты синхронизированы с docs/DEV_PORTS.md
    // Frontend: http://localhost:5173
    // Backend API (см. proxy ниже): http://localhost:8001
    host: '0.0.0.0',
    port: 5173,
    // Иначе при занятом 5173 Vite уходит на 5174, а start-dev.ps1 и документация ждут только 5173
    strictPort: true,
    cors: true,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
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
      '/chat': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/legal': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/privacy': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/plans': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
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
