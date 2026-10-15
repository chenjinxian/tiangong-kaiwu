/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * UndoManager 真实 txn API 接线行为测试（RW2-T2）。
 *
 * 病灶史：undo/redo 曾探测 `connection.reverseSingleTxn`（真 API 在 `connection.txns`），
 * 探测失败仍无条件 success=true——UI 谎报撤销成功。本组钉死三态真实断言：
 * 成功（IModelStatus.Success）/失败（非零 IModelStatus 或异常）/不可用（isUndoPossible=false）。
 * canUndo/canRedo 为事件驱动缓存态（onCommitted/onAfterRedo 触发重查 async 真 API）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BeEvent, IModelStatus } from '@itwin/core-bentley';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { UndoManager } from './UndoManager.js';

interface MockTxns {
  reverseSingleTxn: ReturnType<typeof vi.fn>;
  reinstateTxn: ReturnType<typeof vi.fn>;
  isUndoPossible: ReturnType<typeof vi.fn>;
  isRedoPossible: ReturnType<typeof vi.fn>;
  getUndoString: ReturnType<typeof vi.fn>;
  getRedoString: ReturnType<typeof vi.fn>;
  onCommitted: BeEvent<(hasPendingTxns: boolean, time: number) => void>;
  onAfterUndoRedo: BeEvent<(isUndo: boolean) => void>;
}

function createMockConnection(overrides: Partial<MockTxns> = {}): { connection: BriefcaseConnection; txns: MockTxns } {
  const txns: MockTxns = {
    reverseSingleTxn: vi.fn().mockResolvedValue(IModelStatus.Success),
    reinstateTxn: vi.fn().mockResolvedValue(IModelStatus.Success),
    isUndoPossible: vi.fn().mockResolvedValue(false),
    isRedoPossible: vi.fn().mockResolvedValue(false),
    getUndoString: vi.fn().mockResolvedValue(''),
    getRedoString: vi.fn().mockResolvedValue(''),
    onCommitted: new BeEvent<(hasPendingTxns: boolean, time: number) => void>(),
    onAfterUndoRedo: new BeEvent<(isUndo: boolean) => void>(),
    ...overrides,
  };
  const connection = { txns } as unknown as BriefcaseConnection;
  return { connection, txns };
}

/** 初始 setConnection 触发的 async 状态刷新是 fire-and-forget，须让出微任务队列 */
const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('UndoManager（RW2-T2 真 txns API）', () => {
  let manager: UndoManager;

  beforeEach(() => {
    manager = new UndoManager();
  });

  it('undo() 在 reverseSingleTxn 返回非零 IModelStatus 时返回 false（不再假成功），且历史下标不动', async () => {
    const { connection, txns } = createMockConnection({
      isUndoPossible: vi.fn().mockResolvedValue(true),
      getUndoString: vi.fn().mockResolvedValue('Place Line'),
      reverseSingleTxn: vi.fn().mockResolvedValue(IModelStatus.CannotUndo),
    });
    manager.setConnection(connection);
    await flushAsync(); // 初次刷新：canUndo=true

    manager.recordOperation({ description: 'Place Line' });
    const indexBefore = manager.currentIndex;

    const ok = await manager.undo();

    expect(ok).toBe(false);
    expect(txns.reverseSingleTxn).toHaveBeenCalledTimes(1);
    expect(manager.currentIndex).toBe(indexBefore);
  });

  it('undo() 在 reverseSingleTxn 抛异常时返回 false（异常=失败，不再吞掉报成功）', async () => {
    const { connection, txns } = createMockConnection({
      isUndoPossible: vi.fn().mockResolvedValue(true),
      reverseSingleTxn: vi.fn().mockRejectedValue(new Error('no write lease')),
    });
    manager.setConnection(connection);
    await flushAsync();

    const ok = await manager.undo();

    expect(ok).toBe(false);
    expect(txns.reverseSingleTxn).toHaveBeenCalledTimes(1);
  });

  it('undo() 在 reverseSingleTxn 返回 Success 时返回 true 并移动历史下标', async () => {
    const { connection, txns } = createMockConnection({
      isUndoPossible: vi.fn().mockResolvedValue(true),
      getUndoString: vi.fn().mockResolvedValue('Place Line'),
    });
    manager.setConnection(connection);
    await flushAsync();

    manager.recordOperation({ description: 'Place Line' });
    const indexBefore = manager.currentIndex;

    const ok = await manager.undo();

    expect(ok).toBe(true);
    expect(txns.reverseSingleTxn).toHaveBeenCalledTimes(1);
    expect(manager.currentIndex).toBe(indexBefore - 1);
  });

  it('undo() 在 canUndo=false（isUndoPossible=false）时不调 reverseSingleTxn 直接返回 false', async () => {
    const { connection, txns } = createMockConnection({
      isUndoPossible: vi.fn().mockResolvedValue(false),
    });
    manager.setConnection(connection);
    await flushAsync();

    const ok = await manager.undo();

    expect(ok).toBe(false);
    expect(txns.reverseSingleTxn).not.toHaveBeenCalled();
  });

  it('redo() 在 reinstateTxn 返回非零 IModelStatus 时返回 false；返回 Success 时返回 true', async () => {
    const fail = createMockConnection({
      isRedoPossible: vi.fn().mockResolvedValue(true),
      reinstateTxn: vi.fn().mockResolvedValue(IModelStatus.CannotUndo),
    });
    manager.setConnection(fail.connection);
    await flushAsync();
    expect(await manager.redo()).toBe(false);
    expect(fail.txns.reinstateTxn).toHaveBeenCalledTimes(1);

    manager.setConnection(undefined);
    const ok = createMockConnection({
      isRedoPossible: vi.fn().mockResolvedValue(true),
      getRedoString: vi.fn().mockResolvedValue('Place Line'),
    });
    manager.setConnection(ok.connection);
    await flushAsync();
    expect(await manager.redo()).toBe(true);
    expect(ok.txns.reinstateTxn).toHaveBeenCalledTimes(1);
  });

  it('canUndo/canRedo 事件驱动：onCommitted 后按 isUndoPossible/isRedoPossible 异步刷新缓存', async () => {
    let undoPossible = false;
    let redoPossible = false;
    const { connection, txns } = createMockConnection({
      isUndoPossible: vi.fn().mockImplementation(async () => undoPossible),
      isRedoPossible: vi.fn().mockImplementation(async () => redoPossible),
      getUndoString: vi.fn().mockResolvedValue('Place Line'),
      getRedoString: vi.fn().mockResolvedValue('Delete Wall'),
    });
    manager.setConnection(connection);
    await flushAsync();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);

    undoPossible = true;
    redoPossible = true;
    txns.onCommitted.raiseEvent(true, Date.now());
    await flushAsync();

    expect(manager.canUndo).toBe(true);
    expect(manager.canRedo).toBe(true);
    expect(manager.undoLabel).toBe('Place Line');
    expect(manager.redoLabel).toBe('Delete Wall');
  });

  it('onAfterUndoRedo 事件触发后重查状态（undo 后 canUndo 翻转为 false）', async () => {
    let undoPossible = true;
    const { connection, txns } = createMockConnection({
      isUndoPossible: vi.fn().mockImplementation(async () => undoPossible),
      reverseSingleTxn: vi.fn().mockImplementation(async () => {
        undoPossible = false;
        return IModelStatus.Success;
      }),
    });
    manager.setConnection(connection);
    await flushAsync();
    expect(manager.canUndo).toBe(true);

    await manager.undo();
    // 真实后端会在 reverseSingleTxn 内部 raise onAfterUndoRedo；mock 须手动补发以验证事件通道
    txns.onAfterUndoRedo.raiseEvent(true);
    await flushAsync();

    expect(manager.canUndo).toBe(false);
  });

  it('setConnection(undefined) 复位缓存态并退订旧 txns 事件', async () => {
    let undoPossible = true;
    const { connection, txns } = createMockConnection({
      isUndoPossible: vi.fn().mockImplementation(async () => undoPossible),
    });
    manager.setConnection(connection);
    await flushAsync();
    expect(manager.canUndo).toBe(true);

    manager.setConnection(undefined);

    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
    // 旧 txns 再提交也不应影响已断连的 manager（无监听器泄漏/无状态污染）
    txns.onCommitted.raiseEvent(true, Date.now());
    await flushAsync();
    expect(manager.canUndo).toBe(false);
  });
});
