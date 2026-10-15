/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Undo/Redo Manager - Comprehensive edit history management
 * Following display-test-app's undo/redo patterns
 */

import { BeEvent, IModelStatus } from '@itwin/core-bentley';
import type { BriefcaseConnection } from '@itwin/core-frontend';

/** Information about a single undoable operation */
export interface UndoableOperation {
  /** Unique identifier for this operation */
  id: string;
  /** Human-readable description of the operation */
  description: string;
  /** Timestamp when operation was recorded */
  timestamp: number;
  /** Whether this operation can be undone */
  canUndo: boolean;
  /** Whether this operation can be redone */
  canRedo: boolean;
}

/** Event args for undo/redo state changes */
export interface UndoRedoStateChangeEventArgs {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
}

/** Options for recording an operation */
export interface RecordOperationOptions {
  /** Description shown in UI */
  description: string;
  /** Callback to perform the action (for custom undo/redo) */
  do?: () => Promise<void>;
  /** Callback to undo the action */
  undo?: () => Promise<void>;
}

/**
 * Manages undo/redo state for editing operations.
 *
 * RW2-T2 接线真 API（itwinjs-core core/frontend/src/BriefcaseTxns.ts）：
 * - undo → `connection.txns.reverseSingleTxn()`（返回 IModelStatus，非 Success 即失败）
 * - redo → `connection.txns.reinstateTxn()`（同上）
 * - canUndo/canRedo/label 为事件驱动缓存态：真 API `isUndoPossible()/isRedoPossible()/
 *   getUndoString()/getRedoString()` 均为 async，sync getter 只能读缓存；
 *   缓存在 `onCommitted`/`onAfterUndoRedo` 事件后重查刷新。
 *
 * 注意：本类只承载 briefcase 编辑事务栈（「编辑撤销」）。特征 OpLog 通道的
 * 「特征撤销」走 FeaturePanel 的 applyOp({kind:'undo'})，两者互不相干。
 */
export class UndoManager {
  private static _instance: UndoManager;
  private _connection: BriefcaseConnection | undefined;
  private _operationHistory: UndoableOperation[] = [];
  private _currentIndex = -1;
  private _maxHistorySize = 50;
  private _isUndoing = false;
  private _isRedoing = false;

  /** 事件驱动的 txn 栈缓存态（真 API 全 async，sync getter 读此缓存） */
  private _txnCanUndo = false;
  private _txnCanRedo = false;
  private _txnUndoLabel = '';
  private _txnRedoLabel = '';
  /** 退订当前 connection.txns 事件监听（换连接/断连时调用） */
  private _removeTxnListeners: (() => void) | undefined;
  /** 刷新序号：丢弃过期响应，只认最后一次查询 */
  private _refreshSeq = 0;

  /** Event fired when undo/redo availability changes */
  public readonly onStateChanged = new BeEvent<(args: UndoRedoStateChangeEventArgs) => void>();
  /** Event fired when history changes */
  public readonly onHistoryChanged = new BeEvent<() => void>();

  public static get instance(): UndoManager {
    if (!this._instance) {
      this._instance = new UndoManager();
    }
    return this._instance;
  }

  /** Set the active connection for undo/redo operations */
  public setConnection(connection: BriefcaseConnection | undefined): void {
    // 先退订旧连接的 txn 事件，防监听器泄漏与旧连接污染新状态
    this._removeTxnListeners?.();
    this._removeTxnListeners = undefined;

    this._connection = connection;
    this._operationHistory = [];
    this._currentIndex = -1;

    if (connection) {
      const txns = connection.txns;
      const handleTxnEvent = () => {
        void this._refreshTxnState();
      };
      txns.onCommitted.addListener(handleTxnEvent);
      txns.onAfterUndoRedo.addListener(handleTxnEvent);
      this._removeTxnListeners = () => {
        txns.onCommitted.removeListener(handleTxnEvent);
        txns.onAfterUndoRedo.removeListener(handleTxnEvent);
      };
      void this._refreshTxnState();
    } else {
      this._txnCanUndo = false;
      this._txnCanRedo = false;
      this._txnUndoLabel = '';
      this._txnRedoLabel = '';
    }

    this._notifyStateChange();
    this._notifyHistoryChange();
  }

  /** Get the current connection */
  public get connection(): BriefcaseConnection | undefined {
    return this._connection;
  }

  /** Whether an undo operation is currently in progress */
  public get isUndoing(): boolean {
    return this._isUndoing;
  }

  /** Whether a redo operation is currently in progress */
  public get isRedoing(): boolean {
    return this._isRedoing;
  }

  /** Whether undo is available（事件驱动缓存态，事件后异步刷新） */
  public get canUndo(): boolean {
    if (!this._connection) return false;
    return this._txnCanUndo;
  }

  /** Whether redo is available（事件驱动缓存态，事件后异步刷新） */
  public get canRedo(): boolean {
    if (!this._connection) return false;
    return this._txnCanRedo;
  }

  /** Get label for next undo operation（txn 描述优先，历史描述兜底） */
  public get undoLabel(): string {
    if (!this.canUndo) return '';
    return this._txnUndoLabel || this._operationHistory[this._currentIndex]?.description || '编辑撤销';
  }

  /** Get label for next redo operation（txn 描述优先，历史描述兜底） */
  public get redoLabel(): string {
    if (!this.canRedo) return '';
    return this._txnRedoLabel || this._operationHistory[this._currentIndex + 1]?.description || '编辑重做';
  }

  /** Get full operation history (for UI display) */
  public get history(): ReadonlyArray<UndoableOperation> {
    return this._operationHistory.slice();
  }

  /** Get current position in history */
  public get currentIndex(): number {
    return this._currentIndex;
  }

  /**
   * Record an operation in the history
   * Called automatically when edit operations complete
   */
  public recordOperation(options: RecordOperationOptions): void {
    // Remove any operations after current index (redo stack)
    if (this._currentIndex < this._operationHistory.length - 1) {
      this._operationHistory = this._operationHistory.slice(0, this._currentIndex + 1);
    }

    const operation: UndoableOperation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      description: options.description,
      timestamp: Date.now(),
      canUndo: true,
      canRedo: false,
    };

    this._operationHistory.push(operation);
    this._currentIndex++;

    // Limit history size
    if (this._operationHistory.length > this._maxHistorySize) {
      this._operationHistory.shift();
      this._currentIndex--;
    }

    this._notifyStateChange();
    this._notifyHistoryChange();
  }

  /**
   * Perform undo operation（briefcase 编辑事务栈）。
   * 真 API：`connection.txns.reverseSingleTxn()`，按 IModelStatus 判成功；
   * 非零状态或异常均返回 false——不再假成功。
   */
  public async undo(): Promise<boolean> {
    if (!this.canUndo || this._isUndoing || this._isRedoing) {
      return false;
    }

    const connection = this._connection;
    if (!connection) {
      return false;
    }

    this._isUndoing = true;
    let success = false;

    try {
      const status = await connection.txns.reverseSingleTxn();
      success = status === IModelStatus.Success;

      if (success && this._currentIndex >= 0) {
        const op = this._operationHistory[this._currentIndex];
        if (op) {
          op.canRedo = true;
          op.canUndo = false;
        }
        this._currentIndex--;
      }
    } catch {
      // 真后端失败（无写租约/锁冲突等）：如实报失败
      success = false;
    } finally {
      this._isUndoing = false;
      // undo 后同步重查缓存态（真实后端同时会经 onAfterUndoRedo 事件再刷一次；
      // 此处显式刷新保证 undo() 返回时状态已收敛，mock/异常路径也确定）
      await this._refreshTxnState();
      this._notifyHistoryChange();
    }

    return success;
  }

  /**
   * Perform redo operation（briefcase 编辑事务栈）。
   * 真 API：`connection.txns.reinstateTxn()`，按 IModelStatus 判成功。
   */
  public async redo(): Promise<boolean> {
    if (!this.canRedo || this._isUndoing || this._isRedoing) {
      return false;
    }

    const connection = this._connection;
    if (!connection) {
      return false;
    }

    this._isRedoing = true;
    let success = false;

    try {
      const status = await connection.txns.reinstateTxn();
      success = status === IModelStatus.Success;

      if (success && this._currentIndex < this._operationHistory.length - 1) {
        this._currentIndex++;
        const op = this._operationHistory[this._currentIndex];
        if (op) {
          op.canUndo = true;
          op.canRedo = false;
        }
      }
    } catch {
      success = false;
    } finally {
      this._isRedoing = false;
      await this._refreshTxnState();
      this._notifyHistoryChange();
    }

    return success;
  }

  /** Clear all history */
  public clear(): void {
    this._operationHistory = [];
    this._currentIndex = -1;
    this._notifyStateChange();
    this._notifyHistoryChange();
  }

  /** Jump to a specific point in history */
  public async jumpTo(index: number): Promise<boolean> {
    if (index < -1 || index >= this._operationHistory.length) {
      return false;
    }

    const steps = index - this._currentIndex;
    if (steps === 0) return true;

    const isUndo = steps < 0;
    const count = Math.abs(steps);

    for (let i = 0; i < count; i++) {
      const success = isUndo ? await this.undo() : await this.redo();
      if (!success) return false;
    }

    return true;
  }

  /**
   * 重查 txn 栈真状态并写缓存（isUndoPossible/isRedoPossible/getUndoString/getRedoString
   * 均 async，见 itwinjs-core BriefcaseTxns.ts）。带序号去重：只认最后一次查询，
   * 丢弃过期响应；瞬时失败保留旧缓存（下次事件再刷）。
   */
  private async _refreshTxnState(): Promise<void> {
    const connection = this._connection;
    if (!connection) {
      return;
    }
    const seq = ++this._refreshSeq;
    try {
      const txns = connection.txns;
      const [canUndo, canRedo, undoLabel, redoLabel] = await Promise.all([
        txns.isUndoPossible(),
        txns.isRedoPossible(),
        txns.getUndoString(),
        txns.getRedoString(),
      ]);
      if (seq !== this._refreshSeq || this._connection !== connection) {
        return; // 过期响应（期间换过连接或又触发了一次刷新）
      }
      this._txnCanUndo = canUndo;
      this._txnCanRedo = canRedo;
      this._txnUndoLabel = undoLabel;
      this._txnRedoLabel = redoLabel;
      this._notifyStateChange();
    } catch {
      // 状态查询失败（如后端瞬断）：保留旧缓存，等下一次 onCommitted/onAfterUndoRedo 再刷
    }
  }

  private _notifyStateChange(): void {
    this.onStateChanged.raiseEvent({
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel,
    });
  }

  private _notifyHistoryChange(): void {
    this.onHistoryChanged.raiseEvent();
  }
}

/** Global instance accessor */
export const undoManager = UndoManager.instance;
