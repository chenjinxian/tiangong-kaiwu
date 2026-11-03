/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图工具实时数值提示（Onshape live）：绘制过程中在光标旁显示当前尺寸。
 * 纯计算测试；光标位置/渲染归工具与覆盖层。
 */
import { describe, expect, it } from 'vitest';
import { computeSketchLiveMeasures } from '../tools/sketch/sketch-live-measures.js';

describe('computeSketchLiveMeasures', () => {
  it('线：长度 + 角度（0°=局部 +u，逆时针为正）', () => {
    const measures = computeSketchLiveMeasures('line', [{ u: 0, v: 0 }], { u: 3, v: 4 });
    expect(measures).toEqual([
      { labelKey: 'partStudio.sketch.live.length', value: '5' },
      { labelKey: 'partStudio.sketch.live.angle', value: '53.1°' },
    ]);
  });

  it('矩形：宽 × 高（绝对值，0 锚点不显示）', () => {
    const measures = computeSketchLiveMeasures('rectangle', [{ u: 10, v: 5 }], { u: 92.55, v: -14.05 });
    expect(measures).toEqual([
      { labelKey: 'partStudio.sketch.live.width', value: '82.55' },
      { labelKey: 'partStudio.sketch.live.height', value: '19.05' },
    ]);
    expect(computeSketchLiveMeasures('rectangle', [], { u: 1, v: 1 })).toEqual([]);
  });

  it('圆：半径', () => {
    expect(computeSketchLiveMeasures('circle', [{ u: 0, v: 0 }], { u: 3, v: 4 })).toEqual([
      { labelKey: 'partStudio.sketch.live.radius', value: '5' },
    ]);
  });

  it('三点弧：起/终点已锚后按弧上候选点算半径', () => {
    const measures = computeSketchLiveMeasures(
      'arc',
      [{ u: 1, v: 0 }, { u: 0, v: 1 }],
      { u: Math.SQRT1_2, v: Math.SQRT1_2 },
    );
    expect(measures).toEqual([{ labelKey: 'partStudio.sketch.live.radius', value: '1' }]);
  });

  it('样条：不上报伪尺寸（只保留阶段提示）', () => {
    expect(computeSketchLiveMeasures('spline', [{ u: 0, v: 0 }, { u: 10, v: 0 }], { u: 5, v: 5 })).toEqual([]);
  });
});
