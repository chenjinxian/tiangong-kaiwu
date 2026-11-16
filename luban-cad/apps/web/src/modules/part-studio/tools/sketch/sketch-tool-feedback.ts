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

/**
 * 绘制中的画布数值标签（2026-11-16 E6/S5 + W12 Onshape live）——两种形态：
 * - `edge`：贴在边旁的数值（矩形宽/高、直线长度）。start/end 是边的视口
 *   坐标（CSS px，相对画布左上角；与 `cursor` 同一坐标空间），覆盖层据此
 *   算中点/角度/外偏移并随边旋转；
 * - `point`：点标签（中心点圆直径、三点圆弧 `R` 半径）。point 是标签中心的
 *   视口坐标，水平不旋转；可见文本 = `prefix` + `value`（如 `Ø20`、`R1.897`）。
 * 两者都只做显示投影：数值由 sketch-live-measures 产出，位置由工具投影到
 * 视口，不碰 IModelApp、RPC、schema 或草图数据。
 */
export interface SketchToolEdgeLabel {
  kind: 'edge';
  /** i18n 键（与 `measures` 同一 labelKey——覆盖层据此避免重复渲染白卡片）。 */
  labelKey: string;
  /** 已格式化数值（复用 computeSketchLiveMeasures 的格式）。 */
  value: string;
  /** 边起点（视口坐标）。 */
  start: { x: number; y: number };
  /** 边终点（视口坐标）。 */
  end: { x: number; y: number };
  /**
   * 本标签额外抑制的光标卡尺寸键（缺省只抑制同 `labelKey` 的 measure）。
   * 直线：长度贴线渲染时 live 无白卡片，连角度卡一并抑制（measure 列表不变）。
   */
  suppressesLabelKeys?: readonly string[];
}

/**
 * 点标签（中心点圆直径、三点圆弧半径；水平不旋转）。
 * - 中心点圆：落在圆心→光标半径段中点，前缀 `Ø`；
 * - 三点圆弧（W15）：落在弧角向中点外侧，前缀 `R`。
 */
export interface SketchToolPointLabel {
  kind: 'point';
  /** i18n 键（语义键；可见文本 = `prefix` + `value`，不渲染键名本身）。 */
  labelKey: string;
  /** 已格式化数值（复用 computeSketchLiveMeasures 的格式）。 */
  value: string;
  /** 标签中心（视口坐标）。 */
  point: { x: number; y: number };
  /** 文本前缀（如直径符号 `Ø`、半径 `R`）。 */
  prefix?: string;
  /**
   * 本标签额外抑制的光标卡尺寸键（缺省只抑制同 `labelKey` 的 measure）。
   * 中心点圆：直径点标签（语义键=`diameter`）抑制 `radius` 卡；
   * 三点圆弧：`R` 半径点标签抑制同名 `radius` 卡（live 同帧无白卡片）。
   */
  suppressesLabelKeys?: readonly string[];
}

export type SketchToolDrawLabel = SketchToolEdgeLabel | SketchToolPointLabel;

export interface SketchToolFeedback {
  toolId: string;
  /** 当前阶段提示（已翻译；如「点击放置矩形对角点」）。 */
  hint?: string;
  /** 光标旁实时尺寸（空数组=只显示提示）。 */
  measures: readonly SketchLiveMeasure[];
  /** 视口坐标（CSS px，相对画布左上角）。 */
  cursor?: { x: number; y: number };
  /**
   * 画布数值标签（2026-11-16 E6/S5 Onshape live；W12 扩展直线长度与圆直径）：
   * 矩形宽度/高度与直线长度贴在边旁，中心点圆直径落在半径段中点，相应尺寸
   * 不再使用光标旁白卡片。旧发布方不带该字段仍合法。
   */
  drawLabels?: readonly SketchToolDrawLabel[];
  /**
   * 视口锚点徽标（CSS px，相对画布左上角；与 `cursor` 同一坐标空间）。
   * 2026-11-15 E3 Onshape live：草图圆角悬停角点时，画布在角点画橙色圆点 +
   * 右上角浅褐 `R0.25` 标签；产品以本字段驱动只读 HTML 覆盖层。旧发布方
   * 不带该字段仍合法（覆盖层不渲染徽标）。
   */
  badge?: { x: number; y: number; text: string };
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

/** 只发阶段提示的便捷入口（尺寸/约束/偏移工具复用；不携带 badge）。 */
export function publishSketchToolHint(toolId: string, hint: string, cursor?: { x: number; y: number }): void {
  publishSketchToolFeedback({ toolId, hint, measures: [], ...(cursor ? { cursor } : {}) });
}
