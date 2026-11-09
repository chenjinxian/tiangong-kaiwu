// src/modules/part-studio/test/MoveFaceDialog.test.tsx
//
// ADR-0014 UI 面：MoveFaceDialog 行为验收（live 证据
// ui-evidence/feature-dialogs-20261108/onshape/move-face.{json,png}）——
//  1) 面来自 store.canvas.selection；无面禁提交；
//  2) 向外=正距离、向内=负距离，载荷 {faces,distanceMm,targetBodyId}；
//  3) 跨 body 显式拒收；
//  4) edit 回显 distanceMm/faces → updateParams；
//  5) 逐面距离（distancesMm）只读提示 + 禁提交；
//  6) 「重新应用圆角」禁用并提示。
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

import { MoveFaceDialog } from '../dialogs/MoveFaceDialog.js';

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

function renderDialog(overrides: Partial<React.ComponentProps<typeof MoveFaceDialog>> = {}) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  render(
    <MoveFaceDialog
      featureName="移动面"
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

describe('MoveFaceDialog', () => {
  it('无面选择：确认禁用 + 空态提示 + 重新应用圆角禁用', () => {
    renderDialog();
    expect(screen.getByTestId('part-studio-move-face-faces')).toBeTruthy();
    expect((screen.getByTestId('part-studio-move-face-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-move-face-refillet-hint').textContent).toContain('未支持');
    const refillet = screen.getByRole('checkbox', { name: '重新应用圆角' }) as HTMLInputElement;
    expect(refillet.disabled).toBe(true);
  });

  it('向外偏移：insertFeature 载荷为正距离 + faces + owner target', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog();
    fireEvent.change(screen.getByTestId('part-studio-move-face-distance'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('part-studio-move-face-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'moveFace',
      params: { faces: [{ nodeId: 7, entityId: 11 }], distanceMm: 5 },
      targetBodyId: 'body-1',
    });
  });

  it('向内偏移 + 同 body 多面：距离取负，faces 全保留', async () => {
    mocks.selection = [face('body-1', 7, 11), face('body-1', 7, 12)];
    const { applyOp } = renderDialog();
    fireEvent.change(screen.getByTestId('part-studio-move-face-distance'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByTestId('part-studio-move-face-direction'), { target: { value: 'inward' } });
    fireEvent.click(screen.getByTestId('part-studio-move-face-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect((applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>).params).toMatchObject({
      faces: [{ nodeId: 7, entityId: 11 }, { nodeId: 7, entityId: 12 }],
      distanceMm: -2.5,
    });
  });

  it('距离非法（0/空/非数）→ 禁提交', () => {
    mocks.selection = [face('body-1', 7, 11)];
    renderDialog();
    const confirm = screen.getByTestId('part-studio-move-face-confirm') as HTMLButtonElement;
    for (const value of ['0', '', 'abc', '-1']) {
      fireEvent.change(screen.getByTestId('part-studio-move-face-distance'), { target: { value } });
      expect(confirm.disabled).toBe(true);
    }
  });

  it('跨 body 选择 → 明确拒收 + 禁提交', () => {
    mocks.selection = [face('body-1', 7, 11), face('body-2', 8, 12)];
    renderDialog();
    expect(screen.getByTestId('part-studio-move-face-cross-body')).toBeTruthy();
    expect((screen.getByTestId('part-studio-move-face-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('edit 回显：distanceMm/faces → updateParams（保留原参数）', async () => {
    const { applyOp } = renderDialog({
      featureId: 'move-face-1',
      initialParams: {
        faces: [{ nodeId: 7, entityId: 11 }],
        distanceMm: 5,
        unrelated: 'keep-me',
      },
    });
    expect((screen.getByTestId('part-studio-move-face-distance') as HTMLInputElement).value).toBe('5');
    fireEvent.change(screen.getByTestId('part-studio-move-face-distance'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('part-studio-move-face-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'move-face-1',
      params: {
        faces: [{ nodeId: 7, entityId: 11 }],
        distanceMm: 3,
        unrelated: 'keep-me',
      },
    });
  });

  it('edit 逐面距离（distancesMm）→ 只读提示 + 禁提交', () => {
    renderDialog({
      featureId: 'move-face-2',
      initialParams: {
        faces: [{ nodeId: 7, entityId: 11 }, { nodeId: 7, entityId: 12 }],
        distancesMm: [5, 2],
      },
    });
    expect(screen.getByTestId('part-studio-move-face-per-face-readonly')).toBeTruthy();
    expect((screen.getByTestId('part-studio-move-face-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('part-studio-move-face-distance') as HTMLInputElement).disabled).toBe(true);
  });
});
