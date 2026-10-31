# @luban-cad/web

鲁班CAD 下一代 Web 应用（web M0 基座）。

## 先 build 后 dev

本应用经 pnpm workspace 以 `workspace:*` 引用仓内 `link:` 包（`@luban-cad/shared`、
`@luban-cad/viewer`），而 viewer 的入口是**构建产物**
（`main: ./dist/index.js`），并非源码直引。**全新检出或重装依赖后，必须先在这些
workspace 包内跑 `pnpm build` 产出 `dist/`，再回 apps/web 跑 `pnpm dev`**——
否则 Vite 解析不到包入口，dev server 直接起不来（或运行期报模块缺失）。

## public/scripts/parse-imdl-worker.js（快照，勿手改）

`publicPath: '/'`（viewer `web-initializer.ts`）下，core-frontend 的
ImdlParser 按 `<origin>/scripts/parse-imdl-worker.js` 取 imdl tile 解码
worker；该文件缺席时 SPA 回退返回 index.html 当 JS——worker 静默死亡、
几何渲染不出（publicpath-worker-404 教训，2026-10-09/2026-10-22 两代实证）。
本目录快照 = `itwinjs-core/core/frontend/lib/public/scripts/parse-imdl-worker.js`
的拷贝（dev vite publicDir 与 Docker 生产构建同一来源）；**itwinjs-core 上游
同步/重编译后须重拷对齐**（worker 与 lib/esm 主包版本漂移同病）。生产镜像
在 `apps/web/Dockerfile` 构建尾有硬断言（dist 缺该文件即构建失败）。

## 测试与 e2e 类型门禁

- `pnpm test`：Vitest 单测。
- `pnpm typecheck:e2e`：Playwright specs + `playwright.config.ts` 的 tsc 门禁。
  主 `tsconfig.json` 只 include `src`/`vite.config.ts`，e2e 不在 `pnpm build`
  覆盖面内；本命令用 `tsconfig.e2e.json`（复用严格选项，全局 types 切 node）。
  改 e2e/helpers 后须单独跑，避免拼写/契约漂移要到真栈才暴露。
- `pnpm test:e2e`：先跑上述 tsc 门禁，再跑 Playwright 真栈（前置与配额见根
  CLAUDE.md；设置 `PLAYWRIGHT_BASE_URL` 时测已部署产物，否则自起/复用 :5300
  dev server）。仅跑 Playwright 本身可用 `pnpm exec playwright test`。
- `pnpm lint`：覆盖 `src/**` + `e2e/**` + `playwright.config.ts`（e2e 至少过
  TS parser；细则规则仍主要面向 src）。

