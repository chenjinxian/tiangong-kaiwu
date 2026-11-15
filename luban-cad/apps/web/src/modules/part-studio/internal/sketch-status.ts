/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图状态读数（2026-11-15 E4/S4b Onshape live 对齐）纯逻辑：
 * - `formatStatusPoint` / `formatStatusLength`：固定 mm（产品单位）3 位小数；
 * - `resolveSketchStatusLength`：`store.canvas.selection` 唯一权威 + 活动草图
 *   DTO → 单条选中曲线的长度/半径读数。
 *
 * 只做显示投影，不写模型状态、不发 RPC。Onshape live 的元素标签是
 * `长度:`（文档单位）；本产品固定 mm，单位后缀逐坐标重复（与 live
 * `X -3.561 in Y 0.000 in Z 0.749 in` 同构）。
 *
 * 单位口径（2026-11-15 复核）：本产品草图 DTO 局部与 iTwin 世界数值均按
 * **产品固定 mm** 解释（`sketch-plane.ts` 注释里的「米制」是遗留误导）；
 * 证据：种子草图 20×20 拉伸体积 4000 mm³（e2e cplane-point / sketch-create-
 * parity 以坐标 20 表示 20 mm），尺寸标注 `formatSketchDimensionValue` 直接
 * 打印原始值并用 mm 文案。因此读数**不做 1000× 缩放**——直接按 mm 显示。
 */

import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';

/** 状态读数点（世界系 mm）。 */
export interface SketchStatusPoint {
  x: number;
  y: number;
  z: number;
}

/** 长度/半径读数种类（组件映射既有 i18n 键 `partStudio.sketch.live.*`）。 */
export type SketchStatusLengthKind = 'length' | 'radius';

export interface SketchStatusLength {
  kind: SketchStatusLengthKind;
  /** 毫米值（与草图 DTO 局部坐标同单位）。 */
  valueMm: number;
}

/** 选择项结构（兼容 `store.canvas.selection` 的 sketchPart 与 picker 的 part）。 */
export interface SketchStatusSelectionEntry {
  sketchId?: string;
  entityId?: number;
  sketchPart?: 'curve' | 'handle';
  part?: 'curve' | 'handle';
  handleIndex?: number;
}

interface LocalPoint {
  x: number;
  y: number;
}

/** 3 位小数；`-0.000` 归一为 `0.000`；非有限值显示 `?`（不伪造 0）。 */
export function formatStatusNumber(value: number): string {
  if (!Number.isFinite(value))
    return '?';
  const fixed = value.toFixed(3);
  return fixed === '-0.000' ? '0.000' : fixed;
}

/** `X 1.235 mm Y -2.000 mm Z 0.000 mm`（Onshape 逐坐标单位后缀）。 */
export function formatStatusPoint(point: SketchStatusPoint): string {
  return `X ${formatStatusNumber(point.x)} mm Y ${formatStatusNumber(point.y)} mm Z ${formatStatusNumber(point.z)} mm`;
}

/** `12.346 mm`（固定 mm）。 */
export function formatStatusLength(valueMm: number): string {
  return `${formatStatusNumber(valueMm)} mm`;
}

function collectPointEntities(entities: readonly SketchEntityDto[]): Map<number, LocalPoint> {
  const points = new Map<number, LocalPoint>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.x === 'number' && typeof entity.y === 'number')
      points.set(entity.id, { x: entity.x, y: entity.y });
  }
  return points;
}

function resolvePoint(
  ref: number | { x: number; y: number },
  points: ReadonlyMap<number, LocalPoint>,
): LocalPoint | undefined {
  if (typeof ref === 'number')
    return points.get(ref);
  return Number.isFinite(ref.x) && Number.isFinite(ref.y) ? { x: ref.x, y: ref.y } : undefined;
}

function isCurveSelection(entry: SketchStatusSelectionEntry): boolean {
  return entry.handleIndex === undefined
    && (entry.part ?? entry.sketchPart ?? 'curve') !== 'handle';
}

/**
 * 活动草图中恰好选中一条曲线实体时的长度读数：
 * - line → 两端点距离（端点支持点实体数值引用/内联坐标）；
 * - circle/arc（有 radius）→ 半径。
 * 其余（多选/控制点/点/样条/无法解析/非活动草图）→ null（不显示长度段）。
 */
export function resolveSketchStatusLength(
  sketch: Pick<SketchDto, 'id' | 'entities'> | null | undefined,
  selection: readonly SketchStatusSelectionEntry[],
): SketchStatusLength | null {
  if (!sketch)
    return null;
  const curves = selection.filter((entry) =>
    entry.sketchId === sketch.id
    && entry.entityId !== undefined
    && isCurveSelection(entry));
  // 同实体重复条目（多源选择投影）按一个实体计——去重后必须恰好一条。
  const entityIds = [...new Set(curves.map((entry) => entry.entityId!))];
  if (entityIds.length !== 1)
    return null;

  const entity = sketch.entities.find((candidate) => candidate.id === entityIds[0]);
  if (!entity)
    return null;

  switch (entity.kind) {
    case 'line': {
      const points = collectPointEntities(sketch.entities);
      const start = resolvePoint(entity.p1, points);
      const end = resolvePoint(entity.p2, points);
      if (!start || !end)
        return null;
      // DTO 数值即产品固定 mm（20×20 草图体积 4000 mm³ 的既有口径）。
      const valueMm = Math.hypot(end.x - start.x, end.y - start.y);
      return Number.isFinite(valueMm) ? { kind: 'length', valueMm } : null;
    }
    case 'circle':
    case 'arc': {
      const radius = entity.radius;
      if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0)
        return null;
      return { kind: 'radius', valueMm: radius };
    }
    default:
      return null;
  }
}
