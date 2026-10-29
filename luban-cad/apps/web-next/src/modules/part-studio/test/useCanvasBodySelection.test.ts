// src/modules/part-studio/test/useCanvasBodySelection.test.ts
//
// B6 M-A5 Task 1：画布 body 选中桥单测——connection.selectionSet（权威选择集）
// → store.canvas.selection 的映射契约：
//  - 挂载即读当前 elements（订阅前已在集内的元素也要回流）；
//  - onChanged 后以 elements 当前集为权威（忽略事件 delta）映射 active authored
//    body → { kind:'part', id:bodyKey, label:name }，按 elements 迭代序；
//  - 非 body/未知/consumed(active=false)/orphan(authored=false) 忽略；空集写 []；
//  - bodies undefined（legacy 回退）不订阅、不接管 store 选择集；
//  - enabled=false（M-A5.2 T1：face/edge 模式）退订且不写 store；重启同步；
//  - 稳定 key（kind/id/label/owner/topology）等值守卫：相同序列重复触发不重写
//    （store 数组引用不变），同 id 不同 owner/topology 不误判相等；
//  - 卸载/连接替换退订（BeEvent disposer）；不写 tree.selectedNodeIds。
//
// 连接/选择集为最小桩（真实 hook/store 参与，不触网络/不引导查看器）。
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { BodyInfo } from '@luban-cad/shared';
import { canvasSelectionKey, useCanvasBodySelection } from '../hooks/useCanvasBodySelection.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { CanvasSelection } from '../types.js';

type SelectionListener = (ev?: unknown) => void;

/**
 * SelectionSet 最小替身：elements（Set 迭代序）+ onChanged.addListener
 * （BeEvent 契约：返回退订 disposer）。replace=整集替换并发事件（真实
 * SelectionSet.replace 语义）；emit 用于「事件 delta 被忽略」的定向断言。
 */
function makeSelectionSet(initialIds: readonly string[] = []) {
  const elements = new Set<string>(initialIds);
  const listeners = new Set<SelectionListener>();
  const emit = (ev?: unknown): void => {
    for (const listener of [...listeners]) listener(ev);
  };
  return {
    elements,
    onChanged: {
      addListener: vi.fn((listener: SelectionListener): (() => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
    },
    replace(ids: readonly string[]): void {
      elements.clear();
      for (const id of ids) elements.add(id);
      emit({ added: ids, removed: [] });
    },
    emit,
    listenerCount: (): number => listeners.size,
  };
}

/** briefcase 连接最小桩（hook 只用 selectionSet）。 */
function makeConnection(initialIds: readonly string[] = []) {
  return { selectionSet: makeSelectionSet(initialIds) };
}

type MockConnection = ReturnType<typeof makeConnection>;

const asConnection = (connection: MockConnection | undefined): BriefcaseConnection | undefined =>
  connection as unknown as BriefcaseConnection | undefined;

// body 读面样本：BODY_1 authored=true；BODY_2 authored 缺省（=托管，须映射）；
// BODY_CONSUMED active=false（消费/软删）；BODY_ORPHAN authored=false（直改副本）。
const BODY_1: BodyInfo = { bodyKey: '0x201', name: 'Body 1', active: true, authored: true };
const BODY_2: BodyInfo = { bodyKey: '0x202', name: 'Body 2', active: true };
const BODY_CONSUMED: BodyInfo = { bodyKey: '0x203', name: 'Body 3', active: false, authored: true };
const BODY_ORPHAN: BodyInfo = { bodyKey: '0x204', name: 'Body 4', active: true, authored: false };
const BODIES: readonly BodyInfo[] = [BODY_1, BODY_2, BODY_CONSUMED, BODY_ORPHAN];

interface HookProps {
  connection: MockConnection | undefined;
  bodies: readonly BodyInfo[] | undefined;
  enabled: boolean;
}

function renderBodySelection(
  connection: MockConnection | undefined,
  bodies: readonly BodyInfo[] | undefined,
  enabled = true,
) {
  return renderHook(
    ({ connection: c, bodies: b, enabled: e }: HookProps) =>
      useCanvasBodySelection(asConnection(c), b, e),
    { initialProps: { connection, bodies, enabled } satisfies HookProps },
  );
}

const currentSelection = () => usePartStudioStore.getState().canvas.selection;

beforeEach(() => {
  usePartStudioStore.setState({
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    canvas: { selection: [], hiddenIds: [], selectionMode: 'body' },
  });
});

describe('useCanvasBodySelection（B6 M-A5 T1 画布 body 选中桥）', () => {
  it('挂载即读当前 elements（权威全集）→ 按 elements 迭代序写 part 选择', () => {
    const connection = makeConnection(['0x202', '0x201']);

    renderBodySelection(connection, BODIES);

    expect(connection.selectionSet.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(currentSelection()).toEqual([
      { kind: 'part', id: '0x202', label: 'Body 2' },
      { kind: 'part', id: '0x201', label: 'Body 1' },
    ]);
  });

  it('onChanged → 以当前 elements 集为权威（忽略事件 delta）；空集写 []', () => {
    const connection = makeConnection();
    renderBodySelection(connection, BODIES);
    expect(currentSelection()).toEqual([]);

    act(() => connection.selectionSet.replace(['0x201']));
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);

    // delta 声称 added=['0x201']，但 elements 实际只剩 0x202——映射以元素集为准。
    connection.selectionSet.elements.clear();
    connection.selectionSet.elements.add('0x202');
    act(() => connection.selectionSet.emit({ added: ['0x201'], removed: [] }));
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x202', label: 'Body 2' }]);

    act(() => connection.selectionSet.replace([]));
    expect(currentSelection()).toEqual([]);
  });

  it('非 body / consumed / orphan id 忽略；混合集只映射 active authored body', () => {
    const connection = makeConnection(['0x999', '0x203', '0x204']);
    renderBodySelection(connection, BODIES);
    expect(currentSelection()).toEqual([]);

    act(() => connection.selectionSet.replace(['0x999', '0x201', '0x203', '0x204']));
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);
  });

  it('同一 bodyKey 重复读面条目去重（首个 active authored 生效）', () => {
    const duplicate: BodyInfo = { bodyKey: '0x201', name: 'Body 1 dup', active: true, authored: true };
    const connection = makeConnection(['0x201']);

    renderBodySelection(connection, [BODY_1, duplicate]);

    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);
  });

  it('bodies undefined（legacy 回退）不订阅也不接管 store 选择集', () => {
    usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: 'legacy', label: 'Legacy' }]);
    const connection = makeConnection(['0x201']);

    renderBodySelection(connection, undefined);

    expect(connection.selectionSet.onChanged.addListener).not.toHaveBeenCalled();
    act(() => connection.selectionSet.replace(['0x202']));
    expect(currentSelection()).toEqual([{ kind: 'part', id: 'legacy', label: 'Legacy' }]);
  });

  it('相同集合重复触发不重写（稳定 key 等值守卫；bodies 变化才重算）', () => {
    const connection = makeConnection(['0x201']);
    const { rerender } = renderBodySelection(connection, BODIES);
    const first = currentSelection();
    expect(first).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);

    act(() => connection.selectionSet.replace(['0x201']));
    // 未重写：setCanvasSelection 每次都会换新数组引用。
    expect(currentSelection()).toBe(first);

    // bodies 引用变化（读面刷新/改名）→ effect 重同步当前 elements，label 跟随。
    rerender({ connection, bodies: [{ ...BODY_1, name: 'Body 1 renamed' }], enabled: true });
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1 renamed' }]);
  });

  it('卸载退订（BeEvent disposer）：旧监听不再写 store', () => {
    const connection = makeConnection(['0x201']);
    const { unmount } = renderBodySelection(connection, BODIES);
    expect(connection.selectionSet.listenerCount()).toBe(1);

    unmount();
    expect(connection.selectionSet.listenerCount()).toBe(0);

    usePartStudioStore.getState().setCanvasSelection([]);
    act(() => connection.selectionSet.emit());
    expect(currentSelection()).toEqual([]);
  });

  it('连接替换：旧连接退订、新连接订阅并同步当前 elements', () => {
    const connA = makeConnection(['0x201']);
    const connB = makeConnection(['0x202']);
    const { rerender } = renderBodySelection(connA, BODIES);
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);

    rerender({ connection: connB, bodies: BODIES, enabled: true });
    expect(connA.selectionSet.listenerCount()).toBe(0);
    expect(connB.selectionSet.listenerCount()).toBe(1);
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x202', label: 'Body 2' }]);

    // 旧连接事件不再生效（若旧监听残留会写回 Body 1）。
    connA.selectionSet.elements.clear();
    connA.selectionSet.elements.add('0x201');
    act(() => connA.selectionSet.emit());
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x202', label: 'Body 2' }]);
  });

  it('不写 tree.selectedNodeIds（树→画布 emphasize 由 useCanvasSelection 单向承担）', () => {
    usePartStudioStore.getState().setSelectedNodeIds(['feature-1']);
    const connection = makeConnection(['0x201']);

    renderBodySelection(connection, BODIES);
    act(() => connection.selectionSet.replace(['0x202']));

    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['feature-1']);
  });

  it('无连接不订阅（不抛）', () => {
    const { unmount } = renderBodySelection(undefined, BODIES);
    expect(() => unmount()).not.toThrow();
    expect(currentSelection()).toEqual([]);
  });

  it('enabled=false 退订且不写 store；重新启用同步当前 elements', () => {
    const connection = makeConnection(['0x201']);
    const { rerender } = renderBodySelection(connection, BODIES, true);
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x201', label: 'Body 1' }]);

    usePartStudioStore.getState().setCanvasSelection([]);
    rerender({ connection, bodies: BODIES, enabled: false });
    expect(connection.selectionSet.listenerCount()).toBe(0);
    act(() => connection.selectionSet.replace(['0x202']));
    expect(currentSelection()).toEqual([]);

    rerender({ connection, bodies: BODIES, enabled: true });
    expect(connection.selectionSet.listenerCount()).toBe(1);
    expect(currentSelection()).toEqual([{ kind: 'part', id: '0x202', label: 'Body 2' }]);
  });

  it('canvasSelectionKey 区分 owner/topology（同 id 不误判相等）', () => {
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
