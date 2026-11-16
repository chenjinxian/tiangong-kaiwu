// src/modules/part-studio/test/TransformDialog.test.tsx
//
// ADR-0010 UI 面：TransformDialog 行为验收（live 证据
// ui-evidence/feature-dialogs-20261108/onshape/transform-*.{json,png}）——
//  1) 新建 XYZ 平动 + 复制 → insertFeature/transform + targetBodyId；
//  2) edit 回显世界轴旋转 → updateParams；
//  3) 零平移/零角/缩放 1 无操作禁提交；模式切换；
//  4) 多实体必须选目标；无实体禁提交；
//  5) 自定义轴/旋转中心/缩放固定点只读保留；
//  6) 多分量/非均匀缩放诚实限权（禁提交或切模式）；
//  7) 2026-11-15 live 行对齐：目标 query field 两态/7 模式菜单/轴值行/
//     默认角度 30 与缩放 1/均匀缩放/底栏（载荷不变）。
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    await user.clear(screen.getByRole('textbox', { name: 'X 轴平移（mm）' }));
    await user.type(screen.getByRole('textbox', { name: 'X 轴平移（mm）' }), '30');
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
    const target = screen.getByRole('combobox', { name: '要变换或复制的图元' }) as HTMLSelectElement;
    expect(target.value).toBe('');
    expect(screen.getByTestId('part-studio-transform-target-missing')).toBeTruthy();
    await user.selectOptions(target, 'body-2');
    await user.clear(screen.getByRole('textbox', { name: 'X 轴平移（mm）' }));
    await user.type(screen.getByRole('textbox', { name: 'X 轴平移（mm）' }), '5');
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
    await second.user.type(screen.getAllByRole('textbox', { name: 'X 轴平移（mm）' }).at(-1)!, '5');
    await second.user.click(screen.getAllByRole('button', { name: '确认' }).at(-1)!);
    expect(second.applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-scale-axes',
      params: { translation: { x: 5, y: 0, z: 0 } },
    });
    expect(first.applyOp).not.toHaveBeenCalled();
  });

  it('live 行对齐：目标 query field / 7 模式菜单 / 轴值行 / 默认值 / 均匀缩放 / 底栏', async () => {
    const { user } = renderDialog();

    // 目标行 = 两态 query field：12px 标签 + 单实体 chip（selected 42px 态）。
    const targetField = screen.getByTestId('part-studio-transform-target-field');
    expect(targetField.textContent).toContain('要变换或复制的图元');
    expect(targetField.className).toContain('is-selected');
    expect(screen.getByTestId('part-studio-transform-target').textContent).toContain('Body 1');

    // 模式菜单 = live 7 项按序；4 项无后端通道诚实禁用并带未实现 title。
    const modeSelect = screen.getByRole('combobox', { name: '变换类型' }) as HTMLSelectElement;
    const options = Array.from(modeSelect.options);
    expect(options.map((option) => option.textContent)).toEqual([
      '按直线平动', '按距离平动', '按 XYZ 平动', '按配合连接器变换', '旋转', '原位复制', '缩放',
    ]);
    expect(options.filter((option) => option.disabled).map((option) => option.textContent)).toEqual([
      '按直线平动', '按距离平动', '按配合连接器变换', '原位复制',
    ]);
    expect(options.filter((option) => option.disabled).every((option) => option.title === '该能力尚未实现')).toBe(true);
    expect(screen.getByTestId('part-studio-transform-mode-hint').textContent).toContain('按直线平动');

    // X/Y/Z 值行：轴名（含 aria 轴名）+ 右对齐值 + mm + 禁用计算器。
    for (const axis of ['X', 'Y', 'Z']) {
      expect((screen.getByRole('textbox', { name: `${axis} 轴平移（mm）` }) as HTMLInputElement).value).toBe('0');
    }
    expect(screen.getAllByText('mm')).toHaveLength(3);
    expect(
      (screen.getAllByRole('button', { name: '计算器' }) as HTMLButtonElement[]).every((button) => button.disabled),
    ).toBe(true);

    // live 默认：旋转角度 30、缩放 1（均匀缩放勾选）。
    await user.selectOptions(modeSelect, 'rotate');
    expect((screen.getByRole('textbox', { name: '角度（度）' }) as HTMLInputElement).value).toBe('30');
    // 审计 B3（2026-11-16）：旋转角度行 = 值行壳（° 单位 + 禁用计算器）。
    const angleRow = screen.getByRole('textbox', { name: '角度（度）' }).closest('section')!;
    expect(angleRow.textContent).toContain('°');
    expect((within(angleRow).getByRole('button', { name: '计算器' }) as HTMLButtonElement).disabled).toBe(true);
    await user.selectOptions(modeSelect, 'scale');
    expect((screen.getByRole('textbox', { name: '缩放因子' }) as HTMLInputElement).value).toBe('1');
    // 审计 B3（2026-11-16）：缩放行无量纲单位后缀，仍带禁用计算器。
    const scaleRow = screen.getByRole('textbox', { name: '缩放因子' }).closest('section')!;
    expect(scaleRow.textContent).not.toContain('mm');
    expect(scaleRow.textContent).not.toContain('°');
    expect((within(scaleRow).getByRole('button', { name: '计算器' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: '均匀缩放' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('part-studio-transform-scale-point').textContent).toContain('点或配合连接器');

    // 底栏：禁用透明度滑杆 + ? 帮助。
    expect((screen.getByRole('slider', { name: '透明度' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '帮助' })).toBeTruthy();
  });

  it('取消均匀缩放：诚实提示并禁提交；落库非均匀缩放勾选为只读', async () => {
    const { user } = renderDialog();
    const modeSelect = screen.getByRole('combobox', { name: '变换类型' }) as HTMLSelectElement;
    await user.selectOptions(modeSelect, 'scale');
    const scale = screen.getByRole('textbox', { name: '缩放因子' });
    await user.clear(scale);
    await user.type(scale, '2');
    expect(confirm().disabled).toBe(false);
    const uniform = screen.getByRole('checkbox', { name: '均匀缩放' });
    await user.click(uniform);
    expect((uniform as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('part-studio-transform-uniform-hint').textContent).toContain('仅支持均匀缩放');
    expect(confirm().disabled).toBe(true);

    const nonUniform = { scaleAxes: { x: 2, y: 1, z: 0.5 } };
    const second = renderDialog({ featureId: 'f-scale-axes', initialParams: nonUniform }, nonUniform);
    const storedUniform = screen.getAllByRole('checkbox', { name: '均匀缩放' }).at(-1) as HTMLInputElement;
    expect(storedUniform.checked).toBe(false);
    expect(storedUniform.disabled).toBe(true);
    expect((screen.getAllByRole('button', { name: '确认' }).at(-1) as HTMLButtonElement).disabled).toBe(true);
    expect(second.applyOp).not.toHaveBeenCalled();
  });
});
