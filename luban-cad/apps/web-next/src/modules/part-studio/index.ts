/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 模块 barrel（spec 规则 4：跨模块只准 import 模块入口
 * `@modules/<name>`）——对外出口编辑器会话态 store、能力注册表与契约
 * 类型（M3 Task 2；PartStudioPage/ribbon/树/画布等待 Task 3+ 挂入）。
 */

export { usePartStudioStore } from './stores/part-studio.store.js';
export type { PartStudioActions, PartStudioStore } from './stores/part-studio.store.js';
export {
  CAPABILITY_GUIDANCE,
  TOOL_CAPABILITIES,
  capabilityOf,
  isGated,
} from './internal/capabilities.js';
export type { Capability, CapabilityGuidance } from './internal/capabilities.js';
export type {
  CanvasSelection,
  CanvasSelectionKind,
  DockTab,
  PartStudioCommandPaletteState,
  PartStudioDockState,
  PartStudioSketchState,
  PartStudioState,
  PartStudioToolState,
  PartStudioTreeState,
  TreeTab,
} from './types.js';
