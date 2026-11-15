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
  it('无面选择：确认禁用 + 空态字段 + 移动类型/终止类型禁用 + 重新应用圆角禁用', () => {
    renderDialog();
    expect(screen.getByTestId('part-studio-move-face-faces')).toBeTruthy();
    const facesField = screen.getByTestId('part-studio-move-face-faces-field');
    expect(facesField.className).toContain('is-empty');
    expect(facesField.querySelector('.part-studio-feature-dialog__query-label')?.textContent).toBe('要移动的面');
    expect((screen.getByTestId('part-studio-move-face-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-move-face-refillet-hint').textContent).toContain('未支持');
    const refillet = screen.getByRole('checkbox', { name: '重新应用圆角' }) as HTMLInputElement;
    expect(refillet.disabled).toBe(true);
    expect(refillet.checked).toBe(false);
    // live：偏移/终止类型为单一禁用下拉（无重复静态值行），理由在 title。
    const moveType = screen.getByRole('combobox', { name: '偏移' }) as HTMLSelectElement;
    expect(moveType.disabled).toBe(true);
    expect(moveType.value).toBe('offset');
    expect(moveType.title).toBe('该能力尚未实现');
    const termination = screen.getByRole('combobox', { name: '终止类型' }) as HTMLSelectElement;
    expect(termination.disabled).toBe(true);
    expect(termination.value).toBe('blind');
    expect(termination.title).toBe('该能力尚未实现');
    // 目标实体可见行已删除；逐面只读提示与圆角行保留。
    expect(screen.queryByText('目标实体')).toBeNull();
  });

  it('向外偏移：insertFeature 载荷为正距离 + faces + owner target', async () => {
    mocks.selection = [face('body-1', 7, 11)];
    const { applyOp } = renderDialog();
    const facesField = screen.getByTestId('part-studio-move-face-faces-field');
    expect(facesField.className).toContain('is-selected');
    expect(facesField.getAttribute('title')).toContain('目标实体: Body 1');
    const direction = screen.getByTestId('part-studio-move-face-direction') as HTMLButtonElement;
    expect(direction.getAttribute('aria-pressed')).toBe('true');
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

  it('向内偏移 + 同 body 多面：方向箭头切换符号，faces 全保留', async () => {
    mocks.selection = [face('body-1', 7, 11), face('body-1', 7, 12)];
    const { applyOp } = renderDialog();
    fireEvent.change(screen.getByTestId('part-studio-move-face-distance'), { target: { value: '2.5' } });
    const direction = screen.getByTestId('part-studio-move-face-direction') as HTMLButtonElement;
    fireEvent.click(direction);
    expect(direction.getAttribute('aria-pressed')).toBe('false');
    expect(direction.getAttribute('aria-label')).toBe('向内');
    fireEvent.click(direction);
    expect(direction.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(direction);
    fireEvent.click(screen.getByTestId('part-studio-move-face-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect((applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>).params).toMatchObject({
      faces: [{ nodeId: 7, entityId: 11 }, { nodeId: 7, entityId: 12 }],
      distanceMm: -2.5,
    });
  });

  it('面 chip ×：仅本地过滤提交 faces（不改载荷语义）', async () => {
    mocks.selection = [face('body-1', 7, 11), face('body-1', 7, 12)];
    const { applyOp } = renderDialog();
    const removes = screen.getAllByTestId('part-studio-move-face-face-remove');
    expect(removes).toHaveLength(2);
    fireEvent.click(removes[0]!);
    expect(screen.getAllByTestId('part-studio-move-face-face-remove')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('part-studio-move-face-distance'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('part-studio-move-face-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect((applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>).params).toMatchObject({
      faces: [{ nodeId: 7, entityId: 12 }],
      distanceMm: 1,
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
