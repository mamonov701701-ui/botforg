import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Должен совпадать с портом uvicorn при ручном запуске (см. docs/DEV_PORTS.md).
// Скрипт scripts/start-dev.ps1 задаёт BOTFORG_BACKEND_PORT явно.
const backendPort = Number(process.env.BOTFORG_BACKEND_PORT || '8001');
const backendTarget = `http://localhost:${backendPort}`;

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
    // Backend API (см. proxy ниже): http://localhost:${BOTFORG_BACKEND_PORT|8001}
    host: '0.0.0.0',
    port: 5173,
    // Иначе при занятом 5173 Vite уходит на 5174, а start-dev.ps1 и документация ждут только 5173
    strictPort: true,
    cors: true,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/dev': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/blocks': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/me': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/bots': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/scenarios': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/analytics': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/chat': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/legal': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/privacy': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/plans': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: backendTarget,
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
