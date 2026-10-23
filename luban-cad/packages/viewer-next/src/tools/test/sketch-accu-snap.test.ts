// sketch-accu-snap（M6-a T5）：SketchAccuSnap 九模式优先级表验收——
// getActiveSnapModes 返回全部九种 SnapMode（HitDetail.ts:22-32 枚举全员）、
// 优先级序钉死（端点/关键点首位——草图闭环焊接的主参照；Nearest/Bisector
// 兜底末位）。
// mock 口径：@itwin/core-frontend 模块级 mock——AccuSnap 基类桩 + SnapMode
// 枚举值镜像（位掩码常量为冻结 API，镜像值与 HitDetail.ts 逐一对账；真实
// core-frontend 在 node 环境下全量加载过重，register-edit-tools.test 同口径）。

import { describe, expect, it, vi } from 'vitest';

vi.mock('@itwin/core-frontend', () => ({
  AccuSnap: class {},
  // SnapMode 位掩码镜像（itwinjs-core AccuSnap.ts 同文件 HitDetail.ts:22-32）：
  // Nearest=1, NearestKeypoint=2, MidPoint=4, Center=8, Origin=16,
  // Bisector=32, Intersection=64, PerpendicularPoint=128, TangentPoint=256。
  SnapMode: {
    Nearest: 1,
    NearestKeypoint: 2,
    MidPoint: 4,
    Center: 8,
    Origin: 16,
    Bisector: 32,
    Intersection: 64,
    PerpendicularPoint: 128,
    TangentPoint: 256,
  },
}));

import { SnapMode } from '@itwin/core-frontend';
import { SketchAccuSnap } from '../sketch-accu-snap.js';

describe('SketchAccuSnap（M6-a T5）', () => {
  it('getActiveSnapModes 返回九模式全量（HitDetail.ts 枚举全员）', () => {
    const snap = new SketchAccuSnap();
    const modes = snap.getActiveSnapModes();
    expect(modes).toHaveLength(9);
    expect(new Set(modes).size).toBe(9); // 无重复
  });

  it('优先级序钉死：关键点→中点→圆心→交点→垂足→切点→原点→最近点→角平分', () => {
    const snap = new SketchAccuSnap();
    expect(snap.getActiveSnapModes()).toEqual([
      SnapMode.NearestKeypoint,
      SnapMode.MidPoint,
      SnapMode.Center,
      SnapMode.Intersection,
      SnapMode.PerpendicularPoint,
      SnapMode.TangentPoint,
      SnapMode.Origin,
      SnapMode.Nearest,
      SnapMode.Bisector,
    ]);
  });
});
