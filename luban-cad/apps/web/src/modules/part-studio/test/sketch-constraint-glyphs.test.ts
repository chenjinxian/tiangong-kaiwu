/**
 * 草图非尺寸约束 glyph 锚点（Onshape live 2026-11-12）：
 * 线中点、重合点位平均、等长两线代表点平均、镜像实体+轴平均；尺寸/失效跳过。
 */
import { describe, expect, it } from 'vitest';
import type { SketchDto } from '@luban-cad/shared';
import { buildSketchConstraintGlyphs, constraintIdFromGlyphId } from '../internal/sketch-constraint-glyphs.js';

const SKETCH: SketchDto = {
  id: 'sketch-1',
  entities: [
    { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    { kind: 'line', id: 2, p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
    { kind: 'point', id: 3, x: 0, y: 0 },
    { kind: 'point', id: 4, x: 10, y: 0 },
    { kind: 'circle', id: 5, center: { x: 20, y: 0 }, radius: 3 },
  ],
  constraints: [
    { kind: 'horizontal', id: 101, refs: [1] },
    { kind: 'equal', id: 102, refs: [1, 2] },
    { kind: 'coincident', id: 103, refs: [{ entity: 1, part: 'start' }, 3] },
    { kind: 'midpoint', id: 104, refs: [1] },
    { kind: 'distance', id: 105, refs: [3, 4], value: 10 },
    { kind: 'mirror', id: 106, refs: [5, 1] },
    { kind: 'vertical', id: 107, refs: [999] },
  ],
  solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
};

describe('buildSketchConstraintGlyphs', () => {
  const glyphs = buildSketchConstraintGlyphs(SKETCH);
  const byId = new Map(glyphs.map((glyph) => [glyph.id, glyph]));

  it('尺寸约束不产 glyph；失效引用跳过（不猜测）', () => {
    expect([...byId.keys()]).toEqual([
      'constraint-101', 'constraint-102', 'constraint-103', 'constraint-104', 'constraint-106',
    ]);
  });

  it('水平约束锚点=线中点', () => {
    const glyph = byId.get('constraint-101')!;
    expect(glyph.kind).toBe('horizontal');
    expect(glyph.position.x).toBeCloseTo(5, 9);
    expect(glyph.position.y).toBeCloseTo(0, 9);
    expect(glyph.position.z).toBeCloseTo(0, 9);
  });

  it('等长约束锚点=两条线中点平均', () => {
    const glyph = byId.get('constraint-102')!;
    expect(glyph.kind).toBe('equal');
    expect(glyph.position.x).toBeCloseTo(5, 9);
    expect(glyph.position.y).toBeCloseTo(2.5, 9);
  });

  it('重合约束取点位平均（端点+点实体同点）', () => {
    const glyph = byId.get('constraint-103')!;
    expect(glyph.kind).toBe('coincident');
    expect(glyph.position.x).toBeCloseTo(0, 9);
    expect(glyph.position.y).toBeCloseTo(0, 9);
  });

  it('中点约束锚点=线中点', () => {
    const glyph = byId.get('constraint-104')!;
    expect(glyph.kind).toBe('midpoint');
    expect(glyph.position.x).toBeCloseTo(5, 9);
    expect(glyph.position.y).toBeCloseTo(0, 9);
  });

  it('镜像约束锚点=实体代表点与轴线中点平均', () => {
    const glyph = byId.get('constraint-106')!;
    expect(glyph.kind).toBe('mirror');
    expect(glyph.position.x).toBeCloseTo(12.5, 9);
    expect(glyph.position.y).toBeCloseTo(0, 9);
  });

  it('草图平面变换到世界（Front 面：局部 v → 世界 −z，右手系）', () => {
    const front = buildSketchConstraintGlyphs({
      ...SKETCH,
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        xDir: { x: 1, y: 0, z: 0 },
      },
    });
    const glyph = front.find((item) => item.id === 'constraint-102')!;
    expect(glyph.position.x).toBeCloseTo(5, 9);
    expect(glyph.position.y).toBeCloseTo(0, 9);
    expect(glyph.position.z).toBeCloseTo(-2.5, 9);
  });
});

describe('constraintIdFromGlyphId', () => {
  it('解析 constraint-<id>；尺寸标签 id 不匹配', () => {
    expect(constraintIdFromGlyphId('constraint-42')).toBe(42);
    expect(constraintIdFromGlyphId('dimension-42')).toBeNull();
    expect(constraintIdFromGlyphId('constraint-x')).toBeNull();
  });
});
