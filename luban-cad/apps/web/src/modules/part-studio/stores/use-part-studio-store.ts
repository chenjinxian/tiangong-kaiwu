/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 编辑器会话态 store（M3 Task 2；M4 Task 8 命名口径拍板）。
 *
 * 文件命名（M3 终审 §四 观察项的拍板落地）：hook 主导出文件=camelCase
 * `use-*`（本文件主导出即 usePartStudioStore hook，与 viewer
 * `use-viewport.ts` 同规）；测试文件同被测物改名（use-part-studio-store
 * .test.ts，「测试=被测物.test.*」口径不变）。
 *
 * spec §3 五分法：编辑器会话态唯一归属 zustand；store 铁律「一 store 一
 * 职责」——本文件按职责拆五个切片（tree/dock/tool/sketch/commandPalette），
 * 各切片独立 createXxxSlice 定义、单一 create 组合；消费面走 selector
 * 订阅（`usePartStudioStore(s => s.tree.activeTab)`），保证重渲染粒度。
 * 服务端态（react-query）与运行时态（viewer hooks）严禁入本 store。
 */

import { create } from 'zustand';
import type { StoreApi } from 'zustand';

import type { LubanFeatureType, PatternParams, SketchPlaneDto } from '@luban-cad/shared';
import type {
  CanvasSelection,
  DatumId,
  DockTab,
  PartStudioCanvasState,
  PartStudioCommandPaletteState,
  PartStudioDialogState,
  PartStudioDockState,
  PartStudioDatumState,
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
  /** 2026-11-13 Onshape live：进入草图不改相机（无 orientCamera 选项）。 */
  enterSketch: (sketchId: string) => void;
  exitSketch: () => void;
  /** M6-a T5：活动草图平面下发（SketchDialog 确认链 → 宿主 onConfirm 消费面调用）。 */
  setActiveSketchPlane: (plane: SketchPlaneDto | null) => void;
  /** ADR-0018 S1g：草图「显示约束」开关（glyph + 尺寸标注覆盖层显隐）。 */
  setShowConstraints: (visible: boolean) => void;
  toggleSketchConstruction: () => void;
  /** AIRR 2026-11-12：草图阵列/变换会话（Onshape canvas gizmo）。
   *  2026-11-13：`'use'`=草图「使用」拾取会话（同一会话槽，画布由 Use 覆盖层接管）。 */
  startSketchPattern: (kind: 'linear' | 'circular' | 'transform' | 'use') => void;
  cancelSketchPattern: () => void;
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
  // dialog 切片（T6：画布内联非模态对话框宿主寻址；M4-T6 扩 new/edit 双模式）
  openFeatureDialog: (
    feature:
      | {
        mode: 'new';
        featureType: LubanFeatureType;
        patternKind?: PatternParams['kind'];
        inputFaces?: readonly CanvasSelection[];
      }
      | { mode: 'edit'; featureId: string; featureName: string; featureType: string },
  ) => void;
  openSketchDialog: (sketchId?: string) => void;
  closeDialog: () => void;
  // viewOnly 切片（T7：仅查看模式切换）
  setViewOnly: (active: boolean) => void;
  toggleViewOnly: () => void;
  // datum 切片（2026-11-02 默认几何图元）
  setDatumVisible: (id: DatumId, visible: boolean) => void;
  toggleDatumVisible: (id: DatumId) => void;
  setDatumExpanded: (expanded: boolean) => void;
  selectDatum: (id: DatumId | null) => void;
  /** Session 实时同步有效可见性（不写覆盖）。 */
  syncDatumVisibility: (visibility: Record<DatumId, boolean>) => void;
  /** scope 切换清空用户覆盖（自动规则重新接管）。 */
  clearDatumVisibilityOverrides: () => void;
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
  // M6-a T5：平面缺省 null=契约缺省 XY@z=0（见 types.ts 注）。
  activeSketchPlane: null,
  constructionMode: false,
  // ADR-0018 S1g：Onshape live 草图对话框默认勾选「显示约束」。
  showConstraints: true,
  // AIRR 2026-11-12：草图阵列会话缺省未激活。
  pattern: null,
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

/** 默认几何图元初始态：Origin+三平面可见、组展开、无用户覆盖。 */
const initialDatum: PartStudioDatumState = {
  visibility: { origin: true, top: true, front: true, right: true },
  visibilityOverrides: {},
  expanded: true,
  selectedId: null,
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

/** sketch 切片：草图模式进出（活动草图 id 寻址树红显/对话框）+ 平面下发（M6-a T5）。 */
function createSketchSlice([set, get]: SliceCreator): { sketch: PartStudioSketchState } & Pick<PartStudioActions,
  'enterSketch' | 'exitSketch' | 'setActiveSketchPlane' | 'setShowConstraints' | 'toggleSketchConstruction' | 'startSketchPattern' | 'cancelSketchPattern'> {
  return {
    sketch: initialSketch,
    // 进草图恒先归零平面（防上一草图会话的平面残留串场）；新建路径的平面随后由
    // SketchDialog onConfirm 链 setActiveSketchPlane 下发（M6-a T5）。
    enterSketch: (sketchId) => set({
      sketch: {
        isActive: true,
        activeSketchId: sketchId,
        activeSketchPlane: null,
        constructionMode: false,
        // 显示开关跨草图会话保留（Onshape 会话内复选框状态延续）；缺省勾选。
        showConstraints: get().sketch.showConstraints ?? true,
        pattern: null,
      },
    }),
    exitSketch: () => set({ sketch: { ...initialSketch } }),
    // 平面单设一跳（不并入 enterSketch）：T4 收口的 SketchDialog 内部先
    // enterSketch(真 sketchId)、再经 onConfirm 回调把平面选项带出——宿主
    // PartStudioCanvas 在 onConfirm 里映射下发；enterSketch 签名保持 T4 口径不动。
    setActiveSketchPlane: (plane) => set({ sketch: { ...get().sketch, activeSketchPlane: plane } }),
    setShowConstraints: (visible) => set({ sketch: { ...get().sketch, showConstraints: visible } }),
    toggleSketchConstruction: () => set({ sketch: { ...get().sketch, constructionMode: !get().sketch.constructionMode } }),
    // AIRR 2026-11-12：仅草图编辑态可启动阵列（Onshape 草图工具）。
    startSketchPattern: (kind) => {
      const sketch = get().sketch;
      if (!sketch.isActive || !sketch.activeSketchId)
        return;
      set({ sketch: { ...sketch, pattern: { kind } } });
    },
    cancelSketchPattern: () => {
      const sketch = get().sketch;
      if (!sketch.pattern)
        return;
      set({ sketch: { ...sketch, pattern: null } });
    },
  };
}

/** commandPalette 切片：命令搜索（alt+/）开合 + 查询词/亮显（ribbon 高亮数据源）。 */
function createCommandPaletteSlice([set, get]: SliceCreator): { commandPalette: PartStudioCommandPaletteState } & Pick<PartStudioActions,
  'openCommandPalette' | 'closeCommandPalette' | 'toggleCommandPalette' | 'setCommandPaletteQuery' | 'setPaletteHighlight'> {
  return {
    commandPalette: initialCommandPalette,
    // 打开即清空查询词（os-23：每次进入都是全新搜索）——open/toggle 两个
    // 打开入口同口径（终审 T4-① 收口：toggle 原不清空，入口间口径不一）。
    openCommandPalette: () => set({ commandPalette: { ...get().commandPalette, isOpen: true, query: '' } }),
    closeCommandPalette: () => set({ commandPalette: { ...get().commandPalette, isOpen: false } }),
    toggleCommandPalette: () =>
      set({ commandPalette: { ...get().commandPalette, isOpen: !get().commandPalette.isOpen, query: '' } }),
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
  ...createDatumSlice(args),
}));

// P2.8：E2E 观测面（仅构建期 VITE_E2E_HOOKS=true 挂载；发布镜像缺省关闭）。
// e2e 原用 dev-only 的 `/src/.../use-part-studio-store.ts` 动态导入读取选择桥，
// 发布镜像没有源码路径；store 属 app 状态，不放进 viewer 的 window.__lubanE2E。
if (import.meta.env.VITE_E2E_HOOKS === 'true' && typeof window !== 'undefined') {
  (window as unknown as {
    __lubanE2EApp?: { usePartStudioStore: typeof usePartStudioStore };
  }).__lubanE2EApp = { usePartStudioStore };
}

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
 * dialog 切片：画布内联非模态对话框宿主寻址（T6；M4-T6 扩双模式）——
 * feature=特征对话框（mode 'new'=ribbon「拉伸」创建路由，featureType 即提交
 * op 的特征类型；mode 'edit'=树上「编辑…」路由，featureId 为宿主重挂 key）；
 * sketch=新建草图（ribbon newSketch 激活路由，sketchId 缺省 null——M6-a T4
 * 起对话框确认经 insertSketch RPC 返回真 sketchId 入 sketch 切片；壳期
 *（applyOp 未接线）回退 'sketch-active' 占位寻址）。
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

/**
 * datum 切片：默认几何图元（Origin/Top/Front/Right）的可见性/展开/选中。
 * 合成 id 仅在本切片流转，不进 tree/canvas（见 types.ts 注）。
 */
function createDatumSlice([set, get]: SliceCreator): { datum: PartStudioDatumState } & Pick<PartStudioActions,
  'setDatumVisible' | 'toggleDatumVisible' | 'setDatumExpanded' | 'selectDatum'
  | 'syncDatumVisibility' | 'clearDatumVisibilityOverrides'> {
  return {
    datum: initialDatum,
    setDatumVisible: (id, visible) => {
      const datum = get().datum;
      set({
        datum: {
          ...datum,
          visibility: { ...datum.visibility, [id]: visible },
          visibilityOverrides: { ...datum.visibilityOverrides, [id]: visible },
        },
      });
    },
    toggleDatumVisible: (id) => {
      const datum = get().datum;
      const next = !datum.visibility[id];
      set({
        datum: {
          ...datum,
          visibility: { ...datum.visibility, [id]: next },
          visibilityOverrides: { ...datum.visibilityOverrides, [id]: next },
        },
      });
    },
    setDatumExpanded: (expanded) => set({ datum: { ...get().datum, expanded } }),
    selectDatum: (id) => set({ datum: { ...get().datum, selectedId: id } }),
    syncDatumVisibility: (visibility) => {
      const datum = get().datum;
      const current = datum.visibility;
      if (current.origin === visibility.origin && current.top === visibility.top
        && current.front === visibility.front && current.right === visibility.right)
        return;
      set({ datum: { ...datum, visibility } });
    },
    clearDatumVisibilityOverrides: () => {
      const datum = get().datum;
      if (Object.keys(datum.visibilityOverrides).length === 0) return;
      set({ datum: { ...datum, visibilityOverrides: {} } });
    },
  };
}
