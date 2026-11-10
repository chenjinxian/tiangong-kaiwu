# 查看器 IPC 生命周期（display-test-app 对照）

**结论（2026-11-10）**：Web 查看器的 `LocalhostIpcApp` / `IpcApp` / `IModelApp`
是**页面级 host**，不是 React 路由/Viewport 级资源。luban-cad 原先按路由
`acquireViewer → releaseViewer → shutdown`，会引发 SPA 重入卡
“正在解析 Part Studio…”；已按 itwinjs-core `display-test-app` 模型重构。

## display-test-app 的模型

| 阶段 | DTA 行为 | 证据 |
|---|---|---|
| app 启动 | `LocalhostIpcApp.startup()` 一次（Electron/Mobile/Web 分支） | `test-apps/display-test-app/src/frontend/App.ts:270-347` |
| 启动期配置刷新 | 仅 boot 阶段 `IModelApp.shutdown()` 后再次 startup | `DisplayTestApp.ts:212-220` |
| 打开/切换 iModel | 只打开/关闭 `IModelConnection`，IPC host 不动 | `Viewer.ts:586-588`、`611-627` |
| 关闭 Viewer/窗口 | 关闭 iModel 连接；不 shutdown IpcApp/IModelApp | `Surface.ts:412-428`、`Viewer.ts:621-627` |
| 页面关闭/刷新 | `beforeunload` 只 `closeAllViewers()`；浏览器销毁 JS/WebSocket；新页面重新 startup | `Surface.ts:43` |
| 后端 | `LocalhostIpcHost.startup({noServer:true})` 一次；每条 `/ipc` `connect` | `backend/Backend.ts:293-311`、`WebMain.ts:60` |

DTA 实测语义：打开/关闭多个 Viewer、切换 iModel、浏览器刷新/退出都能恢复；
它没有“路由卸载 → IPC host shutdown”路径。

## luban-cad 原先的问题

- `packages/viewer/src/viewport/use-viewport.ts:153-177`：Viewport 挂载
  `acquireViewer`，卸载 `releaseViewer`。
- `packages/viewer/src/host/web-initializer.ts`（旧）：`viewerRefCount` 归零时
  `IpcApp.shutdown()` / `IModelApp.shutdown()`。
- 路由返回项目页 → host 销毁；再次进入 → 重建 WebSocket。
- 期间出现过：
  - 只调 `IModelApp.shutdown`，`IpcApp.isValid` 残留 → 下次跳过 startup；
  - `LocalhostIpcApp` 私有 `_initialized/_ipc` 复用已关闭 socket →
    `WebSocket is already in CLOSING or CLOSED state`；
  - 页面停“正在解析 Part Studio…”。
- 用私有字段 reset 可以止血，但依赖 iTwin.js 内部实现，不是 DTA 口径。

## 现行实现（2026-11-10 重构后）

- `startViewer` 仍幂等；只有 `IpcApp.isValid && IModelApp.initialized` 同时为真
  才跳过 `LocalhostIpcApp.startup`，否则执行 startup。
- `acquireViewer`/`releaseViewer` 只维护消费者引用计数；**release 归零不 shutdown**。
- 离开编辑器只由 `useBriefcaseConnection` 关闭 `BriefcaseConnection`/iModel；
  `beforeunload` 同样关闭连接。
- 页面刷新/关闭：浏览器销毁 WebSocket，后端 `LocalhostIpcHost` 的 connection
  close 清理；新页面重新 startup。
- 显式停止查看器没有公开 API；整页刷新是唯一恢复路径。连接失败画面提供
  “刷新页面”按钮（`part-studio-connection-reload`）。
- 不再修改 `LocalhostIpcApp`/`IpcWebSocket` 私有字段。

## 后端重启边界（2026-11-10 收口）

页面级 host 无法自动重连，但**必须做到有界失败**。MS 重启后旧 WebSocket 已死，
而 `IpcApp.isValid`/`IpcSession.active` 仍为真；`downloadBriefcase` 会向死
socket 发请求并永久悬挂（实测页面停在“正在打开文档…”75s 以上，无错误面）。

现行做法（`packages/viewer/src/connection/use-briefcase-connection.ts`）：

- 打开文档前先做 **IPC 存活探针**：官方轻量方法
  `IpcApp.appFunctionIpc.queryConcurrency('io')`（与 iModel 无关，走同一条
  `/ipc` WebSocket），与 8s 超时竞速。
- 探针超时/拒绝 → 立即 `error`：“建模服务连接已断开（/ipc WebSocket 无响应，
  后端可能已重启）。请刷新页面重新连接。”错误面出现“刷新页面”按钮。
- 刷新后新页面重新 `LocalhostIpcApp.startup`、新建 WebSocket，同一编辑器可
  正常打开。不做组件级 shutdown、不读/改 iTwin 私有字段。
- 打开中途后端重启仍可能让单次 `downloadBriefcase` 悬挂；此时用户可刷新，
  与 DTA 的刷新恢复口径一致。若未来需要自动重连，应新增显式重连协议/ADR，
  不在 React 组件层重建 host。

## 登出/切换账号边界（2026-11-10 收口）

WebSocket 建连身份固定，SPA 切 `/login` 不会改变它；页面级 host 复用到下一位
用户即身份泄漏。所有登出入口（文档中心 / 文档详情 / 编辑器顶栏 / 设置）统一为：

```ts
await AuthSession.logout();
window.location.href = '/login';
```

整页导航销毁旧 JS 上下文与 WebSocket，新页面按新会话重建 host。单元测试断言
`window.location.href === '/login'`；真栈用 `performance.timeOrigin` 前后变化
证明是整页 reload 而非 SPA 跳转。

## 残余边界

- 页面级 host 会占用一个 WebGL/IPC 会话直到刷新；这是 DTA 同款取舍。
- 打开文档期间后端重启的单次下载仍依赖刷新恢复（见上）。
- 如果引入显式重连协议，必须先 ADR，并保持“唯一 IPC host/单一真相源”。

## 回归

- viewer 单测 **130/130**（页面级 host、in-flight 去重、release 不 shutdown、
  存活探针拒绝/8s 超时）。
- 真栈 `e2e/examples/catalog.spec.ts` **5/5**：18 卡、文档中心可见、
  编辑器→项目页→再编辑器两轮、页面刷新。
- 真栈 `e2e/examples/ipc-logout.spec.ts` **1/1**：登出整页导航。
- 真栈 `e2e/examples/ms-restart-recovery.spec.ts`（`IPC_RESTART_E2E=1`）
  **1/1**：重启宿主 MS → 打开另一模型出现有界错误面 → 刷新恢复。
- `verify-stack` 17/17。
