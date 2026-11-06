// src/modules/part-studio/test/ShellDialog.test.tsx
//
// T3：参数化抽壳对话框（ShellDialog）行为验收——
//  1) 面来自 store.canvas.selection（唯一选择权威）；无面禁提交；
//  2) 向内=负距离，选中面 distances=0（穿孔移除），其余面 defaultDistance；
//  3) 跨 body 选择显式拒收；
//  4) edit 模式回显壁厚并走 updateParams，保留 faces；
//  5) 方向向外=正距离。
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
  it('无面选择：确认禁用 + 空态提示', () => {
    renderDialog();
    expect(screen.getByTestId('part-studio-shell-faces')).toBeTruthy();
    expect((screen.getByTestId('part-studio-shell-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('向内抽壳：insertFeature 载荷为负壁厚 + 选中面 distances=0 + owner target', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog();
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

  it('向外：defaultDistance 为正', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog();
    fireEvent.change(screen.getByTestId('part-studio-shell-direction'), { target: { value: 'outward' } });
    fireEvent.click(screen.getByTestId('part-studio-shell-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect((applyOp.mock.calls[0]![0] as { params: { defaultDistance: number } }).params.defaultDistance).toBe(2);
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
