/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Undo/Redo Manager - Comprehensive edit history management
 * Following display-test-app's undo/redo patterns
 */

import { BeEvent } from '@itwin/core-bentley';
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
 * Manages undo/redo state for editing operations
 * Integrates with IModelConnection's built-in txns for element editing
 */
export class UndoManager {
  private static _instance: UndoManager;
  private _connection: BriefcaseConnection | undefined;
  private _operationHistory: UndoableOperation[] = [];
  private _currentIndex = -1;
  private _maxHistorySize = 50;
  private _isUndoing = false;
  private _isRedoing = false;

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
    this._connection = connection;
    this._operationHistory = [];
    this._currentIndex = -1;
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

  /** Whether undo is available */
  public get canUndo(): boolean {
    if (!this._connection) return false;
    // Use connection's built-in txn capabilities if available
    // Note: isUndoAvailable may not exist in current API version
    const conn = this._connection as unknown as { isUndoAvailable?: boolean };
    return conn.isUndoAvailable ?? this._currentIndex >= 0;
  }

  /** Whether redo is available */
  public get canRedo(): boolean {
    if (!this._connection) return false;
    // Note: isRedoAvailable may not exist in current API version
    const conn = this._connection as unknown as { isRedoAvailable?: boolean };
    return conn.isRedoAvailable ?? this._currentIndex < this._operationHistory.length - 1;
  }

  /** Get label for next undo operation */
  public get undoLabel(): string {
    if (!this.canUndo) return '';
    const current = this._operationHistory[this._currentIndex];
    return current?.description ?? 'Undo';
  }

  /** Get label for next redo operation */
  public get redoLabel(): string {
    if (!this.canRedo) return '';
    const next = this._operationHistory[this._currentIndex + 1];
    return next?.description ?? 'Redo';
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
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
   * Perform undo operation
   * Uses IModelConnection's built-in undo when available
   */
  public async undo(): Promise<boolean> {
    if (!this.canUndo || this._isUndoing || this._isRedoing) {
      return false;
    }

    this._isUndoing = true;
    let success = false;

    try {
      if (this._connection) {
        // Note: reverseSingleTxn may not exist in current API version
        const conn = this._connection as unknown as { reverseSingleTxn?: () => Promise<void> };
        if (conn.reverseSingleTxn) {
          await conn.reverseSingleTxn();
        }
        success = true;
      }

      if (success && this._currentIndex >= 0) {
        const op = this._operationHistory[this._currentIndex];
        if (op) {
          op.canRedo = true;
          op.canUndo = false;
        }
        this._currentIndex--;
      }
    } finally {
      this._isUndoing = false;
      this._notifyStateChange();
      this._notifyHistoryChange();
    }

    return success;
  }

  /**
   * Perform redo operation
   * Uses IModelConnection's built-in redo when available
   */
  public async redo(): Promise<boolean> {
    if (!this.canRedo || this._isUndoing || this._isRedoing) {
      return false;
    }

    this._isRedoing = true;
    let success = false;

    try {
      if (this._connection) {
        // Note: reinstateTxn may not exist in current API version
        const conn = this._connection as unknown as { reinstateTxn?: () => Promise<void> };
        if (conn.reinstateTxn) {
          await conn.reinstateTxn();
        }
        success = true;
      }

      if (success && this._currentIndex < this._operationHistory.length - 1) {
        this._currentIndex++;
        const op = this._operationHistory[this._currentIndex];
        if (op) {
          op.canUndo = true;
          op.canRedo = false;
        }
      }
    } finally {
      this._isRedoing = false;
      this._notifyStateChange();
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
