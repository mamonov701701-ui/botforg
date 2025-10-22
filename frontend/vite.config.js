import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    historyApiFallback: true,
    proxy: {
      '/blocks': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        credentials: 'include'
      },
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        credentials: 'include'
      },
      '/me': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        credentials: 'include'
      }
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@application': path.resolve(__dirname, './src/application'),
    },
  },
}); 