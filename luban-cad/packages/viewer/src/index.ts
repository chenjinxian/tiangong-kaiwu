export { startViewer, acquireViewer, releaseViewer } from './host/web-initializer.js';
export type { StartViewerOptions } from './host/web-initializer.js';
export { ensureAccuSnap } from './tools/ensure-accusnap.js';
// M6-a T5：SketchAccuSnap（tools/sketch-accu-snap.ts）经 web-initializer 懒引
// 注入 startup——不静态引出（ensureEditTools 同款口径：class extends AccuSnap
// 会把基类存在性强加给每个 barrel 消费方的 core-frontend mock 面）。
// M3 Task 3：React 宿主 hook——viewport 挂载 ref + 运行时接线；M4 Task 2 起
// 扩 ScreenViewport 创建主链（apps/web PartStudioCanvas 经 viewportRef/viewport 消费）。
export { useViewport } from './viewport/use-viewport.js';
export type { UseViewportOptions, UseViewportResult, ViewportPhase } from './viewport/use-viewport.js';
// 2026-11-02：内容感知取景公开出口（特征提交后自动 fit / 页签条适应视图）。
export {
  fitViewToModelRanges,
  queryAllPhysicalModelIds,
} from './viewport/fit-view.js';
export type { FitViewToModelRangesOptions } from './viewport/fit-view.js';
// M4 Task 2：Onshape 式视口底色（纯应用函数；data-theme 的 MutationObserver
// 接线在消费侧 apps/web PartStudioPage）。
export { applyViewportBackground } from './viewport/theme-background.js';
export type { ViewportTheme } from './viewport/theme-background.js';
// M4 Task 2：项目范围装饰件（D4 必办挂账；ToggleProjectExtentsTool 供 T3 注册表）。
export {
  ProjectExtentsDecoration,
  ToggleProjectExtentsTool,
  toggleProjectExtents,
} from './viewport/decorations/project-extents-decoration.js';
// 2026-11-02：Onshape 默认几何图元（Origin/Top/Front/Right）视口装饰。
export {
  DatumPlanesDecoration,
} from './viewport/decorations/datum-planes-decoration.js';
export type {
  DatumPlaneVisibility,
} from './viewport/decorations/datum-planes-decoration.js';
// 2026-11-03：完整 BRep 拓扑边/顶点叠加层（后端拓扑读面 → iTwin GraphicBuilder）。
export {
  BrepTopologyDecoration,
  collectBrepEdgeCurves,
  effectiveBrepOptions,
} from './viewport/decorations/brep-topology-decoration.js';
export type {
  BrepTopology,
  BrepTopologyDecorationOptions,
  BrepTopologyEdge,
  BrepTopologyVertex,
} from './viewport/decorations/brep-topology-decoration.js';
// M4 Task 1：可写编辑连接 hook——BriefcaseConnection 生命周期 + save/push/pull 代理
//（Part Studio 组合消费，接口契约见 connection/use-briefcase-connection.ts）。
export { useBriefcaseConnection } from './connection/index.js';
export type {
  UseBriefcaseConnectionOptions,
  UseBriefcaseConnectionResult,
} from './connection/index.js';
// M4 Task 3：编辑工具注册表——EditTools.initialize + 分组注册序（同旧
// registerTools.ts 裁剪，跳过项登记见该文件头注）+ Undo/Redo/Delete/Escape
// 快捷键子集。PartStudioPage 在 host 就绪（phase ready + ToolAdmin 轮询）后编排。
// 懒引（动态 import）而非静态引出：barrel 是 app 各测试文件的高频静态入口
// （part-studio 结构测试以「零真实查看器」口径模块级 mock @itwin/core-frontend），
// 注册表携 40+ 工具类导出依赖（视图/测量/裁剪/基元/变换工具等），静态引出会把
// 这些导出名强加给每个消费方的 mock 面；懒引后注册面仅在 ensureEditTools 实调
// （host 就绪后一次性）时加载，运行时行为与签名不变。
export async function ensureEditTools(): Promise<void> {
  const { ensureEditTools: run } = await import('./tools/register-edit-tools.js');
  return run();
}
