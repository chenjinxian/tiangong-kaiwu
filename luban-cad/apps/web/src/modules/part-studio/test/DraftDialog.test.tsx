// src/modules/part-studio/test/DraftDialog.test.tsx
//
// ADR-0021 AX-01 UI 面：DraftDialog 行为验收——
//  1) 面来自唯一选择权威；无面/中性面未选/跨 body 禁提交；
//  2) 目标面=所选面减去中性面；insert 载荷 {bodyId,faces,neutralFace,pullDirection,
//     angleDeg} + 顶层面 targetBodyId（与 moveFace/shell 同标准目标语义）；
//  3) 角度 0<|a|<89 前端门；addStep=true 省略键、false 显式落库；
//  4) edit 回显（stored 面 + 中性面/方向/角度/addStep）→ updateParams 保形；
//  5) 预览同 insert 载荷并带 targetBodyId（HITL 预览→确认）。
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult, PreviewResult } from '@luban-cad/shared';

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

import { DraftDialog } from '../dialogs/DraftDialog.js';

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

function renderDialog(overrides: Partial<React.ComponentProps<typeof DraftDialog>> = {}) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({
    ok: true,
    affected: [],
    preview: {
      entries: [],
      categoryId: '0x1',
      placement: { origin: { x: 0, y: 0, z: 0 }, angles: { yaw: 0, pitch: 0, roll: 0 } },
      modelId: '0x2',
      elementId: '0x3',
    },
  }));
  render(
    <DraftDialog
      featureName="拔模 1"
      applyOp={applyOp}
      previewOp={previewOp}
      bodies={bodies}
      {...overrides}
    />,
  );
  return { applyOp, previewOp };
}

beforeEach(() => {
  mocks.selection = [];
  mocks.outputMessage.mockReset();
});

describe('DraftDialog', () => {
  it('无面选择：空态 + 确认禁用（中性面未定）', () => {
    renderDialog();
    expect(screen.getByTestId('part-studio-draft-faces')).toBeTruthy();
    expect((screen.getByTestId('part-studio-draft-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('part-studio-draft-neutral') as HTMLSelectElement).options).toHaveLength(1);
  });

  it('选两面：中性面下拉取自所选面；目标面=其余面，insert 带 targetBodyId', async () => {
    mocks.selection = [face('body-1', 7, 11), face('body-1', 7, 12)];
    const { applyOp } = renderDialog();
    const neutral = screen.getByTestId('part-studio-draft-neutral') as HTMLSelectElement;
    expect(neutral.options).toHaveLength(3); // 占位 + 两面
    fireEvent.change(neutral, { target: { value: 'body-1:7:12' } });
    fireEvent.change(screen.getByTestId('part-studio-draft-angle'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('part-studio-draft-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'draft',
      params: {
        bodyId: 'body-1',
        faces: [{ nodeId: 7, entityId: 11 }],
        neutralFace: { nodeId: 7, entityId: 12 },
        pullDirection: 'Z',
        angleDeg: 20,
      },
      targetBodyId: 'body-1',
    });
  });

  it('addStep 关闭 → 显式 false；预览载荷同 insert + targetBodyId', async () => {
    mocks.selection = [face('body-1', 7, 11), face('body-1', 7, 12)];
    const { applyOp, previewOp } = renderDialog();
    fireEvent.change(screen.getByTestId('part-studio-draft-neutral'), { target: { value: 'body-1:7:12' } });
    fireEvent.click(screen.getByTestId('part-studio-draft-add-step'));
    fireEvent.click(screen.getByTestId('part-studio-draft-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect((applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>).params).toMatchObject({
      addStep: false,
    });
    await waitFor(() => expect(previewOp).toHaveBeenCalled());
    const previewOpArg = previewOp.mock.calls.at(-1)![0] as Extract<FeatureOp, { kind: 'insertFeature' }>;
    expect(previewOpArg.kind).toBe('insertFeature');
    expect(previewOpArg.featureType).toBe('draft');
    expect(previewOpArg.targetBodyId).toBe('body-1');
  });

  it('跨 body 选择 → 明确拒收 + 禁提交', () => {
    mocks.selection = [face('body-1', 7, 11), face('body-2', 8, 12)];
    renderDialog();
    expect(screen.getByTestId('part-studio-draft-cross-body')).toBeTruthy();
    expect((screen.getByTestId('part-studio-draft-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('角度非法（0/±89/空/非数）→ 禁提交', () => {
    mocks.selection = [face('body-1', 7, 11), face('body-1', 7, 12)];
    renderDialog();
    fireEvent.change(screen.getByTestId('part-studio-draft-neutral'), { target: { value: 'body-1:7:12' } });
    const confirm = screen.getByTestId('part-studio-draft-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    for (const value of ['0', '89', '-89', '', 'abc']) {
      fireEvent.change(screen.getByTestId('part-studio-draft-angle'), { target: { value } });
      expect(confirm.disabled).toBe(true);
    }
  });

  it('edit 回显 stored 面/中性面/方向/角度/addStep → updateParams 保形', async () => {
    const { applyOp } = renderDialog({
      featureId: 'draft-1',
      initialParams: {
        bodyId: 'body-1',
        faces: [{ nodeId: 7, entityId: 11 }],
        neutralFace: { nodeId: 7, entityId: 12 },
        pullDirection: 'Y',
        angleDeg: 10,
        addStep: false,
      },
    });
    expect((screen.getByTestId('part-studio-draft-direction') as HTMLSelectElement).value).toBe('Y');
    expect((screen.getByTestId('part-studio-draft-angle') as HTMLInputElement).value).toBe('10');
    expect((screen.getByTestId('part-studio-draft-add-step') as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByTestId('part-studio-draft-angle'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('part-studio-draft-confirm'));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'draft-1',
      params: {
        bodyId: 'body-1',
        faces: [{ nodeId: 7, entityId: 11 }],
        neutralFace: { nodeId: 7, entityId: 12 },
        pullDirection: 'Y',
        angleDeg: 25,
        addStep: false,
      },
    });
  });
});
