/**
 * ADR-0018 S1e：尺寸标签命中与约束 id 解析（纯逻辑）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchDimensionLabel } from '@luban-cad/viewer';
import {
  constraintIdFromDimensionLabel,
  hitTestSketchDimensionLabel,
} from '../internal/sketch-dimension-picker.js';

const label = (id: string, center: { x: number; y: number }, width = 60, height = 16): SketchDimensionLabel => ({
  id,
  kind: 'linear',
  text: '20',
  center,
  angle: 0,
  rect: {
    left: center.x - width / 2,
    top: center.y - height / 2,
    right: center.x + width / 2,
    bottom: center.y + height / 2,
  },
});

describe('constraintIdFromDimensionLabel', () => {
  it('解析 dimension-<id>', () => {
    expect(constraintIdFromDimensionLabel('dimension-12')).toBe(12);
  });

  it('非标注 id / 非安全整数 → null', () => {
    expect(constraintIdFromDimensionLabel('12')).toBeNull();
    expect(constraintIdFromDimensionLabel('dimension-')).toBeNull();
    expect(constraintIdFromDimensionLabel('dimension-99999999999999999999')).toBeNull();
  });
});

describe('hitTestSketchDimensionLabel', () => {
  const labels = [label('dimension-1', { x: 100, y: 50 }), label('dimension-2', { x: 200, y: 50 })];

  it('中心命中；边界内命中', () => {
    expect(hitTestSketchDimensionLabel(labels, { x: 102, y: 48 })?.id).toBe('dimension-1');
    expect(hitTestSketchDimensionLabel(labels, { x: 100 + 29, y: 50 })?.id).toBe('dimension-1');
  });

  it('容差外未命中', () => {
    expect(hitTestSketchDimensionLabel(labels, { x: 100, y: 50 + 12 })).toBeNull();
    expect(hitTestSketchDimensionLabel(labels, { x: 20, y: 20 })).toBeNull();
  });

  it('重叠时取中心最近者', () => {
    const overlapping = [label('dimension-1', { x: 100, y: 50 }), label('dimension-2', { x: 120, y: 50 })];
    expect(hitTestSketchDimensionLabel(overlapping, { x: 118, y: 50 })?.id).toBe('dimension-2');
    expect(hitTestSketchDimensionLabel(overlapping, { x: 102, y: 50 })?.id).toBe('dimension-1');
  });
});
