/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 编辑器会话态 store（M3 Task 2）。
 *
 * spec §3 五分法：编辑器会话态唯一归属 zustand；store 铁律「一 store 一
 * 职责」——本文件按职责拆五个切片（tree/dock/tool/sketch/commandPalette），
 * 各切片独立 createXxxSlice 定义、单一 create 组合；消费面走 selector
 * 订阅（`usePartStudioStore(s => s.tree.activeTab)`），保证重渲染粒度。
 * 服务端态（react-query）与运行时态（viewer-next hooks）严禁入本 store。
 */

import { create } from 'zustand';
import type { StoreApi } from 'zustand';

import type {
  CanvasSelection,
  DockTab,
  PartStudioCanvasState,
  PartStudioCommandPaletteState,
  PartStudioDialogState,
  PartStudioDockState,
  PartStudioSketchState,
  PartStudioState,
  PartStudioToolState,
  PartStudioTreeState,
  PartStudioViewOnlyState,
  TreeTab,
} from '../types.js';

/** 切片 action 集（store = PartStudioState + action）。 */
export interface PartStudioActions {
  // tree 切片
  setActiveTreeTab: (tab: TreeTab) => void;
  setSelectedNodeIds: (nodeIds: readonly string[]) => void;
  toggleNodeExpanded: (nodeId: string) => void;
  // dock 切片
  setDockTab: (tab: DockTab) => void;
  openDock: () => void;
  closeDock: () => void;
  toggleDock: () => void;
  // tool 切片
  setActiveTool: (toolId: string | null) => void;
  // sketch 切片
  enterSketch: (sketchId: string) => void;
  exitSketch: () => void;
  // commandPalette 切片
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  setCommandPaletteQuery: (query: string) => void;
  setPaletteHighlight: (enabled: boolean) => void;
  // canvas 切片（T5：viewport pick → store 回流的寻址单位宿主）
  setCanvasSelection: (selection: readonly CanvasSelection[]) => void;
  hideNodes: (nodeIds: readonly string[]) => void;
  showNodes: (nodeIds: readonly string[]) => void;
  // dialog 切片（T6：画布内联非模态对话框宿主寻址）
  openFeatureDialog: (feature: { featureId: string; featureName: string; featureType: string }) => void;
  openSketchDialog: (sketchId?: string) => void;
  closeDialog: () => void;
  // viewOnly 切片（T7：仅查看模式切换）
  setViewOnly: (active: boolean) => void;
  toggleViewOnly: () => void;
}

export type PartStudioStore = PartStudioState & PartStudioActions;

/** zustand slices 模式的 create 回调三元组。 */
type SliceCreator = [
  set: (partial: Partial<PartStudioStore>) => void,
  get: () => PartStudioStore,
  store: StoreApi<PartStudioStore>,
];

const initialTree: PartStudioTreeState = {
  activeTab: 'features',
  selectedNodeIds: [],
  expandedNodeIds: [],
};

const initialDock: PartStudioDockState = {
  activeTab: 'toolSettings',
  isOpen: false,
};

const initialTool: PartStudioToolState = {
  activeToolId: null,
};

const initialSketch: PartStudioSketchState = {
  isActive: false,
  activeSketchId: null,
};

const initialCommandPalette: PartStudioCommandPaletteState = {
  isOpen: false,
  query: '',
  highlightEnabled: true,
};

const initialCanvas: PartStudioCanvasState = {
  selection: [],
  hiddenIds: [],
};

const initialDialog: PartStudioDialogState = { active: null };

const initialViewOnly: PartStudioViewOnlyState = { isActive: false };

/** tree 切片：双段树活动段 + 树选中/展开。 */
function createTreeSlice([set, get]: SliceCreator): { tree: PartStudioTreeState } & Pick<PartStudioActions,
  'setActiveTreeTab' | 'setSelectedNodeIds' | 'toggleNodeExpanded'> {
  return {
    tree: initialTree,
    setActiveTreeTab: (tab) => set({ tree: { ...get().tree, activeTab: tab } }),
    setSelectedNodeIds: (nodeIds) => set({ tree: { ...get().tree, selectedNodeIds: [...nodeIds] } }),
    toggleNodeExpanded: (nodeId) => {
      const tree = get().tree;
      const expandedNodeIds = tree.expandedNodeIds.includes(nodeId)
        ? tree.expandedNodeIds.filter((id) => id !== nodeId)
        : [...tree.expandedNodeIds, nodeId];
      set({ tree: { ...tree, expandedNodeIds } });
    },
  };
}

/** dock 切片：停靠页签 + 开合。 */
function createDockSlice([set, get]: SliceCreator): { dock: PartStudioDockState } & Pick<PartStudioActions,
  'setDockTab' | 'openDock' | 'closeDock' | 'toggleDock'> {
  return {
    dock: initialDock,
    setDockTab: (tab) => set({ dock: { ...get().dock, activeTab: tab } }),
    openDock: () => set({ dock: { ...get().dock, isOpen: true } }),
    closeDock: () => set({ dock: { ...get().dock, isOpen: false } }),
    toggleDock: () => set({ dock: { ...get().dock, isOpen: !get().dock.isOpen } }),
  };
}

/** tool 切片：当前激活工具。 */
function createToolSlice([set]: SliceCreator): { tool: PartStudioToolState } & Pick<PartStudioActions, 'setActiveTool'> {
  return {
    tool: initialTool,
    setActiveTool: (toolId) => set({ tool: { activeToolId: toolId } }),
  };
}

/** sketch 切片：草图模式进出（活动草图 id 寻址树红显/对话框）。 */
function createSketchSlice([set]: SliceCreator): { sketch: PartStudioSketchState } & Pick<PartStudioActions,
  'enterSketch' | 'exitSketch'> {
  return {
    sketch: initialSketch,
    enterSketch: (sketchId) => set({ sketch: { isActive: true, activeSketchId: sketchId } }),
    exitSketch: () => set({ sketch: { ...initialSketch } }),
  };
}

/** commandPalette 切片：命令搜索（alt+/）开合 + 查询词/亮显（ribbon 高亮数据源）。 */
function createCommandPaletteSlice([set, get]: SliceCreator): { commandPalette: PartStudioCommandPaletteState } & Pick<PartStudioActions,
  'openCommandPalette' | 'closeCommandPalette' | 'toggleCommandPalette' | 'setCommandPaletteQuery' | 'setPaletteHighlight'> {
  return {
    commandPalette: initialCommandPalette,
    // 打开即清空查询词（os-23：每次进入都是全新搜索）。
    openCommandPalette: () => set({ commandPalette: { ...get().commandPalette, isOpen: true, query: '' } }),
    closeCommandPalette: () => set({ commandPalette: { ...get().commandPalette, isOpen: false } }),
    toggleCommandPalette: () => set({ commandPalette: { ...get().commandPalette, isOpen: !get().commandPalette.isOpen } }),
    setCommandPaletteQuery: (query) => set({ commandPalette: { ...get().commandPalette, query } }),
    setPaletteHighlight: (enabled) => set({ commandPalette: { ...get().commandPalette, highlightEnabled: enabled } }),
  };
}

/**
 * part-studio 主导出 hook（spec §3「store 文件=主导出 hook」）。
 * 测试/非 React 消费面用 `usePartStudioStore.getState()`。
 */
export const usePartStudioStore = create<PartStudioStore>()((...args) => ({
  ...createTreeSlice(args),
  ...createDockSlice(args),
  ...createToolSlice(args),
  ...createSketchSlice(args),
  ...createCommandPaletteSlice(args),
  ...createCanvasSlice(args),
  ...createDialogSlice(args),
  ...createViewOnlySlice(args),
}));

/** canvas 切片：画布选择集（pick 回流宿主）+ 会话隐藏集。 */
function createCanvasSlice([set, get]: SliceCreator): { canvas: PartStudioCanvasState } & Pick<PartStudioActions,
  'setCanvasSelection' | 'hideNodes' | 'showNodes'> {
  return {
    canvas: initialCanvas,
    setCanvasSelection: (selection) => set({ canvas: { ...get().canvas, selection: [...selection] } }),
    hideNodes: (nodeIds) => {
      const canvas = get().canvas;
      const hiddenIds = [...new Set([...canvas.hiddenIds, ...nodeIds])];
      set({ canvas: { ...canvas, hiddenIds } });
    },
    showNodes: (nodeIds) => {
      const canvas = get().canvas;
      const dropping = new Set(nodeIds);
      set({ canvas: { ...canvas, hiddenIds: canvas.hiddenIds.filter((id) => !dropping.has(id)) } });
    },
  };
}

/**
 * dialog 切片：画布内联非模态对话框宿主寻址（T6）——feature=特征编辑
 * （树上「编辑…」路由）；sketch=新建草图（ribbon newSketch 激活路由，
 * sketchId 缺省 null——对话框确认时由宿主补 'sketch-active'）。
 */
function createDialogSlice([set]: SliceCreator): { dialog: PartStudioDialogState } & Pick<PartStudioActions,
  'openFeatureDialog' | 'openSketchDialog' | 'closeDialog'> {
  return {
    dialog: initialDialog,
    openFeatureDialog: (feature) => set({ dialog: { active: 'feature', ...feature } }),
    openSketchDialog: (sketchId) => set({ dialog: { active: 'sketch', sketchId: sketchId ?? null } }),
    closeDialog: () => set({ dialog: { active: null } }),
  };
}

/**
 * viewOnly 切片：仅查看模式（T7 os-24 汉堡菜单「切换到仅查看模式」）——
 * 菜单 checkmark/标签反转的数据源；ribbon 只读态等后续消费面经 selector
 * 订阅（store 铁律：编辑器会话态唯一归属 zustand）。
 */
function createViewOnlySlice([set, get]: SliceCreator): { viewOnly: PartStudioViewOnlyState } & Pick<PartStudioActions,
  'setViewOnly' | 'toggleViewOnly'> {
  return {
    viewOnly: initialViewOnly,
    setViewOnly: (active) => set({ viewOnly: { isActive: active } }),
    toggleViewOnly: () => set({ viewOnly: { isActive: !get().viewOnly.isActive } }),
  };
}
