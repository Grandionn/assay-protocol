import { loadEnv } from 'vite';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:3000';

  return {
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
          target: apiTarget,
          changeOrigin: true,
        },
        '/agents': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
