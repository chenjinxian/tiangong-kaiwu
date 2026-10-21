import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // link: 包不做预打包（brief 钉死项）；@itwin/core-frontend 为 DevViewerRoute
    // 就绪态回退读取通道，按 apps/web 先例排除（esm 产物源码直服）。
    exclude: ['@luban-cad/viewer-next', '@luban-cad/shared', '@itwin/core-frontend'],
  },
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
