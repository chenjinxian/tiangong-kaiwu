// src/modules/part-studio/test/FeaturePatternDialog.test.tsx
//
// ADR-0007 切片 8：featurePattern 编辑对话框行为验收——
//  1) 落库回显 source/kind/count/spacing/axis/centered；
//  2) updateParams 载荷保留 source/axis/centered，仅改可编辑量；
//  3) 数值域校验（count 2..1000、居中奇数、spacing>0、angle (0,360]）；
//  4) 圆周形态用 angle 并保留原轴；
//  5) 源/轴缺失或退化 → 禁提交；
//  6) canEdit=false 全禁用；
//  7) A4（2026-11-16）：源 chips 显示 features 映射的特征名，缺省/未命中回退 id；
//  8) A5（2026-11-16）：共享底栏（禁用透明度滑杆 + ? 帮助）；
//  9) A6（2026-11-16）：轴方向只读值行（「方向」+ 向量）、跳过实例行折叠箭头；
// 10) W10c（2026-11-16 live 形状）：只读阵列范围 + 四个禁用操作页签（无活动页签）、
//     距离行 mm 单位 + 实例数/距离行禁用计算器、第二个方向折叠组（有/无落库两态、
//     收起不改载荷）、跳过实例组禁用折叠行。
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult, PreviewResult, VariableDto } from '@luban-cad/shared';

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
  it('跳过实例行（Onshape live 行序最后）：禁用 + 未支持提示（点选通道未实现）+ 折叠箭头 affordance', () => {
    renderDialog();
    const row = screen.getByTestId('part-studio-feature-pattern-skip-instances');
    expect(row.getAttribute('title')).toContain('尚未支持');
    expect((row.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true);
    expect(row.textContent).toContain('跳过实例');
    // A6（2026-11-16）：禁用折叠行同仓储 span idiom（aria-hidden，无行为）。
    const chevron = screen.getByTestId('part-studio-feature-pattern-skip-chevron');
    expect(chevron.textContent).toBe('›');
    expect(chevron.getAttribute('aria-hidden')).toBe('true');
    expect(row.contains(chevron)).toBe(true);
  });

  it('阵列类型选项=线性阵列/环形阵列（特征阵列不是零件阵列）', () => {
    renderDialog();
    const kind = screen.getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement;
    expect(within(kind).getByRole('option', { name: '线性阵列' })).toBeDefined();
    expect(within(kind).getByRole('option', { name: '环形阵列' })).toBeDefined();
    expect(within(kind).queryByRole('option', { name: '零件阵列' })).toBeNull();
    expect(within(kind).queryByRole('option', { name: '圆周阵列' })).toBeNull();
  });

  it('A5：底栏 = 禁用透明度滑杆 + ? 帮助（与其他特征对话框共享皮肤）', () => {
    renderDialog();
    const slider = screen.getByRole('slider', { name: '透明度' }) as HTMLInputElement;
    expect(slider.disabled).toBe(true);
    // F5（2026-11-16）：禁用态必须给出真实原因（无假控件、无静默按钮）。
    expect(slider.getAttribute('title')).toBe('透明度滑杆尚未接入动态预览着色，暂不可用。');
    const help = screen.getByRole('button', { name: '帮助' });
    expect(help.textContent).toBe('?');
    expect(help.getAttribute('title')).toBe('帮助内容尚未接入。');
  });

  it('A4：源 chips 显示 features 映射的特征名（载荷仍是结构引用 id）', async () => {
    const { applyOp, user } = renderDialog({
      features: [{ id: '0x20000000008', label: '拉伸 1', featureType: 'extrude' }],
    }, stored({ centered: false }));
    expect(screen.getByTestId('part-studio-feature-pattern-source').textContent).toBe('拉伸 1');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({ params: { sourceFeatureId: '0x20000000008' } });
  });

  it('A4：无 features 表 / id 未命中 → 回退原始 id（不崩溃，载荷不变）', () => {
    // 缺省 features：原始 id 回退（既有行为保持）。
    renderDialog();
    expect(screen.getByTestId('part-studio-feature-pattern-source').textContent).toBe('0x20000000008');

    // 部分映射：命中项显示名，未命中项回退 id。
    renderDialog({
      features: [{ id: '0x20000000008', label: '拉伸 1', featureType: 'extrude' }],
    }, stored({
      sourceFeatureId: undefined,
      sourceFeatureIds: ['0x20000000008', '0x20000000009'],
    }));
    const multi = screen.getAllByTestId('part-studio-feature-pattern-source').at(-1)!;
    expect(multi.getAttribute('data-multi')).toBe('true');
    expect(within(multi).getByTestId('part-studio-feature-pattern-source-0').textContent).toBe('拉伸 1');
    expect(within(multi).getByTestId('part-studio-feature-pattern-source-1').textContent).toBe('0x20000000009');
  });

  it('落库回显：居中总数 5 → 每侧 3、居中勾选 + 提示', () => {
    const { applyOp } = renderDialog({
      features: [{ id: '0x20000000008', label: '拉伸 1', featureType: 'extrude' }],
    }, stored({ centered: true, count: 5 }));
    expect(screen.getByTestId('part-studio-feature-pattern-source').textContent).toBe('拉伸 1');
    expect((screen.getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement).value).toBe('linear');
    expect((screen.getByRole('textbox', { name: '每侧实例数（含原件）' }) as HTMLInputElement).value).toBe('3');
    expect((screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement).value).toBe('6');
    // A6（2026-11-16）：轴方向 = 只读值行（「方向」+ 格式化向量），不再是裸 (x,y,z) 提示。
    const directionRow = screen.getByTestId('part-studio-feature-pattern-axis');
    expect(directionRow.textContent).toContain('方向');
    expect(screen.getByTestId('part-studio-feature-pattern-direction-value').textContent).toBe('(1, 0, 0)');
    expect((screen.getByRole('checkbox', { name: '居中' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('part-studio-feature-pattern-centered-hint').textContent).toContain('2N−1');
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('确认：updateParams 保留 source/axis/centered，实例数改 4', async () => {
    const { applyOp, onConfirm, user } = renderDialog({}, stored({ centered: false }));
    const count = screen.getByRole('textbox', { name: '实例数' });
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
    expect((screen.getByRole('textbox', { name: '实例数' }) as HTMLInputElement).value).toBe('3');
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
    const spacing = screen.getByRole('textbox', { name: '距离' });
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
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull();
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
    expect((screen.getByRole('textbox', { name: '实例数' }) as HTMLInputElement).disabled).toBe(true);
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
  // 第二方向轴是结构引用（只读回显）。W10c（2026-11-16）：折叠组头始终渲染
  // （有落库轴=可用/默认展开，无落库轴=禁用+原因），内容只在既有第二方向
  // 且展开时渲染。
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
  it('多源阵列：全部源 chips 回显特征名（A4），载荷保留 sourceFeatureIds', async () => {
    const { applyOp, user } = renderDialog({
      features: [
        { id: '0x20000000008', label: '拉伸 1', featureType: 'extrude' },
        { id: '0x20000000009', label: '拉伸 2', featureType: 'extrude' },
      ],
    }, stored({
      sourceFeatureId: undefined,
      sourceFeatureIds: ['0x20000000008', '0x20000000009'],
    }));
    expect(screen.getByTestId('part-studio-feature-pattern-source').getAttribute('data-multi')).toBe('true');
    expect(screen.getByTestId('part-studio-feature-pattern-source-0').textContent).toBe('拉伸 1');
    expect(screen.getByTestId('part-studio-feature-pattern-source-1').textContent).toBe('拉伸 2');
    expect(screen.getByTestId('part-studio-feature-pattern-multi-source-hint').textContent)
      .toContain('结构引用');
    const count = screen.getByRole('textbox', { name: '实例数' });
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
    const firstCount = screen.getByRole('textbox', { name: '实例数' });
    await user.clear(firstCount);
    await user.type(firstCount, '500');
    expect(screen.queryByTestId('part-studio-feature-pattern-total-invalid')).toBeNull();
    expect(confirm().disabled).toBe(false);
    expect(applyOp).not.toHaveBeenCalled();
  });

  // ADR-0020 S6（shared 1.76）：线性间距表达式——spacing 保持必填物化快照，
  // 表达式原文随载荷提交；circular 两键都不带；未触碰保留、数值/切圆周清除；
  // 无效求值阻断确认与 previewOp（S5 本地化错误）。
  const SP_VARIABLE: VariableDto = { id: 'v-sp', name: 'sp', expression: '10', type: 'length' };
  const spacingInput = (): HTMLInputElement =>
    screen.getByTestId('part-studio-feature-pattern-spacing') as HTMLInputElement;
  const confirmButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;

  it('S6 间距表达式：`#sp` → 载荷 {spacing: 求值 10, spacingExpression: "#sp"}；preview 用求值 spacing', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({ ok: true, affected: [] }));
    const { applyOp, user } = renderDialog({ variables: [SP_VARIABLE], previewOp });
    const expectedParams = {
      sourceFeatureId: '0x20000000008',
      kind: 'linear',
      count: 3,
      spacing: 10,
      axis,
      spacingExpression: '#sp',
    };
    expect(spacingInput().value).toBe('6');
    await user.click(spacingInput());
    await user.clear(spacingInput());
    await user.type(spacingInput(), '#sp');
    expect(spacingInput().value).toBe('#sp'); // 聚焦=表达式原文
    await user.tab();
    expect(spacingInput().value).toBe('10'); // 失焦=本地求值（sp=10）
    await waitFor(() => expect(previewOp.mock.calls.at(-1)?.[0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: expectedParams,
    }), { timeout: 3000 });
    await user.click(confirmButton());
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: expectedParams,
    });
  });

  it('S6 编辑未触碰保留：改实例数 → spacingExpression 原样保留（spacing 按表达式求值重物化）', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE] },
      stored({ spacingExpression: '#sp' }),
    );
    const count = screen.getByRole('textbox', { name: '实例数' });
    await user.clear(count);
    await user.type(count, '4');
    await user.click(confirmButton());
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear',
        count: 4,
        // 表达式在场 → spacing 与本地求值同源（后端写边界仍按表达式权威物化，
        // 快照必须与表达式一致，不能保留旧值 6）。
        spacing: 10,
        axis,
        spacingExpression: '#sp',
      },
    });
  });

  it('S6 数值编辑清除：写入 20 → 载荷 spacing 20 且不带 spacingExpression', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE] },
      stored({ spacingExpression: '#sp' }),
    );
    await user.click(spacingInput());
    expect(spacingInput().value).toBe('#sp');
    await user.clear(spacingInput());
    await user.type(spacingInput(), '20');
    await user.tab();
    await user.click(confirmButton());
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.params).toMatchObject({ kind: 'linear', count: 3, spacing: 20 });
    expect(op.params).not.toHaveProperty('spacingExpression');
  });

  it('S6 切圆周：表达式清除、载荷无 spacing/spacingExpression；切回线性草稿归位数值', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE] },
      stored({ spacingExpression: '#sp' }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect(screen.queryByTestId('part-studio-feature-pattern-spacing')).toBeNull();
    await user.click(confirmButton());
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'circular',
        count: 3,
        angle: 360,
        axis,
      },
    });
    // 切回线性：旧表达式已清除。必须**聚焦**断言（未聚焦的受控输入显示
    // numberText，即使表达式残留也会是数值——聚焦才暴露残留的 `#sp`）；
    // 再提交一次并断言载荷不带 spacingExpression（宿主清除 effect 的真正判据）。
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'linear');
    await user.click(spacingInput());
    expect(spacingInput().value).toBe('6');
    await user.tab();
    await user.click(confirmButton());
    expect(applyOp.mock.calls[1]![0]).toEqual({
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

  it('S6 无效表达式阻断：`#nope` → ✓ 禁用 + S5 本地化字段错误 + 不重发 previewOp/不发 op', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({ ok: true, affected: [] }));
    const { applyOp, user } = renderDialog({ variables: [SP_VARIABLE], previewOp });
    await waitFor(() => expect(previewOp).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await user.click(spacingInput());
    await user.clear(spacingInput());
    await user.type(spacingInput(), '#nope');
    expect(spacingInput().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('expression-field-error').textContent).toContain('未知变量');
    expect(confirmButton().disabled).toBe(true);
    // 无效表达式不产生新的影子求值（不回落数值草稿、不出假预览）。
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(previewOp).toHaveBeenCalledTimes(1);
    await user.click(confirmButton());
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('S6 变量表未就绪：未触碰的落库表达式按物化 spacing 放行（不误报未知变量）', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [], variablesLoading: true },
      stored({ spacingExpression: '#sp' }),
    );
    expect(confirmButton().disabled).toBe(false);
    await user.click(confirmButton());
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear',
        count: 3,
        spacing: 6,
        axis,
        spacingExpression: '#sp',
      },
    });
  });

  // ADR-0020 S9（shared 1.79）：第二方向间距表达式——嵌套在
  // `secondDirection.spacingExpression`（与第一方向顶层同名键分层）。
  const SP_VARIABLE_S9: VariableDto = { id: 'v-sp', name: 'sp', expression: '10', type: 'length' };
  const W_VARIABLE_S9: VariableDto = { id: 'v-w', name: 'w', expression: '5', type: 'length' };
  const secondAxisS9 = {
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
  };
  const secondSpacingInputS9 = (): HTMLInputElement =>
    screen.getByTestId('part-studio-feature-pattern-second-spacing') as HTMLInputElement;

  it('S9 两层同名表达式区分（仅第一方向）：顶层带 spacingExpression，第二方向对象不带', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9] },
      stored({
        spacingExpression: '#sp',
        secondDirection: { count: 2, spacing: 8, axis: secondAxisS9 },
      }),
    );
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 10, axis, spacingExpression: '#sp',
        secondDirection: { count: 2, spacing: 8, axis: secondAxisS9 },
      },
    });
  });

  it('S9 两层同名表达式区分（仅第二方向）：嵌套带 spacingExpression，顶层不带', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9] },
      stored({
        secondDirection: {
          count: 2, spacing: 8, axis: secondAxisS9, spacingExpression: '#sp',
        },
      }),
    );
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 6, axis,
        // 嵌套表达式在场 → 嵌套 spacing 与本地求值同源（8 → 10），顶层不串键。
        secondDirection: {
          count: 2, spacing: 10, axis: secondAxisS9, spacingExpression: '#sp',
        },
      },
    });
  });

  it('S9 两层同名表达式区分（两层同时）：各自使用自己的求值/原文，互不覆盖', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9, W_VARIABLE_S9] },
      stored({
        spacingExpression: '#sp',
        secondDirection: {
          count: 2, spacing: 8, axis: secondAxisS9, spacingExpression: '#w',
        },
      }),
    );
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 10, axis, spacingExpression: '#sp',
        secondDirection: {
          count: 2, spacing: 5, axis: secondAxisS9, spacingExpression: '#w',
        },
      },
    });
  });

  it('S9 第二方向表达式输入：`#sp` → 嵌套 {spacing: 求值, spacingExpression}；preview 同源', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({ ok: true, affected: [] }));
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9], previewOp },
      stored({ secondDirection: { count: 2, spacing: 8, axis: secondAxisS9 } }),
    );
    const input = secondSpacingInputS9();
    expect(input.value).toBe('8');
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#sp');
    expect(input.value).toBe('#sp');
    await user.tab();
    expect(input.value).toBe('10');
    const expected = {
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 6, axis,
        secondDirection: {
          count: 2, spacing: 10, axis: secondAxisS9, spacingExpression: '#sp',
        },
      },
    };
    await waitFor(() => expect(previewOp.mock.calls.at(-1)?.[0]).toEqual(expected), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith(expected);
    const params = (applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>).params;
    expect(params).not.toHaveProperty('spacingExpression');
  });

  it('S9 第二方向未触碰保留：改实例数 → 嵌套 spacingExpression 原样保留 + 求值重物化', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9] },
      stored({
        secondDirection: {
          count: 2, spacing: 8, axis: secondAxisS9, spacingExpression: '#sp',
        },
      }),
    );
    const secondCount = screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' });
    await user.clear(secondCount);
    await user.type(secondCount, '3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 6, axis,
        secondDirection: {
          count: 3, spacing: 10, axis: secondAxisS9, spacingExpression: '#sp',
        },
      },
    });
  });

  it('S9 第二方向数值编辑清除：改成 20 → 嵌套 spacing 20 且不带 spacingExpression', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9] },
      stored({
        secondDirection: {
          count: 2, spacing: 8, axis: secondAxisS9, spacingExpression: '#sp',
        },
      }),
    );
    const input = secondSpacingInputS9();
    await user.click(input);
    expect(input.value).toBe('#sp');
    await user.clear(input);
    await user.type(input, '20');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.params).toMatchObject({
      secondDirection: { count: 2, spacing: 20, axis: secondAxisS9 },
    });
    const second = (op.params as Record<string, unknown>).secondDirection as Record<string, unknown>;
    expect(second.spacingExpression).toBeUndefined();
  });

  it('S9 禁用第二方向清除表达式：取消勾选 → 载荷无 secondDirection；重新勾选草稿归位数值', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9] },
      stored({
        secondDirection: {
          count: 2, spacing: 8, axis: secondAxisS9, spacingExpression: '#sp',
        },
      }),
    );
    const enabled = screen.getByRole('checkbox', { name: '第二个方向' });
    expect((enabled as HTMLInputElement).checked).toBe(true);
    await user.click(enabled);
    expect(screen.queryByTestId('part-studio-feature-pattern-second-spacing')).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 6, axis,
      },
    });
    // 重新勾选：旧表达式已被宿主清除（聚焦才暴露残留的 `#sp`）；数值草稿保留
    // **当前草稿**——本用例从未聚焦表达式，草稿仍是落库快照 8（若先聚焦/失焦，
    // numberText 已被投影为求值 10，则保留 10）。
    await user.click(enabled);
    const back = secondSpacingInputS9();
    await user.click(back);
    expect(back.value).toBe('8');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 6, axis,
        secondDirection: { count: 2, spacing: 8, axis: secondAxisS9 },
      },
    });
  });

  it('S9 切圆周清除第二方向表达式：载荷无 secondDirection；切回线性重新启用后不带表达式', async () => {
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9] },
      stored({
        secondDirection: {
          count: 2, spacing: 8, axis: secondAxisS9, spacingExpression: '#sp',
        },
      }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect(screen.queryByTestId('part-studio-feature-pattern-second-spacing')).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'circular', count: 3, angle: 360, axis,
      },
    });
    // 切回线性：切圆周已把第二方向取消（勾选=禁用/未勾选），重新启用后
    // 旧表达式已被清理；数值草稿仍是未触碰的落库快照（8）。
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'linear');
    const enabled = screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement;
    expect(enabled.checked).toBe(false);
    await user.click(enabled);
    const back = secondSpacingInputS9();
    await user.click(back);
    expect(back.value).toBe('8');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: {
        sourceFeatureId: '0x20000000008',
        kind: 'linear', count: 3, spacing: 6, axis,
        secondDirection: { count: 2, spacing: 8, axis: secondAxisS9 },
      },
    });
    const second = (applyOp.mock.calls[1]![0] as Extract<FeatureOp, { kind: 'updateParams' }>)
      .params as Record<string, unknown>;
    expect(
      (second.secondDirection as Record<string, unknown>).spacingExpression,
    ).toBeUndefined();
  });

  it('S9 第二方向无效表达式阻断：`#nope` → ✓ 禁用 + S5 本地化字段错误 + 不重发 previewOp/不发 op', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({ ok: true, affected: [] }));
    const { applyOp, user } = renderDialog(
      { variables: [SP_VARIABLE_S9], previewOp },
      stored({ secondDirection: { count: 2, spacing: 8, axis: secondAxisS9 } }),
    );
    await waitFor(() => expect(previewOp).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const input = secondSpacingInputS9();
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#nope');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('expression-field-error').textContent).toContain('未知变量');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    // 无效表达式不产生新的影子求值（不回落数值草稿、不出假预览）。
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(previewOp).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  // ── W10c（2026-11-16 live 对话框形状）────────────────────────────────────
  it('W10c：阵列范围=只读禁用「特征阵列」（固定原因）；操作页签四个全禁用且无活动页签', () => {
    renderDialog();
    const scope = screen.getByRole('combobox', { name: '阵列范围' }) as HTMLSelectElement;
    expect(scope.value).toBe('feature');
    expect(scope.disabled).toBe(true);
    expect(scope.getAttribute('title')).toContain('特征阵列');
    expect(screen.getByTestId('part-studio-feature-pattern-scope-row').getAttribute('title'))
      .toContain('零件阵列');

    const tabs = screen.getByRole('tablist', { name: '阵列操作' });
    const items = within(tabs).getAllByRole('tab');
    expect(items.map((tab) => tab.textContent)).toEqual(['新建', '加入', '移除', '相交']);
    for (const tab of items) {
      expect((tab as HTMLButtonElement).disabled).toBe(true);
      expect(tab.getAttribute('aria-disabled')).toBe('true');
      // 不伪造活动页签：无 aria-selected、无 active 类。
      expect(tab.hasAttribute('aria-selected')).toBe(false);
      expect(tab.className).not.toContain('part-studio-feature-dialog__tab--active');
    }
  });

  it('W10c：距离行=mm 单位 + 禁用计算器；实例数行=禁用计算器（真实原因，载荷仍为 mm）', () => {
    renderDialog();
    const spacingSection = screen.getByTestId('part-studio-feature-pattern-spacing').closest('section')!;
    expect(spacingSection.textContent).toContain('mm');
    const countSection = screen.getByTestId('part-studio-feature-pattern-count').closest('section')!;
    // live：实例数无单位（只有值与图标）。
    expect(countSection.textContent).not.toContain('mm');
    for (const [testId, section] of [
      ['part-studio-feature-pattern-spacing-calculator', spacingSection],
      ['part-studio-feature-pattern-count-calculator', countSection],
    ] as const) {
      const calc = within(section).getByTestId(testId) as HTMLButtonElement;
      expect(calc.disabled).toBe(true);
      expect(calc.getAttribute('aria-label')).toBe('计算器');
      expect(calc.getAttribute('title')).toContain('计算器');
    }
  });

  it('W10c：第二个方向折叠组——有落库=勾选/箭头可用/默认展开；收起隐藏字段但不改载荷', async () => {
    const { applyOp, user } = renderDialog({}, stored({
      secondDirection: { count: 2, spacing: 8, axis: secondAxis },
    }));
    const enabled = screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement;
    const expander = screen.getByTestId('part-studio-feature-pattern-second-expander') as HTMLButtonElement;
    expect(enabled.checked).toBe(true);
    expect(enabled.disabled).toBe(false);
    expect(expander.disabled).toBe(false);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('part-studio-feature-pattern-second-body')).toBeTruthy();

    await user.click(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('part-studio-feature-pattern-second-body')).toBeNull();
    expect(screen.queryByRole('textbox', { name: '第二方向实例数量（含原件）' })).toBeNull();
    // 折叠只改可见性：仍按勾选状态提交第二方向（不静默丢键）。
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      params: { secondDirection: { count: 2, spacing: 8, axis: secondAxis } },
    });

    await user.click(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('part-studio-feature-pattern-second-body')).toBeTruthy();
  });

  it('W10c：无落库第二方向 → 勾选与箭头诚实禁用（原因）+ 内容不渲染', () => {
    renderDialog();
    const enabled = screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement;
    const expander = screen.getByTestId('part-studio-feature-pattern-second-expander') as HTMLButtonElement;
    expect(enabled.checked).toBe(false);
    expect(enabled.disabled).toBe(true);
    expect(enabled.closest('label')?.getAttribute('title')).toContain('第二方向轴');
    expect(expander.disabled).toBe(true);
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    expect(expander.getAttribute('title')).toContain('第二方向轴');
    expect(screen.queryByTestId('part-studio-feature-pattern-second-body')).toBeNull();
  });

  it('W10c：取消勾选 → 箭头随驱动复选框禁用；重新勾选自动展开（live 语义）', async () => {
    const { user } = renderDialog({}, stored({
      secondDirection: { count: 2, spacing: 8, axis: secondAxis },
    }));
    const enabled = screen.getByRole('checkbox', { name: '第二个方向' });
    const expander = screen.getByTestId('part-studio-feature-pattern-second-expander') as HTMLButtonElement;
    await user.click(enabled);
    expect(expander.disabled).toBe(true);
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    expect(expander.getAttribute('title')).toContain('勾选');
    await user.click(enabled);
    expect(expander.disabled).toBe(false);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('part-studio-feature-pattern-second-body')).toBeTruthy();
  });
});
