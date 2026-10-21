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
  DockTab,
  PartStudioCommandPaletteState,
  PartStudioDockState,
  PartStudioSketchState,
  PartStudioState,
  PartStudioToolState,
  PartStudioTreeState,
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
};

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

/** commandPalette 切片：命令搜索（alt+/）开合。 */
function createCommandPaletteSlice([set, get]: SliceCreator): { commandPalette: PartStudioCommandPaletteState } & Pick<PartStudioActions,
  'openCommandPalette' | 'closeCommandPalette' | 'toggleCommandPalette'> {
  return {
    commandPalette: initialCommandPalette,
    openCommandPalette: () => set({ commandPalette: { isOpen: true } }),
    closeCommandPalette: () => set({ commandPalette: { isOpen: false } }),
    toggleCommandPalette: () => set({ commandPalette: { isOpen: !get().commandPalette.isOpen } }),
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
}));
