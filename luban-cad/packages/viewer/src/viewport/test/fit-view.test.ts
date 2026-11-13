/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * fitViewToModelRanges（2026-11-02）：显式/全物理模型取景、空集/查询失败/
 * 晚到结果守卫的 no-op 语义。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ScreenViewport } from '@itwin/core-frontend';
import { Range3d } from '@itwin/core-geometry';
import {
  fitViewToModelRanges,
  fitViewToVisibleContent,
  queryAllPhysicalModelIds,
} from '../fit-view.js';

function makeViewport(ranges: unknown, modelRows: string[] = ['0x1']): {
  viewport: ScreenViewport;
  lookAt: ReturnType<typeof vi.fn>;
  synch: ReturnType<typeof vi.fn>;
  queryModelRanges: ReturnType<typeof vi.fn>;
} {
  const lookAt = vi.fn();
  const synch = vi.fn();
  const queryModelRanges = vi.fn().mockResolvedValue(ranges);
  const viewport = {
    iModel: {
      queryModelRanges,
      models: { queryModelRanges },
      async *createQueryReader() {
        for (const row of modelRows) yield [row];
      },
    },
    view: {
      lookAtVolume: lookAt,
      lookAt: vi.fn(),
      computeFitRange: vi.fn(),
      is3d: () => true,
      isCameraOn: false,
      turnCameraOff: vi.fn(),
    },
    viewRect: { aspect: 1.5 },
    synchWithView: synch,
  } as unknown as ScreenViewport;
  return { viewport, lookAt, synch, queryModelRanges };
}

const RANGE = { low: [0, 0, 0], high: [10, 20, 30] };

describe('fitViewToModelRanges', () => {
  it('fits explicit model ids', async () => {
    const { viewport, lookAt, synch, queryModelRanges } = makeViewport([RANGE]);
    await expect(fitViewToModelRanges(viewport, ['0x10'])).resolves.toBe(true);
    expect(queryModelRanges).toHaveBeenCalledWith(['0x10']);
    expect(lookAt).toHaveBeenCalledTimes(1);
    const call = lookAt.mock.calls[0];
    expect(call?.[1]).toBe(1.5);
    expect(call?.[2]).toEqual({
      paddingPercent: { left: 0.06, right: 0.06, top: 0.08, bottom: 0.08 },
    });
    expect(synch).toHaveBeenCalledWith({});
  });

  it('queries all PhysicalModels when ids are omitted', async () => {
    const { viewport, queryModelRanges } = makeViewport([RANGE], ['0x1', '0x2']);
    await expect(fitViewToModelRanges(viewport)).resolves.toBe(true);
    expect(queryModelRanges).toHaveBeenCalledWith(['0x1', '0x2']);
  });

  it('空范围 → 取景基准面（Onshape Home），无模型/查询失败仍 no-op', async () => {
    {
      // 有 physical model 但范围为空（init 占位体）：空 Part Studio。
      const { viewport, lookAt } = makeViewport([]);
      await expect(fitViewToModelRanges(viewport)).resolves.toBe(true);
      expect(lookAt).toHaveBeenCalledTimes(1);
      const volume = lookAt.mock.calls[0]?.[0] as { low: { x: number }; high: { z: number } };
      expect(volume.low.x).toBe(-150);
      expect(volume.high.z).toBe(150);
    }
    {
      const { viewport, lookAt } = makeViewport([]);
      await expect(fitViewToModelRanges(viewport, [])).resolves.toBe(false);
      expect(lookAt).not.toHaveBeenCalled();
    }
    {
      const { viewport, lookAt, queryModelRanges } = makeViewport([], []);
      queryModelRanges.mockResolvedValueOnce([]);
      await expect(fitViewToModelRanges(viewport)).resolves.toBe(false);
      expect(lookAt).not.toHaveBeenCalled();
    }
    {
      const { viewport, lookAt, queryModelRanges } = makeViewport([RANGE]);
      queryModelRanges.mockRejectedValueOnce(new Error('backend down'));
      await expect(fitViewToModelRanges(viewport, ['0x10'])).resolves.toBe(false);
      expect(lookAt).not.toHaveBeenCalled();
    }
  });

  it('respects the late-result guard', async () => {
    const { viewport, lookAt } = makeViewport([RANGE]);
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(fitViewToModelRanges(viewport, ['0x10'], { isCurrent })).resolves.toBe(false);
    expect(lookAt).not.toHaveBeenCalled();
  });

  it('queryAllPhysicalModelIds distinguishes empty from failure', async () => {
    const ok = { async *createQueryReader() {} } as never;
    await expect(queryAllPhysicalModelIds(ok)).resolves.toEqual([]);
    const bad = { createQueryReader() { throw new Error('x'); } } as never;
    await expect(queryAllPhysicalModelIds(bad)).resolves.toBeUndefined();
  });
});

describe('fitViewToVisibleContent（Onshape 语义，2026-11-13）', () => {
  const sketchRange = Range3d.createXYZXYZ(-50, -50, 0, 50, 50, 0);

  it('模型范围 ∪ 活动草图；不改旋转，仅 lookAtVolume', async () => {
    const { viewport, lookAt, synch, queryModelRanges } = makeViewport([RANGE]);
    await expect(fitViewToVisibleContent(viewport, {
      modelIds: ['0x10'],
      sketchRange,
      paddingPercent: { left: 0.22, right: 0.05, top: 0.08, bottom: 0.08 },
    })).resolves.toBe(true);
    expect(queryModelRanges).toHaveBeenCalledWith(['0x10']);
    expect(lookAt).toHaveBeenCalledTimes(1);
    const call = lookAt.mock.calls[0];
    expect(call?.[1]).toBe(1.5);
    expect(call?.[2]).toEqual({
      paddingPercent: { left: 0.22, right: 0.05, top: 0.08, bottom: 0.08 },
    });
    expect(synch).toHaveBeenCalledWith({});
  });

  it('无模型但有草图（草图编辑）→ 只取景草图，基准面不并入', async () => {
    const { viewport, lookAt } = makeViewport([]);
    await expect(fitViewToVisibleContent(viewport, {
      modelIds: [],
      sketchRange,
      datumPlanesVisible: true,
    })).resolves.toBe(true);
    const volume = lookAt.mock.calls[0]?.[0] as Range3d;
    expect(volume.low.x).toBe(-50);
    expect(volume.high.x).toBe(50);
  });

  it('空场景 + 基准面可见 → 基准面范围兜底（不是 projectExtents）', async () => {
    const { viewport, lookAt } = makeViewport([]);
    await expect(fitViewToVisibleContent(viewport, {
      modelIds: [],
      datumPlanesVisible: true,
    })).resolves.toBe(true);
    const volume = lookAt.mock.calls[0]?.[0] as Range3d;
    expect(volume.low.x).toBe(-150);
    expect(volume.high.z).toBe(150);
  });

  it('无任何可见内容 → no-op（相机保持不动）', async () => {
    const { viewport, lookAt } = makeViewport([]);
    await expect(fitViewToVisibleContent(viewport, {
      modelIds: [],
      datumPlanesVisible: false,
    })).resolves.toBe(false);
    expect(lookAt).not.toHaveBeenCalled();
  });

  it('模型范围查询失败仍可用草图取景', async () => {
    const { viewport, lookAt, queryModelRanges } = makeViewport([RANGE]);
    queryModelRanges.mockRejectedValueOnce(new Error('backend down'));
    await expect(fitViewToVisibleContent(viewport, {
      modelIds: ['0x10'],
      sketchRange,
    })).resolves.toBe(true);
    expect(lookAt).toHaveBeenCalledTimes(1);
  });

  it('晚到守卫：查询返回后不落相机', async () => {
    const { viewport, lookAt } = makeViewport([RANGE]);
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(fitViewToVisibleContent(viewport, {
      modelIds: ['0x10'],
      sketchRange,
      isCurrent,
    })).resolves.toBe(false);
    expect(lookAt).not.toHaveBeenCalled();
  });
});
