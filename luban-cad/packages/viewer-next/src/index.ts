export { startViewer, acquireViewer, releaseViewer } from './host/web-initializer.js';
export type { StartViewerOptions } from './host/web-initializer.js';
export { ensureAccuSnap } from './tools/ensure-accusnap.js';
// M3 Task 3：React 宿主 hook——viewport 挂载 ref + 运行时接线（viewport 创建
// 全链 M4 Task 2 接管；web-next PartStudioCanvas 经 viewportRef 消费）。
export { useViewport } from './viewport/use-viewport.js';
export type { UseViewportOptions, UseViewportResult, ViewportPhase } from './viewport/use-viewport.js';
// M4 Task 1：可写编辑连接 hook——BriefcaseConnection 生命周期 + save/push/pull 代理
//（Part Studio 组合消费，接口契约见 connection/use-briefcase-connection.ts）。
export { useBriefcaseConnection } from './connection/index.js';
export type {
  UseBriefcaseConnectionOptions,
  UseBriefcaseConnectionResult,
} from './connection/index.js';
