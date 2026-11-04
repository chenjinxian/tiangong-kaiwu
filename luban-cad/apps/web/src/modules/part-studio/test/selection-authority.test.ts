// src/modules/part-studio/test/selection-authority.test.ts
//
// X-03（2026-11-04）：选择权威单测——`store.canvas.selection` 是唯一事实源，
// `connection.selectionSet` 只是 part 选择的单向投影：
//  - 树 selectedNodeIds → part 选择（active authored body 过滤、顺序、去重）；
//  - 投影只写 kind='part' 的 id；子实体/空选择清空 SelectionSet；
//  - 等值守卫：同序列重复投影不触发 replace/emptyAll；
//  - applyCanvasSelection 可选清树；clearCanvasSelection 清 store/树/SelectionSet；
//  - preserveToolSelection 保留 SelectionSet（ElementSetTool 启动输入契约），
//    syncCanvasSelectionProjection 再按 store 收口；
//  - 无连接不抛；canvasSelectionKey 区分 owner/topology。
//
// 纯函数 + 真实 store（无组件/网络）；SelectionSet 为最小桩。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { BodyInfo } from '@luban-cad/shared';
import {
  activeAuthoredBodiesById,
  applyCanvasSelection,
  bodyIdsFromCanvasSelection,
  canvasSelectionKey,
  clearCanvasSelection,
  partSelectionsFromTree,
  projectCanvasSelectionToSelectionSet,
  syncCanvasSelectionProjection,
} from '../internal/selection-authority.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { CanvasSelection } from '../types.js';

function makeSelectionSet(initialIds: readonly string[] = []) {
  const elements = new Set<string>(initialIds);
  return {
    elements,
    replace: vi.fn((ids: readonly string[]): void => {
      elements.clear();
      for (const id of ids) elements.add(id);
    }),
    emptyAll: vi.fn((): void => {
      elements.clear();
    }),
  };
}

function makeConnection(initialIds: readonly string[] = []) {
  return { selectionSet: makeSelectionSet(initialIds) };
}

const asConnection = (connection: ReturnType<typeof makeConnection> | undefined): BriefcaseConnection | undefined =>
  connection as unknown as BriefcaseConnection | undefined;

const BODY_1: BodyInfo = { bodyKey: '0x201', name: 'Body 1', active: true, authored: true };
const BODY_2: BodyInfo = { bodyKey: '0x202', name: 'Body 2', active: true };
const BODY_CONSUMED: BodyInfo = { bodyKey: '0x203', name: 'Body 3', active: false, authored: true };
const BODY_ORPHAN: BodyInfo = { bodyKey: '0x204', name: 'Body 4', active: true, authored: false };
const BODIES: readonly BodyInfo[] = [BODY_1, BODY_2, BODY_CONSUMED, BODY_ORPHAN];

const currentSelection = () => usePartStudioStore.getState().canvas.selection;
const currentTree = () => usePartStudioStore.getState().tree.selectedNodeIds;

beforeEach(() => {
  usePartStudioStore.setState({
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    canvas: { selection: [], hiddenIds: [] },
  });
  vi.clearAllMocks();
});

describe('partSelectionsFromTree / activeAuthoredBodiesById', () => {
  it('按 selectedNodeIds 顺序映射 active authored body；consumed/orphan/未知忽略', () => {
    const selection = partSelectionsFromTree(
      ['0x202', '0x203', '0x204', '0x999', '0x201'],
      BODIES,
    );
    expect(selection).toEqual([
      { kind: 'part', id: '0x202', label: 'Body 2' },
      { kind: 'part', id: '0x201', label: 'Body 1' },
    ]);
  });

  it('同 bodyKey 重复读面条目去重（首个 active authored 生效）', () => {
    const duplicate: BodyInfo = { bodyKey: '0x201', name: 'Body 1 dup', active: true, authored: true };
    const byId = activeAuthoredBodiesById([BODY_1, duplicate]);
    expect(byId.get('0x201')?.name).toBe('Body 1');
  });

  it('空 selectedNodeIds → 空选择（调用方决定是否保持现有画布选择）', () => {
    expect(partSelectionsFromTree([], BODIES)).toEqual([]);
  });
});

describe('projectCanvasSelectionToSelectionSet（唯一投影写点）', () => {
  it('只投影 kind=part 的 id（保持选择顺序）', () => {
    const connection = makeConnection();
    const selection: CanvasSelection[] = [
      { kind: 'face', id: 'face:1', ownerBodyKey: '0x201' },
      { kind: 'part', id: '0x202', label: 'Body 2' },
      { kind: 'edge', id: 'edge:1', ownerBodyKey: '0x201' },
      { kind: 'part', id: '0x201', label: 'Body 1' },
    ];
    projectCanvasSelectionToSelectionSet(asConnection(connection), selection);
    expect([...connection.selectionSet.elements]).toEqual(['0x202', '0x201']);
    expect(connection.selectionSet.replace).toHaveBeenCalledWith(['0x202', '0x201']);
  });

  it('纯子实体选择 → 清空 SelectionSet', () => {
    const connection = makeConnection(['0x201']);
    projectCanvasSelectionToSelectionSet(asConnection(connection), [
      { kind: 'face', id: 'face:1', ownerBodyKey: '0x201' },
    ]);
    expect(connection.selectionSet.elements.size).toBe(0);
    expect(connection.selectionSet.emptyAll).toHaveBeenCalledTimes(1);
  });

  it('空选择且已空 → 不触发 emptyAll（等值守卫）', () => {
    const connection = makeConnection();
    projectCanvasSelectionToSelectionSet(asConnection(connection), []);
    expect(connection.selectionSet.emptyAll).not.toHaveBeenCalled();
  });

  it('同 part 序列重复投影 → 不触发 replace/emptyAll', () => {
    const connection = makeConnection(['0x202', '0x201']);
    projectCanvasSelectionToSelectionSet(asConnection(connection), [
      { kind: 'part', id: '0x202' },
      { kind: 'part', id: '0x201' },
    ]);
    expect(connection.selectionSet.replace).not.toHaveBeenCalled();
    expect(connection.selectionSet.emptyAll).not.toHaveBeenCalled();
  });

  it('无连接不抛', () => {
    expect(() => projectCanvasSelectionToSelectionSet(undefined, [
      { kind: 'part', id: '0x201' },
    ])).not.toThrow();
  });

  it('bodyIdsFromCanvasSelection 只取 part', () => {
    expect(bodyIdsFromCanvasSelection([
      { kind: 'face', id: 'face:1' },
      { kind: 'part', id: '0x201' },
    ])).toEqual(['0x201']);
  });
});

describe('applyCanvasSelection', () => {
  it('写 store + 投影；clearTree=true 清树', () => {
    usePartStudioStore.getState().setSelectedNodeIds(['feature-1']);
    const connection = makeConnection();

    applyCanvasSelection(asConnection(connection), [
      { kind: 'part', id: '0x201', label: 'Body 1' },
    ], { clearTree: true });

    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);
    expect(currentTree()).toEqual([]);
    expect([...connection.selectionSet.elements]).toEqual(['0x201']);
  });

  it('同值不替换 store 数组引用（稳定 key 等值守卫）', () => {
    const connection = makeConnection();
    applyCanvasSelection(asConnection(connection), [{ kind: 'part', id: '0x201', label: 'Body 1' }]);
    const first = currentSelection();

    applyCanvasSelection(asConnection(connection), [{ kind: 'part', id: '0x201', label: 'Body 1' }]);

    expect(currentSelection()).toBe(first);
  });

  it('project=false 时只写 store（工具启动保留 SelectionSet 的显式路径）', () => {
    usePartStudioStore.getState().setSelectedNodeIds(['feature-1']);
    const connection = makeConnection(['0x201']);

    applyCanvasSelection(asConnection(connection), [], { project: false });

    expect(currentSelection()).toEqual([]);
    expect(currentTree()).toEqual(['feature-1']); // 未传 clearTree：树选择保持
    expect([...connection.selectionSet.elements]).toEqual(['0x201']);
  });
});

describe('clearCanvasSelection / syncCanvasSelectionProjection', () => {
  it('清 store + 树 + SelectionSet', () => {
    const connection = makeConnection(['0x201']);
    usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x201' }]);
    usePartStudioStore.getState().setSelectedNodeIds(['0x201']);

    clearCanvasSelection(asConnection(connection));

    expect(currentSelection()).toEqual([]);
    expect(currentTree()).toEqual([]);
    expect(connection.selectionSet.elements.size).toBe(0);
  });

  it('preserveToolSelection=true 保留 SelectionSet（ElementSetTool 启动输入）', () => {
    const connection = makeConnection(['0x201']);
    usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x201' }]);
    usePartStudioStore.getState().setSelectedNodeIds(['0x201']);

    clearCanvasSelection(asConnection(connection), { preserveToolSelection: true });

    expect(currentSelection()).toEqual([]);
    expect(currentTree()).toEqual([]);
    expect([...connection.selectionSet.elements]).toEqual(['0x201']);
  });

  it('syncCanvasSelectionProjection 按当前 store 收口（工具退出后清掉旧输入）', () => {
    const connection = makeConnection(['0x201']);
    syncCanvasSelectionProjection(asConnection(connection));
    expect(connection.selectionSet.elements.size).toBe(0);
  });
});

describe('canvasSelectionKey', () => {
  it('区分 owner/topology（同 id 不误判相等）', () => {
    const a: CanvasSelection = {
      kind: 'face', id: 'face:1:3', ownerBodyKey: '0x15',
      topologyId: { nodeId: 1, entityId: 3 },
    };
    const b: CanvasSelection = {
      kind: 'face', id: 'face:1:3', ownerBodyKey: '0x16',
      topologyId: { nodeId: 1, entityId: 3 },
    };
    const c: CanvasSelection = {
      kind: 'face', id: 'face:1:3', ownerBodyKey: '0x15',
      topologyId: { nodeId: 1, entityId: 4 },
    };
    expect(canvasSelectionKey([a])).not.toBe(canvasSelectionKey([b]));
    expect(canvasSelectionKey([a])).not.toBe(canvasSelectionKey([c]));
  });
});
