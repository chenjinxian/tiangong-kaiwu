/**
 * ADR-0017 追补：空 Part Studio 默认取景——Onshape Home 朝向 + 基准面立方取景。
 * 证据：live 空 Part Studio 的 Front/Right 投影宽比 851:491 → 方位角 30°。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ScreenViewport } from '@itwin/core-frontend';
import { Point3d, Range3d } from '@itwin/core-geometry';
import { RENDER_DEFAULTS } from '@luban-cad/shared';
import {
  datumPlanesRange,
  defaultHomeEyeDirection,
  lookAtDatumPlanes,
} from '../empty-datum-view.js';

function makeViewport(overrides: Record<string, unknown> = {}): {
  viewport: ScreenViewport;
  lookAt: ReturnType<typeof vi.fn>;
  lookAtVolume: ReturnType<typeof vi.fn>;
  turnCameraOff: ReturnType<typeof vi.fn>;
  synch: ReturnType<typeof vi.fn>;
} {
  const lookAt = vi.fn();
  const lookAtVolume = vi.fn();
  const turnCameraOff = vi.fn();
  const synch = vi.fn();
  const viewport = {
    view: {
      is3d: () => true,
      isCameraOn: false,
      lookAt,
      lookAtVolume,
      turnCameraOff,
      ...overrides,
    },
    viewRect: { aspect: 1.5 },
    synchWithView: synch,
  } as unknown as ScreenViewport;
  return { viewport, lookAt, lookAtVolume, turnCameraOff, synch };
}

describe('lookAtDatumPlanes', () => {
  it('Onshape Home：方位 30°/仰角 30°，眼点在 +X/-Y/+Z 侧', () => {
    const dir = defaultHomeEyeDirection();
    const az = (RENDER_DEFAULTS.defaultViewOrientation.azimuthDeg * Math.PI) / 180;
    const el = (RENDER_DEFAULTS.defaultViewOrientation.elevationDeg * Math.PI) / 180;
    expect(dir.x).toBeCloseTo(Math.sin(az) * Math.cos(el), 6);
    expect(dir.y).toBeCloseTo(-Math.cos(az) * Math.cos(el), 6);
    expect(dir.z).toBeCloseTo(Math.sin(el), 6);
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.y).toBeLessThan(0);
    expect(dir.z).toBeGreaterThan(0);
  });

  it('取景范围是半边长 150 的原点居中方块', () => {
    const range = datumPlanesRange(RENDER_DEFAULTS.emptyViewRangeMm);
    expect(range.low.isAlmostEqual(Point3d.create(-150, -150, -150))).toBe(true);
    expect(range.high.isAlmostEqual(Point3d.create(150, 150, 150))).toBe(true);
  });

  it('设置 Home 朝向、恢复正交、按 5% 留白取景并同步视口', () => {
    const { viewport, lookAt, lookAtVolume, turnCameraOff, synch } = makeViewport();
    expect(lookAtDatumPlanes(viewport)).toBe(true);
    expect(lookAt).toHaveBeenCalledTimes(1);
    const args = lookAt.mock.calls[0]?.[0] as { eyePoint: Point3d; targetPoint: Point3d };
    expect(args.targetPoint.isAlmostEqual(Point3d.createZero())).toBe(true);
    expect(args.eyePoint.z).toBeGreaterThan(0);
    expect(turnCameraOff).toHaveBeenCalledTimes(1);
    expect(lookAtVolume).toHaveBeenCalledTimes(1);
    const [volume, aspect, options] = lookAtVolume.mock.calls[0] as [Range3d, number, { paddingPercent: number }];
    expect(volume.low.x).toBe(-RENDER_DEFAULTS.emptyViewRangeMm);
    expect(volume.high.z).toBe(RENDER_DEFAULTS.emptyViewRangeMm);
    expect(aspect).toBe(1.5);
    expect(options.paddingPercent).toBe(0.05);
    expect(synch).toHaveBeenCalledWith({});
  });

  it('已开透视时不强制关相机', () => {
    const { viewport, turnCameraOff } = makeViewport({ isCameraOn: true });
    expect(lookAtDatumPlanes(viewport)).toBe(true);
    expect(turnCameraOff).not.toHaveBeenCalled();
  });

  it('非 3D 或缺少 lookAt 的视图不写相机', () => {
    {
      const { viewport, lookAt } = makeViewport({ is3d: () => false });
      expect(lookAtDatumPlanes(viewport)).toBe(false);
      expect(lookAt).not.toHaveBeenCalled();
    }
    {
      const { viewport, lookAt, lookAtVolume } = makeViewport({ lookAt: undefined });
      expect(lookAtDatumPlanes(viewport)).toBe(false);
      expect(lookAt).not.toHaveBeenCalled();
      expect(lookAtVolume).not.toHaveBeenCalled();
    }
  });
});
