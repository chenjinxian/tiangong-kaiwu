/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 模块 barrel（spec 规则 4：跨模块只准 import 模块入口
 * `@modules/<name>`）——对外出口编辑器会话态 store、能力注册表、契约
 * 类型（M3 Task 2）与 PartStudioPage 编辑器壳（M3 Task 3；ribbon/树/
 * 画布/停靠内部组件经 PartStudioPage 聚合，不单独外销）。M3 Task 5 增
 * 出口：选择驱动 hooks（useCanvasSelection/useFeatureTree）与树/画布
 * 契约类型（FeatureNode/PartNode/PartStudioCanvasState）。M3 Task 6 增
 * 出口：内联非模态对话框（FeatureDialog/SketchDialog——画布宿主经
 * store.dialog 寻址渲染）与对话契约类型（结果载荷/实体芯片/平面选项）、
 * 草图工具注册表（草图模式 ribbon 变身数据源）。
 */

export { usePartStudioStore } from './stores/use-part-studio-store.js';
export type { PartStudioActions, PartStudioStore } from './stores/use-part-studio-store.js';
export {
  CAPABILITY_GUIDANCE,
  TOOL_CAPABILITIES,
  capabilityOf,
  isGated,
} from './internal/capabilities.js';
export type { Capability, CapabilityGuidance } from './internal/capabilities.js';
// M3 Task 4：ribbon 注册表（ribbon/树/画布/页签的命令数据源契约——跨切片
// 消费面经此 barrel 取 registry 数据与类型；Ribbon/CommandPalette 组件由
// PartStudioPage 聚合，不单独外销）。
export {
  RIBBON_GROUP_ORDER,
  RIBBON_TOOLS,
  allRibbonCommands,
  findRibbonCommand,
} from './ribbon/ribbon-registry.js';
export type {
  RibbonCommand,
  RibbonDropdownItem,
  RibbonGroup,
  RibbonIcon,
  RibbonTool,
} from './ribbon/ribbon-registry.js';
// M3 Task 6：草图工具注册表（os-30 草图模式 ribbon 变身的数据源契约）。
export {
  SKETCH_TOOL_GROUP_ORDER,
  SKETCH_RIBBON_TOOLS,
} from './ribbon/sketch-tools.js';
export type { SketchRibbonGroup, SketchRibbonTool } from './ribbon/sketch-tools.js';
// M3 Task 5：选择驱动 hooks（T6 FeatureDialog fast-pick/树数据接线消费面）。
export { useCanvasSelection } from './hooks/useCanvasSelection.js';
export type { CanvasSelectionApi } from './hooks/useCanvasSelection.js';
export { useFeatureTree } from './hooks/useFeatureTree.js';
export type { FeatureTreeModel, UseFeatureTreeOptions } from './hooks/useFeatureTree.js';
// M3 Task 6：内联非模态对话框（FeatureDialog/SketchDialog）——画布宿主经
// store.dialog 寻址渲染；跨模块消费面（如后续装配模块复用对话框形态）经
// 此 barrel 取组件与结果契约类型。
export { FeatureDialog } from './dialogs/FeatureDialog.js';
export type {
  FeatureBooleanScope,
  FeatureDialogEntity,
  FeatureDialogProps,
  FeatureDialogResult,
  FeatureDirection,
  FeatureResultType,
} from './dialogs/FeatureDialog.js';
export { SketchDialog } from './dialogs/SketchDialog.js';
export type {
  SketchDialogProps,
  SketchDialogResult,
  SketchPlaneOption,
} from './dialogs/SketchDialog.js';
export { PartStudioPage } from './PartStudioPage.js';
export type {
  CanvasSelection,
  CanvasSelectionKind,
  DockTab,
  FeatureNode,
  PartNode,
  PartStudioCanvasState,
  PartStudioCommandPaletteState,
  PartStudioDialogState,
  PartStudioDockState,
  PartStudioSketchState,
  PartStudioState,
  PartStudioToolState,
  PartStudioTreeState,
  TreeTab,
} from './types.js';
