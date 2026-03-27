import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@artifacts': path.resolve(__dirname, '../artifacts'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/discover': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/agents': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
