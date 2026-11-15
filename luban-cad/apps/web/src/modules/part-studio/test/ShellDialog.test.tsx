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
