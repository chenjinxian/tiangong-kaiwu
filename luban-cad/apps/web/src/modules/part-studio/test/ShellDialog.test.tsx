// src/modules/part-studio/test/ShellDialog.test.tsx
//
// T3：参数化抽壳对话框（ShellDialog）行为验收——
//  1) 面来自 store.canvas.selection（唯一选择权威）；无面禁提交；空/选中两态字段；
//  2) 向内=负距离，选中面 distances=0（穿孔移除），其余面 defaultDistance；
//  3) 跨 body 选择显式拒收；
//  4) edit 模式回显厚度并走 updateParams，保留 faces；
//  5) 方向箭头（替换旧「方向」下拉）向外=正距离；aria-pressed 同步；
//  6) 面 chip 的 × 本地过滤提交 faces（不改共享契约）；
//  7) live 对齐：挖空复选框禁用未勾选、抽壳厚度 mm + 禁用计算器。
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  selection: [] as Array<{
    kind: string;
    id: string;
    label?: string;
    ownerBodyKey?: string;
    topologyId?: { nodeId: number; entityId: number };
  }>,
  outputMessage: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    constructor(public priority: unknown, public message: string) {}
  },
  OutputMessagePriority: { Success: 1 },
}));

vi.mock('../hooks/useCanvasSelection.js', () => ({
  useCanvasSelection: () => ({ selection: mocks.selection }),
}));

vi.mock('../canvas/FeaturePreviewOverlay.js', () => ({
  FeaturePreviewOverlay: () => null,
}));

import { ShellDialog } from '../dialogs/ShellDialog.js';

const bodies = [
  { bodyKey: 'body-1', name: 'Body 1', active: true, authored: true },
  { bodyKey: 'body-2', name: 'Body 2', active: true, authored: true },
];

function face(ownerBodyKey: string, nodeId: number, entityId: number): (typeof mocks.selection)[number] {
  return {
    kind: 'face',
    id: `${ownerBodyKey}:${nodeId}:${entityId}`,
    label: `Face ${entityId}`,
    ownerBodyKey,
    topologyId: { nodeId, entityId },
  };
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof ShellDialog>> = {}) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  render(
    <ShellDialog
      featureName="抽壳"
      applyOp={applyOp}
      bodies={bodies}
      {...overrides}
    />,
  );
  return { applyOp };
}

beforeEach(() => {
  mocks.selection = [];
  mocks.outputMessage.mockReset();
});

describe('ShellDialog', () => {
  it('无面选择：确认禁用 + 空态字段 + 挖空禁用未勾选 + 默认 2 mm', () => {
    renderDialog();
    expect(screen.getByTestId('part-studio-shell-faces')).toBeTruthy();
    const field = screen.getByTestId('part-studio-shell-faces-field');
    expect(field.className).toContain('is-empty');
    expect(field.className).not.toContain('is-selected');
    expect(field.textContent).toContain('要移除的面');
    expect(screen.getByText(/先在画布中选择要移除的面/)).toBeTruthy();
    expect((screen.getByTestId('part-studio-shell-confirm') as HTMLButtonElement).disabled).toBe(true);

    const hollow = screen.getByTestId('part-studio-shell-hollow') as HTMLInputElement;
    expect(hollow.disabled).toBe(true);
    expect(hollow.checked).toBe(false);
    expect(hollow.title).toBe('该能力尚未实现');

    const thickness = screen.getByTestId('part-studio-shell-thickness') as HTMLInputElement;
    expect(thickness.value).toBe('2');
    expect(screen.getByText('抽壳厚度')).toBeTruthy();
    expect(screen.getByText('mm')).toBeTruthy();
    const calculator = screen.getByRole('button', { name: '计算器' }) as HTMLButtonElement;
    expect(calculator.disabled).toBe(true);
    expect(calculator.title).toBe('该能力尚未实现');
  });

  it('向内抽壳：选中面字段 is-selected + 负壁厚 + 选中面 distances=0 + owner target', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog();
    const field = screen.getByTestId('part-studio-shell-faces-field');
    expect(field.className).toContain('is-selected');
    expect(field.className).not.toContain('is-empty');
    expect(field.textContent).toContain('Face 11');
    // 目标实体可见行已删；owner 名经字段 title 可查。
    expect(field.getAttribute('title')).toContain('Body 1');
    fireEvent.change(screen.getByTestId('part-studio-shell-thickness'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'shell',
      targetBodyId: 'body-1',
      params: {
        defaultDistance: -2,
        faces: [{ nodeId: 7, entityId: 11 }],
        distances: 0,
      },
    });
  });

  it('跨 body 选择：显式 alert + 禁提交', () => {
    mocks.selection = [face('body-1', 7, 11), face('body-2', 8, 12)];
    renderDialog();
    expect(screen.getByTestId('part-studio-shell-cross-body')).toBeTruthy();
    expect((screen.getByTestId('part-studio-shell-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('方向箭头：向内为正反切换（向外 defaultDistance 为正，aria-pressed 同步）', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog();
    const direction = screen.getByTestId('part-studio-shell-direction');
    expect(direction.getAttribute('aria-label')).toBe('向内');
    expect(direction.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(direction);
    expect(direction.getAttribute('aria-label')).toBe('向外');
    expect(direction.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect((applyOp.mock.calls[0]![0] as { params: { defaultDistance: number } }).params.defaultDistance).toBe(2);
  });

  it('面 chip 的 × 本地移除该面：提交 faces 排除被移除面；清空后回到空态禁提交', async () => {
    mocks.selection = [face('body-1', 7, 11), face('body-1', 8, 12)];
    const { applyOp } = renderDialog();
    const removes = screen.getAllByTestId('part-studio-shell-face-remove');
    expect(removes).toHaveLength(2);
    fireEvent.click(removes[0]!);
    expect(screen.getAllByTestId('part-studio-shell-face-remove')).toHaveLength(1);
    expect(screen.queryByText('Face 11')).toBeNull();
    expect(screen.getByText('Face 12')).toBeTruthy();
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect((applyOp.mock.calls[0]![0] as { params: { faces: unknown } }).params.faces).toEqual([
      { nodeId: 8, entityId: 12 },
    ]);

    fireEvent.click(screen.getAllByTestId('part-studio-shell-face-remove')[0]!);
    expect(screen.getByTestId('part-studio-shell-faces-field').className).toContain('is-empty');
    expect((screen.getByTestId('part-studio-shell-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── ADR-0020 S4c：抽壳厚度表达式（有符号距离；方向派生只读）──────────
  const T_VARIABLE = { id: 'vt', name: 't', expression: '2', type: 'length' as const };

  async function shellWithExpression(expression: string): Promise<{
    applyOp: ReturnType<typeof vi.fn>;
    input: HTMLInputElement;
  }> {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog({ variables: [T_VARIABLE] });
    const input = screen.getByTestId('part-studio-shell-thickness') as HTMLInputElement;
    fireEvent.change(input, { target: { value: expression } });
    fireEvent.blur(input);
    await waitFor(() => expect(input.value).not.toBe(expression));
    return { applyOp, input };
  }

  it('S4c 负值表达式 0 - #t：方向派生向内且只读（disabled）+ 载荷 defaultDistance=-2 + 原文', async () => {
    const { applyOp } = await shellWithExpression('0 - #t');
    expect((screen.getByTestId('part-studio-shell-thickness') as HTMLInputElement).value).toBe('-2');
    const direction = screen.getByTestId('part-studio-shell-direction');
    await waitFor(() => expect(direction.getAttribute('data-direction')).toBe('inward'));
    expect(direction.getAttribute('aria-label')).toBe('向内');
    expect((direction as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'shell',
      targetBodyId: 'body-1',
      params: {
        defaultDistance: -2,
        defaultDistanceExpression: '0 - #t',
        faces: [{ nodeId: 7, entityId: 11 }],
        distances: 0,
      },
    });
  });

  it('S4c 正值表达式 #t：方向派生向外；× 清除后方向恢复可交互（数值态）', async () => {
    const { applyOp } = await shellWithExpression('#t');
    const direction = screen.getByTestId('part-studio-shell-direction');
    await waitFor(() => expect(direction.getAttribute('data-direction')).toBe('outward'));
    expect(direction.getAttribute('aria-label')).toBe('向外');
    expect((direction as HTMLButtonElement).disabled).toBe(true);

    const clear = screen.getByTestId('part-studio-shell-expression-clear');
    fireEvent.click(clear);
    await waitFor(() => expect(screen.queryByTestId('part-studio-shell-expression-clear')).toBeNull());
    expect((direction as HTMLButtonElement).disabled).toBe(false);
    // 清除后：数值 = |求值| = 2、方向保留求值符号（外扩）；再切向内提交负值。
    expect((screen.getByTestId('part-studio-shell-thickness') as HTMLInputElement).value).toBe('2');
    fireEvent.click(direction);
    expect(direction.getAttribute('data-direction')).toBe('inward');
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = (applyOp.mock.calls[0]![0] as { params: Record<string, unknown> }).params;
    expect(params.defaultDistance).toBe(-2);
    expect('defaultDistanceExpression' in params).toBe(false);
  });

  it('P3 无效表达式：方向不伪造成 through/穿孔（保留最近有效方向或中性，清除 title）', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    renderDialog({ variables: [T_VARIABLE] });
    const input = screen.getByTestId('part-studio-shell-thickness') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#nope' } });
    const direction = screen.getByTestId('part-studio-shell-direction');
    await waitFor(() => expect(direction.getAttribute('data-expression-invalid')).toBe('true'));
    // 允许显示最近一次有效方向（缺省数值 2 → outward），但绝不能是 through/穿孔。
    expect(direction.getAttribute('data-direction')).not.toBe('through');
    expect(direction.getAttribute('aria-label')).not.toBe('穿孔');
    expect(direction.getAttribute('aria-label')).not.toBe('向外');
    expect(direction.getAttribute('aria-label')).not.toBe('向内');
    expect(direction.getAttribute('aria-label')).toBe('方向');
    const error = await screen.findByTestId('expression-field-error');
    expect(error.textContent).toContain('未知变量');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(direction.getAttribute('title')).toBe('清除表达式');
  });

  it('S4c 无效表达式 → 确认禁用 + aria-invalid（零 op）', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog({ variables: [T_VARIABLE] });
    const input = screen.getByTestId('part-studio-shell-thickness') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#nope' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByTestId('part-studio-shell-confirm') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('edit：回显落库壁厚/面并走 updateParams', async () => {
    const { applyOp } = renderDialog({
      featureId: 'feat-shell',
      initialParams: {
        defaultDistance: -1.5,
        faces: [{ nodeId: 3, entityId: 4 }],
        distances: 0,
      },
    });
    expect((screen.getByTestId('part-studio-shell-thickness') as HTMLInputElement).value).toBe('1.5');
    fireEvent.change(screen.getByTestId('part-studio-shell-thickness'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'feat-shell',
      params: {
        defaultDistance: -2.5,
        faces: [{ nodeId: 3, entityId: 4 }],
        distances: 0,
      },
    });
  });
});
