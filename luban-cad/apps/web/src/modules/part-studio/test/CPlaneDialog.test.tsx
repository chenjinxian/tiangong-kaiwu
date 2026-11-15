// src/modules/part-studio/test/CPlaneDialog.test.tsx
//
// ADR-0006 切片 B1（shared 1.29）：CPlaneDialog 行为验收——
//  1) 未选参考基准面时 ✓ 禁用；选择后可用；
//  2) 偏移复选 + 距离 + 反转法线进入 insertFeature/cPlane 载荷；
//  3) 未启用偏移时省略 offsetMm；未勾反转时不发 flipNormal；
//  4) edit 模式回显并走 updateParams；
//  5) 非法偏移/只读/后端拒收：不关闭、不假成功；
//  6) 2026-11-15 live 对齐（payload 不变）：图元 query field 两态 + 字段内
//     「图元」标签 + 右外置装饰时钟、偏移/偏移距离下划线值行 + 禁用计算器、
//     类型行产品扩展 title、底栏滑杆诚实禁用、高级定义只读守卫仍在。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({ outputMessage: vi.fn() }));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    constructor(public priority: unknown, public message: string) {}
  },
  OutputMessagePriority: { Success: 1 },
}));

import { CPlaneDialog } from '../dialogs/CPlaneDialog.js';

function renderDialog(overrides: Partial<React.ComponentProps<typeof CPlaneDialog>> = {}) {
  const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
  const onConfirm = vi.fn();
  render(
    <CPlaneDialog
      featureName="平面 1"
      applyOp={applyOp}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { applyOp, onConfirm };
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /确认/ }) as HTMLButtonElement;
}

// live 皮肤钉：jsdom 不计算样式，按仓内既有先例做 CSS 文本断言
//（FeatureDialog.test.tsx / onshape-skin.test.ts 的 ruleBlock）。
const cplaneCss = readFileSync(resolve(__dirname, '../dialogs/FeatureDialog.css'), 'utf8');

function cssRuleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const match = cplaneCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

describe('CPlaneDialog（ADR-0006 切片 B1）', () => {
  beforeEach(() => {
    mocks.outputMessage.mockReset();
  });

  it('未选参考基准面时 ✓ 禁用；选择 Front 后可用', () => {
    renderDialog();
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-front'));
    expect(screen.getByTestId('cplane-reference-chip').textContent).toContain('Front 平面');
    expect(confirmButton().disabled).toBe(false);
  });

  it('偏移 + 距离 + 反转法线 → insertFeature/cPlane 载荷', async () => {
    const { applyOp, onConfirm } = renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-front'));
    fireEvent.change(screen.getByTestId('cplane-offset'), { target: { value: 'offset' } });
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '-20' } });
    fireEvent.click(screen.getByTestId('cplane-flip-normal'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'cPlane',
      params: { reference: 'front', offsetMm: -20, flipNormal: true },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
  });

  it('v1.31 平面点：世界参考法线 + 原点 X/Y/Z → origin 载荷', async () => {
    const { applyOp } = renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-top'));
    fireEvent.change(screen.getByTestId('cplane-mode'), { target: { value: 'point' } });
    fireEvent.change(screen.getByTestId('cplane-origin-x'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('cplane-origin-y'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('cplane-origin-z'), { target: { value: '3' } });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'cPlane',
      params: { reference: 'top', origin: { x: 1, y: 2, z: 3 } },
    });
  });

  it('平面点原点非法 → ✓ 禁用，不提交', () => {
    const { applyOp } = renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-top'));
    fireEvent.change(screen.getByTestId('cplane-mode'), { target: { value: 'point' } });
    fireEvent.change(screen.getByTestId('cplane-origin-x'), { target: { value: 'abc' } });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(confirmButton());
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('未启用偏移/反转 → 省略可选键', async () => {
    const { applyOp } = renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-right'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'cPlane',
      params: { reference: 'right' },
    });
  });

  it('edit 模式回显落库参数并走 updateParams', async () => {
    const { applyOp } = renderDialog({
      featureId: '0x42',
      initialParams: { reference: 'right', offsetMm: 50, flipNormal: true },
    });
    expect(screen.getByTestId('cplane-reference-chip').textContent).toContain('Right 平面');
    expect((screen.getByTestId('cplane-offset-distance') as HTMLInputElement).value).toBe('50');
    expect((screen.getByTestId('cplane-flip-normal') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '60' } });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: '0x42',
      params: { reference: 'right', offsetMm: 60, flipNormal: true },
    });
  });

  it('非法偏移值禁用 ✓；修正后可提交', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-top'));
    fireEvent.change(screen.getByTestId('cplane-offset'), { target: { value: 'offset' } });
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '' } });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(screen.getByTestId('cplane-offset-distance'), { target: { value: '0' } });
    expect(confirmButton().disabled).toBe(false);
  });

  it('只读：✓ 禁用且显示诚实提示', () => {
    renderDialog({ canEdit: false, initialParams: { reference: 'top' } });
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('part-studio-cplane-readonly-hint')).toBeTruthy();
  });

  it('图元 query field：空态 is-empty + 字段内「图元」标签 + 右侧装饰时钟；选中后 is-selected + 值 + ×', () => {
    renderDialog();
    const field = screen.getByTestId('cplane-reference-field');
    expect(field.className).toContain('is-empty');
    expect(field.className).not.toContain('is-selected');
    expect(field.querySelector('.part-studio-feature-dialog__query-label')?.textContent).toBe('图元');
    // 装饰时钟在字段外/右，无语义（aria-hidden，不可交互）。
    const clock = screen.getByTestId('cplane-reference-clock');
    expect(clock.getAttribute('aria-hidden')).toBe('true');
    expect(clock.querySelector('svg')).toBeTruthy();
    expect(field.contains(clock)).toBe(false);

    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    const options = screen.getByTestId('cplane-reference-menu').querySelectorAll('[role="option"]');
    expect(Array.from(options).map((option) => option.textContent)).toEqual([
      'Top 平面', 'Front 平面', 'Right 平面',
    ]);
    fireEvent.click(screen.getByTestId('cplane-reference-front'));
    expect(field.className).toContain('is-selected');
    expect(field.className).not.toContain('is-empty');
    expect(screen.getByTestId('cplane-reference-chip').textContent).toContain('Front 平面');
    expect(screen.getByTestId('cplane-reference-clear').textContent).toBe('×');
    // 两态皮肤钉：空 26px 浅蓝 rgb(222,241,251)/rgb(22,81,176)；已选 42px 白底/#d7d7d7。
    const emptyBlock = cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='cplane'] .part-studio-cplane__reference-field.is-empty",
    );
    expect(emptyBlock).toContain('min-block-size: 26px');
    expect(emptyBlock).toContain('border: 1px solid #1651b0');
    expect(emptyBlock).toContain('background: #def1fb');
    // 2026-11-15 真栈回归：空态占位文本是 sr-only，触发按钮必须显式撑满字段
    // （否则 0 高度 → Playwright/真实点击不可见）。
    const emptyTrigger = cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='cplane'] .part-studio-cplane__reference-field.is-empty .part-studio-cplane__reference-trigger",
    );
    expect(emptyTrigger).toContain('block-size: 100%');
    expect(emptyTrigger).toContain('min-block-size: 24px');
    const selectedBlock = cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='cplane'] .part-studio-cplane__reference-field.is-selected",
    );
    expect(selectedBlock).toContain('min-block-size: 42px');
    expect(selectedBlock).toContain('border: 1px solid #d7d7d7');
    expect(selectedBlock).toContain('background: #ffffff');
    expect(cplaneCss).toMatch(/\.part-studio-feature-dialog__query-label\s*\{[^}]*font-size: 12px/);
  });

  it('偏移/偏移距离 live 值行：下划线 + 右对齐 mm + 禁用计算器 + 底栏滑杆禁用；默认仍为 0', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('cplane-reference-chip'));
    fireEvent.click(screen.getByTestId('cplane-reference-front'));
    fireEvent.change(screen.getByTestId('cplane-offset'), { target: { value: 'offset' } });

    const offsetSelect = screen.getByTestId('cplane-offset');
    expect(offsetSelect.closest('section')?.className).toContain('part-studio-cplane__offset-row');
    const offsetSelectBlock = cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='cplane'] .part-studio-cplane__offset-row .part-studio-feature-dialog__select",
    );
    expect(offsetSelectBlock).toContain('border-block-end: 1px solid #d7d7d7');
    expect(offsetSelectBlock).toContain('background: transparent');
    expect(offsetSelectBlock).toContain('font-size: 13.3333px');
    expect(offsetSelectBlock).toContain('text-align: end');
    expect(cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='cplane'] .part-studio-cplane__offset-row .part-studio-feature-dialog__distance-label",
    )).toContain('color: #666666');

    const distanceInput = screen.getByTestId('cplane-offset-distance') as HTMLInputElement;
    expect(distanceInput.value).toBe('0');
    expect(distanceInput.closest('section')?.className).toContain('part-studio-cplane__distance-row');
    const distanceInputBlock = cssRuleBlock(
      ".part-studio-feature-dialog[data-feature='cplane'] .part-studio-cplane__distance-row .part-studio-feature-dialog__input",
    );
    expect(distanceInputBlock).toContain('border-block-end: 1px solid #d7d7d7');
    expect(distanceInputBlock).toContain('text-align: end');
    expect(screen.getByText('mm')).toBeTruthy();

    const calculator = screen.getByRole('button', { name: '计算器' }) as HTMLButtonElement;
    expect(calculator.disabled).toBe(true);
    expect(calculator.title).toBe('该能力尚未实现');
    expect(screen.getByTestId('cplane-offset-calculator')).toBe(calculator);

    const slider = screen.getByRole('slider', { name: '透明度' }) as HTMLInputElement;
    expect(slider.disabled).toBe(true);
  });

  it('类型行：产品扩展 title（平面点=世界原点子集）；高级定义只读守卫仍在', () => {
    const { unmount } = render(
      <CPlaneDialog featureName="平面 1" applyOp={vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true }))} />,
    );
    const modeRow = screen.getByTestId('cplane-mode-row');
    expect(modeRow.getAttribute('title')).toContain('产品扩展');
    expect(modeRow.getAttribute('title')).toContain('世界原点子集');
    expect((screen.getByTestId('cplane-mode') as HTMLSelectElement).value).toBe('reference');
    unmount();

    render(
      <CPlaneDialog
        featureName="平面 1"
        featureId="0x42"
        initialParams={{
          reference: 'top',
          line: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
          angleDeg: 45,
        }}
        applyOp={vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true }))}
      />,
    );
    expect(screen.queryByTestId('cplane-mode-row')).toBeNull();
    expect(screen.queryByTestId('cplane-reference-field')).toBeNull();
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('part-studio-cplane-advanced-readonly-hint').textContent)
      .toContain('线角度平面');
  });

  // 2026-11-15 P0：高级定义（LINE_ANGLE/LINE_POINT/THREE_POINT）落库参数回显时，
  // 对话框只支持基准面偏移/世界原点，必须只读——绝不提交降级的 reference 参数集。
  function expectAdvancedReadonly(initialParams: Record<string, unknown>, definitionLabel: string): void {
    const { applyOp } = renderDialog({ featureId: '0x42', initialParams });
    expect(confirmButton().disabled).toBe(true);
    expect(screen.queryByTestId('cplane-reference-chip')).toBeNull();
    expect(screen.queryByTestId('cplane-mode')).toBeNull();
    expect(screen.getByTestId('part-studio-cplane-advanced-definition').textContent)
      .toContain(definitionLabel);
    expect(screen.getByTestId('part-studio-cplane-advanced-readonly-hint').textContent)
      .toContain(definitionLabel);
    fireEvent.click(confirmButton());
    expect(applyOp).not.toHaveBeenCalled();
  }

  it('edit 模式 LINE_ANGLE（line + angleDeg）：只读提示，✓ 禁用且不提交', () => {
    expectAdvancedReadonly(
      {
        reference: 'top',
        line: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        angleDeg: 45,
      },
      '线角度平面',
    );
  });

  it('edit 模式 LINE_POINT（line + point）：只读提示，✓ 禁用且不提交', () => {
    expectAdvancedReadonly(
      {
        reference: 'top',
        line: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        point: { x: 0, y: 0, z: 5 },
      },
      '线点平面',
    );
  });

  it('edit 模式 THREE_POINT（threePoints）：只读提示，✓ 禁用且不提交', () => {
    expectAdvancedReadonly(
      {
        reference: 'top',
        threePoints: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
          { x: 0, y: 10, z: 0 },
        ],
      },
      '三点平面',
    );
  });

  it('后端拒收：就地 Alert，不关闭、不报成功', async () => {
    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: '平面被草图引用' }));
    const onConfirm = vi.fn();
    render(
      <CPlaneDialog
        featureName="平面 1"
        featureId="0x42"
        initialParams={{ reference: 'top' }}
        applyOp={applyOp}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(confirmButton());
    await screen.findByText('平面被草图引用');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(mocks.outputMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('part-studio-cplane-dialog')).toBeTruthy();
  });
});
