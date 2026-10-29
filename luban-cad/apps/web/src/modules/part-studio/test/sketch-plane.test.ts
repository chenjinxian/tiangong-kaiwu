// src/modules/part-studio/test/sketch-plane.test.ts
//
// M6-a T5：草图平面坐标架（tools/sketch/sketch-plane.ts）纯函数验收——
//  - 缺省/退化回退 XY@z=0（契约缺省=后端 planeZ v1 语义）；
//  - 三基准面（上视 XY/前视 XZ/右视 YZ——T4 sketchPlaneFromOption 的 DTO）
//    的右手正交化（y=normal×xDir）与 world↔local 双向往返；
//  - 投影语义：toLocal 丢弃法向分量（=投影到草图面）；
//  - 离面点投影 + toWorld 恰落面内。
// 纯模块零 mock（core-geometry 真实参与——几何换算是被测物本体）。

import { describe, expect, it } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

/** 三基准面 DTO（与 SketchDialog.sketchPlaneFromOption 同值对账）。 */
const TOP: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};
const RIGHT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 },
  xDir: { x: 0, y: 1, z: 0 },
};

describe('sketchPlaneFrameFrom（M6-a T5）', () => {
  it('缺省（undefined/null）→ XY@z=0 恒等架', () => {
    for (const dto of [undefined, null]) {
      const frame = sketchPlaneFrameFrom(dto);
      expect(frame.origin.isAlmostEqual(Point3d.create(0, 0, 0))).toBe(true);
      expect(frame.normal.isAlmostEqual({ x: 0, y: 0, z: 1 } as Point3d)).toBe(true);
      expect(frame.toLocal(Point3d.create(1, 2, 3))).toEqual({ u: 1, v: 2 }); // z 分量丢弃
      const w = frame.toWorld({ u: 1, v: 2 });
      expect(w.isAlmostEqual(Point3d.create(1, 2, 0))).toBe(true);
    }
  });

  it('上视（TOP）→ 与缺省同构（x×y=z 右手系）', () => {
    const frame = sketchPlaneFrameFrom(TOP);
    expect(frame.xDir.isAlmostEqual({ x: 1, y: 0, z: 0 } as Point3d)).toBe(true);
    expect(frame.yDir.isAlmostEqual({ x: 0, y: 1, z: 0 } as Point3d)).toBe(true);
    expect(frame.toLocal(Point3d.create(3, 4, 0))).toEqual({ u: 3, v: 4 });
  });

  it('前视（FRONT：normal=+Y，xDir=+X）→ u→+X，v=normal×xDir 完成右手系', () => {
    const frame = sketchPlaneFrameFrom(FRONT);
    expect(frame.xDir.isAlmostEqual({ x: 1, y: 0, z: 0 } as Point3d)).toBe(true);
    // 右手系唯一补全：y=z×x=(0,1,0)×(1,0,0)=(0,0,-1)——v 轴指向世界 −Z
    //（视角观感取向归 M6-c 视图对齐任务裁决；后端求值侧必须用同一约定，
    //  见本任务台账登记）。
    expect(frame.yDir.isAlmostEqual({ x: 0, y: 0, z: -1 } as Point3d)).toBe(true);
    // 世界 (3, 9, 4)：法向分量 9 丢弃 → u=3, v=−4
    expect(frame.toLocal(Point3d.create(3, 9, 4))).toEqual({ u: 3, v: -4 });
    // 往返：toWorld(toLocal(p)) = 投影点（恰在 y=0 面内）
    const roundtrip = frame.toWorld(frame.toLocal(Point3d.create(3, 9, 4)));
    expect(roundtrip.isAlmostEqual(Point3d.create(3, 0, 4))).toBe(true);
  });

  it('右视（RIGHT：normal=+X，xDir=+Y）→ u→+Y，v→+Z', () => {
    const frame = sketchPlaneFrameFrom(RIGHT);
    expect(frame.xDir.isAlmostEqual({ x: 0, y: 1, z: 0 } as Point3d)).toBe(true);
    expect(frame.yDir.isAlmostEqual({ x: 0, y: 0, z: 1 } as Point3d)).toBe(true);
    expect(frame.toLocal(Point3d.create(7, 3, 4))).toEqual({ u: 3, v: 4 });
    const w = frame.toWorld({ u: 3, v: 4 });
    expect(w.isAlmostEqual(Point3d.create(0, 3, 4))).toBe(true);
  });

  it('非原点平面（origin 偏移）→ 投影相对原点', () => {
    const dto: SketchPlaneDto = {
      origin: { x: 10, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    const frame = sketchPlaneFrameFrom(dto);
    expect(frame.toLocal(Point3d.create(13, 4, 0))).toEqual({ u: 3, v: 4 });
    expect(frame.toWorld({ u: 3, v: 4 }).isAlmostEqual(Point3d.create(13, 4, 0))).toBe(true);
  });

  it('退化 dto（xDir∥normal / 零向量）→ 静默回缺省 XY@z=0（不抛错）', () => {
    const parallel: SketchPlaneDto = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 0, y: 0, z: 1 }, // ∥ normal
    };
    const zero: SketchPlaneDto = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    for (const dto of [parallel, zero]) {
      const frame = sketchPlaneFrameFrom(dto);
      expect(frame.toLocal(Point3d.create(1, 2, 3))).toEqual({ u: 1, v: 2 });
    }
  });

  it('非正交 xDir（带法向分量）→ Gram-Schmidt 去法向后归一', () => {
    const dto: SketchPlaneDto = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 5 }, // 非法向正交——去 z 分量 → +X
    };
    const frame = sketchPlaneFrameFrom(dto);
    expect(frame.xDir.isAlmostEqual({ x: 1, y: 0, z: 0 } as Point3d)).toBe(true);
    expect(frame.toLocal(Point3d.create(1, 2, 3))).toEqual({ u: 1, v: 2 });
  });

  it('localToWorld 为刚体变换（行列式 +1，无镜像无缩放）', () => {
    for (const dto of [TOP, FRONT, RIGHT]) {
      const frame = sketchPlaneFrameFrom(dto);
      expect(frame.localToWorld.matrix.determinant()).toBeCloseTo(1, 12);
      // 列向量单位长
      expect(frame.localToWorld.matrix.columnX().magnitude()).toBeCloseTo(1, 12);
      expect(frame.localToWorld.matrix.columnY().magnitude()).toBeCloseTo(1, 12);
      expect(frame.localToWorld.matrix.columnZ().magnitude()).toBeCloseTo(1, 12);
    }
  });
});
