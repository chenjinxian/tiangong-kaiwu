/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ASCII DXF → 草图实体（Onshape「插入 DXF 或 DWG」首切片，2026-11-12）。
 *
 * 支持 LINE / CIRCLE / ARC / POINT / LWPOLYLINE（直线段 + bulge 圆弧段；
 * 忽略 BLOCKS/INSERT/样条等）；
 * 读取 HEADER `$INSUNITS`（缺省毫米）并换算为毫米；DXF 的 XY 平面直接映射
 * 到当前草图局部 (u,v)（不旋转/不放置）。未支持实体计数返回，UI 诚实提示
 * 跳过数量，不静默丢弃。
 */
import type { SketchEntityDto } from '@luban-cad/shared';

export interface DxfImportResult {
  entities: SketchEntityDto[];
  skipped: number;
  units: string;
}

interface Pair { code: number; value: string }

const UNIT_SCALE: Record<number, { scale: number; label: string }> = {
  1: { scale: 25.4, label: 'in' },
  2: { scale: 304.8, label: 'ft' },
  4: { scale: 1, label: 'mm' },
  5: { scale: 10, label: 'cm' },
  6: { scale: 1000, label: 'm' },
};

function pairs(text: string): Pair[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (!Number.isFinite(code))
      continue;
    out.push({ code, value: lines[i + 1]!.trim() });
  }
  return out;
}

function headerUnits(all: readonly Pair[]): { scale: number; label: string } {
  for (let i = 0; i + 1 < all.length; i++) {
    if (all[i]!.code === 9 && all[i]!.value === '$INSUNITS' && all[i + 1]!.code === 70) {
      const units = Number(all[i + 1]!.value);
      return UNIT_SCALE[units] ?? { scale: 1, label: 'mm' };
    }
  }
  return { scale: 1, label: 'mm' };
}

function valuesOf(groups: readonly Pair[], code: number): string[] {
  return groups.filter((pair) => pair.code === code).map((pair) => pair.value);
}

function num(groups: readonly Pair[], code: number): number | undefined {
  const raw = valuesOf(groups, code)[0];
  if (raw === undefined)
    return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** 顶点序列（LWPOLYLINE：重复 10/20；bulge 42 与顶点对齐，缺省 0）。 */
function polylineVertices(groups: readonly Pair[]): { points: Array<{ x: number; y: number }>; bulges: number[] } | undefined {
  const xs = valuesOf(groups, 10).map(Number);
  const ys = valuesOf(groups, 20).map(Number);
  if (xs.length === 0 || xs.length !== ys.length || xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v)))
    return undefined;
  const bulges = valuesOf(groups, 42).map(Number);
  return {
    points: xs.map((x, i) => ({ x, y: ys[i]! })),
    bulges: xs.map((_, i) => (Number.isFinite(bulges[i]) ? bulges[i]! : 0)),
  };
}

function normalizeSweep(start: number, end: number): number {
  const tau = Math.PI * 2;
  let sweep = ((end - start) % tau + tau) % tau;
  if (sweep < 1e-12)
    sweep = tau;
  return sweep;
}

/** 解析 DXF 文本；`existingMaxId` 之后分配新 id（调用方给当前草图最大值）。 */
export function parseDxfSketchEntities(text: string, existingMaxId = 0): DxfImportResult {
  const all = pairs(text);
  const units = headerUnits(all);
  let nextId = existingMaxId + 1;
  const entities: SketchEntityDto[] = [];
  let skipped = 0;

  let inEntities = false;
  let current: { type: string; groups: Pair[] } | undefined;
  const flush = (): void => {
    if (!current)
      return;
    const { type, groups } = current;
    const cx = num(groups, 10);
    const cy = num(groups, 20);
    if (type === 'LINE') {
      const x2 = num(groups, 11);
      const y2 = num(groups, 21);
      if (cx !== undefined && cy !== undefined && x2 !== undefined && y2 !== undefined) {
        entities.push({
          kind: 'line', id: nextId++,
          p1: { x: cx * units.scale, y: cy * units.scale },
          p2: { x: x2 * units.scale, y: y2 * units.scale },
        });
      } else skipped++;
    } else if (type === 'POINT') {
      if (cx !== undefined && cy !== undefined) {
        entities.push({
          kind: 'point', id: nextId++,
          x: cx * units.scale, y: cy * units.scale,
        });
      } else skipped++;
    } else if (type === 'LWPOLYLINE') {
      const polyline = polylineVertices(groups);
      if (!polyline || polyline.points.length < 2) {
        skipped++;
      } else {
        const points = [...polyline.points];
        const bulges = [...polyline.bulges];
        const closed = (Number(valuesOf(groups, 70)[0] ?? '0') & 1) === 1;
        if (closed) {
          points.push(points[0]!);
          bulges.push(bulges[0] ?? 0);
        }
        for (let i = 0; i + 1 < points.length; i++) {
          const p1 = { x: points[i]!.x * units.scale, y: points[i]!.y * units.scale };
          const p2 = { x: points[i + 1]!.x * units.scale, y: points[i + 1]!.y * units.scale };
          const bulge = bulges[i] ?? 0;
          if (Math.abs(bulge) <= 1e-9) {
            entities.push({ kind: 'line', id: nextId++, p1, p2 });
            continue;
          }
          const theta = 4 * Math.atan(bulge);
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const chord = Math.hypot(dx, dy);
          const sinHalf = Math.sin(theta / 2);
          if (chord < 1e-9 || Math.abs(sinHalf) < 1e-9) {
            skipped++;
            continue;
          }
          const radius = chord / (2 * Math.abs(sinHalf));
          const left = { x: -dy / chord, y: dx / chord };
          const offset = Math.sign(theta) * radius * Math.cos(theta / 2);
          const center = {
            x: (p1.x + p2.x) / 2 + left.x * offset,
            y: (p1.y + p2.y) / 2 + left.y * offset,
          };
          entities.push({
            kind: 'arc', id: nextId++,
            center,
            radius,
            startAngle: Math.atan2(p1.y - center.y, p1.x - center.x),
            sweepAngle: theta,
          });
        }
      }
    } else if (type === 'CIRCLE' || type === 'ARC') {
      const radius = num(groups, 40);
      const startDeg = num(groups, 50);
      const endDeg = num(groups, 51);
      if (cx !== undefined && cy !== undefined && radius !== undefined && radius > 0) {
        if (type === 'CIRCLE') {
          entities.push({
            kind: 'circle', id: nextId++,
            center: { x: cx * units.scale, y: cy * units.scale },
            radius: radius * units.scale,
          });
        } else if (startDeg !== undefined && endDeg !== undefined) {
          const start = (startDeg * Math.PI) / 180;
          const end = (endDeg * Math.PI) / 180;
          entities.push({
            kind: 'arc', id: nextId++,
            center: { x: cx * units.scale, y: cy * units.scale },
            radius: radius * units.scale,
            startAngle: start,
            sweepAngle: normalizeSweep(start, end),
          });
        } else skipped++;
      } else skipped++;
    } else {
      skipped++;
    }
    current = undefined;
  };

  for (let i = 0; i < all.length; i++) {
    const pair = all[i]!;
    if (!inEntities) {
      if (pair.code === 2 && pair.value === 'ENTITIES')
        inEntities = true;
      continue;
    }
    if (pair.code === 0) {
      flush();
      if (pair.value === 'ENDSEC')
        break;
      current = { type: pair.value, groups: [] };
    } else if (current) {
      current.groups.push(pair);
    }
  }
  flush();
  return { entities, skipped, units: units.label };
}
