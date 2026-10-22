/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 模块契约类型（M3 Task 2）。
 */

import type { LubanFeatureType } from '@luban-cad/shared';

/** 画布拾取类型（spec §5 上下文敏感模型：右键菜单按 kind 重构）。 */
export type CanvasSelectionKind = 'part' | 'face' | 'edge' | 'vertex' | 'feature';

/**
 * 画布选择集条目——viewport pick → store 回流的寻址单位
 *（选择驱动 UI：ribbon 组重排/高亮、画布右键按 kind 重构的依据）。
 * T5 定宿主（T2 挂账「CanvasSelection 无宿主」收口）：存 store.canvas
 * .selection；label/featureType 为可选显示/路由元数据（featureType 是
 * 「编辑特征」路由 tools.run 的目标 toolId）。
 */
export interface CanvasSelection {
  kind: CanvasSelectionKind;
  id: string;
  /** 显示名（菜单标签「删除 {{name}}」插值；缺省回退 id）。 */
  label?: string;
  /** kind=feature 时的特征类型（ribbon 工具 id 同族，如 extrude）。 */
  featureType?: string;
}

/** 特征条目（双段树特征段视图模型；数据由消费方注入——壳期空集，RPC 接线后走 react-query）。 */
export interface FeatureNode {
  id: string;
  name: string;
  /** 特征类型（:type 筛选依据；ribbon 工具 id 同族命名，如 sketch/extrude/fillet）。 */
  type: string;
  /** 重生成失败（os-11：出错特征红色显示）。 */
  hasError: boolean;
  /** 有警告（:warnings 筛选依据）。 */
  hasWarning?: boolean;
  /** 已抑制（os-11：抑制斜体；:suppressed 筛选依据）。 */
  isSuppressed: boolean;
  /** 已隐藏（:hidden 筛选依据；画布隐藏集 store.canvas.hiddenIds 叠加其上）。 */
  isHidden: boolean;
  /** 使用/更改的变量名（:variable 筛选依据，区分大小写）。 */
  variables?: readonly string[];
}

/** 零件条目（双段树零件段视图模型；注入口径同 FeatureNode）。 */
export interface PartNode {
  id: string;
  name: string;
  isHidden: boolean;
  hasError?: boolean;
}

/** 双段树活动段（os-11 左栏：特征列表 / 零件列表）。 */
export type TreeTab = 'features' | 'parts';

/**
 * 右侧停靠面板活动页签（沿用旧应用 EditorDockPanel 三类：
 * 工具设置 / 版本历史 / 显示设置）。
 */
export type DockTab = 'toolSettings' | 'history' | 'display';

/** tree 切片——树选中/展开 + 双段活动段（spec §3 编辑器会话态）。 */
export interface PartStudioTreeState {
  activeTab: TreeTab;
  selectedNodeIds: readonly string[];
  expandedNodeIds: readonly string[];
}

/** dock 切片——停靠页签与开合。 */
export interface PartStudioDockState {
  activeTab: DockTab;
  isOpen: boolean;
}

/** tool 切片——当前激活工具（ribbon/画布拾取的会话锚点）。 */
export interface PartStudioToolState {
  activeToolId: string | null;
}

/** sketch 切片——草图模式（ribbon 变身/栅格覆盖层/树红显的开关源）。 */
export interface PartStudioSketchState {
  isActive: boolean;
  activeSketchId: string | null;
}

/** commandPalette 切片——命令搜索面板（alt+/）开关 + 查询词 + ribbon 亮显。 */
export interface PartStudioCommandPaletteState {
  isOpen: boolean;
  /** 当前查询词（ribbon「亮显工具栏中的工具」的数据源；T4）。 */
  query: string;
  /** 亮显开关（os-23 勾选，默认开）。 */
  highlightEnabled: boolean;
}

/** canvas 切片——画布选择集（viewport pick → store 回流）+ 会话隐藏集。 */
export interface PartStudioCanvasState {
  /** 画布选择集（右键菜单按 primary.kind 重构的依据；T6 viewport pick 接线后写入）。 */
  selection: readonly CanvasSelection[];
  /** 隐藏集（画布菜单「隐藏」的会话记录；FeatureOverrideProvider 消费、:hidden 叠加）。 */
  hiddenIds: readonly string[];
}

/**
 * dialog 切片——画布内联非模态对话框的宿主寻址（T6：FeatureDialog/SketchDialog
 * 由 PartStudioCanvas 按 active 渲染）。feature 段双模式（M4-T6 拉伸闭环）：
 * - mode 'new'：ribbon「拉伸」创建路由（featureType 即提交 op 的特征类型）；
 * - mode 'edit'：树上「编辑…」路由（featureId 为宿主 FeatureDialog 的
 *   重挂 key——M3-T6 台账①根治本地态跨特征残留；featureName/featureType
 *   供标题与后续 updateParams 路由）。
 * sketch=新建草图（ribbon newSketch 激活路由）。
 */
export type PartStudioDialogState =
  | { active: null }
  | { active: 'feature'; mode: 'new'; featureType: LubanFeatureType }
  | { active: 'feature'; mode: 'edit'; featureId: string; featureName: string; featureType: string }
  | { active: 'sketch'; sketchId: string | null };

/**
 * viewOnly 切片——仅查看模式（T7 汉堡菜单「切换到仅查看模式」切换；
 * os-24 菜单项 checkmark 数据源，后续消费面：ribbon 只读态/编辑工具禁用）。
 */
export interface PartStudioViewOnlyState {
  isActive: boolean;
}

/**
 * part-studio 编辑器会话态聚合（spec §3 五分法：编辑器会话态唯一归属
 * zustand；服务端态归 react-query、运行时态归 viewer-next，不进本类型）。
 */
export interface PartStudioState {
  tree: PartStudioTreeState;
  dock: PartStudioDockState;
  tool: PartStudioToolState;
  sketch: PartStudioSketchState;
  commandPalette: PartStudioCommandPaletteState;
  canvas: PartStudioCanvasState;
  dialog: PartStudioDialogState;
  viewOnly: PartStudioViewOnlyState;
}
