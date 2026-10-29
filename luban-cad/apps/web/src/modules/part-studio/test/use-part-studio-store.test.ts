// src/modules/part-studio/test/use-part-studio-store.test.ts
//
// M3 Task 2（brief Step 1）：part-studio 编辑器会话态 store——
//  1) 初始态：五分切片（tree/dock/tool/sketch/commandPalette）缺省值
//     （spec §3 五分法：编辑器会话态唯一归属 zustand，本 store 聚合五切片）；
//     T5 增 canvas 切片（画布选择集 + 会话隐藏集——T2 挂账「CanvasSelection
//     无宿主（T5 定）」收口）、T6 增 dialog 切片（画布内联对话框宿主寻址）、
//     T7 增 viewOnly 切片（仅查看模式，os-24 汉堡菜单切换）——初始态快照
//     同步扩八切片；
//  2) 各切片 action 切换：树页签/选中/展开、停靠页签与开合、当前工具、
//     草图模式进出、命令搜索开关、画布选择集/隐藏集、对话框开闭、
//     仅查看模式切换；
//  3) usePartStudioStore() 在 React 内的订阅：action 触发 → hook 返回值
//     跟随重渲染（selector 粒度消费面 sanity）。
//
// 定位：纯 zustand 逻辑（无 RPC/无组件），全部断言直挂 store API
//（getState/setState）；仅用例 3 经 renderHook 验证 React 订阅面。

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { PartStudioState } from '../types.js';

/** 初始会话态快照（实现漂移时「初始态」用例即红，防静默改缺省）。 */
const INITIAL_STATE: PartStudioState = {
  tree: {
    activeTab: 'features',
    selectedNodeIds: [],
    expandedNodeIds: [],
  },
  dock: {
    activeTab: 'toolSettings',
    isOpen: false,
  },
  tool: {
    activeToolId: null,
  },
  sketch: {
    isActive: false,
    activeSketchId: null,
    // M6-a T5：平面缺省 null=契约缺省 XY@z=0。
    activeSketchPlane: null,
  },
  commandPalette: {
    isOpen: false,
    query: '',
    highlightEnabled: true,
  },
  canvas: {
    selection: [],
    hiddenIds: [],
    selectionMode: 'body',
  },
  dialog: {
    active: null,
  },
  viewOnly: {
    isActive: false,
  },
};

beforeEach(() => {
  // 合并式复位：只盖八切片状态键，action 函数不动。
  usePartStudioStore.setState(INITIAL_STATE);
});

describe('usePartStudioStore 初始态', () => {
  it('八切片全部落在缺省会话态（tree/dock/tool/sketch/commandPalette/canvas/dialog/viewOnly）', () => {
    const state = usePartStudioStore.getState();
    expect({
      tree: state.tree,
      dock: state.dock,
      tool: state.tool,
      sketch: state.sketch,
      commandPalette: state.commandPalette,
      canvas: state.canvas,
      dialog: state.dialog,
      viewOnly: state.viewOnly,
    }).toEqual(INITIAL_STATE);
  });
});

describe('tree 切片（树选中/展开 + 双段活动页签）', () => {
  it('setActiveTreeTab 在 features/parts 两段间切换', () => {
    usePartStudioStore.getState().setActiveTreeTab('parts');
    expect(usePartStudioStore.getState().tree.activeTab).toBe('parts');
    usePartStudioStore.getState().setActiveTreeTab('features');
    expect(usePartStudioStore.getState().tree.activeTab).toBe('features');
  });

  it('setSelectedNodeIds 覆写树选中集', () => {
    usePartStudioStore.getState().setSelectedNodeIds(['sketch-1', 'extrude-2']);
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['sketch-1', 'extrude-2']);
  });

  it('toggleNodeExpanded 幂等翻转展开集', () => {
    const { toggleNodeExpanded } = usePartStudioStore.getState();
    toggleNodeExpanded('node-1');
    expect(usePartStudioStore.getState().tree.expandedNodeIds).toEqual(['node-1']);
    toggleNodeExpanded('node-1');
    expect(usePartStudioStore.getState().tree.expandedNodeIds).toEqual([]);
  });
});

describe('dock 切片（停靠页签 + 开合）', () => {
  it('openDock/closeDock/toggleDock 翻转开合态', () => {
    const store = usePartStudioStore.getState();
    store.openDock();
    expect(usePartStudioStore.getState().dock.isOpen).toBe(true);
    store.toggleDock();
    expect(usePartStudioStore.getState().dock.isOpen).toBe(false);
    store.toggleDock();
    expect(usePartStudioStore.getState().dock.isOpen).toBe(true);
    store.closeDock();
    expect(usePartStudioStore.getState().dock.isOpen).toBe(false);
  });

  it('setDockTab 在 toolSettings/history/display 三页签间切换', () => {
    usePartStudioStore.getState().setDockTab('history');
    expect(usePartStudioStore.getState().dock.activeTab).toBe('history');
    usePartStudioStore.getState().setDockTab('display');
    expect(usePartStudioStore.getState().dock.activeTab).toBe('display');
  });
});

describe('tool 切片（当前工具）', () => {
  it('setActiveTool 记工具 id，可置 null 回到无工具', () => {
    usePartStudioStore.getState().setActiveTool('Extrude');
    expect(usePartStudioStore.getState().tool.activeToolId).toBe('Extrude');
    usePartStudioStore.getState().setActiveTool(null);
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
  });
});

describe('sketch 切片（草图模式）', () => {
  it('enterSketch 进草图模式并记活动草图（平面归零防串场），exitSketch 全复位', () => {
    usePartStudioStore.getState().enterSketch('sketch-9');
    expect(usePartStudioStore.getState().sketch).toEqual({ isActive: true, activeSketchId: 'sketch-9', activeSketchPlane: null });
    usePartStudioStore.getState().exitSketch();
    expect(usePartStudioStore.getState().sketch).toEqual({ isActive: false, activeSketchId: null, activeSketchPlane: null });
  });

  it('M6-a T5：setActiveSketchPlane 下发平面；enterSketch 再进归零（不串上一会话）', () => {
    const plane = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    usePartStudioStore.getState().enterSketch('sketch-1');
    usePartStudioStore.getState().setActiveSketchPlane(plane);
    expect(usePartStudioStore.getState().sketch.activeSketchPlane).toEqual(plane);
    // 新会话归零（SketchDialog 确认链随后再下发新平面）。
    usePartStudioStore.getState().enterSketch('sketch-2');
    expect(usePartStudioStore.getState().sketch.activeSketchPlane).toBeNull();
    // exitSketch 全复位含平面。
    usePartStudioStore.getState().setActiveSketchPlane(plane);
    usePartStudioStore.getState().exitSketch();
    expect(usePartStudioStore.getState().sketch.activeSketchPlane).toBeNull();
  });
});

describe('commandPalette 切片（命令搜索开关）', () => {
  it('open/close/toggle 翻转命令搜索面板', () => {
    const store = usePartStudioStore.getState();
    store.openCommandPalette();
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(true);
    store.toggleCommandPalette();
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
    store.toggleCommandPalette();
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(true);
    store.closeCommandPalette();
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
  });

  it('open/toggle 入口统一清空查询词（os-23 每次全新搜索；终审 T4-① 口径统一）', () => {
    const store = usePartStudioStore.getState();
    store.setCommandPaletteQuery('圆角');
    store.toggleCommandPalette(); // 开（原关）→ 开即全新搜索
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(true);
    expect(usePartStudioStore.getState().commandPalette.query).toBe('');
    store.setCommandPaletteQuery('倒角');
    store.toggleCommandPalette(); // 关 → 查询作废清空
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
    expect(usePartStudioStore.getState().commandPalette.query).toBe('');
    store.setCommandPaletteQuery('圆角');
    store.closeCommandPalette();
    store.openCommandPalette(); // open 入口同口径
    expect(usePartStudioStore.getState().commandPalette.query).toBe('');
  });
});

describe('canvas 切片（画布选择集 + 会话隐藏集，T5 收口 CanvasSelection 宿主）', () => {
  it('setCanvasSelection 覆写画布选择集（viewport pick 回流）', () => {
    usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: 'p1', label: 'Part 1' }]);
    expect(usePartStudioStore.getState().canvas.selection).toEqual([
      { kind: 'part', id: 'p1', label: 'Part 1' },
    ]);
    usePartStudioStore.getState().setCanvasSelection([]);
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
  });

  it('hideNodes 并集隐藏；showNodes 差集恢复', () => {
    const store = usePartStudioStore.getState();
    store.hideNodes(['a', 'b']);
    store.hideNodes(['b', 'c']);
    expect(usePartStudioStore.getState().canvas.hiddenIds).toEqual(['a', 'b', 'c']);
    store.showNodes(['b']);
    expect(usePartStudioStore.getState().canvas.hiddenIds).toEqual(['a', 'c']);
  });

  // M-A5.2 T1：选择模式是 canvas 切片的一部分——切模式清空画布选择
  // （body↔face/edge 选择集语义不同，跨模式残留会误路由右键菜单）；
  // 树选中不受影响（子实体选择不写 SelectionSet/树）；同模式幂等不重写。
  it('setSelectionMode 切模式清空 canvas 选择，树选中不动；同模式幂等', () => {
    const store = usePartStudioStore.getState();
    store.setCanvasSelection([{ kind: 'part', id: '0x15', label: 'Body 1' }]);
    store.setSelectedNodeIds(['feature-1']);
    store.setSelectionMode('face');
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('face');
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['feature-1']);
    store.setSelectionMode('face');
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('face');
  });
});

describe('dialog 切片（画布内联对话框宿主寻址，T6；M4-T6 扩 new/edit 双模式）', () => {
  it('openFeatureDialog new 模式：记 featureType（ribbon「拉伸」创建路由）', () => {
    const store = usePartStudioStore.getState();
    store.openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'extrude',
    });
  });

  it('openFeatureDialog edit 模式：记 featureId + 名称/类型（树上「编辑…」路由）', () => {
    const store = usePartStudioStore.getState();
    store.openFeatureDialog({
      mode: 'edit',
      featureId: 'ex1',
      featureName: '拉伸 1',
      featureType: 'extrude',
    });
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'edit',
      featureId: 'ex1',
      featureName: '拉伸 1',
      featureType: 'extrude',
    });
  });

  it('openSketchDialog 记草图 id（缺省 null）', () => {
    const store = usePartStudioStore.getState();
    store.openSketchDialog();
    expect(usePartStudioStore.getState().dialog).toEqual({ active: 'sketch', sketchId: null });
    store.openSketchDialog('sketch-3');
    expect(usePartStudioStore.getState().dialog).toEqual({ active: 'sketch', sketchId: 'sketch-3' });
  });

  it('closeDialog 复位；互斥（后开者覆盖前者）', () => {
    const store = usePartStudioStore.getState();
    store.openFeatureDialog({ mode: 'new', featureType: 'fillet' });
    store.openSketchDialog('sketch-1');
    expect(usePartStudioStore.getState().dialog).toEqual({ active: 'sketch', sketchId: 'sketch-1' });
    store.closeDialog();
    expect(usePartStudioStore.getState().dialog).toEqual({ active: null });
  });
});

describe('viewOnly 切片（仅查看模式，T7 os-24 汉堡菜单）', () => {
  it('toggleViewOnly 幂等翻转；setViewOnly 显式置位', () => {
    const { toggleViewOnly, setViewOnly } = usePartStudioStore.getState();
    expect(usePartStudioStore.getState().viewOnly.isActive).toBe(false);
    toggleViewOnly();
    expect(usePartStudioStore.getState().viewOnly.isActive).toBe(true);
    toggleViewOnly();
    expect(usePartStudioStore.getState().viewOnly.isActive).toBe(false);
    setViewOnly(true);
    expect(usePartStudioStore.getState().viewOnly.isActive).toBe(true);
    setViewOnly(false);
    expect(usePartStudioStore.getState().viewOnly.isActive).toBe(false);
  });
});

describe('usePartStudioStore() React 订阅面', () => {
  it('selector 订阅：action 触发后 hook 返回值跟随', () => {
    const { result } = renderHook(() => usePartStudioStore((s) => s.tool.activeToolId));
    expect(result.current).toBeNull();
    act(() => {
      usePartStudioStore.getState().setActiveTool('Fillet');
    });
    expect(result.current).toBe('Fillet');
  });
});
