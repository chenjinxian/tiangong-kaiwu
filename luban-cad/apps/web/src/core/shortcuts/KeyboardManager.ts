/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Keyboard Shortcuts Manager
 */

import { IModelApp } from '@itwin/core-frontend';
import { BeEvent } from '@itwin/core-bentley';

export interface KeyboardShortcut {
  key: string;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
  toolId?: string;
  action?: () => void | Promise<void>;
  description: string;
}

export class KeyboardManager {
  private static _instance: KeyboardManager;
  private _shortcuts = new Map<string, KeyboardShortcut>();
  private _enabled = true;

  public readonly onShortcutTriggered = new BeEvent<(shortcut: KeyboardShortcut) => void>();

  public static get instance(): KeyboardManager {
    if (!this._instance) {
      this._instance = new KeyboardManager();
    }
    return this._instance;
  }

  public register(shortcut: KeyboardShortcut): void {
    const key = this._getKeyString(shortcut);
    this._shortcuts.set(key, shortcut);
  }

  public unregister(key: string, modifiers?: KeyboardShortcut['modifiers']): void {
    const keyString = this._getKeyString({ key, modifiers } as KeyboardShortcut);
    this._shortcuts.delete(keyString);
  }

  public enable(): void {
    this._enabled = true;
  }

  public disable(): void {
    this._enabled = false;
  }

  public getShortcuts(): ReadonlyArray<KeyboardShortcut> {
    return Array.from(this._shortcuts.values());
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    if (!this._enabled) return false;

    const shortcut: KeyboardShortcut = {
      key: e.key.toLowerCase(),
      modifiers: {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      },
      description: '',
    };

    const keyString = this._getKeyString(shortcut);
    const registered = this._shortcuts.get(keyString);

    if (registered) {
      e.preventDefault();
      e.stopPropagation();

      this.onShortcutTriggered.raiseEvent(registered);

      if (registered.toolId) {
        void IModelApp.tools.run(registered.toolId);
      } else if (registered.action) {
        void registered.action();
      }
      return true;
    }

    return false;
  }

  private _getKeyString(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];
    if (shortcut.modifiers?.ctrl) parts.push('ctrl');
    if (shortcut.modifiers?.shift) parts.push('shift');
    if (shortcut.modifiers?.alt) parts.push('alt');
    if (shortcut.modifiers?.meta) parts.push('meta');
    parts.push(shortcut.key.toLowerCase());
    return parts.join('+');
  }
}

export const keyboardManager = KeyboardManager.instance;

// Default shortcuts
export function registerDefaultShortcuts(): void {
  // Undo/Redo
  keyboardManager.register({
    key: 'z',
    modifiers: { ctrl: true },
    toolId: 'LubanCad.Undo',
    description: '撤销',
  });
  keyboardManager.register({
    key: 'z',
    modifiers: { ctrl: true, shift: true },
    toolId: 'LubanCad.Redo',
    description: '重做',
  });
  keyboardManager.register({
    key: 'y',
    modifiers: { ctrl: true },
    toolId: 'LubanCad.Redo',
    description: '重做 (替代)',
  });

  // Selection
  keyboardManager.register({
    key: 'a',
    modifiers: { ctrl: true },
    toolId: 'LubanCad.SelectAll',
    description: '全选',
  });

  // View
  keyboardManager.register({
    key: 'f',
    toolId: 'View.Fit',
    description: '适应视图 (Fit View)',
  });
  keyboardManager.register({
    key: 'r',
    toolId: 'View.Rotate',
    description: '旋转视图 (Rotate View)',
  });
  keyboardManager.register({
    key: 'p',
    toolId: 'View.Pan',
    description: '平移视图 (Pan View)',
  });
  keyboardManager.register({
    key: 'z',
    toolId: 'View.Zoom',
    description: '缩放视图 (Zoom View)',
  });
  keyboardManager.register({
    key: 'w',
    toolId: 'View.WindowArea',
    description: '窗口区域 (Window Area)',
  });
  keyboardManager.register({
    key: 's',
    action: async () => {
      await IModelApp.toolAdmin?.startDefaultTool();
    },
    description: '选择工具 (Select)',
  });

  // Escape to exit tool
  keyboardManager.register({
    key: 'escape',
    action: async () => {
      await IModelApp.toolAdmin.startDefaultTool();
    },
    description: '退出当前工具',
  });
}
