/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图尺寸数值标签拾取（ADR-0018 S1e）：标签屏幕位置由 viewer 的
 * `layoutSketchDimensions`/`sketchDimensionLabels` 纯函数给出（与绘制同源），
 * 本模块只做命中判定与约束 id 解析。
 */
import type { SketchConstraintGlyphLayout, SketchDimensionLabel } from '@luban-cad/viewer';

export interface ScreenPoint2 { x: number; y: number }

/** 标签 id 形如 `dimension-<constraintId>`（sketch-annotations.ts 同源）。 */
export function constraintIdFromDimensionLabel(id: string): number | null {
  const match = /^dimension-(\d+)$/.exec(id);
  if (!match)
    return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/** 非尺寸约束 glyph 命中：方块矩形（含 tolerance 外扩）内取中心最近者。 */
export function hitTestSketchConstraintGlyph(
  glyphs: readonly SketchConstraintGlyphLayout[],
  point: ScreenPoint2,
  tolerance = 1,
): SketchConstraintGlyphLayout | null {
  let best: { glyph: SketchConstraintGlyphLayout; distance: number } | null = null;
  for (const glyph of glyphs) {
    const { left, top, right, bottom } = glyph.rect;
    if (point.x < left - tolerance || point.x > right + tolerance
      || point.y < top - tolerance || point.y > bottom + tolerance)
      continue;
    const distance = Math.hypot(point.x - glyph.center.x, point.y - glyph.center.y);
    if (!best || distance < best.distance)
      best = { glyph, distance };
  }
  return best?.glyph ?? null;
}

/** 命中判定：优先中心距离（框内取最近），容差外返回 null。 */
export function hitTestSketchDimensionLabel(
  labels: readonly SketchDimensionLabel[],
  point: ScreenPoint2,
  tolerance = 2,
): SketchDimensionLabel | null {
  let best: { label: SketchDimensionLabel; distance: number } | null = null;
  for (const label of labels) {
    const { left, top, right, bottom } = label.rect;
    const halfW = (right - left) / 2;
    const halfH = (bottom - top) / 2;
    const dx = Math.abs(point.x - label.center.x);
    const dy = Math.abs(point.y - label.center.y);
    if (dx > halfW + tolerance || dy > halfH + tolerance)
      continue;
    const distance = Math.hypot(point.x - label.center.x, point.y - label.center.y);
    if (!best || distance < best.distance)
      best = { label, distance };
  }
  return best?.label ?? null;
}
