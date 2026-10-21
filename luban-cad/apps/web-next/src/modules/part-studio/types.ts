/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 模块契约类型（M3 Task 2）。
 */

/** 画布拾取类型（spec §5 上下文敏感模型：右键菜单按 kind 重构）。 */
export type CanvasSelectionKind = 'part' | 'face' | 'edge' | 'vertex' | 'feature';

/**
 * 画布选择集条目——viewport pick → store 回流的寻址单位
 *（选择驱动 UI：ribbon 组重排/高亮、画布右键按 kind 重构的依据）。
 */
export interface CanvasSelection {
  kind: CanvasSelectionKind;
  id: string;
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
}
