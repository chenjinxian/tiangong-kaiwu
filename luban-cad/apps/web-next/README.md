# @luban-cad/web-next

鲁班CAD 下一代 Web 应用（web-next M0 基座）。

## 先 build 后 dev

本应用经 pnpm workspace 以 `workspace:*` 引用仓内 `link:` 包（`@luban-cad/shared`、
`@luban-cad/viewer`），而 viewer 的入口是**构建产物**
（`main: ./dist/index.js`），并非源码直引。**全新检出或重装依赖后，必须先在这些
workspace 包内跑 `pnpm build` 产出 `dist/`，再回 apps/web-next 跑 `pnpm dev`**——
否则 Vite 解析不到包入口，dev server 直接起不来（或运行期报模块缺失）。

## public/scripts/parse-imdl-worker.js（快照，勿手改）

`publicPath: '/'`（viewer `web-initializer.ts`）下，core-frontend 的
ImdlParser 按 `<origin>/scripts/parse-imdl-worker.js` 取 imdl tile 解码
worker；该文件缺席时 SPA 回退返回 index.html 当 JS——worker 静默死亡、
几何渲染不出（publicpath-worker-404 教训，2026-10-09/2026-10-22 两代实证）。
本目录快照 = `itwinjs-core/core/frontend/lib/public/scripts/parse-imdl-worker.js`
的拷贝（dev vite publicDir 与 Docker 生产构建同一来源）；**itwinjs-core 上游
同步/重编译后须重拷对齐**（worker 与 lib/esm 主包版本漂移同病）。生产镜像
在 `apps/web-next/Dockerfile` 构建尾有硬断言（dist 缺该文件即构建失败）。

