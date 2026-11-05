// src/modules/part-studio/test/CPlaneDialog.test.tsx
//
// ADR-0006 切片 B1（shared 1.29）：CPlaneDialog 行为验收——
//  1) 未选参考基准面时 ✓ 禁用；选择后可用；
//  2) 偏移复选 + 距离 + 反转法线进入 insertFeature/cPlane 载荷；
//  3) 未启用偏移时省略 offsetMm；未勾反转时不发 flipNormal；
//  4) edit 模式回显并走 updateParams；
//  5) 非法偏移/只读/后端拒收：不关闭、不假成功。
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({ outputMessage: vi.fn() }));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    constructor(public priority: unknown, public message: string) {}
  },
  OutputMessagePriority: { Success: 1 },
}));

import { CPlaneDialog } from '../dialogs/CPlaneDialog.js';

function renderDialog(overrides: Partial<React.ComponentProps<typeof CPlaneDialog>> = {}) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  const onConfirm = vi.fn();
  render(
    <CPlaneDialog
      featureName="平面 1"
      applyOp={applyOp}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { applyOp, onConfirm };
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /确认/ }) as HTMLButtonElement;
}

describe('CPlaneDialog（ADR-0006 切片 B1）', () => {
  beforeEach(() => {
    mocks.outputMessage.mockReset();
  });

  it('未选参考基准面时 ✓ 禁用；选择 Front 后可用', () => {
    renderDialog();
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-front'));
    expect(screen.getByTestId('cplane-reference-chip').textContent).toContain('Front 平面');
    expect(confirmButton().disabled).toBe(false);
  });

  it('偏移 + 距离 + 反转法线 → insertFeature/cPlane 载荷', async () => {
    const { applyOp, onConfirm } = renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-front'));
    fireEvent.change(screen.getByTestId('cplane-offset'), { target: { value: 'offset' } });
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '-20' } });
    fireEvent.click(screen.getByTestId('cplane-flip-normal'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'cPlane',
      params: { reference: 'front', offsetMm: -20, flipNormal: true },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
  });

  it('未启用偏移/反转 → 省略可选键', async () => {
    const { applyOp } = renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-right'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'cPlane',
      params: { reference: 'right' },
    });
  });

  it('edit 模式回显落库参数并走 updateParams', async () => {
    const { applyOp } = renderDialog({
      featureId: '0x42',
      initialParams: { reference: 'right', offsetMm: 50, flipNormal: true },
    });
    expect(screen.getByTestId('cplane-reference-chip').textContent).toContain('Right 平面');
    expect((screen.getByTestId('cplane-offset-distance') as HTMLInputElement).value).toBe('50');
    expect((screen.getByTestId('cplane-flip-normal') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '60' } });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: '0x42',
      params: { reference: 'right', offsetMm: 60, flipNormal: true },
    });
  });

  it('非法偏移值禁用 ✓；修正后可提交', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-top'));
    fireEvent.change(screen.getByTestId('cplane-offset'), { target: { value: 'offset' } });
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '' } });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '0' } });
    expect(confirmButton().disabled).toBe(false);
  });

  it('只读：✓ 禁用且显示诚实提示', () => {
    renderDialog({ canEdit: false, initialParams: { reference: 'top' } });
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('part-studio-cplane-readonly-hint')).toBeTruthy();
  });

  it('后端拒收：就地 Alert，不关闭、不报成功', async () => {
    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: '平面被草图引用' }));
    const onConfirm = vi.fn();
    render(
      <CPlaneDialog
        featureName="平面 1"
        featureId="0x42"
        initialParams={{ reference: 'top' }}
        applyOp={applyOp}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(confirmButton());
    await screen.findByText('平面被草图引用');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(mocks.outputMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('part-studio-cplane-dialog')).toBeTruthy();
  });
});
