/*-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
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
  private currentDialog: DialogRequest | null = null;
  private queue: DialogRequest[] = [];
  private listeners: Set<() => void> = new Set();

  /**
   * Show category picker dialog
   * Returns the selected category ID or undefined if cancelled
   */
  async showCategoryPicker(): Promise<string | undefined> {
    return this.showDialog<string>('categoryPicker');
  }

  /**
   * Internal method to show a dialog
   */
  private showDialog<T>(type: DialogType, data?: Record<string, unknown>): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request: DialogRequest<T> = {
        type,
        resolve: resolve as (value: unknown) => void,
        reject,
        data,
      };

      if (this.currentDialog) {
        this.queue.push(request as DialogRequest);
      } else {
        this.currentDialog = request as DialogRequest;
        this.notifyListeners();
      }
    });
  }

  /**
   * Get current dialog request (for React components to render)
   */
  getCurrentDialog(): DialogRequest | null {
    return this.currentDialog;
  }

  /**
   * Subscribe to dialog changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Close current dialog with a result
   */
  closeDialog(result?: unknown): void {
    if (this.currentDialog) {
      this.currentDialog.resolve(result);
      this.currentDialog = null;

      // Process next dialog in queue
      if (this.queue.length > 0) {
        this.currentDialog = this.queue.shift() || null;
      }

      this.notifyListeners();
    }
  }

  /**
   * Cancel current dialog
   */
  cancelDialog(): void {
    if (this.currentDialog) {
      this.currentDialog.resolve(undefined);
      this.currentDialog = null;

      // Process next dialog in queue
      if (this.queue.length > 0) {
        this.currentDialog = this.queue.shift() || null;
      }

      this.notifyListeners();
    }
  }

  /**
   * Clear all pending dialogs
   */
  clearAll(): void {
    if (this.currentDialog) {
      this.currentDialog.resolve(undefined);
    }
    this.queue.forEach(req => req.resolve(undefined));
    this.queue = [];
    this.currentDialog = null;
    this.notifyListeners();
  }
}

export const dialogService = new DialogService();
export default dialogService;
