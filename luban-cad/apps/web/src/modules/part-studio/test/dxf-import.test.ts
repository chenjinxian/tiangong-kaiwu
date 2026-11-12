/**
 * ASCII DXF 导入纯逻辑：LINE/CIRCLE/ARC、$INSUNITS 换算、ID 分配、跳过计数。
 */
import { describe, expect, it } from 'vitest';
import { parseDxfSketchEntities } from '../internal/dxf-import.js';

function dxf(units: number, entities: string): string {
  return [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$INSUNITS',
    '70', String(units),
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
    entities,
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');
}

const LINE = ['0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '10', '21', '0'].join('\n');
const CIRCLE = ['0', 'CIRCLE', '8', '0', '10', '20', '20', '0', '40', '5'].join('\n');
const ARC = ['0', 'ARC', '8', '0', '10', '0', '20', '20', '40', '4', '50', '0', '51', '90'].join('\n');

describe('parseDxfSketchEntities', () => {
  it('LINE/CIRCLE/ARC → 草图实体；id 从 existingMaxId+1 起', () => {
    const result = parseDxfSketchEntities(dxf(4, [LINE, CIRCLE, ARC].join('\n')), 10);
    expect(result.units).toBe('mm');
    expect(result.skipped).toBe(0);
    expect(result.entities).toHaveLength(3);
    const [line, circle, arc] = result.entities as Array<Record<string, unknown>>;
    expect(line).toMatchObject({ kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } });
    expect(circle).toMatchObject({ kind: 'circle', id: 12, center: { x: 20, y: 0 }, radius: 5 });
    expect(arc).toMatchObject({ kind: 'arc', id: 13, center: { x: 0, y: 20 }, radius: 4 });
    expect((arc as unknown as { startAngle: number }).startAngle).toBeCloseTo(0, 9);
    expect((arc as unknown as { sweepAngle: number }).sweepAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it('$INSUNITS=1（英寸）→ 长度与半径 ×25.4', () => {
    const result = parseDxfSketchEntities(dxf(1, [LINE, CIRCLE].join('\n')));
    expect(result.units).toBe('in');
    const line = result.entities[0] as unknown as { p2: { x: number; y: number } };
    expect(line.p2.x).toBeCloseTo(254, 9);
    const circle = result.entities[1] as unknown as { center: { x: number }; radius: number };
    expect(circle.center.x).toBeCloseTo(508, 9);
    expect(circle.radius).toBeCloseTo(127, 9);
  });

  it('未支持实体（SPLINE/INSERT 等）计数；无可导入实体→空 + skipped', () => {
    const spline = ['0', 'SPLINE', '8', '0', '70', '8', '71', '3'].join(String.fromCharCode(10));
    const result = parseDxfSketchEntities(dxf(4, spline));
    expect(result.entities).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('缺 ENTITIES 段 → 空结果（不抛错）', () => {
    const text = ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    expect(parseDxfSketchEntities(text)).toEqual({ entities: [], skipped: 0, units: 'mm' });
  });

  it('ARC 跨 0°（350°→10°）→ 20° 逆时针扫角', () => {
    const arc = ['0', 'ARC', '10', '0', '20', '0', '40', '1', '50', '350', '51', '10'].join('\n');
    const result = parseDxfSketchEntities(dxf(4, arc));
    const entity = result.entities[0] as unknown as { startAngle: number; sweepAngle: number };
    expect(entity.startAngle).toBeCloseTo((350 * Math.PI) / 180, 9);
    expect(entity.sweepAngle).toBeCloseTo((20 * Math.PI) / 180, 9);
  });
});

describe('parseDxfSketchEntities — POINT / LWPOLYLINE', () => {
  it('POINT → 草图点（单位换算）', () => {
    const point = ['0', 'POINT', '8', '0', '10', '3', '20', '-4'].join('\n');
    const result = parseDxfSketchEntities(dxf(1, point));
    const pointEntity = result.entities[0] as { kind: string; x: number; y: number };
    expect(pointEntity.kind).toBe('point');
    expect(pointEntity.x).toBeCloseTo(76.2, 9);
    expect(pointEntity.y).toBeCloseTo(-101.6, 9);
  });

  it('开放 LWPOLYLINE（直线段）→ 逐段 line；顶点顺序保留', () => {
    const poly = ['0', 'LWPOLYLINE', '90', '3', '70', '0',
      '10', '0', '20', '0', '10', '4', '20', '0', '10', '4', '20', '3'].join('\n');
    const result = parseDxfSketchEntities(dxf(4, poly));
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]).toMatchObject({ kind: 'line', p1: { x: 0, y: 0 }, p2: { x: 4, y: 0 } });
    expect(result.entities[1]).toMatchObject({ kind: 'line', p1: { x: 4, y: 0 }, p2: { x: 4, y: 3 } });
  });

  it('闭合 LWPOLYLINE（70 bit1）→ 追加首尾段', () => {
    const poly = ['0', 'LWPOLYLINE', '90', '3', '70', '1',
      '10', '0', '20', '0', '10', '4', '20', '0', '10', '0', '20', '3'].join('\n');
    const result = parseDxfSketchEntities(dxf(4, poly));
    expect(result.entities).toHaveLength(3);
    expect(result.entities[2]).toMatchObject({ kind: 'line', p1: { x: 0, y: 3 }, p2: { x: 0, y: 0 } });
  });

  it('带 bulge 的 LWPOLYLINE → 生成圆弧段（半圆 b=1）', () => {
    const poly = ['0', 'LWPOLYLINE', '90', '2', '70', '0',
      '10', '0', '20', '0', '42', '1', '10', '4', '20', '0'].join(String.fromCharCode(10));
    const result = parseDxfSketchEntities(dxf(4, poly));
    expect(result.entities).toHaveLength(1);
    const arc = result.entities[0] as { kind: string; center: { x: number; y: number }; radius: number; startAngle: number; sweepAngle: number };
    expect(arc.kind).toBe('arc');
    expect(arc.center.x).toBeCloseTo(2, 9);
    expect(arc.center.y).toBeCloseTo(0, 9);
    expect(arc.radius).toBeCloseTo(2, 9);
    expect(arc.sweepAngle).toBeCloseTo(Math.PI, 9);
  });

  it('1/4 圆 bulge（tan(π/8)）→ 圆心在弦左侧、扫角 π/2', () => {
    const bulge = Math.tan(Math.PI / 8);
    const poly = ['0', 'LWPOLYLINE', '90', '2', '70', '0',
      '10', '0', '20', '0', '42', String(bulge), '10', '2', '20', '0'].join(String.fromCharCode(10));
    const result = parseDxfSketchEntities(dxf(4, poly));
    const arc = result.entities[0] as { center: { x: number; y: number }; radius: number; sweepAngle: number; startAngle: number };
    expect(arc.center.x).toBeCloseTo(1, 9);
    expect(arc.center.y).toBeCloseTo(1, 9);
    expect(arc.radius).toBeCloseTo(Math.SQRT2, 9);
    expect(arc.sweepAngle).toBeCloseTo(Math.PI / 2, 9);
    expect(arc.startAngle).toBeCloseTo(-3 * Math.PI / 4, 9);
  });
});

describe('parseDxfSketchEntities — SPLINE', () => {
  const NL = String.fromCharCode(10);
  const four = ['10', '0', '20', '0', '10', '1', '20', '2', '10', '2', '20', '-1', '10', '3', '20', '0'];

  it('三次 4 控制点非周期 SPLINE → spline 实体', () => {
    const spline = ['0', 'SPLINE', '70', '8', '71', '3', ...four].join(NL);
    const result = parseDxfSketchEntities(dxf(4, spline));
    expect(result.entities).toHaveLength(1);
    const entity = result.entities[0] as { kind: string; controlPoints: Array<{ x: number; y: number }> };
    expect(entity.kind).toBe('spline');
    expect(entity.controlPoints).toHaveLength(4);
    expect(entity.controlPoints[1]).toEqual({ x: 1, y: 2 });
  });

  it('周期/非三次/非 4 控制点 SPLINE → 跳过计数', () => {
    const periodic = ['0', 'SPLINE', '70', '9', '71', '3', ...four].join(NL);
    expect(parseDxfSketchEntities(dxf(4, periodic)).skipped).toBe(1);
    const degree2 = ['0', 'SPLINE', '70', '8', '71', '2', ...four].join(NL);
    expect(parseDxfSketchEntities(dxf(4, degree2)).skipped).toBe(1);
    const three = ['0', 'SPLINE', '70', '8', '71', '3', ...four.slice(0, 12)].join(NL);
    expect(parseDxfSketchEntities(dxf(4, three)).skipped).toBe(1);
  });
});
