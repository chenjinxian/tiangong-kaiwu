/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 右键拖拽与右键菜单的判定（2026-11-12 Onshape 对拍）：
 * Onshape 右键拖拽旋转视图，右键单击（无位移）才弹上下文菜单。Chrome 在右键
 * mouseup 之后仍会派发 contextmenu（已实测），因此拖拽开始时置一次性抑制标志，
 * 画布/草图拾取层的 contextmenu 处理器消费后清除；右键按下时重置，保证未产生
 * contextmenu 的拖拽不会吞掉下一次单击。
 */
let suppressNextContextMenu = false;

export function markRightDragMenuSuppression(): void {
  suppressNextContextMenu = true;
}

export function clearRightDragMenuSuppression(): void {
  suppressNextContextMenu = false;
}

/** 消费一次性抑制标志（返回 true 表示本次 contextmenu 来自右键拖拽）。 */
export function consumeRightDragMenuSuppression(): boolean {
  const suppressed = suppressNextContextMenu;
  suppressNextContextMenu = false;
  return suppressed;
}
