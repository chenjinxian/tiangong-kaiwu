/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * fitViewToModelRanges（2026-11-02）：显式/全物理模型取景、空集/查询失败/
 * 晚到结果守卫的 no-op 语义。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ScreenViewport } from '@itwin/core-frontend';
import { fitViewToModelRanges, queryAllPhysicalModelIds } from '../fit-view.js';

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
