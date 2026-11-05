import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

const appDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 2026-11-05 官方 ViewCube：iTwin AppUI SCSS 使用 webpack 风格 `~@itwin/...`
 * 导入（如 `@itwin/core-react/lib/core-react/base/base`）。Vite 的 Sass 编译器
 * 不认识 `~`，直接 500。这里按包内真实布局解析到 `.scss` 文件（sass 条件导出
 * 的 `lib/*` 映射），不改 node_modules。
 */
function findSassTildeImport(url: string): URL | null {
  if (!url.startsWith('~')) return null;
  const target = path.join(appDir, 'node_modules', url.slice(1));
  const candidates = [
    `${target}.scss`,
    `${target}.sass`,
    path.join(target, 'index.scss'),
    path.join(path.dirname(target), `_${path.basename(target)}.scss`),
    target,
  ];
  const file = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  return file ? pathToFileURL(file) : null;
}

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        importers: [{ findFileUrl: findSassTildeImport }],
      },
    },
  },
  optimizeDeps: {
    // link: 包不做预打包（brief 钉死项）；@itwin/core-frontend 为 DevViewerRoute
    // 就绪态回退读取通道，按 apps/web 先例排除（esm 产物源码直服）。
    // M6-a T5：core-geometry/core-common 同 link: 口径一并排除（草图工具链依赖）。
    exclude: [
      '@luban-cad/viewer',
      '@luban-cad/shared',
      '@itwin/core-frontend',
      '@itwin/core-geometry',
      '@itwin/core-common',
      // 2026-11-05 官方 ViewCube：AppUI 组件（imodel-components-react 等）仍由
      // Vite 预打包（其 CJS 依赖 classnames 等是 pnpm 传递依赖，直服会缺
      // default 导出）；但 core-* 保持排除，esbuild 将其 external 到 link: 源码，
      // 保证 Matrix3d/UiEvent/Viewport 与主应用同实例。默认 onshape 模式不 import
      // 官方组件，因此不触发这条预打包链。
    ],
  },
  server: {
    // C2 退役（2026-10-26）：新 web 迁入 :5300（旧 apps/web 删除，docs/PORTS.md 既定方案；
    // 过渡期暂驻的 :5310 退役）。
    port: 5300,
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
      // main.js cors({ origin: config.FRONTEND_URL })）——C2 迁入 :5300 后 dev 恰与
      // 钉死值同源，但同源代理姿态仍保持（部署形态恒经代理，不做 dev 直连特例）。
      // 前缀取证于 main.js Express 注册：
      // - /ipc（express-ws，LocalhostIpcHost 的 BriefcaseConnection 通道，
      //   viewer buildUrlForSocket 拼 ws://<origin>/ipc）；
      // - /ws（进度广播通道，verifyClient 同样鉴 JWT）；
      // - /rpc/metadata（OpenAPI bootstrap，HTTP）；
      // - /api/*（/api/imodels/:id/progress 等用户态查询面）。
      // 注：HTTP RPC 面 `/:title/:version/mode/*` 前端不使用（实际 RPC 全走
      // /ipc WS，main.js 注记），不挂代理。
      '/ipc': { target: 'ws://localhost:5401', ws: true, changeOrigin: true, secure: false },
      '/ws': { target: 'ws://localhost:5401', ws: true, changeOrigin: true, secure: false },
      '/rpc': { target: 'http://localhost:5401', changeOrigin: true, secure: false },
      '/api': { target: 'http://localhost:5401', changeOrigin: true, secure: false },
      // P2.8 tile cache：与部署 nginx 同构——tiles 路径的 Azurite 404 改写为
      // 204 哨兵，viewer MissAwareFetchCloudStorage 视 204/404 为 miss 回退原生。
      // 其它 Azurite 404 原样透传。
      '/azurite': {
        target: 'http://localhost:10500',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/azurite/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            if (proxyRes.statusCode === 404 && /\/tiles\//.test(req.url ?? '')) {
              proxyRes.statusCode = 204;
              proxyRes.statusMessage = 'No Content';
              delete proxyRes.headers['content-length'];
              delete proxyRes.headers['content-type'];
              proxyRes.headers['cache-control'] = 'no-store';
            }
          });
        },
      },
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
    server: {
      deps: {
        // 官方 ViewCube 默认加载后，jsdom 单测也会 import AppUI 包；这些包
        // 直接 import .scss，Node ESM 会以 ERR_UNKNOWN_FILE_EXTENSION 崩。
        // 交给 Vite 转换（CSS 在 Vitest 下由 css:false 处理为空模块）。
        inline: [
          '@itwin/imodel-components-react',
          '@itwin/components-react',
          '@itwin/core-react',
        ],
      },
    },
    // e2e/*.spec.ts 是 Playwright 套件（独立 config playwright.config.ts）——
    // vitest 缺省 include 收 *.spec.* 会把它们当单测收集、集间即红（M5-T5 起
    // 在场，M5-T7 perf 探针入 e2e 时一并钉死排除面）。缺省排除面保留
    //（M-2：configDefaults 展开而非整体替换）。
    exclude: [...configDefaults.exclude, 'e2e/**', 'playwright/**', 'test-results/**'],
  },
});
