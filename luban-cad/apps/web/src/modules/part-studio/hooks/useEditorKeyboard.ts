/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useEditorKeyboard（web M4 Task 4）：编辑器 app 性行为键——**只绑
 * Ctrl+S / Cmd+S（保存）**。
 *
 * 控制器裁定（T3 交接单，硬约束）：viewer registerDefaultShortcuts 已把
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Delete / Escape 绑到真实注册工具（'Undo'/
 * 'Redo'/'DeleteElements'/默认工具）并自挂 window 捕获段监听——本 hook **不得
 * 二次绑定**（React 键盘层再拦一层 = 工具双跑）；undo/redo 走 viewer
 * 快捷键通道，不经本 hook（签名按裁定收缩为 `actions: { save }`）。
 * （安装态判据 `isDefaultShortcutsInstalled()` 在 viewer
 * tools/keyboard-shortcuts.ts 内部，未经 barrel 出口——T4 评审 Minor-2 勘误。）
 *
 * 与旧应用差异（诚实登记）：旧 `features/editor/hooks/useEditorKeyboard.ts`
 * 是 Delete 键 + keyboardManager.handleKeyDown 委托派发；web Delete/
 * Escape/undo/redo 已由 viewer 快捷键子集接管，本 hook 只保留 app 性行为
 * （保存）+ editable 焦点门（INPUT/TEXTAREA/SELECT/contentEditable 内击键不
 * 派发，同 viewer 守卫口径）+ preventDefault（拦浏览器另存为对话框）。
 * save 的 Promise 拒绝就地吞掉（错误面由调用方 onStatus/notifications 负责，
 * 不逃逸成 unhandled rejection——旧 Editor 键盘层同款纪律）。
 */

import { useEffect, useRef } from 'react';

export interface EditorKeyboardActions {
  /** 保存动作（Ctrl+S / Cmd+S；供 useUndoRedo().saveChanges 等代理）。 */
  save: () => void | Promise<void>;
}

/** 可编辑标签守卫集（viewer keyboard-shortcuts 同口径）。 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** 焦点是否落在可编辑目标（事件目标优先，合成派发缺元素回退 activeElement）。
 * isContentEditable 之外加 contenteditable 属性回查：jsdom 不实现该反射属性
 * （测试环境守卫可达），真实浏览器两路等价。 */
function isEditableTarget(e: KeyboardEvent): boolean {
  const target = (e.target instanceof Element ? e.target : document.activeElement) as HTMLElement | null;
  if (!target) return false;
  return (
    EDITABLE_TAGS.has(target.tagName)
    || target.isContentEditable === true
    || target.getAttribute('contenteditable') === 'true'
  );
}

export function useEditorKeyboard(enabled: boolean, actions: EditorKeyboardActions): void {
  // actions 经 ref 取用：监听器终身一次挂载，回调用方无需 memo（键位层不因
  // 闭包换_identity 重挂/漏挂）。
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e)) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        try {
          void Promise.resolve(actionsRef.current.save()).catch(() => undefined);
        } catch {
          // 同步抛错同口径吞掉（拒绝不逃逸为 unhandled rejection）。
        }
      }
      // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Delete / Escape：viewer
      // registerDefaultShortcuts 独占，此处有意不处理。
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
