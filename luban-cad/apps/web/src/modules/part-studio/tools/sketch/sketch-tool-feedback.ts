/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图工具反馈总线（2026-11-02 Onshape live 标注提示）：工具在鼠标移动/落点
 * 时发布「阶段提示 + 当前尺寸 + 视口光标坐标」，画布上的
 * SketchToolFeedbackOverlay 订阅渲染。刻意不写入 zustand store——光标每帧
 * 变化，只有这个小覆盖层重渲染，画布/特征树零联动。
 *
 * toolId 守卫清理：旧工具 onCleanup 不得清掉刚安装的新工具反馈。
 */
import type { SketchLiveMeasure } from './sketch-live-measures.js';

export interface SketchToolFeedback {
  toolId: string;
  /** 当前阶段提示（已翻译；如「点击放置矩形对角点」）。 */
  hint?: string;
  /** 光标旁实时尺寸（空数组=只显示提示）。 */
  measures: readonly SketchLiveMeasure[];
  /** 视口坐标（CSS px，相对画布左上角）。 */
  cursor?: { x: number; y: number };
}

let current: SketchToolFeedback | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** 发布反馈（工具调用；cursor 缺省时覆盖层不渲染）。 */
export function publishSketchToolFeedback(next: SketchToolFeedback): void {
  current = next;
  notify();
}

/** 清理反馈；传 toolId 时仅在该反馈仍属于该工具时清理。 */
export function clearSketchToolFeedback(toolId?: string): void {
  if (toolId !== undefined && current !== undefined && current.toolId !== toolId) return;
  if (current === undefined) return;
  current = undefined;
  notify();
}

/** useSyncExternalStore 快照（未发布为 undefined）。 */
export function getSketchToolFeedback(): SketchToolFeedback | undefined {
  return current;
}

/** 订阅反馈变化（返回退订函数）。 */
export function subscribeSketchToolFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 只发阶段提示的便捷入口（尺寸/约束/偏移工具复用）。 */
export function publishSketchToolHint(toolId: string, hint: string, cursor?: { x: number; y: number }): void {
  publishSketchToolFeedback({ toolId, hint, measures: [], ...(cursor ? { cursor } : {}) });
}
