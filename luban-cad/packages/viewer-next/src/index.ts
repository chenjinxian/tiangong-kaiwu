export { startViewer, acquireViewer, releaseViewer } from './host/web-initializer.js';
export type { StartViewerOptions } from './host/web-initializer.js';
export { ensureAccuSnap } from './tools/ensure-accusnap.js';
// M3 Task 3：React 宿主 hook——viewport 挂载 ref + 运行时接线；M4 Task 2 起
// 扩 ScreenViewport 创建主链（web-next PartStudioCanvas 经 viewportRef/viewport 消费）。
export { useViewport } from './viewport/use-viewport.js';
export type { UseViewportOptions, UseViewportResult, ViewportPhase } from './viewport/use-viewport.js';
// M4 Task 2：Onshape 式视口底色（纯应用函数；data-theme 的 MutationObserver
// 接线在消费侧 apps/web-next PartStudioPage）。
export { applyViewportBackground } from './viewport/theme-background.js';
export type { ViewportTheme } from './viewport/theme-background.js';
// M4 Task 2：项目范围装饰件（D4 必办挂账；ToggleProjectExtentsTool 供 T3 注册表）。
export {
  ProjectExtentsDecoration,
  ToggleProjectExtentsTool,
  toggleProjectExtents,
} from './viewport/decorations/project-extents-decoration.js';
// M4 Task 1：可写编辑连接 hook——BriefcaseConnection 生命周期 + save/push/pull 代理
//（Part Studio 组合消费，接口契约见 connection/use-briefcase-connection.ts）。
export { useBriefcaseConnection } from './connection/index.js';
export type {
  UseBriefcaseConnectionOptions,
  UseBriefcaseConnectionResult,
} from './connection/index.js';
