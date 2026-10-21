import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5310,
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/itwins': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/imodels': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/accesscontrol': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/users': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/files': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
    },
  },
  resolve: {
    alias: {
      '@app': '/src/app',
      '@config': '/src/config',
      '@clients': '/src/clients',
      '@common': '/src/common',
      '@components': '/src/components',
      '@modules': '/src/modules',
      '@routes': '/src/routes',
      '@styles': '/src/styles',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});
