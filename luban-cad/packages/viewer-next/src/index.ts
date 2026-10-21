export { startViewer, stopViewer } from './host/web-initializer.js';
export { ensureAccuSnap } from './tools/ensure-accusnap.js';
// M3 Task 3：React 宿主 hook——viewport 挂载 ref + 运行时接线（viewport 创建
// 全链 T5/T6 接管；web-next PartStudioCanvas 经 viewportRef 消费）。
export { useViewport } from './viewport/use-viewport.js';
export type { UseViewportOptions, UseViewportResult, ViewportPhase } from './viewport/use-viewport.js';
