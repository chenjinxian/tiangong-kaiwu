/**
 * 默认几何图元实时可见性纯函数测试（2026-11-02 Onshape 对齐）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchPlaneDto } from '@luban-cad/shared';
import {
  autoDatumVisibility,
  datumPlaneFromSketch,
  resolveDatumVisibility,
} from '../internal/datum-visibility.js';

function plane(normal: [number, number, number], origin: [number, number, number] = [0, 0, 0]): SketchPlaneDto {
  return {
    origin: { x: origin[0], y: origin[1], z: origin[2] },
    normal: { x: normal[0], y: normal[1], z: normal[2] },
    xDir: { x: 1, y: 0, z: 0 },
  };
}

const ALL = { origin: true, top: true, front: true, right: true };
const NONE = { origin: false, top: false, front: false, right: false };

describe('datum-visibility', () => {
  it('empty studio shows all four; bodies hide all four (including Origin)', () => {
    expect(autoDatumVisibility({ hasBodies: false, isSketchActive: false })).toEqual(ALL);
    expect(autoDatumVisibility({ hasBodies: true, isSketchActive: false })).toEqual(NONE);
  });

  it('maps axis-aligned default planes through the origin', () => {
    expect(datumPlaneFromSketch(plane([0, 0, 1]))).toBe('top');
    expect(datumPlaneFromSketch(plane([0, 1, 0]))).toBe('front');
    expect(datumPlaneFromSketch(plane([1, 0, 0]))).toBe('right');
    expect(datumPlaneFromSketch(plane([0, 0, -1]))).toBe('top');
    expect(datumPlaneFromSketch(null)).toBe('top');
    expect(datumPlaneFromSketch(undefined)).toBe('top');
  });

  it('does not map offset or non-axis-aligned sketch planes onto a default plane', () => {
    expect(datumPlaneFromSketch(plane([0, 0, 1], [0, 0, 0.1]))).toBeUndefined();
    expect(datumPlaneFromSketch(plane([0.577, 0.577, 0.577]))).toBeUndefined();
  });

  it('with bodies, an active default-plane sketch shows only that plane', () => {
    expect(autoDatumVisibility({
      hasBodies: true, isSketchActive: true, activeSketchPlane: plane([0, 0, 1]),
    })).toEqual({ ...NONE, top: true });
    expect(autoDatumVisibility({
      hasBodies: true, isSketchActive: true, activeSketchPlane: plane([0, 1, 0]),
    })).toEqual({ ...NONE, front: true });
    expect(autoDatumVisibility({
      hasBodies: true, isSketchActive: true, activeSketchPlane: plane([1, 0, 0]),
    })).toEqual({ ...NONE, right: true });
  });

  it('null plane while sketching uses the XY@z=0 contract default (Top)', () => {
    expect(autoDatumVisibility({
      hasBodies: true, isSketchActive: true, activeSketchPlane: null,
    })).toEqual({ ...NONE, top: true });
  });

  it('user overrides win and are applied per datum', () => {
    expect(resolveDatumVisibility({
      hasBodies: true, isSketchActive: false,
      overrides: { top: true },
    })).toEqual({ ...NONE, top: true });
    expect(resolveDatumVisibility({
      hasBodies: false, isSketchActive: false,
      overrides: { front: false },
    })).toEqual({ ...ALL, front: false });
    expect(resolveDatumVisibility({
      hasBodies: true, isSketchActive: true, activeSketchPlane: plane([0, 0, 1]),
      overrides: { top: false, right: true },
    })).toEqual({ ...NONE, right: true });
  });
});
