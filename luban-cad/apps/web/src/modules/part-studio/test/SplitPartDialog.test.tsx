// src/modules/part-studio/test/SplitPartDialog.test.tsx
//
// ADR-0012 UI 面：SplitPartDialog 行为验收（live 证据
// ui-evidence/feature-dialogs-20261108/onshape/split.{json,png}）——
//  1) 新建单侧世界平面：plane/offset/keepSide + targetBodyId；
//  2) edit 回显 → updateParams；目标只读；
//  3) 多实体必须选目标；无实体禁提交；
//  4) 面/双侧等未支持项只给静态诚实提示；
//  5) 偏移非有限数禁提交。
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

import { SplitPartDialog } from '../dialogs/SplitPartDialog.js';

const BODIES: BodyInfo[] = [
  { bodyKey: 'body-1', name: 'Body 1', active: true, authored: true },
  { bodyKey: 'body-2', name: 'Body 2', active: true, authored: true },
];

function renderDialog(
  props: Partial<React.ComponentProps<typeof SplitPartDialog>> = {},
  params?: Record<string, unknown>,
) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  const previewOp = vi.fn(async (_op: FeatureOp): Promise<import('@luban-cad/shared').PreviewResult> =>
    ({ ok: true, affected: [] }));
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(
    <SplitPartDialog
      featureName="分割 1"
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

describe('SplitPartDialog', () => {
  it('新建 YZ x=20 保留正侧：insertFeature + 目标实体，预览同载荷', async () => {
    const { applyOp, previewOp, onConfirm, user } = renderDialog();
    expect(screen.getByTestId('part-studio-split-part-target').textContent).toContain('Body 1');
    await user.selectOptions(screen.getByRole('combobox', { name: '分割平面' }), 'YZ');
    await user.clear(screen.getByRole('textbox', { name: '平面偏移（mm）' }));
    await user.type(screen.getByRole('textbox', { name: '平面偏移（mm）' }), '20');
    await user.selectOptions(screen.getByRole('combobox', { name: '保留侧' }), 'positive');
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());
    const expected = {
      kind: 'insertFeature',
      featureType: 'splitPart',
      params: { plane: 'YZ', offsetMm: 20, keepSide: 'positive' },
      targetBodyId: 'body-1',
    };
    expect(applyOp).toHaveBeenCalledWith(expected);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(previewOp).toHaveBeenCalledWith(expected), { timeout: 3000 });
  });

  it('edit 回显 plane/offset/keepSide（目标只读）→ updateParams', async () => {
    const params = { plane: 'YZ', offsetMm: 20, keepSide: 'negative' };
    const { applyOp, user } = renderDialog({ featureId: 'f-split', initialParams: params }, params);
    expect(screen.getByTestId('part-studio-split-part-target-fixed')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: '分割平面' }) as HTMLSelectElement).value).toBe('YZ');
    expect((screen.getByRole('textbox', { name: '平面偏移（mm）' }) as HTMLInputElement).value).toBe('20');
    expect((screen.getByRole('combobox', { name: '保留侧' }) as HTMLSelectElement).value).toBe('negative');
    await user.clear(screen.getByRole('textbox', { name: '平面偏移（mm）' }));
    await user.type(screen.getByRole('textbox', { name: '平面偏移（mm）' }), '25');
    await user.selectOptions(screen.getByRole('combobox', { name: '保留侧' }), 'positive');
    await user.click(confirm());
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-split',
      params: { plane: 'YZ', offsetMm: 25, keepSide: 'positive' },
    });
  });

  it('多实体必须选目标；无实体禁提交', async () => {
    const { user, applyOp } = renderDialog({ bodies: BODIES });
    const target = screen.getByRole('combobox', { name: '要分割的零件、曲面或曲线' }) as HTMLSelectElement;
    expect(target.value).toBe('');
    expect(screen.getByTestId('part-studio-split-part-target-missing')).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    await user.selectOptions(target, 'body-2');
    await user.click(confirm());
    expect(applyOp).toHaveBeenCalledWith(expect.objectContaining({ targetBodyId: 'body-2' }));

    const noBodies = renderDialog({ bodies: [] });
    expect(screen.getAllByTestId('part-studio-split-part-needs-body').length).toBeGreaterThan(0);
    expect((screen.getAllByRole('button', { name: '确认' }).at(-1) as HTMLButtonElement).disabled).toBe(true);
    expect(noBodies.applyOp).not.toHaveBeenCalled();
  });

  it('未支持项静态提示 + 非有限偏移禁提交', async () => {
    const { user } = renderDialog();
    expect(screen.getByTestId('part-studio-split-part-type-hint').textContent).toContain('面分割');
    expect(screen.getByTestId('part-studio-split-part-both-unsupported').textContent).toContain('多体');
    const offset = screen.getByRole('textbox', { name: '平面偏移（mm）' });
    await user.clear(offset);
    expect(confirm().disabled).toBe(true);
    await user.type(offset, '10');
    expect(confirm().disabled).toBe(false);
  });
});
