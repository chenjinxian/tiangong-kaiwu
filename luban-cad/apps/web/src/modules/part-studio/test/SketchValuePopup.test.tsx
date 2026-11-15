// src/modules/part-studio/test/SketchValuePopup.test.tsx
//
// Onshape 草图值确认弹层（2026-11-03）：尺寸/偏移工具完成后在标注位置弹出
// 数字输入框，确认后经 applyUpdate/commit 提交；不使用常驻 SketchPanel。
// 2026-11-15 E1 live 校准：尺寸候选预填实测值并整段选中、只读单位后缀、
// 白卡片/100×26/22×22 实心圆按钮（样式钉走 CSS 文本断言，jsdom 不算样式）。
// E1 链式标注第一步：弹层关闭 dimension 候选（确认成功/取消/草图切换）时发
// dimensionPopupClosed 通知等待中的工具；offset 候选与错误路径不发射。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SketchDto } from '@luban-cad/shared';
import { dimensionUnitSuffix, SketchValuePopup } from '../components/SketchValuePopup.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';

function fakeSystem(overrides: Partial<UseSketchSystem> = {}): UseSketchSystem {
  const activeSketch: SketchDto = {
    id: 'sk-1',
    entities: [],
    constraints: [],
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
    regions: [],
  };
  return {
    activeSketch,
    loading: false,
    applyUpdate: vi.fn(async () => ({ ok: true, featureId: 'sk-1' })),
    applyConstraintValue: vi.fn(async () => ({ ok: true, featureId: 'sk-1' })),
    refresh: vi.fn(async () => undefined),
    ...overrides,
  } as UseSketchSystem;
}

const popupCss = readFileSync(resolve(__dirname, '../components/SketchValuePopup.css'), 'utf8');

/** 取选择器所属规则体（单层大括号；本仓 CSS 无嵌套——同 FeatureDialog.test 先例）。
 * 取**最后一个**匹配：confirm/cancel 先出现在共享规则的选择器组里，独立规则在后。 */
function cssRuleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const matches = [...popupCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  const match = matches[matches.length - 1];
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

describe('SketchValuePopup（Onshape 标注位置值确认框）', () => {
  /** 弹层关闭通知（E1：dimension 候选关闭才发射；工具等它才退出）。 */
  const closed = vi.fn();
  let offClosed: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    offClosed = sketchToolEvents.on('dimensionPopupClosed', closed);
  });

  afterEach(() => {
    offClosed?.();
    offClosed = undefined;
  });

  it('尺寸候选（无实测值）：anchor 位置弹出空输入 + 占位 + mm 后缀，确认后追加约束并关闭', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [{ entity: 7, part: 'start' }],
        entityIds: [7],
        anchor: { x: 140, y: 120 },
      });
    });
    const popup = screen.getByTestId('sketch-value-popup');
    expect(popup.getAttribute('data-kind')).toBe('dimension');
    expect((popup as HTMLElement).style.left).toBe('154px');
    expect((popup as HTMLElement).style.top).toBe('102px');
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    // 几何不可测：保持既有空输入 + 占位行为。
    expect(input.value).toBe('');
    expect(input.placeholder).not.toBe('');
    expect(screen.getByTestId('sketch-value-unit').textContent).toBe('mm');
    const confirm = screen.getByTestId('sketch-value-confirm');
    expect(confirm.className).toBe('part-studio-sketch-value-popup__confirm');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.textContent).toBe('');
    const cancel = screen.getByTestId('sketch-value-cancel');
    expect(cancel.className).toBe('part-studio-sketch-value-popup__cancel');
    expect(cancel.querySelector('svg')).not.toBeNull();
    expect(cancel.textContent).toBe('');
    // 候选打开期间不得发射关闭事件（工具仍在等待）。
    expect(closed).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(system.applyUpdate).toHaveBeenCalledTimes(1));
    expect((system.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual([
      { kind: 'length', id: expect.any(Number), refs: [{ entity: 7, part: 'start' }], value: 42 },
    ]);
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    // 确认成功关闭 dimension 候选 → 恰好一次关闭通知。
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('尺寸候选带 measuredValue：预填 4 位小数并整段选中，确认提交预填值', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [{ entity: 7, part: 'start' }],
        entityIds: [7],
        anchor: { x: 140, y: 120 },
        measuredValue: 12.345678,
      });
    });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('12.3457');
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('12.3457'.length);
    });
    // Enter 提交（保留既有键盘行为；输入文本即预填值）。
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(system.applyUpdate).toHaveBeenCalledTimes(1));
    expect((system.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual([
      { kind: 'length', id: expect.any(Number), refs: [{ entity: 7, part: 'start' }], value: 12.3457 },
    ]);
  });

  it('单位后缀：长度/距离/半径/直径 mm；角度 °（预留通道）', () => {
    expect(dimensionUnitSuffix('length')).toBe('mm');
    expect(dimensionUnitSuffix('distance')).toBe('mm');
    expect(dimensionUnitSuffix('radius')).toBe('mm');
    expect(dimensionUnitSuffix('diameter')).toBe('mm');
    expect(dimensionUnitSuffix('angle')).toBe('°');
  });

  it('非法值：就地错误，不提交；Escape 关闭', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'radius',
        refs: [{ entity: 3, part: 'center' }],
        entityIds: [3],
        anchor: { x: 50, y: 60 },
      });
    });
    fireEvent.change(screen.getByTestId('sketch-value-input'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    expect(screen.getByTestId('sketch-value-error')).toBeDefined();
    expect(system.applyUpdate).not.toHaveBeenCalled();
    // 非法值：弹层保持打开，不得通知工具退出。
    expect(screen.getByTestId('sketch-value-popup')).toBeDefined();
    expect(closed).not.toHaveBeenCalled();
    // Escape 取消 → 关闭一次并恰好通知一次。
    fireEvent.keyDown(screen.getByTestId('sketch-value-input'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('偏移候选：预填实测距（无单位后缀），确认调用工具 commit；拒收保持并显示错误', async () => {
    const commit = vi.fn(async (value: number) => (value > 10 ? '偏移过大' : undefined));
    render(<SketchValuePopup sketchSystem={fakeSystem()} />);
    act(() => {
      sketchToolEvents.emit('offsetCandidate', {
        measuredDistance: 8,
        commit,
        anchor: { x: 200, y: 200 },
      });
    });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('8');
    expect(screen.queryByTestId('sketch-value-unit')).toBeNull();
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    await waitFor(() => expect(commit).toHaveBeenCalledWith(12));
    await waitFor(() => expect(screen.getByTestId('sketch-value-error').textContent).toBe('偏移过大'));
    // 偏移候选由工具自持（commit 回调）：错误与取消都不得发射关闭通知。
    expect(closed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sketch-value-cancel'));
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    expect(closed).not.toHaveBeenCalled();
  });

  // ── E1：dimensionPopupClosed 通知面（工具等待退出）─────────────────────────
  it('提交失败（applyUpdate 拒收）：弹层保持、不通知；取消才通知一次', async () => {
    const system = fakeSystem({
      applyUpdate: vi.fn(async () => ({ ok: false, error: '求解失败' })),
    });
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [{ entity: 7, part: 'start' }],
        entityIds: [7],
        anchor: { x: 140, y: 120 },
      });
    });
    fireEvent.change(screen.getByTestId('sketch-value-input'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    await waitFor(() => expect(screen.getByTestId('sketch-value-error').textContent).toBe('求解失败'));
    expect(screen.getByTestId('sketch-value-popup')).toBeDefined();
    expect(closed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sketch-value-cancel'));
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('草图切换：dimension 候选打开时关闭并通知一次；无候选时不通知', () => {
    const system = fakeSystem();
    const { rerender } = render(<SketchValuePopup sketchSystem={system} />);
    // 挂载（activeSketchId effect 首次运行）没有候选 → 不发射。
    expect(closed).not.toHaveBeenCalled();

    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'radius',
        refs: [{ entity: 3, part: 'center' }],
        entityIds: [3],
        anchor: { x: 50, y: 60 },
      });
    });
    expect(screen.getByTestId('sketch-value-popup')).toBeDefined();

    const switched = fakeSystem({ activeSketch: { ...system.activeSketch!, id: 'sk-2' } });
    rerender(<SketchValuePopup sketchSystem={switched} />);
    expect(screen.queryByTestId('sketch-value-popup')).toBeNull();
    expect(closed).toHaveBeenCalledTimes(1);

    // 无候选时再次切换草图：不重复通知。
    const switchedAgain = fakeSystem({ activeSketch: { ...system.activeSketch!, id: 'sk-3' } });
    rerender(<SketchValuePopup sketchSystem={switchedAgain} />);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

// ── E1 live 样式钉（2026-11-15 证据：白卡片/100×26/22×22 实心圆按钮）─────────
// jsdom 不计算布局/颜色，样式层按仓内既有 CSS 文本断言先例落在文本层。
describe('E1 live 值弹层样式', () => {
  it('卡片：白底 + 1px #cccccc + 半径 2 + 最小高 34 + 4px 间距', () => {
    const card = cssRuleBlock('.part-studio-sketch-value-popup');
    expect(card).toContain('background: #ffffff');
    expect(card).toContain('border: 1px solid #cccccc');
    expect(card).toContain('border-radius: 2px');
    expect(card).toContain('min-block-size: 34px');
    expect(card).toContain('gap: 4px');
  });

  it('输入：100×26 / 13.3333px；聚焦下划线 #2850aa', () => {
    const input = cssRuleBlock('.part-studio-sketch-value-popup__input');
    expect(input).toContain('inline-size: 100px');
    expect(input).toContain('block-size: 26px');
    expect(input).toContain('font-size: 13.3333px');
    expect(cssRuleBlock('.part-studio-sketch-value-popup__input:focus')).toContain('#2850aa');
  });

  it('确认/取消：22×22 实心圆，绿 #419228 / 红 #ae3c3e，白色 sprite', () => {
    expect(popupCss).toMatch(
      /\.part-studio-sketch-value-popup__confirm,[\s\S]*?\.part-studio-sketch-value-popup__cancel\s*\{[^}]*inline-size: 22px;[^}]*block-size: 22px;[^}]*border-radius: 50%;/,
    );
    expect(cssRuleBlock('.part-studio-sketch-value-popup__confirm')).toContain('background: #419228');
    const confirm = cssRuleBlock('.part-studio-sketch-value-popup__confirm');
    expect(confirm).toContain('--os-icon-fill-primary--static: #ffffff');
    const cancel = cssRuleBlock('.part-studio-sketch-value-popup__cancel');
    expect(cancel).toContain('background: #ae3c3e');
    expect(cancel).toContain('--os-icon-accent-cancel: #ffffff');
  });
});
