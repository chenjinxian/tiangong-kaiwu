// src/modules/part-studio/test/TransformDialog.test.tsx
//
// ADR-0010 UI 面：TransformDialog 行为验收（live 证据
// ui-evidence/feature-dialogs-20261108/onshape/transform-*.{json,png}）——
//  1) 新建 XYZ 平动 + 复制 → insertFeature/transform + targetBodyId；
//  2) edit 回显世界轴旋转 → updateParams；
//  3) 零平移/零角/缩放 1 无操作禁提交；模式切换；
//  4) 多实体必须选目标；无实体禁提交；
//  5) 自定义轴/旋转中心/缩放固定点只读保留；
//  6) 多分量/非均匀缩放诚实限权（禁提交或切模式）。
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BodyInfo, FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({ outputMessage: vi.fn() }));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    constructor(public priority: unknown, public message: string) {}
  },
  OutputMessagePriority: { Success: 1 },
}));

vi.mock('../canvas/FeaturePreviewOverlay.js', () => ({
  FeaturePreviewOverlay: () => null,
}));

import { TransformDialog } from '../dialogs/TransformDialog.js';

const BODIES: BodyInfo[] = [
  { bodyKey: 'body-1', name: 'Body 1', active: true, authored: true },
  { bodyKey: 'body-2', name: 'Body 2', active: true, authored: true },
];

function renderDialog(
  props: Partial<React.ComponentProps<typeof TransformDialog>> = {},
  params?: Record<string, unknown>,
) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  const previewOp = vi.fn(async (_op: FeatureOp): Promise<import('@luban-cad/shared').PreviewResult> =>
    ({ ok: true, affected: [] }));
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(
    <TransformDialog
      featureName="变换 1"
      initialParams={params}
      applyOp={applyOp}
      previewOp={previewOp}
      bodies={[BODIES[0]!]}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return { applyOp, previewOp, onConfirm, user };
}

const confirm = () => screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;

describe('TransformDialog', () => {
  it('新建 XYZ 平动 + 复制：insertFeature + 目标实体，预览同载荷', async () => {
    const { applyOp, previewOp, onConfirm, user } = renderDialog();
    expect(screen.getByTestId('part-studio-transform-target').textContent).toContain('Body 1');
    expect((screen.getByRole('combobox', { name: '变换类型' }) as HTMLSelectElement).value).toBe('translate');
    await user.clear(screen.getByRole('textbox', { name: 'ΔX（mm）' }));
    await user.type(screen.getByRole('textbox', { name: 'ΔX（mm）' }), '30');
    await user.click(screen.getByRole('checkbox', { name: '复制零件' }));
    expect(screen.getByTestId('part-studio-transform-copy-hint').textContent).toContain('同一实体');
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());
    const expected = {
      kind: 'insertFeature',
      featureType: 'transform',
      params: { translation: { x: 30, y: 0, z: 0 }, copy: true },
      targetBodyId: 'body-1',
    };
    expect(applyOp).toHaveBeenCalledWith(expected);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(previewOp).toHaveBeenCalledWith(expected), { timeout: 3000 });
  });

  it('edit 回显世界轴旋转（目标只读）→ updateParams', async () => {
    const params = { rotation: { axisDirection: { x: 0, y: 0, z: 1 }, angleDeg: 90 } };
    const { applyOp, user } = renderDialog({ featureId: 'f-transform', initialParams: params }, params);
    expect(screen.getByTestId('part-studio-transform-target-fixed')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: '变换类型' }) as HTMLSelectElement).value).toBe('rotate');
    expect((screen.getByRole('combobox', { name: '轴' }) as HTMLSelectElement).value).toBe('Z');
    const angle = screen.getByRole('textbox', { name: '角度（度）' });
    expect((angle as HTMLInputElement).value).toBe('90');
    await user.clear(angle);
    await user.type(angle, '180');
    await user.click(confirm());
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-transform',
      params: { rotation: { axisDirection: { x: 0, y: 0, z: 1 }, angleDeg: 180 } },
    });
  });

  it('无操作禁提交：零平移 / 零角 / 缩放 1', async () => {
    const { user } = renderDialog();
    expect(screen.getByTestId('part-studio-transform-noop').textContent).toContain('非零');
    expect(confirm().disabled).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: '变换类型' }), 'rotate');
    const angle = screen.getByRole('textbox', { name: '角度（度）' });
    await user.clear(angle);
    await user.type(angle, '0');
    expect(confirm().disabled).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: '变换类型' }), 'scale');
    const scale = screen.getByRole('textbox', { name: '缩放因子' });
    await user.clear(scale);
    await user.type(scale, '1');
    expect(confirm().disabled).toBe(true);
    await user.clear(scale);
    await user.type(scale, '2');
    expect(confirm().disabled).toBe(false);
  });

  it('多实体必须选目标；无实体禁提交', async () => {
    const { user, applyOp } = renderDialog({ bodies: BODIES });
    const target = screen.getByRole('combobox', { name: '要变换的实体' }) as HTMLSelectElement;
    expect(target.value).toBe('');
    expect(screen.getByTestId('part-studio-transform-target-missing')).toBeTruthy();
    await user.selectOptions(target, 'body-2');
    await user.clear(screen.getByRole('textbox', { name: 'ΔX（mm）' }));
    await user.type(screen.getByRole('textbox', { name: 'ΔX（mm）' }), '5');
    await user.click(confirm());
    expect(applyOp).toHaveBeenCalledWith(expect.objectContaining({ targetBodyId: 'body-2' }));

    const noBodies = renderDialog({ bodies: [] });
    expect(noBodies.applyOp).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('part-studio-transform-needs-body').length).toBeGreaterThan(0);
    expect((screen.getAllByRole('button', { name: '确认' }).at(-1) as HTMLButtonElement).disabled).toBe(true);
  });

  it('自定义轴/旋转中心/缩放固定点只读保留', async () => {
    const params = {
      rotation: {
        axisOrigin: { x: 1, y: 2, z: 3 },
        axisDirection: { x: 1, y: 1, z: 0 },
        angleDeg: 90,
      },
    };
    const { applyOp, user } = renderDialog({ featureId: 'f-custom', initialParams: params }, params);
    expect((screen.getByRole('combobox', { name: '轴' }) as HTMLSelectElement).value).toBe('custom');
    expect(screen.getByTestId('part-studio-transform-custom-axis').textContent).toContain('(1, 1, 0)');
    expect(screen.getByTestId('part-studio-transform-axis-origin').textContent).toContain('(1, 2, 3)');
    const angle = screen.getByRole('textbox', { name: '角度（度）' });
    await user.clear(angle);
    await user.type(angle, '45');
    await user.click(confirm());
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-custom',
      params: {
        rotation: {
          axisOrigin: { x: 1, y: 2, z: 3 },
          axisDirection: { x: 1, y: 1, z: 0 },
          angleDeg: 45,
        },
      },
    });
  });

  it('多分量禁提交；非均匀缩放禁提交但可切平动', async () => {
    const combined = { translation: { x: 1, y: 0, z: 0 }, rotation: { axisDirection: { x: 0, y: 0, z: 1 }, angleDeg: 90 } };
    const first = renderDialog({ featureId: 'f-combined', initialParams: combined }, combined);
    expect(screen.getByTestId('part-studio-transform-combined')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: '确认' }).at(-1) as HTMLButtonElement).disabled).toBe(true);

    const nonUniform = { scaleAxes: { x: 2, y: 1, z: 0.5 } };
    const second = renderDialog({ featureId: 'f-scale-axes', initialParams: nonUniform }, nonUniform);
    expect(screen.getByTestId('part-studio-transform-nonuniform')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: '确认' }).at(-1) as HTMLButtonElement).disabled).toBe(true);
    await second.user.selectOptions(screen.getAllByRole('combobox', { name: '变换类型' }).at(-1)!, 'translate');
    await second.user.type(screen.getAllByRole('textbox', { name: 'ΔX（mm）' }).at(-1)!, '5');
    await second.user.click(screen.getAllByRole('button', { name: '确认' }).at(-1)!);
    expect(second.applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-scale-axes',
      params: { translation: { x: 5, y: 0, z: 0 } },
    });
    expect(first.applyOp).not.toHaveBeenCalled();
  });
});
