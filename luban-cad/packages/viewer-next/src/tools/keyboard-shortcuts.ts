/**
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *
 * registerDefaultShortcuts 子集移植（web-next M4 Task 3；源 apps/web/src/core/
 * shortcuts/KeyboardManager.ts）——brief 钉死：仅 Undo/Redo/Delete/Escape 相关键
 * 位，全表（Ctrl+A 选择/视图单键 f r p z w/s）移植延后。
 *
 * 与旧实现的差异（诚实登记，勿静默）：
 *  - 键位→toolId 直连：旧表 Undo/Redo 绑 'LubanCad.Undo'/'LubanCad.Redo'，旧应用
 *    从未注册这两个 toolId（死绑定，tools.run 返回 false）——此处绑 vendored
 *    editor-frontend 内置 UndoTool/RedoTool 的真实 toolId 'Undo'/'Redo'
 *    （ensureEditTools 已注册；M4-T4 顶栏撤销/重做走同一标准通道）；
 *  - Delete：旧应用在 features/editor/hooks/useEditorKeyboard.ts（非
 *    KeyboardManager）处理，回调式 deleteSelected()——此处绑注册在册的标准
 *    DeleteElementsTool（选择集语义同源，不引第二套删除 API）；
 *  - 派发接线：旧 KeyboardManager 需 app 侧 useEditorKeyboard 调
 *    handleKeyDown(e)——web-next 由本模块自挂 window 监听（幂等；T4 的
 *    useEditorKeyboard 只补 Ctrl+S 等 app 性行为，Undo/Redo/Delete/Escape 勿
 *    二次绑定避免双跑）；INPUT/TEXTAREA/contentEditable 焦点守卫（旧 Delete
 *    守卫同口径，扩至全键位）。
 */

import { IModelApp } from '@itwin/core-frontend';

/** 轮询上限（毫秒预算语义与旧 Editor.tsx 无关——此处仅派发，不做轮询）。 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

let installed = false;

/** 键位是否命中输入焦点（守卫：编辑框内击键不触发工具；旧 useEditorKeyboard
 * 以 document.activeElement 判定，事件目标优先——合成派发 target 缺元素时回退）。 */
function isEditableTarget(e: KeyboardEvent): boolean {
  const target = (e.target instanceof Element ? e.target : document.activeElement) as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return EDITABLE_TAGS.has(tag) || target.isContentEditable === true;
}

/** 键位派发（window keydown；导出仅供测试/未来 app 侧复用）。 */
export function handleEditorKeyDown(e: KeyboardEvent): void {
  if (!installed || isEditableTarget(e)) return;

  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (ctrl && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    void IModelApp.tools.run('Undo');
    return;
  }
  if (ctrl && ((key === 'z' && e.shiftKey) || key === 'y')) {
    e.preventDefault();
    e.stopPropagation();
    void IModelApp.tools.run('Redo');
    return;
  }
  if (!ctrl && !e.altKey && key === 'delete') {
    e.preventDefault();
    e.stopPropagation();
    void IModelApp.tools.run('DeleteElements');
    return;
  }
  if (!ctrl && !e.altKey && key === 'escape') {
    e.preventDefault();
    e.stopPropagation();
    void IModelApp.toolAdmin?.startDefaultTool();
  }
}

/**
 * 安装默认快捷键子集（幂等；ensureEditTools 尾部调用）。
 * 卸载走 unregisterDefaultShortcuts（测试/页签卸载场景）。
 */
export function registerDefaultShortcuts(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', handleEditorKeyDown, true);
}

/** 卸载键位派发（幂等）。 */
export function unregisterDefaultShortcuts(): void {
  if (!installed || typeof window === 'undefined') return;
  installed = false;
  window.removeEventListener('keydown', handleEditorKeyDown, true);
}

/** 安装态查询（T4 useEditorKeyboard 判据：已安装则勿二次绑定 Undo/Redo 键）。 */
export function isDefaultShortcutsInstalled(): boolean {
  return installed;
}
