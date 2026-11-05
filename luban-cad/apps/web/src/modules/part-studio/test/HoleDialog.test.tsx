// src/modules/part-studio/test/HoleDialog.test.tsx
//
// ADR-0006 切片 A（2026-11-05）：HoleDialog 行为验收——
//  1) 草图点从 getSketch 读取；Onshape 语义不预选孔位，✓ 直到选点才可用；
//  2) blind 提交 insertFeature/hole，载荷含 sketchId/pointIds/diameterMm/depthMm；
//  3) throughAll 省略 depthMm；
//  4) edit 模式回显落库参数并走 updateParams；
//  5) 沉头孔/倒角孔页签禁用（后端未实现，禁止假成功）。
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  getSketch: vi.fn(),
  outputMessage: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    constructor(public priority: unknown, public message: string) {}
  },
  OutputMessagePriority: { Success: 1 },
}));

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => ({ getSketch: mocks.getSketch }),
  },
}));

vi.mock('@common/workspace/use-workspace-ref.js', () => ({
  useWorkspaceRef: () => ({ iTwinId: 'twin-1', iModelId: 'im-1', modelId: 'ps-1' }),
}));

import { HoleDialog } from '../dialogs/HoleDialog.js';

const sketches = [{ id: 'sketch-1', label: '草图 1' }];

function pointEntities(): { entities: unknown[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 10 },
      { kind: 'line', id: 3, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    ],
  };
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof HoleDialog>> = {}) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  render(
    <HoleDialog
      featureName="孔"
      applyOp={applyOp}
      connectionKey="conn-1"
      sketches={sketches}
      {...overrides}
    />,
  );
  return { applyOp };
}

/** Onshape 实体字段默认折叠：点开后才呈现草图点列表。 */
function openLocations(): void {
  fireEvent.click(screen.getByTestId('hole-locations-toggle'));
}

describe('HoleDialog（ADR-0006 切片 A/A2）', () => {
  beforeEach(() => {
    mocks.getSketch.mockReset();
    mocks.outputMessage.mockReset();
    mocks.getSketch.mockResolvedValue(pointEntities());
  });

  it('读取草图 point 且不预选；选点前 ✓ 禁用', async () => {
    renderDialog();
    openLocations();
    const point1 = await screen.findByLabelText('点 1');
    expect(screen.getByLabelText('点 2')).toBeTruthy();
    // 曲线顶点以「线 3 起点/终点」呈现，不混入 point 编号。
    expect(screen.getByLabelText('线 3 起点')).toBeTruthy();
    expect(screen.getByLabelText('线 3 终点')).toBeTruthy();
    expect(screen.queryByLabelText('点 3')).toBeNull();
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(point1);
    expect(confirm.disabled).toBe(false);
    expect(mocks.getSketch).toHaveBeenCalledWith('conn-1', 'sketch-1', 'ps-1');
  });

  it('blind 提交 hole insertFeature 载荷（不含 inch 换算字段）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.change(screen.getByTestId('hole-diameter'), { target: { value: '8' } });
    fireEvent.change(screen.getByTestId('hole-depth'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'hole',
      params: {
        sketchId: 'sketch-1',
        pointIds: [1],
        diameterMm: 8,
        endBound: 'blind',
        depthMm: 12,
        tipAngleDeg: 180,
      },
    });
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
  });

  it('曲线顶点孔位：线终点提交 vertexRefs（v1.27）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('线 3 终点'));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'hole',
      params: {
        sketchId: 'sketch-1',
        vertexRefs: [{ entityId: 3, part: 'end' }],
        diameterMm: 5,
        endBound: 'blind',
        depthMm: 10,
        tipAngleDeg: 180,
      },
    });
  });

  it('throughAll 省略 depthMm', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 2'));
    fireEvent.change(screen.getByTestId('hole-end-bound'), { target: { value: 'throughAll' } });
    expect(screen.queryByTestId('hole-depth')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const op = applyOp.mock.calls[0]![0] as unknown as { params: Record<string, unknown> };
    expect(op.params.endBound).toBe('throughAll');
    expect('depthMm' in op.params).toBe(false);
  });

  it('edit 模式回显 pointIds/尺寸并走 updateParams', async () => {
    const { applyOp } = renderDialog({
      featureId: 'feature-9',
      initialParams: {
        sketchId: 'sketch-1', pointIds: [2], diameterMm: 6.5, endBound: 'blind', depthMm: 4,
      },
    });
    openLocations();
    await waitFor(() => expect((screen.getByLabelText('点 2') as HTMLInputElement).checked).toBe(true));
    expect((screen.getByLabelText('点 1') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('hole-diameter') as HTMLInputElement).value).toBe('6.5');
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'feature-9',
      params: {
        sketchId: 'sketch-1',
        pointIds: [2],
        diameterMm: 6.5,
        endBound: 'blind',
        depthMm: 4,
        tipAngleDeg: 180,
      },
    });
  });

  it('沉头孔提交 counterbore 参数（v1.28）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByText('沉头孔').closest('button')!);
    expect(screen.getByTestId('hole-cbore-diameter')).toBeTruthy();
    fireEvent.change(screen.getByTestId('hole-cbore-depth'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'hole',
      params: {
        sketchId: 'sketch-1',
        pointIds: [1],
        holeStyle: 'counterbore',
        counterboreDiameterMm: 10,
        counterboreDepthMm: 3,
        diameterMm: 5,
        endBound: 'blind',
        depthMm: 10,
        tipAngleDeg: 180,
      },
    });
  });

  it('倒角孔页签仍禁用（未实现不假成功）', () => {
    renderDialog();
    const countersink = screen.getByText('倒角孔').closest('button') as HTMLButtonElement;
    expect(countersink.disabled).toBe(true);
  });
});
