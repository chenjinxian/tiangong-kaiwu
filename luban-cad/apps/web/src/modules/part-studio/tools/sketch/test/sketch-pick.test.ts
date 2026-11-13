/**
 * 草图取点（2026-11-13）：光标射线∩草图平面。
 *
 * 背景：进入草图不再自动正视平面后，`ev.point` 落在视口光标深度面而不是
 * 草图平面（Front + ISO 相机实测 v 恒 0 → 矩形退化）。取点必须用世界射线
 * 与平面求交，再投影为局部 (u,v)。
 */
import { describe, expect, it } from 'vitest';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import type { BeButtonEvent } from '@itwin/core-frontend';
import { intersectViewRayWithPlane, pickSketchPlaneLocal } from '../sketch-pick.js';
import { sketchPlaneFrameFrom } from '../sketch-plane.js';
import type { SketchPlaneDto } from '@luban-cad/shared';

/** 假视口：视图 z∈[0,1] 线性映射到世界 near→far 两端点（x/y 忽略）。 */
function fakeViewport(near: Point3d, far: Point3d) {
  return {
    viewToNpc: (p: Point3d) => p.clone(),
    npcToWorld: (p: Point3d) => Point3d.create(
      near.x + (far.x - near.x) * p.z,
      near.y + (far.y - near.y) * p.z,
      near.z + (far.z - near.z) * p.z,
    ),
  };
}

const event = (vp: unknown, point: Point3d): BeButtonEvent => ({
  viewport: vp,
  viewPoint: Point3d.create(10, 20, 0),
  point,
} as unknown as BeButtonEvent);

describe('intersectViewRayWithPlane', () => {
  it('射线与平面斜交 → 解析交点', () => {
    // 射线 near=(0,−2,3) → far=(0,2,−1)；XY 平面 z=0。
    const vp = fakeViewport(Point3d.create(0, -2, 3), Point3d.create(0, 2, -1));
    const hit = intersectViewRayWithPlane(vp, { x: 0, y: 0 }, Point3d.createZero(), Vector3d.unitZ());
    expect(hit).toBeDefined();
    expect(hit!.x).toBeCloseTo(0, 9);
    expect(hit!.y).toBeCloseTo(1, 9); // t=0.75 → y=−2+0.75·4=1
    expect(hit!.z).toBeCloseTo(0, 9);
  });

  it('射线与平面平行 → undefined（不猜）', () => {
    const vp = fakeViewport(Point3d.create(0, -2, 0), Point3d.create(4, 2, 0));
    expect(intersectViewRayWithPlane(vp, { x: 0, y: 0 }, Point3d.createZero(), Vector3d.unitZ()))
      .toBeUndefined();
  });
});

describe('pickSketchPlaneLocal', () => {
  const FRONT: SketchPlaneDto = {
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    xDir: { x: 1, y: 0, z: 0 },
  };

  it('视图射线命中草图平面 → 局部 (u,v) 取自交点而非 ev.point', () => {
    const plane = sketchPlaneFrameFrom(FRONT);
    // 射线穿过世界 (3, 0, −4)（Front 平面 y=0 上）——局部 (u=x, v=−z)=(3,4)。
    const vp = fakeViewport(Point3d.create(3, -10, -4), Point3d.create(3, 10, -4));
    // ev.point 故意给深度面点（y≠0、z=0）——旧实现会得到 v=0。
    const local = pickSketchPlaneLocal(event(vp, Point3d.create(3, -8, 0)), plane);
    expect(local.u).toBeCloseTo(3, 6);
    expect(local.v).toBeCloseTo(4, 6);
  });

  it('无视口 → 回退 ev.point 投影（不崩死）', () => {
    const plane = sketchPlaneFrameFrom(FRONT);
    const local = pickSketchPlaneLocal(event(undefined, Point3d.create(5, 0, -6)), plane);
    expect(local.u).toBeCloseTo(5, 9);
    expect(local.v).toBeCloseTo(6, 9);
  });
});
