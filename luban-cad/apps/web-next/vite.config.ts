import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // link: 包不做预打包（brief 钉死项）；@itwin/core-frontend 为 DevViewerRoute
    // 就绪态回退读取通道，按 apps/web 先例排除（esm 产物源码直服）。
    // M6-a T5：core-geometry/core-common 同 link: 口径一并排除（草图工具链依赖）。
    exclude: ['@luban-cad/viewer-next', '@luban-cad/shared', '@itwin/core-frontend', '@itwin/core-geometry', '@itwin/core-common'],
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
      // M3-T1：modeling-server (:5401) 同源代理。MS 的 CORS 单源钉死
      // FRONTEND_URL=http://localhost:5300（dist-backend/modeling-server/dist/
      // main.js cors({ origin: config.FRONTEND_URL })），web-next :5310 直连
      // HTTP/WS 必被拦——改走同源代理，DevViewerRoute 的 backendUrl 相应
      // 改传 window.location.origin。前缀取证于 main.js Express 注册：
      // - /ipc（express-ws，LocalhostIpcHost 的 BriefcaseConnection 通道，
      //   viewer-next buildUrlForSocket 拼 ws://<origin>/ipc）；
      // - /ws（进度广播通道，verifyClient 同样鉴 JWT）；
      // - /rpc/metadata（OpenAPI bootstrap，HTTP）；
      // - /api/*（/api/imodels/:id/progress 等用户态查询面）。
      // 注：HTTP RPC 面 `/:title/:version/mode/*` 前端不使用（实际 RPC 全走
      // /ipc WS，main.js 注记），不挂代理。
      '/ipc': { target: 'ws://localhost:5401', ws: true, changeOrigin: true, secure: false },
      '/ws': { target: 'ws://localhost:5401', ws: true, changeOrigin: true, secure: false },
      '/rpc': { target: 'http://localhost:5401', changeOrigin: true, secure: false },
      '/api': { target: 'http://localhost:5401', changeOrigin: true, secure: false },
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
    // e2e/*.spec.ts 是 Playwright 套件（独立 config playwright.config.ts）——
    // vitest 缺省 include 收 *.spec.* 会把它们当单测收集、集间即红（M5-T5 起
    // 在场，M5-T7 perf 探针入 e2e 时一并钉死排除面）。缺省排除面保留
    //（M-2：configDefaults 展开而非整体替换）。
    exclude: [...configDefaults.exclude, 'e2e/**', 'playwright/**', 'test-results/**'],
  },
});
