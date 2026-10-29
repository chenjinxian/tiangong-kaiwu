// src/modules/part-studio/test/useFeatureDisplaySync.test.ts
//
// M4 Task 5：特征显示同步 hook 单元测试（旧应用 useFeatureDisplaySync.ts
// 无测试，本文件为移植件新补的契约面）：
//  - 订阅生命周期：mount 挂 txns.onModelGeometryChanged、unmount 退订；
//  - 三步失效（BriefcaseConnection.ts processBuffered 的等价三步，2026-10-09 修复）：
//    1) 通知自带新 guid → ModelState.geometryGuid 写回；
//    2) dispose 该 model 的全部 TileTreeOwner（Tiles 可迭代，id 形如
//       PrimaryTreeId{modelId,...}）——他 model 的 owner 不受波及；
//    3) refreshForModifiedModels(modelIds) 重绘 + 重新请求 tile；
//  - 未加载补载（决定性保障）：ModelState 未加载 → models.load 后空间视图
//    modelSelector drop/add + 再次 refreshForModifiedModels。
//
// M5 Task 1（P0 呈现链修复批，D-T9-4 层2）追加断言面：
//  - txns.onAfterUndoRedo → 全量失效（凡 extant tile tree owner 一律 dispose +
//    refreshForModifiedModels）——反转事务不发 onCommitted 亦无 guid 通知载荷
//   （后端 TxnManager 仅 notifyAfterUndoRedo），官方 maybeProcess 在常驻
//    editingScope 下 early-return 结构性不覆盖，故 undo/redo 路径由本 hook 补位。

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { useFeatureDisplaySync } from '../hooks/useFeatureDisplaySync.js';

const viewManager = vi.hoisted(() => ({
  refreshForModifiedModels: vi.fn(),
  selectedView: undefined as unknown,
}));

// hook 运行时只取 IModelApp.viewManager（BriefcaseConnection 仅类型位）——
// 整模块替身可避免 link: 源码包在 jsdom 下全量引导。
vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { viewManager },
}));

/** TileTreeOwner 替身：经 [Symbol.dispose] 断言「dispose 该 model 的 tree owners」。 */
function makeTreeOwner() {
  const disposeSym = (Symbol as unknown as { dispose?: symbol }).dispose as symbol;
  const owner = {
    disposed: false,
    [disposeSym]() {
      this.disposed = true;
    },
  };
  return owner;
}

/** makeConnection 入参（缺省：0x100 已加载且两 model 均有 tile tree）。 */
interface MakeConnectionOptions {
  loadedModelIds?: string[];
  tileModelIds?: string[];
  /** 空间视图 modelSelector.has 命中集（缺省=tileModelIds）。 */
  inViewModelIds?: string[];
  withSpatialView?: boolean;
}

/** BriefcaseConnection 替身：txns.onModelGeometryChanged + models.getLoaded/load +
 * tiles 可迭代 + selectedView 空间视图（hook 契约面）。 */
function makeConnection({
  loadedModelIds = ['0x100'],
  tileModelIds = ['0x100', '0x200'],
  inViewModelIds,
  withSpatialView = false,
}: MakeConnectionOptions = {}) {
  const inView = inViewModelIds ?? tileModelIds;
  const geometryListeners = new Set<(changes: ReadonlyArray<{ id: string; guid: string }>) => void>();
  const undoRedoListeners = new Set<(isUndo: boolean) => void>();
  const loadedModels = new Map<string, { asGeometricModel: { geometryGuid: string } }>();
  for (const id of loadedModelIds) {
    loadedModels.set(id, { asGeometricModel: { geometryGuid: 'guid-initial' } });
  }

  const connection = {
    key: 'briefcase-key',
    txns: {
      onModelGeometryChanged: {
        // BeEvent 契约：addListener 返回退订 disposer（hook 的 effect cleanup 即它）。
        addListener: vi.fn((listener: (changes: ReadonlyArray<{ id: string; guid: string }>) => void) => {
          geometryListeners.add(listener);
          return () => {
            geometryListeners.delete(listener);
          };
        }),
        removeListener: vi.fn((listener: (changes: ReadonlyArray<{ id: string; guid: string }>) => void) => {
          geometryListeners.delete(listener);
        }),
      },
      onAfterUndoRedo: {
        // BeEvent 契约：addListener 返回退订 disposer（与 onModelGeometryChanged 同形）。
        addListener: vi.fn((listener: (isUndo: boolean) => void) => {
          undoRedoListeners.add(listener);
          return () => {
            undoRedoListeners.delete(listener);
          };
        }),
        removeListener: vi.fn((listener: (isUndo: boolean) => void) => {
          undoRedoListeners.delete(listener);
        }),
      },
    },
    models: {
      getLoaded: vi.fn((id: string) => loadedModels.get(id)),
      load: vi.fn(async (ids: string[]) => {
        for (const id of ids) loadedModels.set(id, { asGeometricModel: { geometryGuid: 'guid-late' } });
      }),
    },
    tiles: tileModelIds.map((modelId) => ({
      id: { modelId },
      owner: makeTreeOwner(),
    })),
    emitGeometryChanged(changes: Array<{ id: string; guid: string }>) {
      geometryListeners.forEach((listener) => listener(changes));
    },
    emitAfterUndoRedo(isUndo = true) {
      undoRedoListeners.forEach((listener) => listener(isUndo));
    },
  };

  if (withSpatialView) {
    const dropped: string[][] = [];
    const added: string[][] = [];
    viewManager.selectedView = {
      view: {
        isSpatialView: () => true,
        modelSelector: {
          has: (id: string) => inView.includes(id),
          dropModels: (ids: string[]) => void dropped.push(ids),
          addModels: (ids: string[]) => void added.push(ids),
        },
      },
    };
    (connection as { dropped?: string[][] }).dropped = dropped;
    (connection as { added?: string[][] }).added = added;
  } else {
    viewManager.selectedView = undefined;
  }

  return connection;
}

type MockConnection = ReturnType<typeof makeConnection>;

const ownerOf = (connection: MockConnection, modelId: string) =>
  connection.tiles.find((entry) => entry.id.modelId === modelId)?.owner as unknown as { disposed: boolean };

const renderDisplaySync = (connection: MockConnection | undefined) =>
  renderHook(() => useFeatureDisplaySync(connection as unknown as BriefcaseConnection | undefined));

afterEach(() => {
  viewManager.refreshForModifiedModels.mockClear();
  viewManager.selectedView = undefined;
});

describe('useFeatureDisplaySync（三步失效移植件）', () => {
  it('mount 订阅 onModelGeometryChanged，unmount 经 disposer 退订（后发变化不再处理）', () => {
    const connection = makeConnection();

    const { unmount } = renderDisplaySync(connection);
    expect(connection.txns.onModelGeometryChanged.addListener).toHaveBeenCalledTimes(1);

    unmount();
    connection.emitGeometryChanged([{ id: '0x100', guid: 'guid-after-unmount' }]);
    expect(viewManager.refreshForModifiedModels).not.toHaveBeenCalled();
  });

  it('guid 变化 → 写回 ModelState.geometryGuid + dispose 该 model 的 tile owners + 重绘', () => {
    const connection = makeConnection();

    renderDisplaySync(connection);
    connection.emitGeometryChanged([{ id: '0x100', guid: 'guid-next' }]);

    expect(connection.models.getLoaded('0x100')?.asGeometricModel.geometryGuid).toBe('guid-next');
    expect(ownerOf(connection, '0x100').disposed).toBe(true);
    // 他 model 的 owner 不受波及（按 modelId 精确 dispose）。
    expect(ownerOf(connection, '0x200').disposed).toBe(false);
    expect(viewManager.refreshForModifiedModels).toHaveBeenCalledWith(['0x100']);
  });

  it(' ModelState 未加载 → 补载 + 空间视图 modelSelector drop/add + 再次重绘', async () => {
    const connection = makeConnection({ loadedModelIds: [], inViewModelIds: ['0x300'], withSpatialView: true });

    renderDisplaySync(connection);
    connection.emitGeometryChanged([{ id: '0x300', guid: 'guid-late' }]);
    await act(async () => {}); // 冲刷补载异步块

    expect(connection.models.load).toHaveBeenCalledWith(['0x300']);
    expect((connection as { dropped?: string[][] }).dropped).toEqual([['0x300']]);
    expect((connection as { added?: string[][] }).added).toEqual([['0x300']]);
    // 两路重绘：立即路（modelIds 全量）+ 补载路（needsLateLoad）。
    expect(viewManager.refreshForModifiedModels).toHaveBeenCalledTimes(2);
    expect(viewManager.refreshForModifiedModels).toHaveBeenNthCalledWith(1, ['0x300']);
    expect(viewManager.refreshForModifiedModels).toHaveBeenNthCalledWith(2, ['0x300']);
  });

  it('非几何 model（无 asGeometricModel）走补载路，不误写 guid', async () => {
    const connection = makeConnection({ loadedModelIds: ['0x100'], tileModelIds: ['0x100'] });
    // 模型在场但非几何（无 asGeometricModel）→ 不能当已加载几何处理。
    (connection.models.getLoaded as ReturnType<typeof vi.fn>).mockReturnValue({});

    renderDisplaySync(connection);
    connection.emitGeometryChanged([{ id: '0x100', guid: 'guid-next' }]);
    await act(async () => {});

    expect(viewManager.refreshForModifiedModels).toHaveBeenCalledWith(['0x100']);
    expect(ownerOf(connection, '0x100').disposed).toBe(false);
  });

  it('无连接不订阅', () => {
    const { unmount } = renderDisplaySync(undefined);
    expect(() => unmount()).not.toThrow();
  });

  // ── M5-T1（D-T9-4 层2）：undo/redo 全量失效 ─────────────────────────────

  it('D-T9-4 层2：onAfterUndoRedo → 全量失效（dispose 全部 extant tile owners + 重绘）', () => {
    const connection = makeConnection();

    renderDisplaySync(connection);
    connection.emitAfterUndoRedo(true);

    // 反转事务无 guid 载荷——凡 extant tree owner 一律 dispose（撤销后的几何
    // 基准 guid 由服务端在 tree 重建时经 requestTileTreeProps 供给）。
    expect(ownerOf(connection, '0x100').disposed).toBe(true);
    expect(ownerOf(connection, '0x200').disposed).toBe(true);
    expect(viewManager.refreshForModifiedModels).toHaveBeenCalledTimes(1);
    expect(viewManager.refreshForModifiedModels).toHaveBeenCalledWith(['0x100', '0x200']);
  });

  it('unmount 后 onAfterUndoRedo 不再失效（并列监听一并摘除）', () => {
    const connection = makeConnection();

    const { unmount } = renderDisplaySync(connection);
    unmount();
    connection.emitAfterUndoRedo(false);

    expect(ownerOf(connection, '0x100').disposed).toBe(false);
    expect(ownerOf(connection, '0x200').disposed).toBe(false);
    expect(viewManager.refreshForModifiedModels).not.toHaveBeenCalled();
  });
});
