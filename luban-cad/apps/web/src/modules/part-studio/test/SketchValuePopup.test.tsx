// src/modules/part-studio/test/SketchValuePopup.test.tsx
//
// Onshape 草图值确认弹层（2026-11-03）：尺寸/偏移工具完成后在标注位置弹出
// 数字输入框，确认后经 applyUpdate/commit 提交；不使用常驻 SketchPanel。
// 2026-11-15 E1 live 校准：尺寸候选预填实测值并整段选中、只读单位后缀。
// E1 链式标注第一步：弹层关闭 dimension 候选（确认成功/取消/草图切换）时发
// dimensionPopupClosed 通知等待中的工具；offset 候选与错误路径不发射。
//
// 2026-11-16 W17b（live dimension-dialog 对拍）：尺寸分支改用与双击编辑器
// 共用的 209×47 外壳（拖拽条 + 禁用展开器/参数状态切换 + 按钮组），以放置
// 点击为中心（left = anchor.x − 104.5、top = anchor.y − 31，顶部 ≥8px 安全
// 钳制）；初值长度 5 位/角度 7 位小数；方向键无选区长度 ±1 mm（W18 共享外壳
// 角度分支 ±1°）；
// 仅拖拽条可拖、每个候选复位；偏移分支保持旧白卡外观（产品扩展）。
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SketchConstraintDto, SketchDto } from '@luban-cad/shared';
import {
  centerValuePopupPosition,
  dimensionUnitSuffix,
  SketchValuePopup,
  VALUE_POPUP_HALF_WIDTH,
  VALUE_POPUP_MIN_TOP,
  VALUE_POPUP_TOP_OFFSET,
} from '../components/SketchValuePopup.js';
import { formatDimensionPopupValue } from '../internal/sketch-dimension-value.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';
import type { SketchDimensionCandidate } from '../tools/sketch/sketch-tool-events.js';

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

/** jsdom 26 无 PointerEvent（实测）：用 MouseEvent 以 pointer* 事件名派发
 *（与仓内 SketchDimensionEditor.test 同一先例），坐标/按键字段可用。 */
function firePointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: MouseEventInit,
): void {
  fireEvent(element, new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
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

  it('尺寸候选（无实测值）：live dimension-dialog 外壳 + 居中锚点 + 空输入占位，确认后追加约束并关闭', async () => {
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
    // live：可见对话框以放置点击为中心（left = 140 − 104.5；top = 120 − 31）。
    expect((popup as HTMLElement).style.left).toBe('35.5px');
    expect((popup as HTMLElement).style.top).toBe('89px');
    // 与双击编辑器同一外壳（无第三套视觉/旧白卡类）。
    expect(popup.classList.contains('part-studio-dimension-editor-dialog')).toBe(true);
    expect(popup.classList.contains('part-studio-sketch-value-popup')).toBe(false);
    const dragbar = screen.getByTestId('sketch-value-dragbar');
    expect(dragbar.classList.contains('part-studio-dimension-editor-dragbar')).toBe(true);
    expect(dragbar.querySelectorAll('.part-studio-dimension-editor-grip > span')).toHaveLength(3);
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    // 几何不可测：保持既有空输入 + 占位行为。
    expect(input.value).toBe('');
    expect(input.placeholder).not.toBe('');
    expect(input.classList.contains('part-studio-dimension-editor')).toBe(true);
    expect(screen.getByTestId('sketch-value-unit').textContent).toBe('mm');
    const confirm = screen.getByTestId('sketch-value-confirm');
    expect(confirm.className).toBe('part-studio-dimension-editor-confirm');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.textContent).toBe('');
    const cancel = screen.getByTestId('sketch-value-cancel');
    expect(cancel.className).toBe('part-studio-dimension-editor-cancel');
    expect(cancel.querySelector('svg')).not.toBeNull();
    expect(cancel.textContent).toBe('');
    // live 2026-11-16：禁用展开器（纯装饰、无 title）与禁用参数状态切换。
    const expander = screen.getByTestId('sketch-value-expander');
    expect(expander.getAttribute('aria-hidden')).toBe('true');
    expect(expander.getAttribute('title')).toBeNull();
    expect(expander.querySelector('svg')).not.toBeNull();
    const stateToggle = screen.getByTestId('sketch-value-state-toggle') as HTMLButtonElement;
    expect(stateToggle.disabled).toBe(true);
    expect(stateToggle.querySelector('svg')).not.toBeNull();
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

  it('尺寸候选带 measuredValue：预填 5 位小数并整段选中，确认提交预填值', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [{ entity: 7, part: 'start' }],
        entityIds: [7],
        anchor: { x: 140, y: 120 },
        measuredValue: 15.74582793,
      });
    });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('15.74583');
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('15.74583'.length);
    });
    // Enter 提交（保留既有键盘行为；输入文本即预填值）。
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(system.applyUpdate).toHaveBeenCalledTimes(1));
    expect((system.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual([
      { kind: 'length', id: expect.any(Number), refs: [{ entity: 7, part: 'start' }], value: 15.74583 },
    ]);
  });

  it('方向键步进（live）：无选区时 ±1 mm（原始值基线）、不提交', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [11],
        entityIds: [11],
        anchor: { x: 140, y: 120 },
        measuredValue: 15.74582793,
      });
    });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('15.74583');
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const steppedDown = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(steppedDown.value).toBe('14.74582793');

    steppedDown.setSelectionRange(steppedDown.value.length, steppedDown.value.length);
    fireEvent.keyDown(steppedDown, { key: 'ArrowUp' });
    // 步进后文本已不是初始格式化：基线改为 Number(text)。
    expect((screen.getByTestId('sketch-value-input') as HTMLInputElement).value).toBe('15.74582793');
    expect(system.applyUpdate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sketch-value-input')).not.toBeNull();
  });

  it('有选区时 ArrowDown 不步进（live：默认行为折叠选区）', async () => {
    render(<SketchValuePopup sketchSystem={fakeSystem()} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'radius',
        refs: [3],
        entityIds: [3],
        anchor: { x: 140, y: 120 },
        measuredValue: 12.345678,
      });
    });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('12.34568');
    await waitFor(() => expect(document.activeElement).toBe(input));
    // 刚打开时整段选中（live）；显式 select 与 W17 编辑器用例同式，避免
    // jsdom 焦点时序差异导致选区折叠。
    input.select();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((screen.getByTestId('sketch-value-input') as HTMLInputElement).value).toBe('12.34568');
  });

  it('单位后缀：长度/距离/半径/直径 mm；角度 deg（live 输入值内单位 token）', () => {
    expect(dimensionUnitSuffix('length')).toBe('mm');
    expect(dimensionUnitSuffix('distance')).toBe('mm');
    expect(dimensionUnitSuffix('radius')).toBe('mm');
    expect(dimensionUnitSuffix('diameter')).toBe('mm');
    expect(dimensionUnitSuffix('angle')).toBe('deg');
  });

  it('居中锚点纯几何：live (735,281) → (630.5,250)；顶部 ≥8px 安全钳制', () => {
    expect(VALUE_POPUP_HALF_WIDTH).toBe(104.5);
    expect(VALUE_POPUP_TOP_OFFSET).toBe(31);
    expect(VALUE_POPUP_MIN_TOP).toBe(8);
    expect(centerValuePopupPosition({ x: 735, y: 281 })).toEqual({ left: 630.5, top: 250 });
    // 未采到 live 边缘钳制：只保留既有顶部安全钳制，不新增容器尺寸探测。
    expect(centerValuePopupPosition({ x: 100, y: 10 })).toEqual({ left: -4.5, top: 8 });
  });

  it('初值格式化：长度 5 位小数、角度 7 位小数（去尾零；非有限值空文本）', () => {
    expect(formatDimensionPopupValue('length', 15.74582793)).toBe('15.74583');
    expect(formatDimensionPopupValue('radius', 12.3456)).toBe('12.3456');
    expect(formatDimensionPopupValue('distance', 20)).toBe('20');
    expect(formatDimensionPopupValue('angle', 12.345678901)).toBe('12.3456789');
    expect(formatDimensionPopupValue('length', Number.NaN)).toBe('');
  });

  it('拖拽：仅拖拽条可拖（+30/+20 → 可见对话框跟随）；新候选复位到锚点位置', () => {
    render(<SketchValuePopup sketchSystem={fakeSystem()} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [11],
        entityIds: [11],
        anchor: { x: 140, y: 120 },
      });
    });
    const popup = screen.getByTestId('sketch-value-popup') as HTMLElement;
    expect(popup.style.left).toBe('35.5px');
    const dragbar = screen.getByTestId('sketch-value-dragbar');
    firePointer(dragbar, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    firePointer(document.body, 'pointermove', { clientX: 330, clientY: 220, buttons: 1 });
    firePointer(document.body, 'pointerup', { clientX: 330, clientY: 220 });
    const dragged = screen.getByTestId('sketch-value-popup') as HTMLElement;
    expect(parseFloat(dragged.style.left)).toBeCloseTo(65.5, 5);
    expect(parseFloat(dragged.style.top)).toBeCloseTo(109, 5);

    // 面板/输入区不可拖：pointerdown 不启动会话（位置不变）。
    const panel = dragged.querySelector('.part-studio-dimension-editor-panel') as HTMLElement;
    firePointer(panel, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    firePointer(document.body, 'pointermove', { clientX: 360, clientY: 260, buttons: 1 });
    firePointer(document.body, 'pointerup', { clientX: 360, clientY: 260 });
    expect(parseFloat((screen.getByTestId('sketch-value-popup') as HTMLElement).style.left))
      .toBeCloseTo(65.5, 5);

    // 新候选（同种类连续放置）→ 拖拽位移复位到新锚点。
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [12],
        entityIds: [12],
        anchor: { x: 200, y: 150 },
      });
    });
    const reset = screen.getByTestId('sketch-value-popup') as HTMLElement;
    expect(reset.style.left).toBe('95.5px');
    expect(reset.style.top).toBe('119px');
  });

  it('非法值：就地错误（不改变 209×47 对话框结构），不提交；Escape 关闭', async () => {
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
    expect(screen.getByTestId('sketch-value-input').getAttribute('data-error')).toBe('true');
    expect(system.applyUpdate).not.toHaveBeenCalled();
    // 非法值：弹层保持打开，不得通知工具退出。
    expect(screen.getByTestId('sketch-value-popup')).toBeDefined();
    expect(closed).not.toHaveBeenCalled();
    // Escape 取消 → 关闭一次并恰好通知一次。
    fireEvent.keyDown(screen.getByTestId('sketch-value-input'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

// ── 偏移候选（产品扩展；保持旧行为/旧外观，不走 dimension-dialog 外壳）───────
describe('SketchValuePopup 偏移分支（产品扩展）', () => {
  it('偏移候选：旧白卡外观、预填实测距（无单位后缀），确认调用工具 commit；拒收保持并显示错误', async () => {
    const closed = vi.fn();
    const offClosed = sketchToolEvents.on('dimensionPopupClosed', closed);
    try {
      const commit = vi.fn(async (value: number) => (value > 10 ? '偏移过大' : undefined));
      render(<SketchValuePopup sketchSystem={fakeSystem()} />);
      act(() => {
        sketchToolEvents.emit('offsetCandidate', {
          measuredDistance: 8,
          commit,
          anchor: { x: 200, y: 200 },
        });
      });
      const popup = screen.getByTestId('sketch-value-popup');
      expect(popup.getAttribute('data-kind')).toBe('offset');
      expect(popup.classList.contains('part-studio-sketch-value-popup')).toBe(true);
      expect(popup.classList.contains('part-studio-dimension-editor-dialog')).toBe(false);
      // 偏移保持既有 +14/-18 锚点偏移与旧内联输入样式。
      expect((popup as HTMLElement).style.left).toBe('214px');
      expect((popup as HTMLElement).style.top).toBe('182px');
      const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
      expect(input.value).toBe('8');
      expect(input.classList.contains('part-studio-sketch-value-popup__input')).toBe(true);
      expect(screen.queryByTestId('sketch-value-unit')).toBeNull();
      expect(screen.queryByTestId('sketch-value-state-toggle')).toBeNull();
      fireEvent.change(input, { target: { value: '12' } });
      fireEvent.click(screen.getByTestId('sketch-value-confirm'));
      await waitFor(() => expect(commit).toHaveBeenCalledWith(12));
      await waitFor(() => expect(screen.getByTestId('sketch-value-error').textContent).toBe('偏移过大'));
      // 偏移候选由工具自持（commit 回调）：错误与取消都不得发射关闭通知。
      expect(closed).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('sketch-value-cancel'));
      await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
      expect(closed).not.toHaveBeenCalled();
    } finally {
      offClosed();
    }
  });
});

// ── W22（2026-11-16 live）：角度候选（度输入 → 契约弧度提交）────────────────
describe('SketchValuePopup 角度候选（W22）', () => {
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

  function emitAngle(overrides: Partial<SketchDimensionCandidate> = {}): void {
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'angle',
        refs: [1, 2],
        entityIds: [1, 2],
        anchor: { x: 140, y: 120 },
        ...overrides,
      });
    });
  }

  it('新角度候选：实测度值 7 位小数预填 + deg 后缀；确认提交弧度（90° → π/2）', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    emitAngle({ measuredValue: 90 });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('90');
    expect(screen.getByTestId('sketch-value-unit').textContent).toBe('deg');

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(system.applyUpdate).toHaveBeenCalledTimes(1));
    const constraints = (system.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1] as SketchConstraintDto[];
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({ kind: 'angle', refs: [1, 2] });
    expect(constraints[0]!.value).toBeCloseTo(Math.PI / 2, 12);
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('角度初值 = 7 位小数去尾零（live 83.7325188 deg）', () => {
    render(<SketchValuePopup sketchSystem={fakeSystem()} />);
    emitAngle({ measuredValue: 83.7325188 });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('83.7325188');
    expect(screen.getByTestId('sketch-value-unit').textContent).toBe('deg');
  });

  it('方向键 ±1°（未编辑时以实测度值为基线，步进文本 7 位口径）', () => {
    render(<SketchValuePopup sketchSystem={fakeSystem()} />);
    emitAngle({ measuredValue: 83.7325188 });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const steppedDown = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(steppedDown.value).toBe('82.7325188');

    steppedDown.setSelectionRange(steppedDown.value.length, steppedDown.value.length);
    fireEvent.keyDown(steppedDown, { key: 'ArrowUp' });
    expect((screen.getByTestId('sketch-value-input') as HTMLInputElement).value).toBe('83.7325188');
  });

  it('既有角度约束：度预填、确认调 applyConstraintValue 时换算弧度（不追加）', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    emitAngle({ existingConstraintId: 42, existingValue: 90 });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('90');
    expect(screen.getByTestId('sketch-value-unit').textContent).toBe('deg');

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(system.applyConstraintValue).toHaveBeenCalledTimes(1));
    const [id, value] = (system.applyConstraintValue as ReturnType<typeof vi.fn>).mock.calls[0] as [number, number];
    expect(id).toBe(42);
    expect(value).toBeCloseTo(Math.PI / 2, 12);
    expect(system.applyUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
  });

  it('既有角度约束改值：45 → π/4（度 → 弧度）', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    emitAngle({ existingConstraintId: 42, existingValue: 90 });
    fireEvent.change(screen.getByTestId('sketch-value-input'), { target: { value: '45' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    await waitFor(() => expect(system.applyConstraintValue).toHaveBeenCalledTimes(1));
    const [id, value] = (system.applyConstraintValue as ReturnType<typeof vi.fn>).mock.calls[0] as [number, number];
    expect(id).toBe(42);
    expect(value).toBeCloseTo(Math.PI / 4, 12);
  });

  it('角度 ≥360° / ≤0 / 非数值：就地错误、不提交（保持既有度校验）', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    emitAngle({ measuredValue: 90 });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    for (const invalid of ['360', '0', '-5', 'abc', '']) {
      fireEvent.change(input, { target: { value: invalid } });
      fireEvent.click(screen.getByTestId('sketch-value-confirm'));
      expect(screen.getByTestId('sketch-value-error')).toBeDefined();
      expect(system.applyUpdate).not.toHaveBeenCalled();
      expect(system.applyConstraintValue).not.toHaveBeenCalled();
      expect(screen.getByTestId('sketch-value-popup')).toBeDefined();
      expect(closed).not.toHaveBeenCalled();
    }
  });
});

// ── W21（2026-11-16 live S1c）：既有尺寸候选 → 原地改值（不追加）─────────────
describe('SketchValuePopup 既有尺寸候选（W21）', () => {
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

  function emitExisting(overrides: Partial<SketchDimensionCandidate> = {}): void {
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [{ entity: 7, part: 'start' }],
        entityIds: [7],
        anchor: { x: 140, y: 120 },
        existingConstraintId: 42,
        existingValue: 25.98062,
        ...overrides,
      });
    });
  }

  it('预填既有约束值（既有值优先于实测值），确认调 applyConstraintValue 一次且不追加约束', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    // measuredValue 同时存在时不得覆盖既有约束值（既有尺寸是唯一事实源）。
    emitExisting({ measuredValue: 4.2 });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('25.98062');
    expect(screen.getByTestId('sketch-value-unit').textContent).toBe('mm');

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(system.applyConstraintValue).toHaveBeenCalledTimes(1));
    expect((system.applyConstraintValue as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([42, 25.98062]);
    expect(system.applyUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    // 确认关闭 dimension 候选 → 恰好一次关闭通知（工具保持安装，W19）。
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('改值确认：applyConstraintValue(既有 id, 输入值)；既有候选不追加', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    emitExisting({ existingValue: 30 });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('30');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    await waitFor(() => expect(system.applyConstraintValue).toHaveBeenCalledTimes(1));
    expect((system.applyConstraintValue as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([42, 25]);
    expect(system.applyUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
  });

  it('取消：不改值、不追加，关闭并通知一次（约束保持不变）', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    emitExisting();
    expect(screen.getByTestId('sketch-value-popup')).toBeDefined();
    fireEvent.click(screen.getByTestId('sketch-value-cancel'));
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    expect(system.applyConstraintValue).not.toHaveBeenCalled();
    expect(system.applyUpdate).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('提交失败：保留对话框与错误（不通知）；取消后才通知一次', async () => {
    const system = fakeSystem({
      applyConstraintValue: vi.fn(async () => ({ ok: false, error: '求解失败' })),
    });
    render(<SketchValuePopup sketchSystem={system} />);
    emitExisting();
    fireEvent.change(screen.getByTestId('sketch-value-input'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    await waitFor(() => expect(screen.getByTestId('sketch-value-error').textContent).toBe('求解失败'));
    expect(screen.getByTestId('sketch-value-popup')).toBeDefined();
    expect(screen.getByTestId('sketch-value-input').getAttribute('data-error')).toBe('true');
    expect(system.applyUpdate).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('sketch-value-cancel'));
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

// ── E1：dimensionPopupClosed 通知面（工具复位（W19 单尺寸工具保持安装））─────────────────────────
describe('SketchValuePopup 事件契约（E1）', () => {
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
