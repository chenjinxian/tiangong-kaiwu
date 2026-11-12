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

  it('未支持实体计数（LWPOLYLINE）；无可导入实体→空 + skipped', () => {
    const poly = ['0', 'LWPOLYLINE', '90', '2', '10', '0', '20', '0', '10', '5', '20', '0'].join('\n');
    const result = parseDxfSketchEntities(dxf(4, poly));
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
