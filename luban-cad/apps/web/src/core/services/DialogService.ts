/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dialog Service - Manages dialog state for tools that need UI interaction
 *
 * This service allows non-React code (like CAD tools) to trigger React dialogs
 * and receive results asynchronously.
 */

export type DialogType = 'categoryPicker' | 'elementPicker' | 'confirm';

export interface DialogRequest<T = unknown> {
  type: DialogType;
  resolve: (value: T | undefined) => void;
  reject: (reason?: Error) => void;
  data?: Record<string, unknown>;
}

class DialogService {
  private _currentDialog: DialogRequest | null = null;
  private _queue: DialogRequest[] = [];
  private _listeners: Set<() => void> = new Set();

  /**
   * Show category picker dialog
   * Returns the selected category ID or undefined if cancelled
   */
  public async showCategoryPicker(): Promise<string | undefined> {
    return this.showDialog<string>('categoryPicker');
  }

  /**
   * Internal method to show a dialog
   */
  private async showDialog<T>(type: DialogType, data?: Record<string, unknown>): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request: DialogRequest<T> = {
        type,
        resolve,
        reject,
        data,
      };

      if (this._currentDialog) {
        this._queue.push(request as DialogRequest);
      } else {
        this._currentDialog = request as DialogRequest;
        this.notifyListeners();
      }
    });
  }

  /**
   * Get current dialog request (for React components to render)
   */
  public getCurrentDialog(): DialogRequest | null {
    return this._currentDialog;
  }

  /**
   * Subscribe to dialog changes
   */
  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private notifyListeners(): void {
    this._listeners.forEach(listener => listener());
  }

  /**
   * Close current dialog with a result
   */
  public closeDialog(result?: unknown): void {
    if (this._currentDialog) {
      this._currentDialog.resolve(result);
      this._currentDialog = null;

      // Process next dialog in queue
      if (this._queue.length > 0) {
        this._currentDialog = this._queue.shift() || null;
      }

      this.notifyListeners();
    }
  }

  /**
   * Cancel current dialog
   */
  public cancelDialog(): void {
    if (this._currentDialog) {
      this._currentDialog.resolve(undefined);
      this._currentDialog = null;

      // Process next dialog in queue
      if (this._queue.length > 0) {
        this._currentDialog = this._queue.shift() || null;
      }

      this.notifyListeners();
    }
  }

  /**
   * Clear all pending dialogs
   */
  public clearAll(): void {
    if (this._currentDialog) {
      this._currentDialog.resolve(undefined);
    }
    this._queue.forEach(req => req.resolve(undefined));
    this._queue = [];
    this._currentDialog = null;
    this.notifyListeners();
  }
}

export const dialogService = new DialogService();
export default dialogService;
