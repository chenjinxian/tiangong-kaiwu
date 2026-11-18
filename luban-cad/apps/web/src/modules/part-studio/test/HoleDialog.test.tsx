// src/modules/part-studio/test/HoleDialog.test.tsx
//
// ADR-0006 切片 A（2026-11-05）：HoleDialog 行为验收——
//  1) 草图点从 getSketch 读取；Onshape 语义不预选孔位，✓ 直到选点才可用；
//  2) blind 提交 insertFeature/hole，载荷含 sketchId/pointIds/diameterMm/depthMm；
//  3) throughAll 省略 depthMm；
//  4) edit 模式回显落库参数并走 updateParams；
//  5) 沉头孔/倒角孔页签禁用（后端未实现，禁止假成功）；
//  6) 审计 C3（2026-11-16）：沉头/倒角数值行带禁用计算器（载荷/校验不变）；
//  7) 审计 C4（2026-11-16）：孔类型/钻孔尺寸行 = 11px 灰标签 + 14px 无边框值；
//  8) ADR-0020 S8（shared 1.78）：沉头/锥口字段表达式——物化快照 + 原文载荷、
//     未触碰保留、数值/样式切换清除、无效禁提（S5 本地化）、mm/in 投影与 deg
//     内联创建、非适用样式不夹带表达式键、预览用求值数。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  getSketch: vi.fn(),
  outputMessage: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    constructor(public priority: unknown, public message: string) {}
  },
  OutputMessagePriority: { Success: 1 },
}));

// ADR-0020 S4c：表达式求值走真实 shared 求值器（仅 RPC 面替身），
// 与生产同源，避免手写假求值器漂移。
vi.mock('@luban-cad/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@luban-cad/shared')>()),
  LubanFeatureRpcInterface: {
    getClient: () => ({ getSketch: mocks.getSketch }),
  },
}));

vi.mock('@common/workspace/use-workspace-ref.js', () => ({
  useWorkspaceRef: () => ({ iTwinId: 'twin-1', iModelId: 'im-1', modelId: 'ps-1' }),
}));

import { HoleDialog } from '../dialogs/HoleDialog.js';

// FIX-1（2026-11-16 W8b review）：jsdom 不计算样式，按仓内既有先例做 CSS
// 文本断言（FeatureDialog.test.tsx / CPlaneDialog.test.tsx 的 cssRuleBlock）。
const dialogCss = readFileSync(resolve(__dirname, '../dialogs/FeatureDialog.css'), 'utf8');

function cssRuleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const match = dialogCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

const sketches = [{ id: 'sketch-1', label: '草图 1' }];

function pointEntities(): { entities: unknown[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 10 },
      { kind: 'line', id: 3, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    ],
  };
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof HoleDialog>> = {}) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  render(
    <HoleDialog
      featureName="孔"
      applyOp={applyOp}
      connectionKey="conn-1"
      sketches={sketches}
      {...overrides}
    />,
  );
  return { applyOp };
}

/** Onshape 实体字段默认折叠：点开后才呈现草图点列表。 */
function openLocations(): void {
  fireEvent.click(screen.getByTestId('hole-locations-toggle'));
}

describe('HoleDialog（ADR-0006 切片 A/A2）', () => {
  beforeEach(() => {
    mocks.getSketch.mockReset();
    mocks.outputMessage.mockReset();
    mocks.getSketch.mockResolvedValue(pointEntities());
  });

  it('读取草图 point 且不预选；选点前 ✓ 禁用', async () => {
    renderDialog();
    openLocations();
    const point1 = await screen.findByLabelText('点 1');
    expect(screen.getByLabelText('点 2')).toBeTruthy();
    // 曲线顶点以「线 3 起点/终点」呈现，不混入 point 编号。
    expect(screen.getByLabelText('线 3 起点')).toBeTruthy();
    expect(screen.getByLabelText('线 3 终点')).toBeTruthy();
    expect(screen.queryByLabelText('点 3')).toBeNull();
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(point1);
    expect(confirm.disabled).toBe(false);
    expect(mocks.getSketch).toHaveBeenCalledWith('conn-1', 'sketch-1', 'ps-1');
  });

  it('标题摘要：简单孔 Ø 直径 ↧ 深度（当前单位 4 位小数截断）', () => {
    renderDialog();
    expect(screen.getByTestId('part-studio-hole-summary').textContent).toBe('Ø 5 mm ↧ 10 mm');
    fireEvent.change(screen.getByTestId('hole-diameter'), { target: { value: '6.25' } });
    fireEvent.change(screen.getByTestId('hole-depth'), { target: { value: '12' } });
    expect(screen.getByTestId('part-studio-hole-summary').textContent).toBe('Ø 6.25 mm ↧ 12 mm');
    // live 字面量「Inch」（zh-CN 旧值「英寸」已按 2026-11-15 证据更正）。
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    expect(screen.getByTestId('part-studio-hole-summary').textContent).toBe('Ø 0.2461 in ↧ 0.4724 in');
  });

  it('blind 提交 hole insertFeature 载荷（不含 inch 换算字段）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.change(screen.getByTestId('hole-diameter'), { target: { value: '8' } });
    fireEvent.change(screen.getByTestId('hole-depth'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'hole',
      params: {
        sketchId: 'sketch-1',
        pointIds: [1],
        diameterMm: 8,
        endBound: 'blind',
        depthMm: 12,
        tipAngleDeg: 118,
      },
    });
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
  });

  it('曲线顶点孔位：线终点提交 vertexRefs（v1.27）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('线 3 终点'));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'hole',
      params: {
        sketchId: 'sketch-1',
        vertexRefs: [{ entityId: 3, part: 'end' }],
        diameterMm: 5,
        endBound: 'blind',
        depthMm: 10,
        tipAngleDeg: 118,
      },
    });
  });

  it('throughAll 省略 depthMm', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 2'));
    fireEvent.change(screen.getByTestId('hole-end-bound'), { target: { value: 'throughAll' } });
    expect(screen.queryByTestId('hole-depth')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const op = applyOp.mock.calls[0]![0] as unknown as { params: Record<string, unknown> };
    expect(op.params.endBound).toBe('throughAll');
    expect('depthMm' in op.params).toBe(false);
  });

  it('v1.56 upToNext 省略 depthMm 且可提交', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 2'));
    fireEvent.change(screen.getByTestId('hole-end-bound'), { target: { value: 'upToNext' } });
    expect(screen.queryByTestId('hole-depth')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const op = applyOp.mock.calls[0]![0] as unknown as { params: Record<string, unknown> };
    expect(op.params.endBound).toBe('upToNext');
    expect('depthMm' in op.params).toBe(false);
  });

  it('edit 模式回显 pointIds/尺寸并走 updateParams', async () => {
    const { applyOp } = renderDialog({
      featureId: 'feature-9',
      initialParams: {
        sketchId: 'sketch-1', pointIds: [2], diameterMm: 6.5, endBound: 'blind', depthMm: 4,
      },
    });
    openLocations();
    await waitFor(() => expect((screen.getByLabelText('点 2') as HTMLInputElement).checked).toBe(true));
    expect((screen.getByLabelText('点 1') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('hole-diameter') as HTMLInputElement).value).toBe('6.5');
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'feature-9',
      params: {
        sketchId: 'sketch-1',
        pointIds: [2],
        diameterMm: 6.5,
        endBound: 'blind',
        depthMm: 4,
        tipAngleDeg: 180,
      },
    });
  });

  it('改参触发 previewOp（updateParams，hole 载荷）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    renderDialog({
      featureId: 'feature-9',
      previewOp,
      initialParams: {
        sketchId: 'sketch-1', pointIds: [2], diameterMm: 6.5, endBound: 'blind', depthMm: 4,
      },
    });
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'updateParams',
      featureId: 'feature-9',
      params: {
        sketchId: 'sketch-1',
        pointIds: [2],
        diameterMm: 6.5,
        endBound: 'blind',
        depthMm: 4,
        tipAngleDeg: 180,
      },
    });
  });

  it('沉头孔提交 counterbore 参数（v1.28）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByText('沉头孔').closest('button')!);
    expect(screen.getByTestId('hole-cbore-diameter')).toBeTruthy();
    // 沉头孔摘要追加 `| ⌴Ø … ↧ …`（live 证据；单位随当前单位）。
    expect(screen.getByTestId('part-studio-hole-summary').textContent)
      .toBe('Ø 5 mm ↧ 10 mm | ⌴Ø 10 mm ↧ 5 mm');
    fireEvent.change(screen.getByTestId('hole-cbore-depth'), { target: { value: '3' } });
    expect(screen.getByTestId('part-studio-hole-summary').textContent)
      .toBe('Ø 5 mm ↧ 10 mm | ⌴Ø 10 mm ↧ 3 mm');
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'hole',
      params: {
        sketchId: 'sketch-1',
        pointIds: [1],
        holeStyle: 'counterbore',
        counterboreDiameterMm: 10,
        counterboreDepthMm: 3,
        diameterMm: 5,
        endBound: 'blind',
        depthMm: 10,
        tipAngleDeg: 118,
      },
    });
  });

  it('倒角孔提交 countersink 参数（v1.32）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByText('倒角孔').closest('button')!);
    expect(screen.getByTestId('hole-csink-diameter')).toBeTruthy();
    fireEvent.change(screen.getByTestId('hole-csink-angle'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'hole',
      params: {
        sketchId: 'sketch-1',
        pointIds: [1],
        holeStyle: 'countersink',
        countersinkDiameterMm: 10,
        countersinkAngleDeg: 90,
        diameterMm: 5,
        endBound: 'blind',
        depthMm: 10,
        tipAngleDeg: 118,
      },
    });
  });

  it('反向按钮：点击 → 载荷 direction=backward（live「反向」图标控件）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const reverse = screen.getByRole('button', { name: '反向' });
    expect(reverse.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(reverse);
    expect(reverse.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'hole',
      params: { direction: 'backward' },
    });
  });

  // 审计 C3（2026-11-16）：沉头/倒角孔的直径/深度/角度数值行补齐禁用计算器
  //（与主直径/深度行同壳）；载荷/校验/标签不变。
  it('C3：沉头孔/倒角孔数值行各带禁用计算器', async () => {
    renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const expectRowCalculator = (testId: string): void => {
      const row = screen.getByTestId(testId).closest('section');
      expect(row).not.toBeNull();
      const calculator = within(row!).getByRole('button', { name: '计算器' }) as HTMLButtonElement;
      expect(calculator.disabled).toBe(true);
      expect(calculator.title).toBe('该能力尚未实现');
    };
    fireEvent.click(screen.getByText('沉头孔').closest('button')!);
    expectRowCalculator('hole-cbore-diameter');
    expectRowCalculator('hole-cbore-depth');
    fireEvent.click(screen.getByText('倒角孔').closest('button')!);
    expectRowCalculator('hole-csink-diameter');
    expectRowCalculator('hole-csink-angle');
    // FIX-1：数值行模板必须是 4 列（标签+值+单位+计算器），否则计算器折行。
    expect(cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='hole'] .part-studio-hole-dialog__value-row",
    )).toContain('grid-template-columns: 62px minmax(0, 1fr) auto auto');
  });

  // 审计 C4（2026-11-16）：live 这两行是 11px 灰标签 + 14px 无边框值（不是
  // 通用 12px 带框下拉）；控件仍禁用、可访问名与 title 理由不变。
  it('C4：孔类型/钻孔尺寸行 = 11px 灰标签 + 14px 无边框值', () => {
    renderDialog();
    for (const name of ['孔类型', '钻孔尺寸']) {
      const select = screen.getByRole('combobox', { name }) as HTMLSelectElement;
      expect(select.disabled).toBe(true);
      expect(select.title).toBe('该能力尚未实现');
    }
    const labelRule = cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='hole'] .part-studio-hole-dialog__size .part-studio-feature-dialog__distance-label",
    );
    expect(labelRule).toContain('color: #666666');
    expect(labelRule).toContain('font-size: 11px');
    const valueRule = cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='hole'] .part-studio-hole-dialog__size .part-studio-feature-dialog__select",
    );
    expect(valueRule).toContain('border: 0');
    expect(valueRule).toContain('background: transparent');
    expect(valueRule).toContain('font-size: 14px');
  });

  // ── ADR-0020 S4c：孔径/孔深表达式（契约 mm；单位只影响显示投影）────────
  it('S4c 孔径表达式：按 mm 求值/物化，载荷 diameterMm + diameterExpression', async () => {
    const { applyOp } = renderDialog({
      variables: [{ id: 'vd', name: 'd', expression: '3', type: 'length' }],
    });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const diameter = screen.getByTestId('hole-diameter') as HTMLInputElement;
    fireEvent.change(diameter, { target: { value: '#d*2' } });
    // 表达式求值经组件 onValidity 回报宿主后才放行提交（无 ✓ 闪烁期）。
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'hole',
      params: { diameterMm: 6, diameterExpression: '#d*2' },
    });
  });

  it('S4c 单位切换只是显示投影：表达式求值恒 mm，in 显示 4 位小数，快照仍 mm', async () => {
    const { applyOp } = renderDialog({
      variables: [{ id: 'vd', name: 'dia', expression: '6.35', type: 'length' }],
    });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const diameter = screen.getByTestId('hole-diameter') as HTMLInputElement;
    fireEvent.change(diameter, { target: { value: '#dia' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    // 单位切换把求值 mm（6.35）投影为 0.25 in；表达式/快照不变。
    await waitFor(() => expect(diameter.value).toBe('0.25'));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = (applyOp.mock.calls[0]![0] as unknown as { params: Record<string, unknown> }).params;
    expect(params.diameterMm).toBe(6.35);
    expect(params.diameterExpression).toBe('#dia');
  });

  it('S4c 孔深表达式：仅 blind 携带；切 throughAll 清除 depthMm/depthExpression', async () => {
    const { applyOp } = renderDialog({
      variables: [{ id: 'vp', name: 'dep', expression: '4', type: 'length' }],
    });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const depth = screen.getByTestId('hole-depth') as HTMLInputElement;
    fireEvent.change(depth, { target: { value: '#dep' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      params: { endBound: 'blind', depthMm: 4, depthExpression: '#dep' },
    });

    fireEvent.change(screen.getByTestId('hole-end-bound'), { target: { value: 'throughAll' } });
    expect(screen.queryByTestId('hole-depth')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(2));
    const through = (applyOp.mock.calls[1]![0] as unknown as { params: Record<string, unknown> }).params;
    expect(through.endBound).toBe('throughAll');
    expect('depthMm' in through).toBe(false);
    expect('depthExpression' in through).toBe(false);
  });

  it('P2.2 in 模式内联创建：纯数字草稿按契约 mm 建变量（0.25 in → 6.35 mm）', async () => {
    const onCreateVariable = vi.fn();
    renderDialog({ variables: [], onCreateVariable });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    const diameter = screen.getByTestId('hole-diameter') as HTMLInputElement;
    fireEvent.change(diameter, { target: { value: '0.25' } });
    await waitFor(() => expect(diameter.value).toBe('0.25'));
    fireEvent.change(diameter, { target: { value: '#newd' } });
    fireEvent.keyDown(diameter, { key: 'Enter' });
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'newd',
      valueText: '6.35',
      unit: 'mm',
    }));
  });

  it('P3-1 表达式活跃 + 单位切换后内联创建预填恒为 6.35 mm（mm→in / in→mm）', async () => {
    const variables = [{ id: 'vd', name: 'dia', expression: '6.35', type: 'length' as const }];

    // 方向 1：mm 表达式中 → 切 Inch（显示 0.25）→ 内联创建仍按契约 mm 预填。
    const onCreateFromMm = vi.fn();
    renderDialog({ variables, onCreateVariable: onCreateFromMm });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const diameter = screen.getByTestId('hole-diameter') as HTMLInputElement;
    fireEvent.change(diameter, { target: { value: '#dia' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    await waitFor(() => expect(diameter.value).toBe('0.25'));
    fireEvent.change(diameter, { target: { value: '#newd' } });
    fireEvent.keyDown(diameter, { key: 'Enter' });
    expect(onCreateFromMm).toHaveBeenCalledWith(expect.objectContaining({
      name: 'newd',
      valueText: '6.35',
      unit: 'mm',
    }));

    cleanup();

    // 方向 2：先 Inch（显示 0.25）→ 表达式 → 切 mm（显示 6.35）→ 内联创建。
    const onCreateFromIn = vi.fn();
    renderDialog({ variables, onCreateVariable: onCreateFromIn });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    const inchDiameter = screen.getByTestId('hole-diameter') as HTMLInputElement;
    fireEvent.change(inchDiameter, { target: { value: '#dia' } });
    await waitFor(() => expect(inchDiameter.value).toBe('0.25'));
    fireEvent.click(screen.getByRole('tab', { name: '公制' }));
    await waitFor(() => expect(inchDiameter.value).toBe('6.35'));
    fireEvent.change(inchDiameter, { target: { value: '#newd2' } });
    fireEvent.keyDown(inchDiameter, { key: 'Enter' });
    expect(onCreateFromIn).toHaveBeenCalledWith(expect.objectContaining({
      name: 'newd2',
      valueText: '6.35',
      unit: 'mm',
    }));
  });

  it('P3 无效表达式：摘要显示 — 而不是空白 Ø / ↧', async () => {
    renderDialog({ variables: [] });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const diameter = screen.getByTestId('hole-diameter') as HTMLInputElement;
    fireEvent.change(diameter, { target: { value: '#nope' } });
    await waitFor(() =>
      expect(screen.getByTestId('part-studio-hole-summary').textContent).toContain('Ø — mm'));
    expect(screen.getByTestId('part-studio-hole-summary').textContent).not.toContain('Ø  mm');
  });

  it('S4c 无效表达式 → 确认禁用（零 op）', async () => {
    const { applyOp } = renderDialog({ variables: [] });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const diameter = screen.getByTestId('hole-diameter') as HTMLInputElement;
    fireEvent.change(diameter, { target: { value: '#nope' } });
    await waitFor(() => expect(diameter.getAttribute('aria-invalid')).toBe('true'));
    const error = await screen.findByTestId('expression-field-error');
    expect(error.textContent).toContain('未知变量');
    expect(diameter.getAttribute('aria-describedby')).toBe(error.id);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('钻尖角选择：默认 118（Onshape live），选 180 后载荷平底（v1.50）', async () => {
    const { applyOp } = renderDialog();
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    const tip = screen.getByTestId('hole-tip-angle') as HTMLSelectElement;
    expect(tip.value).toBe('118');
    // live 选项文案「118 度 / 180 度」（值仍 118/180）。
    expect(screen.getByRole('option', { name: '118 度' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '180 度' })).toBeTruthy();
    fireEvent.change(tip, { target: { value: '180' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'hole',
      params: { tipAngleDeg: 180 },
    });
  });
});

// ── ADR-0020 S8（shared 1.78）：沉头/锥口字段表达式 ────────────────────────
// 复用 ExpressionNumberField（与孔径/孔深同一状态机）；数值目标保持必填
// 物化快照，原文随载荷；仅当前孔样式适用键发送（样式切换清除）；
// 无效表达式走 S5 本地化错误并禁用提交；mm/in 只是显示投影（快照恒 mm）。
describe('HoleDialog 沉头/锥口表达式（ADR-0020 S8）', () => {
  const W_VARIABLE = { id: 'vw', name: 'w', expression: '10', type: 'length' as const };
  const H_VARIABLE = { id: 'vh', name: 'h', expression: '5', type: 'length' as const };
  const DIA_INCH_VARIABLE = { id: 'vd', name: 'dia', expression: '6.35', type: 'length' as const };
  const SD_VARIABLE = { id: 'vs', name: 'sd', expression: '12', type: 'length' as const };
  const ANGLE_VARIABLE = { id: 'va', name: 'ang', expression: '90', type: 'angle' as const };

  async function openCounterbore(): Promise<void> {
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByText('沉头孔').closest('button')!);
  }

  async function openCountersink(): Promise<void> {
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByText('倒角孔').closest('button')!);
  }

  function submitParams(op: FeatureOp): Record<string, unknown> {
    return (op as unknown as { params: Record<string, unknown> }).params;
  }

  it('沉头孔直径/深度：`#w`/`#h` 求值物化（mm）且原文随载荷', async () => {
    const { applyOp } = renderDialog({ variables: [W_VARIABLE, H_VARIABLE] });
    await openCounterbore();
    const cboreDiameter = screen.getByTestId('hole-cbore-diameter') as HTMLInputElement;
    const cboreDepth = screen.getByTestId('hole-cbore-depth') as HTMLInputElement;
    expect(cboreDiameter.getAttribute('data-expression-field')).toBe('length');
    expect(cboreDepth.getAttribute('data-expression-field')).toBe('length');
    fireEvent.change(cboreDiameter, { target: { value: '#w' } });
    fireEvent.change(cboreDepth, { target: { value: '#h' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(submitParams(applyOp.mock.calls[0]![0])).toMatchObject({
      holeStyle: 'counterbore',
      counterboreDiameterMm: 10,
      counterboreDiameterExpression: '#w',
      counterboreDepthMm: 5,
      counterboreDepthExpression: '#h',
    });
  });

  it('主孔径 + 沉头直径同用表达式：两键各自求值/原文（#w / #w*2）', async () => {
    const { applyOp } = renderDialog({ variables: [W_VARIABLE] });
    await openCounterbore();
    fireEvent.change(screen.getByTestId('hole-diameter'), { target: { value: '#w' } });
    fireEvent.change(screen.getByTestId('hole-cbore-diameter'), { target: { value: '#w*2' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(submitParams(applyOp.mock.calls[0]![0])).toMatchObject({
      diameterMm: 10,
      diameterExpression: '#w',
      holeStyle: 'counterbore',
      counterboreDiameterMm: 20,
      counterboreDiameterExpression: '#w*2',
    });
  });

  it('沉头孔数值编辑清除对应表达式（未编辑的深度表达式保留）', async () => {
    const { applyOp } = renderDialog({ variables: [W_VARIABLE, H_VARIABLE] });
    await openCounterbore();
    const cboreDiameter = screen.getByTestId('hole-cbore-diameter') as HTMLInputElement;
    const cboreDepth = screen.getByTestId('hole-cbore-depth') as HTMLInputElement;
    fireEvent.change(cboreDiameter, { target: { value: '#w' } });
    fireEvent.change(cboreDepth, { target: { value: '#h' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(cboreDiameter, { target: { value: '12' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({
      holeStyle: 'counterbore', counterboreDiameterMm: 12, counterboreDepthMm: 5,
    });
    // 仅被编辑的直径表达式清除；未触碰的深度表达式仍按原文发送。
    expect('counterboreDiameterExpression' in params).toBe(false);
    expect(params.counterboreDepthExpression).toBe('#h');
  });

  it('沉头孔未触碰（编辑回显）保留表达式；变量表未就绪按物化快照放行', async () => {
    const initialParams = {
      sketchId: 'sketch-1',
      pointIds: [2],
      holeStyle: 'counterbore',
      diameterMm: 5,
      counterboreDiameterMm: 10,
      counterboreDepthMm: 4,
      counterboreDiameterExpression: '#w',
      counterboreDepthExpression: '#h',
      endBound: 'throughAll',
    };
    const withVariables = renderDialog({
      featureId: 'feature-8',
      initialParams,
      variables: [
        { id: 'vw', name: 'w', expression: '10', type: 'length' },
        { id: 'vh', name: 'h', expression: '4', type: 'length' },
      ],
    });
    const cboreDiameter = await screen.findByTestId('hole-cbore-diameter') as HTMLInputElement;
    expect(cboreDiameter.value).toBe('10');
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(withVariables.applyOp).toHaveBeenCalledTimes(1));
    expect(withVariables.applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'feature-8',
      params: {
        sketchId: 'sketch-1',
        pointIds: [2],
        holeStyle: 'counterbore',
        counterboreDiameterMm: 10,
        counterboreDepthMm: 4,
        counterboreDiameterExpression: '#w',
        counterboreDepthExpression: '#h',
        diameterMm: 5,
        endBound: 'throughAll',
        tipAngleDeg: 180,
      },
    });
    cleanup();

    // 变量表加载中：未触碰落库表达式按物化快照提交（不误报未知变量）。
    const loading = renderDialog({
      featureId: 'feature-8',
      initialParams,
      variables: [],
      variablesLoading: true,
    });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(loading.applyOp).toHaveBeenCalledTimes(1));
    expect(submitParams(loading.applyOp.mock.calls[0]![0])).toMatchObject({
      holeStyle: 'counterbore',
      counterboreDiameterMm: 10,
      counterboreDepthMm: 4,
      counterboreDiameterExpression: '#w',
      counterboreDepthExpression: '#h',
    });
  });

  it('沉头孔无效表达式：S5 本地化错误 + 禁用提交（零 op）', async () => {
    const { applyOp } = renderDialog({ variables: [] });
    await openCounterbore();
    const cboreDiameter = screen.getByTestId('hole-cbore-diameter') as HTMLInputElement;
    fireEvent.change(cboreDiameter, { target: { value: '#nope' } });
    await waitFor(() => expect(cboreDiameter.getAttribute('aria-invalid')).toBe('true'));
    const error = await screen.findByTestId('expression-field-error');
    expect(error.textContent).toContain('未知变量');
    expect(cboreDiameter.getAttribute('aria-describedby')).toBe(error.id);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('沉头孔英寸投影：表达式求值恒 mm；切 Inch 显示 0.25，快照仍 6.35', async () => {
    const { applyOp } = renderDialog({ variables: [DIA_INCH_VARIABLE] });
    await openCounterbore();
    const cboreDiameter = screen.getByTestId('hole-cbore-diameter') as HTMLInputElement;
    fireEvent.change(cboreDiameter, { target: { value: '#dia' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    await waitFor(() => expect(cboreDiameter.value).toBe('0.25'));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(submitParams(applyOp.mock.calls[0]![0])).toMatchObject({
      counterboreDiameterMm: 6.35,
      counterboreDiameterExpression: '#dia',
    });
  });

  it('沉头孔英寸内联创建：0.25 in 纯数字草稿按契约 mm 预填（6.35）', async () => {
    const onCreateVariable = vi.fn();
    const { applyOp } = renderDialog({ variables: [], onCreateVariable });
    await openCounterbore();
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    const cboreDiameter = screen.getByTestId('hole-cbore-diameter') as HTMLInputElement;
    fireEvent.change(cboreDiameter, { target: { value: '0.25' } });
    await waitFor(() => expect(cboreDiameter.value).toBe('0.25'));
    fireEvent.change(cboreDiameter, { target: { value: '#newd' } });
    fireEvent.keyDown(cboreDiameter, { key: 'Enter' });
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'newd',
      valueText: '6.35',
      unit: 'mm',
    }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('P2-1 英寸 + 无效表达式 + 样式切换：草稿按当前单位归位（10 mm → 0.3937 in），快照不是 254', async () => {
    const { applyOp } = renderDialog({ variables: [] });
    await openCounterbore();
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    const cboreDiameter = screen.getByTestId('hole-cbore-diameter') as HTMLInputElement;
    fireEvent.change(cboreDiameter, { target: { value: '#bad' } });
    await waitFor(() => expect(cboreDiameter.getAttribute('aria-invalid')).toBe('true'));
    // 非适用样式切换会清除无效表达式；切回时草稿必须是单位正确的可解析数值。
    fireEvent.click(screen.getByText('简单').closest('button')!);
    fireEvent.click(screen.getByText('沉头孔').closest('button')!);
    const restored = screen.getByTestId('hole-cbore-diameter') as HTMLInputElement;
    expect(restored.value).not.toContain('#');
    expect(restored.value).toBe('0.3937'); // 10 mm 的英寸显示投影
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    // 显示投影 4 位小数 → 物化回来的快照逼近 10 mm（绝不是 254 mm）。
    expect(Number(params.counterboreDiameterMm)).toBeCloseTo(10, 3);
    // 5 mm → 0.1969 in（4 位投影）回算 5.00126 mm；精度 2 足够且明确不是 127/254。
    expect(Number(params.counterboreDepthMm)).toBeCloseTo(5, 2);
    expect('counterboreDiameterExpression' in params).toBe(false);
    expect('counterboreDepthExpression' in params).toBe(false);
  });

  it('P2-1 主孔深表达式归位：英寸 + 无效深度表达式 + 切终止条件 → 0.3937 in（10 mm）', async () => {
    renderDialog({ variables: [] });
    openLocations();
    fireEvent.click(await screen.findByLabelText('点 1'));
    fireEvent.click(screen.getByRole('tab', { name: 'Inch' }));
    const depth = screen.getByTestId('hole-depth') as HTMLInputElement;
    fireEvent.change(depth, { target: { value: '#bad' } });
    await waitFor(() => expect(depth.getAttribute('aria-invalid')).toBe('true'));
    // throughAll 卸载深度字段：宿主清除表达式并按当前单位归位缺省 10 mm。
    fireEvent.change(screen.getByTestId('hole-end-bound'), { target: { value: 'throughAll' } });
    expect(screen.queryByTestId('hole-depth')).toBeNull();
    fireEvent.change(screen.getByTestId('hole-end-bound'), { target: { value: 'blind' } });
    const restored = screen.getByTestId('hole-depth') as HTMLInputElement;
    expect(restored.value).not.toContain('#');
    expect(restored.value).toBe('0.3937');
  });

  it('切换孔样式清除不适用表达式并归位数值草稿（不夹带旧键）', async () => {
    const { applyOp } = renderDialog({ variables: [W_VARIABLE, H_VARIABLE] });
    await openCounterbore();
    fireEvent.change(screen.getByTestId('hole-cbore-diameter'), { target: { value: '#w' } });
    fireEvent.change(screen.getByTestId('hole-cbore-depth'), { target: { value: '#h' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('倒角孔').closest('button')!);
    // 沉头字段卸载；锥口字段为数值缺省。
    expect(screen.queryByTestId('hole-cbore-diameter')).toBeNull();
    expect((screen.getByTestId('hole-csink-diameter') as HTMLInputElement).value).toBe('10');
    expect((screen.getByTestId('hole-csink-angle') as HTMLInputElement).value).toBe('90');
    fireEvent.click(screen.getByText('沉头孔').closest('button')!);
    // 切回沉头：草稿归位为求值数（非失效的 `#w`/`#h`），表达式已清除。
    expect((screen.getByTestId('hole-cbore-diameter') as HTMLInputElement).value).toBe('10');
    expect((screen.getByTestId('hole-cbore-depth') as HTMLInputElement).value).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({
      holeStyle: 'counterbore', counterboreDiameterMm: 10, counterboreDepthMm: 5,
    });
    expect('counterboreDiameterExpression' in params).toBe(false);
    expect('counterboreDepthExpression' in params).toBe(false);
    expect('countersinkDiameterExpression' in params).toBe(false);
    expect('countersinkAngleExpression' in params).toBe(false);
  });

  it('锥口孔编辑未触碰保留表达式（变量表未就绪按物化快照放行）', async () => {
    const initialParams = {
      sketchId: 'sketch-1',
      pointIds: [2],
      holeStyle: 'countersink',
      diameterMm: 5,
      countersinkDiameterMm: 12,
      countersinkAngleDeg: 90,
      countersinkDiameterExpression: '#sd',
      countersinkAngleExpression: '#ang',
      endBound: 'throughAll',
    };
    const { applyOp } = renderDialog({
      featureId: 'feature-9',
      initialParams,
      variables: [],
      variablesLoading: true,
    });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(submitParams(applyOp.mock.calls[0]![0])).toMatchObject({
      holeStyle: 'countersink',
      countersinkDiameterMm: 12,
      countersinkDiameterExpression: '#sd',
      countersinkAngleDeg: 90,
      countersinkAngleExpression: '#ang',
    });
  });

  it('锥口孔直径改数值只清除直径表达式（未触碰角度表达式保留）', async () => {
    const { applyOp } = renderDialog({ variables: [SD_VARIABLE, ANGLE_VARIABLE] });
    await openCountersink();
    const csinkDiameter = screen.getByTestId('hole-csink-diameter') as HTMLInputElement;
    const csinkAngle = screen.getByTestId('hole-csink-angle') as HTMLInputElement;
    fireEvent.change(csinkDiameter, { target: { value: '#sd' } });
    fireEvent.change(csinkAngle, { target: { value: '#ang' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(csinkDiameter, { target: { value: '14' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({
      holeStyle: 'countersink', countersinkDiameterMm: 14, countersinkAngleDeg: 90,
    });
    expect('countersinkDiameterExpression' in params).toBe(false);
    expect(params.countersinkAngleExpression).toBe('#ang');
  });

  it('锥口孔角度改数值只清除角度表达式（仍按度物化；直径表达式保留）', async () => {
    const { applyOp } = renderDialog({ variables: [SD_VARIABLE, ANGLE_VARIABLE] });
    await openCountersink();
    const csinkDiameter = screen.getByTestId('hole-csink-diameter') as HTMLInputElement;
    const csinkAngle = screen.getByTestId('hole-csink-angle') as HTMLInputElement;
    fireEvent.change(csinkDiameter, { target: { value: '#sd' } });
    fireEvent.change(csinkAngle, { target: { value: '#ang' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(csinkAngle, { target: { value: '82' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({
      holeStyle: 'countersink', countersinkDiameterMm: 12, countersinkAngleDeg: 82,
    });
    expect('countersinkAngleExpression' in params).toBe(false);
    expect(params.countersinkDiameterExpression).toBe('#sd');
  });

  it('锥口孔切换简单样式：表达式清除且不夹带（草稿归位为求值数）', async () => {
    const { applyOp } = renderDialog({ variables: [SD_VARIABLE, ANGLE_VARIABLE] });
    await openCountersink();
    fireEvent.change(screen.getByTestId('hole-csink-diameter'), { target: { value: '#sd' } });
    fireEvent.change(screen.getByTestId('hole-csink-angle'), { target: { value: '#ang' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('简单').closest('button')!);
    expect(screen.queryByTestId('hole-csink-diameter')).toBeNull();
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({ diameterMm: 5, endBound: 'blind', depthMm: 10 });
    expect('holeStyle' in params).toBe(false);
    expect('countersinkDiameterMm' in params).toBe(false);
    expect('countersinkAngleDeg' in params).toBe(false);
    expect('countersinkDiameterExpression' in params).toBe(false);
    expect('countersinkAngleExpression' in params).toBe(false);
    // 切回锥口：草稿归位为求值数（非失效 `#sd`/`#ang`），表达式已清除。
    fireEvent.click(screen.getByText('倒角孔').closest('button')!);
    expect((screen.getByTestId('hole-csink-diameter') as HTMLInputElement).value).toBe('12');
    expect((screen.getByTestId('hole-csink-angle') as HTMLInputElement).value).toBe('90');
  });

  it('锥口孔直径/角度：`#sd`/`#ang` → 物化 mm + 度（不换算弧度）', async () => {
    const { applyOp } = renderDialog({ variables: [SD_VARIABLE, ANGLE_VARIABLE] });
    await openCountersink();
    const csinkDiameter = screen.getByTestId('hole-csink-diameter') as HTMLInputElement;
    const csinkAngle = screen.getByTestId('hole-csink-angle') as HTMLInputElement;
    expect(csinkDiameter.getAttribute('data-expression-field')).toBe('length');
    expect(csinkAngle.getAttribute('data-expression-field')).toBe('angleDeg');
    fireEvent.change(csinkDiameter, { target: { value: '#sd' } });
    fireEvent.change(csinkAngle, { target: { value: '#ang' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({
      holeStyle: 'countersink',
      countersinkDiameterMm: 12,
      countersinkDiameterExpression: '#sd',
      countersinkAngleDeg: 90,
      countersinkAngleExpression: '#ang',
    });
  });

  it('锥口角度 deg 内联创建：unit=deg（不请求 length 变量）', async () => {
    const onCreateVariable = vi.fn();
    const { applyOp } = renderDialog({ variables: [], onCreateVariable });
    await openCountersink();
    const csinkAngle = screen.getByTestId('hole-csink-angle') as HTMLInputElement;
    fireEvent.change(csinkAngle, { target: { value: '#newang' } });
    fireEvent.keyDown(csinkAngle, { key: 'Enter' });
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'newang',
      valueText: '90',
      unit: 'deg',
    }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('锥口角度表达式越界（角变量 200°）→ 角度错误 + 禁用提交', async () => {
    const { applyOp } = renderDialog({
      variables: [{ id: 'va2', name: 'ang2', expression: '200', type: 'angle' }],
    });
    await openCountersink();
    const csinkAngle = screen.getByTestId('hole-csink-angle') as HTMLInputElement;
    fireEvent.change(csinkAngle, { target: { value: '#ang2' } });
    await waitFor(() => expect(csinkAngle.getAttribute('aria-invalid')).toBe('true'));
    const error = await screen.findByTestId('expression-field-error');
    expect(error.textContent).toContain('角度');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('不适用样式不夹带表达式键（simple 行含遗留表达式回显也不发送）', async () => {
    const { applyOp } = renderDialog({
      featureId: 'feature-7',
      variables: [W_VARIABLE],
      initialParams: {
        sketchId: 'sketch-1',
        pointIds: [2],
        diameterMm: 5,
        endBound: 'throughAll',
        counterboreDiameterExpression: '#w',
        countersinkAngleExpression: '#ang',
      },
    });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const params = submitParams(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({ diameterMm: 5, endBound: 'throughAll' });
    expect('counterboreDiameterExpression' in params).toBe(false);
    expect('countersinkAngleExpression' in params).toBe(false);
    expect('holeStyle' in params).toBe(false);
  });

  it('预览载荷使用表达式求值数（counterbore 影子求值）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    renderDialog({ previewOp, variables: [W_VARIABLE, H_VARIABLE] });
    await openCounterbore();
    fireEvent.change(screen.getByTestId('hole-cbore-diameter'), { target: { value: '#w' } });
    fireEvent.change(screen.getByTestId('hole-cbore-depth'), { target: { value: '#h' } });
    await waitFor(() => {
      const last = previewOp.mock.calls.at(-1)?.[0] as unknown as FeatureOp | undefined;
      expect(last).toBeTruthy();
      const params = submitParams(last!);
      expect(params.counterboreDiameterMm).toBe(10);
      expect(params.counterboreDepthMm).toBe(5);
      expect(params.counterboreDiameterExpression).toBe('#w');
      expect(params.counterboreDepthExpression).toBe('#h');
    }, { timeout: 3000 });
  });
});
