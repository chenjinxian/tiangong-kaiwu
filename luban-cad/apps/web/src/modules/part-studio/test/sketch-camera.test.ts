/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图相机纯函数测试（2026-11-13 修订）：显式「正视草图平面」定向、
 * 草图范围/实体取景、partial 视口 no-op；进入/退出草图不再有任何相机副作用。
 */
import { describe, expect, it, vi } from 'vitest';
import { Matrix3d, Point3d, Vector3d } from '@itwin/core-geometry';
import type { Viewport } from '@itwin/core-frontend';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  fitCameraToSketch,
  orientCameraToSketchPlane,
  sketchWorldRange,
} from '../canvas/sketch-camera.js';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

function orthoViewport(rotation = Matrix3d.createIdentity()): {
  viewport: Viewport;
  setRotation: ReturnType<typeof vi.fn>;
  turnCameraOff: ReturnType<typeof vi.fn>;
  synch: ReturnType<typeof vi.fn>;
  raiseViewChanged: ReturnType<typeof vi.fn>;
  lookAtVolume: ReturnType<typeof vi.fn>;
  setOrigin: ReturnType<typeof vi.fn>;
  setExtents: ReturnType<typeof vi.fn>;
} {
  const setRotation = vi.fn();
  const turnCameraOff = vi.fn();
  const synch = vi.fn();
  const raiseViewChanged = vi.fn();
  const lookAtVolume = vi.fn();
  const setOrigin = vi.fn();
  const setExtents = vi.fn();
  const viewport = {
    view: {
      getRotation: () => rotation,
      setRotation,
      is3d: () => true,
      turnCameraOff,
      lookAtVolume,
      getOrigin: () => Point3d.create(10, 20, 30),
      getExtents: () => Vector3d.create(100, 200, 300),
      setOrigin,
      setExtents,
    },
    viewRect: { aspect: 1.5 },
    synchWithView: synch,
    onViewChanged: { raiseEvent: raiseViewChanged },
  } as unknown as Viewport;
  return {
    viewport, setRotation, turnCameraOff, synch, raiseViewChanged, lookAtVolume, setOrigin, setExtents,
  };
}

describe('sketch-camera', () => {
  it('orients Front sketch to its real frame (screen right=+X, up=-Z, normal=+Y)', () => {
    const { viewport, setRotation, turnCameraOff, synch, raiseViewChanged } = orthoViewport();
    orientCameraToSketchPlane(viewport, FRONT);
    expect(setRotation).toHaveBeenCalledTimes(1);
    const m = setRotation.mock.calls[0]![0] as Matrix3d;
    expect(m.rowX().isExactEqual(Vector3d.unitX())).toBe(true);
    expect(m.rowY().isExactEqual(Vector3d.unitZ().negate())).toBe(true);
    expect(m.rowZ().isExactEqual(Vector3d.unitY())).toBe(true);
    expect(turnCameraOff).toHaveBeenCalledTimes(1);
    expect(synch).toHaveBeenCalledWith({});
    // ViewCube 订阅方必须在程序化换视图后收到通知。
    expect(raiseViewChanged).toHaveBeenCalledTimes(1);
  });

  it('is no-op without a camera-capable viewport', () => {
    expect(() => orientCameraToSketchPlane(undefined, FRONT)).not.toThrow();
    const partial = { view: {}, synchWithView: vi.fn() } as unknown as Viewport;
    expect(() => orientCameraToSketchPlane(partial, FRONT)).not.toThrow();
  });

  it('derives the world range from solved sketch entities on the real plane frame', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: -10, y: -5 },
      { kind: 'line', id: 2, p1: 1, p2: { x: 20, y: 15 } },
      { kind: 'circle', id: 3, center: { x: 0, y: 0 }, radius: 5 },
      { kind: 'spline', id: 4, controlPoints: [{ x: -12, y: 3 }, { x: 0, y: 0 }, { x: 6, y: 8 }, { x: 18, y: 12 }] },
      { kind: 'point', id: 5 }, // 未解算点忽略
    ];
    const range = sketchWorldRange(FRONT, entities)!;
    expect(range.low.x).toBeCloseTo(-12, 6);
    expect(range.high.x).toBeCloseTo(20, 6);
    // FRONT 帧：world z = -v → v∈[-5,15] ⇒ z∈[-15,5]；world y=0。
    expect(range.low.z).toBeCloseTo(-15, 6);
    expect(range.high.z).toBeCloseTo(5, 6);
    expect(range.low.y).toBeCloseTo(0, 6);
    expect(range.high.y).toBeCloseTo(0, 6);
    expect(sketchWorldRange(FRONT, [])).toBeUndefined();
  });

  it('fits the camera to the sketch entities with panel-aware padding', () => {
    const { viewport, lookAtVolume, synch, raiseViewChanged } = orthoViewport();
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 1, p1: { x: -40, y: -60 }, p2: { x: 40, y: 60 } },
    ];
    expect(fitCameraToSketch(viewport, FRONT, entities)).toBe(true);
    expect(lookAtVolume).toHaveBeenCalledTimes(1);
    const [range, aspect, options] = lookAtVolume.mock.calls[0]!;
    expect((range as { low: { x: number } }).low.x).toBeCloseTo(-40, 6);
    expect(aspect).toBe(1.5);
    expect(options).toEqual({
      paddingPercent: { left: 0.22, right: 0.05, top: 0.08, bottom: 0.08 },
    });
    expect(synch).toHaveBeenCalledWith({});
    expect(raiseViewChanged).toHaveBeenCalledTimes(1);

    expect(fitCameraToSketch(viewport, FRONT, [])).toBe(false);
    expect(lookAtVolume).toHaveBeenCalledTimes(1);
  });
});
