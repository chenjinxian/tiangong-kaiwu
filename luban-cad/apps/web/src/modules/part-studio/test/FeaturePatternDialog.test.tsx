// src/modules/part-studio/test/FeaturePatternDialog.test.tsx
//
// ADR-0007 切片 8：featurePattern 编辑对话框行为验收——
//  1) 落库回显 source/kind/count/spacing/axis/centered；
//  2) updateParams 载荷保留 source/axis/centered，仅改可编辑量；
//  3) 数值域校验（count 2..1000、居中奇数、spacing>0、angle (0,360]）；
//  4) 圆周形态用 angle 并保留原轴；
//  5) 源/轴缺失或退化 → 禁提交；
//  6) canEdit=false 全禁用。
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({ outputMessage: vi.fn() }));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    constructor(public priority: unknown, public message: string) {}
  },
  OutputMessagePriority: { Success: 1 },
}));

import { FeaturePatternDialog } from '../dialogs/FeaturePatternDialog.js';

const axis = {
  origin: { x: 0, y: 0, z: 0 },
  direction: { x: 1, y: 0, z: 0 },
};

function stored(overrides: Record<string, unknown> = {}) {
  return {
    sourceFeatureId: '0x20000000008',
    kind: 'linear',
    count: 3,
    spacing: 6,
    axis,
    ...overrides,
  };
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof FeaturePatternDialog>> = {},
  params: Record<string, unknown> = stored(),
) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(
    <FeaturePatternDialog
      featureName="特征阵列 1"
      featureId="f-pattern"
      initialParams={params}
      applyOp={applyOp}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return { applyOp, onConfirm, user };
}

describe('FeaturePatternDialog', () => {
  it('落库回显：居中总数 5 → 每侧 3、居中勾选 + 提示', () => {
    const { applyOp } = renderDialog({}, stored({ centered: true, count: 5 }));
    expect(screen.getByTestId('part-studio-feature-pattern-source').textContent).toBe('0x20000000008');
    expect((screen.getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement).value).toBe('linear');
    expect((screen.getByRole('textbox', { name: '每侧实例数（含原件）' }) as HTMLInputElement).value).toBe('3');
    expect((screen.getByRole('textbox', { name: '间距' }) as HTMLInputElement).value).toBe('6');
    expect(screen.getByTestId('part-studio-feature-pattern-axis').textContent).toContain('方向');
    expect((screen.getByRole('checkbox', { name: '居中' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('part-studio-feature-pattern-centered-hint').textContent).toContain('2N−1');
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('确认：updateParams 保留 source/axis/centered，实例数改 4', async () => {
    const { applyOp, onConfirm, user } = renderDialog({}, stored({ centered: false }));
    const count = screen.getByRole('textbox', { name: '实例数量（含原件）' });
    await user.clear(count);
    await user.type(count, '4');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear',
        count: 4,
        spacing: 6,
        axis,
      },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('勾选居中：每侧 3 → count 5 + centered:true；取消勾选按总数 3', async () => {
    const { applyOp, user } = renderDialog({}, stored({ centered: false }));
    const center = screen.getByRole('checkbox', { name: '居中' });
    await user.click(center);
    const count = screen.getByRole('textbox', { name: '每侧实例数（含原件）' }) as HTMLInputElement;
    expect(count.value).toBe('3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'updateParams',
      params: { count: 5, centered: true, spacing: 6 },
    });

    await user.click(center);
    expect((screen.getByRole('textbox', { name: '实例数量（含原件）' }) as HTMLInputElement).value).toBe('3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toMatchObject({ params: { count: 3 } });
    expect((applyOp.mock.calls[1]![0] as Extract<FeatureOp, { kind: 'updateParams' }>).params)
      .not.toHaveProperty('centered');
  });

  it('居中每侧实例数域 2..500；spacing<=0 禁提交', async () => {
    const { applyOp, user } = renderDialog({}, stored({ centered: true, count: 5 }));
    const count = screen.getByRole('textbox', { name: '每侧实例数（含原件）' });
    await user.clear(count);
    await user.type(count, '1');
    expect(screen.getByTestId('part-studio-feature-pattern-count-invalid').textContent)
      .toContain('2–500');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(count);
    await user.type(count, '3');
    const spacing = screen.getByRole('textbox', { name: '间距' });
    await user.clear(spacing);
    await user.type(spacing, '0');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('圆周形态：显示角度、保留原轴、居中禁用复位，载荷用 angle 无 spacing', async () => {
    const { applyOp, user } = renderDialog({}, stored({ centered: true, count: 5 }));
    const center = screen.getByRole('checkbox', { name: '居中' }) as HTMLInputElement;
    expect(center.checked).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect(screen.queryByRole('textbox', { name: '间距' })).toBeNull();
    expect(center.checked).toBe(false);
    expect(center.disabled).toBe(true);
    const angle = screen.getByRole('textbox', { name: '总角度（度）' });
    await user.clear(angle);
    await user.type(angle, '180');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'circular',
        count: 3,
        angle: 180,
        axis,
      },
    });
  });

  it('源缺失或轴退化 → 禁提交并提示', () => {
    renderDialog({}, stored({ sourceFeatureId: undefined }));
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    // 独立现场：轴退化
    render(
      <FeaturePatternDialog
        featureName="特征阵列 2"
        featureId="f-pattern-2"
        initialParams={stored({ axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } } })}
        applyOp={vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true }))}
      />,
    );
    expect(screen.getAllByTestId('part-studio-feature-pattern-axis').at(-1)!.textContent).toContain('退化');
    expect((screen.getAllByRole('button', { name: '确认' }).at(-1) as HTMLButtonElement).disabled).toBe(true);
  });

  it('canEdit=false：输入与确认全禁用', () => {
    renderDialog({ canEdit: false });
    expect((screen.getByRole('textbox', { name: '实例数量（含原件）' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('改参触发 previewOp（updateParams；250ms 防抖）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<import('@luban-cad/shared').PreviewResult> =>
      ({ ok: true, affected: [] }));
    renderDialog({ previewOp });
    await waitFor(() => expect(previewOp).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const op = previewOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear',
        count: 3,
        spacing: 6,
        axis,
      },
    });
  });

  // ADR-0007 切片 11：已有 secondDirection 的阵列可编辑第二方向；
  // 第二方向轴是结构引用（只读回显），非第二方向的旧阵列不渲染该区。
  const secondAxis = {
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
  };

  it('第二方向回显与编辑：count/spacing 改值，轴只读保留', async () => {
    const { applyOp, user } = renderDialog({}, stored({
      secondDirection: { count: 2, spacing: 8, axis: secondAxis },
    }));
    const enabled = screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement;
    expect(enabled.checked).toBe(true);
    const secondCount = screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' }) as HTMLInputElement;
    const secondSpacing = screen.getByRole('textbox', { name: '第二方向间距' }) as HTMLInputElement;
    expect(secondCount.value).toBe('2');
    expect(secondSpacing.value).toBe('8');
    expect(screen.getByTestId('part-studio-feature-pattern-second-axis').textContent)
      .toContain('第二方向轴');
    await user.clear(secondCount);
    await user.type(secondCount, '3');
    await user.clear(secondSpacing);
    await user.type(secondSpacing, '5');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear',
        count: 3,
        spacing: 6,
        axis,
        secondDirection: { count: 3, spacing: 5, axis: secondAxis },
      },
    });
  });

  it('取消第二方向/切圆周 → 载荷移除；重新勾选恢复只读轴', async () => {
    const { applyOp, user } = renderDialog({}, stored({
      secondDirection: { count: 2, spacing: 8, axis: secondAxis },
    }));
    const enabled = screen.getByRole('checkbox', { name: '第二个方向' });
    await user.click(enabled);
    expect(screen.queryByRole('textbox', { name: '第二方向实例数量（含原件）' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({ kind: 'updateParams', params: { count: 3 } });
    expect((applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>).params)
      .not.toHaveProperty('secondDirection');

    await user.click(enabled);
    expect(screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toMatchObject({
      params: { secondDirection: { count: 2, spacing: 8, axis: secondAxis } },
    });

    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect((enabled as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const circular = applyOp.mock.calls[2]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(circular.params).toMatchObject({ kind: 'circular', angle: 360 });
    expect(circular.params).not.toHaveProperty('secondDirection');
  });

  // ADR-0007 切片 12：多源阵列（shared 1.59 sourceFeatureIds）回显与保形。
  it('多源阵列：全部源 chips 回显，载荷保留 sourceFeatureIds', async () => {
    const { applyOp, user } = renderDialog({}, stored({
      sourceFeatureId: undefined,
      sourceFeatureIds: ['0x20000000008', '0x20000000009'],
    }));
    expect(screen.getByTestId('part-studio-feature-pattern-source').getAttribute('data-multi')).toBe('true');
    expect(screen.getByTestId('part-studio-feature-pattern-source-0').textContent).toBe('0x20000000008');
    expect(screen.getByTestId('part-studio-feature-pattern-source-1').textContent).toBe('0x20000000009');
    expect(screen.getByTestId('part-studio-feature-pattern-multi-source-hint').textContent)
      .toContain('结构引用');
    const count = screen.getByRole('textbox', { name: '实例数量（含原件）' });
    await user.clear(count);
    await user.type(count, '4');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.params).toMatchObject({
      sourceFeatureIds: ['0x20000000008', '0x20000000009'],
      kind: 'linear',
      count: 4,
      spacing: 6,
      axis,
    });
    expect(op.params).not.toHaveProperty('sourceFeatureId');
  });

  it('第二方向域校验：间距>0、两方向总实例≤1000', async () => {
    const { applyOp, user } = renderDialog({}, stored({
      count: 600,
      secondDirection: { count: 2, spacing: 8, axis: secondAxis },
    }));
    expect(screen.getByTestId('part-studio-feature-pattern-total-invalid').textContent)
      .toContain('1000');
    const confirm = () => screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    const secondSpacing = screen.getByRole('textbox', { name: '第二方向间距' });
    await user.clear(secondSpacing);
    await user.type(secondSpacing, '0');
    expect(screen.getByTestId('part-studio-feature-pattern-second-spacing-invalid').textContent)
      .toContain('正数');
    expect(confirm().disabled).toBe(true);
    await user.clear(secondSpacing);
    await user.type(secondSpacing, '8');
    const firstCount = screen.getByRole('textbox', { name: '实例数量（含原件）' });
    await user.clear(firstCount);
    await user.type(firstCount, '500');
    expect(screen.queryByTestId('part-studio-feature-pattern-total-invalid')).toBeNull();
    expect(confirm().disabled).toBe(false);
    expect(applyOp).not.toHaveBeenCalled();
  });
});
