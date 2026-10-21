# @luban-cad/web-next

鲁班CAD 下一代 Web 应用（web-next M0 基座）。

## 先 build 后 dev

本应用经 pnpm workspace 以 `workspace:*` 引用仓内 `link:` 包（`@luban-cad/shared`、
`@luban-cad/viewer-next`），而 viewer-next 的入口是**构建产物**
（`main: ./dist/index.js`），并非源码直引。**全新检出或重装依赖后，必须先在这些
workspace 包内跑 `pnpm build` 产出 `dist/`，再回 apps/web-next 跑 `pnpm dev`**——
否则 Vite 解析不到包入口，dev server 直接起不来（或运行期报模块缺失）。
