/**
 * 2026-11-15 E5（Onshape live 悬停非尺寸约束 glyph）：SketchDimensionEditor
 * 的画布 mousemove 命中 glyph → 按约束收集引用实体 id 回调（升序去重）；
 * 未命中/mouseleave 回调空数组；同一集合不重复回调；canEdit=false 不监听。
 * 只做显示联动，不改变选择/模型（断言回调载荷即可）。
 *
 * 2026-11-16 W10a（live dimension-dialog）：确认/取消按钮存在且带 live aria
 * 标签；输入框 blur 不关闭对话框（旧 blur-cancel 行为会关闭）；失焦后窗口级
 * Enter/Escape 仍生效；确认走同一 commit 路径、取消丢弃（不写模型）。
 *
 * 2026-11-16 W17（live 尺寸对话框全结构）：对话框 209×47、拖拽条三枚空心方
 * 握把、禁用展开器与禁用参数状态切换、拖拽条拖动可见对话框（重开复位）、
 * 方向键无选区时 ±1 步进（有选区不步进、不提交）。
 *
 * 2026-11-16 W18（live 角度编辑器）：单位后缀 deg；角度初值 7 位小数（度）、
 * 光标态 ArrowDown ±1°；radians → degrees 在传给共享外壳前归一化。
 */
import type { MutableRefObject } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchConstraintDto, VariableDto } from '@luban-cad/shared';
import type { SketchConstraintGlyphAnnotation, SketchLinearDimensionAnnotation } from '@luban-cad/viewer';
import {
  DIMENSION_EDITOR_DIALOG_COMPACT_WIDTH,
  DIMENSION_EDITOR_DIALOG_WIDTH,
  DIMENSION_EDITOR_INPUT_HEIGHT,
  dimensionEditorDialogWidth,
  dimensionEditorUnit,
  SketchDimensionEditor,
} from '../components/SketchDimensionEditor.js';

/** 受控相机事件源（jsdom 无真 viewport；fire() 触发全部 addListener 注册者）。 */
interface FakeViewChanged {
  addListener: (listener: () => void) => void;
  removeListener: (listener: () => void) => void;
  fire: () => void;
}

function makeViewport(): {
  canvas: HTMLCanvasElement;
  viewport: ScreenViewport;
  onViewChanged: FakeViewChanged;
} {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    }),
  });
  const listeners = new Set<() => void>();
  const onViewChanged: FakeViewChanged = {
    addListener: vi.fn((listener: () => void) => { listeners.add(listener); }),
    removeListener: vi.fn((listener: () => void) => { listeners.delete(listener); }),
    fire: () => { for (const listener of [...listeners]) listener(); },
  };
  const viewport = {
    canvas,
    worldToView: (point: Point3d) => ({ x: point.x, y: point.y }),
    onViewChanged,
  } as unknown as ScreenViewport;
  return { canvas, viewport, onViewChanged };
}

/** glyph 锚点 (100,60) → 屏幕方块中心 (100,44)（layout 上移 16px、边长 20）。 */
const GLYPH: SketchConstraintGlyphAnnotation = {
  id: 'constraint-1',
  kind: 'coincident',
  position: Point3d.create(100, 60, 0),
};
const GLYPH_CENTER = { clientX: 100, clientY: 44 };

const CONSTRAINT: SketchConstraintDto = {
  id: 1,
  kind: 'coincident',
  refs: [{ entity: 4, part: 'start' }, 2, { entity: 4, part: 'end' }, { origin: true }],
};

function renderEditor(options?: { canEdit?: boolean; constraints?: SketchConstraintDto[] }): {
  canvas: HTMLCanvasElement;
  onGlyphHover: ReturnType<typeof vi.fn>;
  onViewChanged: FakeViewChanged;
  unmount: () => void;
  rerenderWithConstraints: (constraints: SketchConstraintDto[]) => void;
} {
  const { canvas, viewport, onViewChanged } = makeViewport();
  const onGlyphHover = vi.fn();
  const element = (constraints: SketchConstraintDto[]) => (
    <SketchDimensionEditor
      viewport={viewport}
      annotations={[]}
      glyphs={[GLYPH]}
      constraints={constraints}
      canEdit={options?.canEdit ?? true}
      onCommit={() => undefined}
      onGlyphHover={onGlyphHover}
    />
  );
  const view = render(element(options?.constraints ?? [CONSTRAINT]));
  return {
    canvas,
    onGlyphHover,
    onViewChanged,
    unmount: view.unmount,
    rerenderWithConstraints: (constraints) => view.rerender(element(constraints)),
  };
}

describe('SketchDimensionEditor E5：约束 glyph 悬停高亮', () => {
  it('命中 glyph → 引用实体 id 升序去重（origin 忽略）；同一集合不重复回调', () => {
    const { canvas, onGlyphHover } = renderEditor();
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenCalledTimes(1);
    expect(onGlyphHover).toHaveBeenLastCalledWith([2, 4]);

    // 仍在同一 glyph 内：数组内容不变 → 不重复回调（mousemove 高频不驱动重渲染）。
    fireEvent.mouseMove(canvas, { clientX: 101, clientY: 45 });
    expect(onGlyphHover).toHaveBeenCalledTimes(1);
  });

  it('移出 glyph → []；mouseleave → []（再次进入后离开同样清空）', () => {
    const { canvas, onGlyphHover } = renderEditor();
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenLastCalledWith([2, 4]);

    fireEvent.mouseMove(canvas, { clientX: 400, clientY: 300 });
    expect(onGlyphHover).toHaveBeenLastCalledWith([]);
    expect(onGlyphHover).toHaveBeenCalledTimes(2);

    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenCalledTimes(3);
    fireEvent.mouseLeave(canvas);
    expect(onGlyphHover).toHaveBeenLastCalledWith([]);
    expect(onGlyphHover).toHaveBeenCalledTimes(4);
  });

  it('glyph 对应约束不在 constraints（陈旧 glyph）→ []', () => {
    const { canvas, viewport } = makeViewport();
    const onGlyphHover = vi.fn();
    render(
      <SketchDimensionEditor
        viewport={viewport}
        annotations={[]}
        glyphs={[{ ...GLYPH, id: 'constraint-99' }]}
        constraints={[CONSTRAINT]}
        onCommit={() => undefined}
        onGlyphHover={onGlyphHover}
      />,
    );
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).not.toHaveBeenCalled();
  });

  it('canEdit=false 不监听（无回调）', () => {
    const { canvas, onGlyphHover } = renderEditor({ canEdit: false });
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    fireEvent.mouseLeave(canvas);
    expect(onGlyphHover).not.toHaveBeenCalled();
  });

  it('悬停中卸载 → 清理回调 []（不把高亮泄漏到下一次宿主渲染）', () => {
    const { canvas, onGlyphHover, unmount } = renderEditor();
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenLastCalledWith([2, 4]);
    unmount();
    expect(onGlyphHover).toHaveBeenLastCalledWith([]);
  });

  it('constraints prop 变更 → 清除上次悬停；再次悬停命中新约束的实体集', () => {
    const { canvas, onGlyphHover, rerenderWithConstraints } = renderEditor();
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenLastCalledWith([2, 4]);

    // 约束集变化（解算/删除/undo 后重取）：旧高亮悬在过期实体上 → 必须清空。
    rerenderWithConstraints([
      { id: 1, kind: 'coincident', refs: [{ entity: 7, part: 'start' }, { entity: 7, part: 'end' }] },
    ]);
    expect(onGlyphHover).toHaveBeenLastCalledWith([]);

    // 新约束的 refs 生效（不是闭包里的旧约束）。
    onGlyphHover.mockClear();
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenLastCalledWith([7]);
  });

  it('相机变化（viewport.onViewChanged）→ 清除悬停；监听保持，可重新悬停高亮', () => {
    const { canvas, onGlyphHover, onViewChanged } = renderEditor();
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenLastCalledWith([2, 4]);
    expect(onViewChanged.addListener).toHaveBeenCalled();

    // glyph 屏幕位置随相机移动：旧高亮立即清空（mousemove 才重建）。
    act(() => onViewChanged.fire());
    expect(onGlyphHover).toHaveBeenLastCalledWith([]);

    // 清空不等于退订：相机事件后再次悬停仍按 glyph 命中回调。
    fireEvent.mouseMove(canvas, GLYPH_CENTER);
    expect(onGlyphHover).toHaveBeenLastCalledWith([2, 4]);
  });
});

// ── 2026-11-16 W10a：live dimension-dialog（按钮/失焦不关闭/窗口键位）──────────
// 线性尺寸锚点：worldToView 恒等 → 标签中心 (140,123)（layout 纯函数同源）。
const DIMENSION_ID = 2;
const DIMENSION_ANNOTATION: SketchLinearDimensionAnnotation = {
  kind: 'linear',
  id: `dimension-${DIMENSION_ID}`,
  a: Point3d.create(120, 80, 0),
  b: Point3d.create(160, 80, 0),
  side: Vector3d.create(0, 1, 0),
  text: '20',
};
const DIMENSION_CONSTRAINT: SketchConstraintDto = {
  id: DIMENSION_ID,
  kind: 'length',
  refs: [11],
  value: 20,
};
const DIMENSION_LABEL_CENTER = { clientX: 140, clientY: 123 };

function renderDimensionEditor(
  onCommit: ReturnType<typeof vi.fn> = vi.fn(),
  constraint: SketchConstraintDto = DIMENSION_CONSTRAINT,
  options?: { variables?: readonly VariableDto[]; annotationText?: string; open?: boolean },
): {
  canvas: HTMLCanvasElement;
} {
  const { canvas, viewport } = makeViewport();
  // 双击监听在 window 捕获段：canvas 必须挂在 document 上，事件才会传播到
  // window（jsdom 对游离节点只派发到节点自身）。
  canvas.dataset.testCanvas = 'dimension-editor';
  document.querySelectorAll('canvas[data-test-canvas="dimension-editor"]').forEach((stale) => stale.remove());
  document.body.appendChild(canvas);
  const annotation = options?.annotationText === undefined
    ? DIMENSION_ANNOTATION
    : { ...DIMENSION_ANNOTATION, text: options.annotationText };
  render(
    <SketchDimensionEditor
      viewport={viewport}
      annotations={[annotation]}
      constraints={[constraint]}
      variables={options?.variables}
      onCommit={onCommit as unknown as (
        constraintId: number,
        value: number,
        expression?: string,
      ) => void}
    />,
  );
  if (options?.open !== false)
    fireEvent.dblClick(canvas, DIMENSION_LABEL_CENTER);
  return { canvas };
}

describe('SketchDimensionEditor W10a：live 尺寸对话框', () => {
  it('确认/取消按钮存在，aria 标签来自 live 词条；带 Onshape sprite', () => {
    renderDimensionEditor();
    const confirm = screen.getByTestId('sketch-dimension-confirm');
    expect(confirm.getAttribute('aria-label')).toBe('确认');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.textContent).toBe('');
    const cancel = screen.getByTestId('sketch-dimension-cancel');
    expect(cancel.getAttribute('aria-label')).toBe('取消');
    expect(cancel.querySelector('svg')).not.toBeNull();
    expect(cancel.textContent).toBe('');
    // 拖拽条握把 3 枚空心方（aria-hidden，不参与可访问性树）。
    const dragbar = confirm.closest('.part-studio-dimension-editor-dialog')!
      .querySelector('.part-studio-dimension-editor-dragbar')!;
    expect(dragbar.getAttribute('aria-hidden')).toBe('true');
    expect(dragbar.querySelectorAll('.part-studio-dimension-editor-grip > span')).toHaveLength(3);
  });

  it('输入框 focusout 不关闭对话框（React blur 映射 focusout；旧 blur-cancel 会关闭）', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit);
    const input = screen.getByTestId('sketch-dimension-input');
    // React 的 onBlur 走原生 focusout——必须派发 focusOut 才能真正覆盖旧
    // blur-cancel 路径（fireEvent.blur 只派发 blur，不会触发 React onBlur）。
    fireEvent.focusOut(input);
    expect(screen.getByTestId('sketch-dimension-input')).toBeDefined();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('输入框内 Enter 只提交一次（窗口捕获段跳过输入框 target，避免双触发）', async () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit);
    const input = screen.getByTestId('sketch-dimension-input');
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(DIMENSION_ID, 30);
    await waitFor(() => expect(screen.queryByTestId('sketch-dimension-input')).toBeNull());
  });

  it('Enter 聚焦取消按钮：不提交；浏览器默认激活（click）执行取消', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit);
    const cancel = screen.getByTestId('sketch-dimension-cancel') as HTMLButtonElement;
    cancel.focus();
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Enter' });
    // 交互控件 Enter 必须放行给控件自身/浏览器默认激活——不得偷换成提交。
    expect(onCommit).not.toHaveBeenCalled();
    // jsdom 不实现 keydown→button click 的默认激活；显式 click 等价真实浏览器。
    fireEvent.click(cancel);
    expect(screen.queryByTestId('sketch-dimension-input')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Enter 聚焦外部文本输入框：不提交（对话框保持打开）', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit);
    const foreign = document.createElement('input');
    document.body.appendChild(foreign);
    try {
      foreign.focus();
      fireEvent.keyDown(foreign, { key: 'Enter' });
      expect(onCommit).not.toHaveBeenCalled();
      expect(screen.getByTestId('sketch-dimension-input')).toBeDefined();
    } finally {
      foreign.remove();
    }
  });

  it('失焦（焦点在 body）后窗口级 Enter 仍提交（commit 路径不变）', async () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit);
    const input = screen.getByTestId('sketch-dimension-input');
    fireEvent.change(input, { target: { value: '30' } });
    input.blur();
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(DIMENSION_ID, 30));
    await waitFor(() => expect(screen.queryByTestId('sketch-dimension-input')).toBeNull());
  });

  it('Escape 聚焦画布（失焦后）关闭并丢弃（不写模型）', () => {
    const onCommit = vi.fn();
    const { canvas } = renderDimensionEditor(onCommit);
    fireEvent.change(screen.getByTestId('sketch-dimension-input'), { target: { value: '999' } });
    canvas.tabIndex = 0;
    canvas.focus();
    expect(document.activeElement).toBe(canvas);
    fireEvent.keyDown(canvas, { key: 'Escape' });
    expect(screen.queryByTestId('sketch-dimension-input')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('取消按钮关闭并丢弃；确认按钮调用同一 commit 路径', async () => {
    const onCommit = vi.fn();
    const { canvas } = renderDimensionEditor(onCommit);
    const input = screen.getByTestId('sketch-dimension-input');
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.click(screen.getByTestId('sketch-dimension-cancel'));
    expect(screen.queryByTestId('sketch-dimension-input')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();

    // 重新打开（标注仍在）→ 确认按钮走 commit。
    fireEvent.dblClick(canvas, DIMENSION_LABEL_CENTER);
    const reopened = screen.getByTestId('sketch-dimension-input');
    fireEvent.change(reopened, { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('sketch-dimension-confirm'));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(DIMENSION_ID, 25));
    await waitFor(() => expect(screen.queryByTestId('sketch-dimension-input')).toBeNull());
  });
});

// ── 2026-11-16 W17：live 尺寸对话框全结构 / 拖拽 / 方向键步进 ──────────────
/** jsdom 26 无 PointerEvent（实测）：用 MouseEvent 以 pointer* 事件名派发
 *（与仓内 ViewCube/SketchStatusReadout 同一先例），坐标/按键字段可用。 */
function firePointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: MouseEventInit,
): void {
  fireEvent(element, new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 可见对话框 client 位置（包装元素 translateY(-50%)：client top = top − 13）。 */
function dialogClientPosition(dialog: HTMLElement): { left: number; top: number } {
  const wrap = dialog.parentElement as HTMLElement;
  return {
    left: parseFloat(wrap.style.left) + parseFloat(dialog.style.left),
    top: parseFloat(wrap.style.top) - DIMENSION_EDITOR_INPUT_HEIGHT / 2 + parseFloat(dialog.style.top),
  };
}

const STEP_CONSTRAINT: SketchConstraintDto = {
  id: DIMENSION_ID,
  kind: 'distance',
  refs: [11],
  value: 15.74582793,
};

describe('SketchDimensionEditor W17：live 尺寸对话框结构', () => {
  it('对话框宽 209；拖拽条带 live 类（1px #ccc 边框由 CSS 钉）；握把三枚方点', () => {
    renderDimensionEditor();
    expect(DIMENSION_EDITOR_DIALOG_WIDTH).toBe(209);
    const dialog = screen.getByTestId('sketch-dimension-dialog');
    expect(dialog.classList.contains('part-studio-dimension-editor-dialog')).toBe(true);
    const dragbar = screen.getByTestId('sketch-dimension-dragbar');
    expect(dragbar.classList.contains('part-studio-dimension-editor-dragbar')).toBe(true);
    expect(dragbar.getAttribute('aria-hidden')).toBe('true');
    expect(dragbar.querySelectorAll('.part-studio-dimension-editor-grip > span')).toHaveLength(3);
  });

  it('禁用展开器（aria-hidden、chevron 图标）与禁用参数状态切换（disabled、图标）', () => {
    renderDimensionEditor();
    const expander = screen.getByTestId('sketch-dimension-expander');
    expect(expander.classList.contains('part-studio-dimension-editor-expander')).toBe(true);
    expect(expander.getAttribute('aria-hidden')).toBe('true');
    expect(expander.querySelector('svg')).not.toBeNull();

    const toggle = screen.getByTestId('sketch-dimension-state-toggle') as HTMLButtonElement;
    expect(toggle.classList.contains('part-studio-dimension-editor-state-toggle')).toBe(true);
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.querySelector('svg')).not.toBeNull();
  });
});

describe('SketchDimensionEditor W17：拖拽条移动可见对话框', () => {
  it('pointerdown + move +40/+30 → 可见对话框跟随；重新打开复位到锚点默认位置', () => {
    const { canvas } = renderDimensionEditor();
    const dragbar = screen.getByTestId('sketch-dimension-dragbar');
    const dialog = screen.getByTestId('sketch-dimension-dialog') as HTMLElement;
    const before = dialogClientPosition(dialog);

    firePointer(dragbar, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    firePointer(dragbar, 'pointermove', { clientX: 340, clientY: 230, buttons: 1 });
    firePointer(dragbar, 'pointerup', { clientX: 340, clientY: 230 });

    const after = dialogClientPosition(dialog);
    expect(after.left - before.left).toBeCloseTo(40, 5);
    expect(after.top - before.top).toBeCloseTo(30, 5);

    // 关闭再打开：回到锚点默认偏移（-21/-13），不保留拖拽位移。
    fireEvent.click(screen.getByTestId('sketch-dimension-cancel'));
    fireEvent.dblClick(canvas, DIMENSION_LABEL_CENTER);
    const reopened = screen.getByTestId('sketch-dimension-dialog') as HTMLElement;
    expect(parseFloat(reopened.style.left)).toBe(-21);
    expect(parseFloat(reopened.style.top)).toBe(-13);
  });

  it('面板/输入区不可拖：pointerdown + move 不改变可见对话框位置', () => {
    renderDimensionEditor();
    const dialog = screen.getByTestId('sketch-dimension-dialog') as HTMLElement;
    const panel = dialog.querySelector('.part-studio-dimension-editor-panel') as HTMLElement;
    const before = dialogClientPosition(dialog);
    firePointer(panel, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    firePointer(panel, 'pointermove', { clientX: 340, clientY: 230, buttons: 1 });
    firePointer(panel, 'pointerup', { clientX: 340, clientY: 230 });
    expect(dialogClientPosition(dialog)).toEqual(before);
  });

  it('指针移出拖拽条后 window 监听继续跟手（事件目标不再是拖拽条）', () => {
    renderDimensionEditor();
    const dragbar = screen.getByTestId('sketch-dimension-dragbar');
    const dialog = screen.getByTestId('sketch-dimension-dialog') as HTMLElement;
    const before = dialogClientPosition(dialog);
    firePointer(dragbar, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    firePointer(document.body, 'pointermove', { clientX: 330, clientY: 220, buttons: 1 });
    firePointer(document.body, 'pointerup', { clientX: 330, clientY: 220 });
    const after = dialogClientPosition(dialog);
    expect(after.left - before.left).toBeCloseTo(30, 5);
    expect(after.top - before.top).toBeCloseTo(20, 5);
  });

  it('丢失 pointerup（buttons=0 的 move）：会话结束，后续悬停 move 不再移动', () => {
    renderDimensionEditor();
    const dragbar = screen.getByTestId('sketch-dimension-dragbar');
    const dialog = screen.getByTestId('sketch-dimension-dialog') as HTMLElement;
    firePointer(dragbar, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    // 丢失抬起的首次 move（按钮已为 0）→ 结束会话，不移动。
    firePointer(document.body, 'pointermove', { clientX: 330, clientY: 220, buttons: 0 });
    const afterLoss = dialogClientPosition(dialog);
    // 之后的按住移动（没有新的 pointerdown）也不得拖动。
    firePointer(document.body, 'pointermove', { clientX: 360, clientY: 240, buttons: 1 });
    expect(dialogClientPosition(dialog)).toEqual(afterLoss);
  });
});

describe('SketchDimensionEditor W17：方向键步进（live）', () => {
  it('未编辑文本按约束原始值 ±1；步进后按当前文本步进；不提交', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit, STEP_CONSTRAINT);
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    expect(input.value).toBe('15.74583');
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const steppedDown = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    expect(steppedDown.value).toBe('14.74582793');

    steppedDown.setSelectionRange(steppedDown.value.length, steppedDown.value.length);
    fireEvent.keyDown(steppedDown, { key: 'ArrowUp' });
    // 步进后文本已不是初始格式化：基线改为 Number(text) → 15.74582793。
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('15.74582793');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sketch-dimension-input')).not.toBeNull();
  });

  it('有选区时 ArrowDown 不步进（live：默认行为折叠选区）', () => {
    renderDimensionEditor(vi.fn(), STEP_CONSTRAINT);
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    input.select();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('15.74583');
  });

  it('输入法合成中的 ArrowDown 不步进（候选导航交给输入法）', () => {
    renderDimensionEditor(vi.fn(), STEP_CONSTRAINT);
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('15.74583');
  });

});

// ── 2026-11-16 W18：角度编辑器单位/初值/方向键（live）────────────────────────
const ANGLE_CONSTRAINT: SketchConstraintDto = {
  id: DIMENSION_ID,
  kind: 'angle',
  refs: [11, 12],
  value: Math.PI / 6,
};

describe('SketchDimensionEditor W18：角度编辑器（live）', () => {
  it('单位后缀 deg（不再是 °）；长度类仍 mm', () => {
    expect(dimensionEditorUnit('angle')).toBe('deg');
    expect(dimensionEditorUnit('length')).toBe('mm');
    renderDimensionEditor(vi.fn(), ANGLE_CONSTRAINT);
    expect(screen.getByTestId('sketch-dimension-unit').textContent).toBe('deg');
  });

  it('角度初值 7 位小数（度）：83.7325188；光标态 ArrowDown 步进 −1°、不提交', () => {
    const onCommit = vi.fn();
    const degrees = 83.7325188;
    renderDimensionEditor(onCommit, { ...ANGLE_CONSTRAINT, value: degrees * Math.PI / 180 });
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    expect(input.value).toBe('83.7325188');
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const steppedDown = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    expect(steppedDown.value).toBe('82.7325188');

    // 步进后文本 ≠ 初始格式化：基线改为 Number(text)（度）。
    steppedDown.setSelectionRange(steppedDown.value.length, steppedDown.value.length);
    fireEvent.keyDown(steppedDown, { key: 'ArrowUp' });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('83.7325188');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sketch-dimension-input')).not.toBeNull();
  });

  it('角度 30 → ArrowDown = 29（整数去尾零），ArrowUp 回到 30', () => {
    renderDimensionEditor(vi.fn(), ANGLE_CONSTRAINT);
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    expect(input.value).toBe('30');
    input.setSelectionRange(2, 2);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('29');
    const stepped = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    stepped.setSelectionRange(2, 2);
    fireEvent.keyDown(stepped, { key: 'ArrowUp' });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('30');
  });

  it('角度有选区/IME 合成中 ArrowDown 不步进', () => {
    renderDimensionEditor(vi.fn(), ANGLE_CONSTRAINT);
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    input.select();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('30');

    const afterSelect = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    afterSelect.setSelectionRange(2, 2);
    fireEvent.keyDown(afterSelect, { key: 'ArrowDown', isComposing: true });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('30');
  });
});

// ── W20（2026-11-16 live）：尺寸标签命中 ref（SketchEntityPicker 尺寸右键菜单）──
type DimensionLabelHitTest = (point: { x: number; y: number }) => number | null;

describe('SketchDimensionEditor W20：尺寸标签命中 ref', () => {
  it('标签中心 → 约束 id；其它位置 → null；卸载清空；覆盖层布尔契约不变', () => {
    const { viewport } = makeViewport();
    const hitRef: MutableRefObject<DimensionLabelHitTest | null> = { current: null };
    const overlayRef: MutableRefObject<((point: { x: number; y: number }) => boolean) | null> = { current: null };
    const view = render(
      <SketchDimensionEditor
        viewport={viewport}
        annotations={[DIMENSION_ANNOTATION]}
        constraints={[DIMENSION_CONSTRAINT]}
        onCommit={() => undefined}
        overlayHitTestRef={overlayRef}
        dimensionLabelHitTestRef={hitRef}
      />,
    );

    expect(hitRef.current).not.toBeNull();
    expect(hitRef.current!({ x: DIMENSION_LABEL_CENTER.clientX, y: DIMENSION_LABEL_CENTER.clientY }))
      .toBe(DIMENSION_ID);
    expect(hitRef.current!({ x: 400, y: 300 })).toBeNull();

    // 既有布尔覆盖层命中契约不变（标签命中 true、空白 false）。
    expect(overlayRef.current).not.toBeNull();
    expect(overlayRef.current!({ x: DIMENSION_LABEL_CENTER.clientX, y: DIMENSION_LABEL_CENTER.clientY }))
      .toBe(true);
    expect(overlayRef.current!({ x: 400, y: 300 })).toBe(false);

    view.unmount();
    expect(hitRef.current).toBeNull();
    expect(overlayRef.current).toBeNull();
  });
});

// ── W31-A（2026-11-17 live）：driven（参考）尺寸双击为 no-op ────────────────
// 本组只证明**双击门禁**：driven 双击不打开编辑器、不改选中；单击选中/标签
// 命中语义是设计行为（driven 标注不被整类排除），由 W20 命中 ref 用例覆盖。
describe('SketchDimensionEditor W31-A：driven 尺寸双击门禁（不打开编辑器/不改选中）', () => {
  function renderForDoubleClick(
    constraint: SketchConstraintDto,
    onSelectConstraint: (constraintId: number | null) => void,
  ): { canvas: HTMLCanvasElement } {
    const { canvas, viewport } = makeViewport();
    canvas.dataset.testCanvas = 'driven-dblclick';
    document.querySelectorAll('canvas[data-test-canvas="driven-dblclick"]').forEach((stale) => stale.remove());
    document.body.appendChild(canvas);
    render(
      <SketchDimensionEditor
        viewport={viewport}
        annotations={[DIMENSION_ANNOTATION]}
        constraints={[constraint]}
        onCommit={() => undefined}
        onSelectConstraint={onSelectConstraint}
      />,
    );
    return { canvas };
  }

  it('driven：双击标签 → 门禁不开编辑器/不选中（单击选中语义由 W20 用例覆盖）', () => {
    const onSelectConstraint = vi.fn();
    const { canvas } = renderForDoubleClick(
      { ...DIMENSION_CONSTRAINT, driven: true },
      onSelectConstraint,
    );
    fireEvent.dblClick(canvas, DIMENSION_LABEL_CENTER);
    expect(screen.queryByTestId('sketch-dimension-input')).toBeNull();
    expect(screen.queryByTestId('sketch-dimension-dialog')).toBeNull();
    expect(onSelectConstraint).not.toHaveBeenCalled();
  });

  it('driving：双击标签 → 编辑器打开并预填（现状不回归）', () => {
    const onSelectConstraint = vi.fn();
    const { canvas } = renderForDoubleClick(DIMENSION_CONSTRAINT, onSelectConstraint);
    fireEvent.dblClick(canvas, DIMENSION_LABEL_CENTER);
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('20');
    expect(onSelectConstraint).toHaveBeenCalledWith(DIMENSION_ID);
  });
});

// ── ADR-0020 S2（2026-11-17 ADR §2.6 D1–D4）：表达式输入 / 紧凑变体 / 补全 ──
const EXPRESSION_VARIABLES: VariableDto[] = [
  { id: 'v1', name: 'width', expression: '10' },
  { id: 'v2', name: 'wobble', expression: '#width * 3' },
];

describe('SketchDimensionEditor S2：标签文本观测面（data-text）', () => {
  it('canvas 标签的 DOM 镜像带 data-text（「显示表达式」e2e 断言用）', () => {
    renderDimensionEditor(vi.fn(), DIMENSION_CONSTRAINT, { annotationText: '#width', open: false });
    const marker = screen.getByTestId('sketch-dimension-label');
    expect(marker.getAttribute('data-text')).toBe('#width');
  });
});

describe('SketchDimensionEditor S2：对话框宽度变体（angle 159）', () => {
  it('angle → 159 紧凑类、无展开器/参数状态切换键；非 angle → 209', () => {
    expect(dimensionEditorDialogWidth('angle')).toBe(159);
    expect(dimensionEditorDialogWidth('length')).toBe(209);
    expect(DIMENSION_EDITOR_DIALOG_COMPACT_WIDTH).toBe(159);
    expect(DIMENSION_EDITOR_DIALOG_WIDTH).toBe(209);

    renderDimensionEditor(vi.fn(), ANGLE_CONSTRAINT);
    const dialog = screen.getByTestId('sketch-dimension-dialog');
    expect(dialog.classList.contains('part-studio-dimension-editor-dialog--compact')).toBe(true);
    expect(screen.queryByTestId('sketch-dimension-expander')).toBeNull();
    expect(screen.queryByTestId('sketch-dimension-state-toggle')).toBeNull();
    // 输入/单位不变（100×26、deg）。
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('30');
    expect(screen.getByTestId('sketch-dimension-unit').textContent).toBe('deg');
  });

  it('长度类保持 209 且保留展开器/参数状态切换键', () => {
    renderDimensionEditor();
    const dialog = screen.getByTestId('sketch-dimension-dialog');
    expect(dialog.classList.contains('part-studio-dimension-editor-dialog--compact')).toBe(false);
    expect(screen.getByTestId('sketch-dimension-expander')).toBeDefined();
    expect(screen.getByTestId('sketch-dimension-state-toggle')).toBeDefined();
  });
});

describe('SketchDimensionEditor S2：表达式预校验与提交', () => {
  it('既有表达式打开时显示原文（不是求值数）', () => {
    renderDimensionEditor(
      vi.fn(),
      { ...DIMENSION_CONSTRAINT, expression: '#width' },
      { variables: EXPRESSION_VARIABLES },
    );
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    expect(input.value).toBe('#width');
    expect((screen.getByTestId('sketch-dimension-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('无效表达式：#nope → 红下划线 + ✓ 禁用 + Enter 不提交', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit, DIMENSION_CONSTRAINT, { variables: EXPRESSION_VARIABLES });
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#nope' } });
    expect(input.getAttribute('data-error')).toBe('true');
    const confirm = screen.getByTestId('sketch-dimension-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId('sketch-dimension-input')).toBeDefined();

    // 改回有效数字 → 错误态解除、✓ 恢复。
    fireEvent.change(input, { target: { value: '20' } });
    expect(input.getAttribute('data-error')).toBe('false');
    expect((screen.getByTestId('sketch-dimension-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('表达式有效：Enter 提交求值数 + 原文（第三参）', async () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit, DIMENSION_CONSTRAINT, { variables: EXPRESSION_VARIABLES });
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#width*2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(DIMENSION_ID, 20, '#width*2');
    await waitFor(() => expect(screen.queryByTestId('sketch-dimension-input')).toBeNull());
  });

  it('纯数字仍走既有回调形状（不传 expression）', async () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit);
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('sketch-dimension-confirm'));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(DIMENSION_ID, 30);
    expect(onCommit.mock.calls[0]).toHaveLength(2);
  });

  it('表达式文本不步进（ArrowUp/Down 只对纯数字生效）', () => {
    renderDimensionEditor(
      vi.fn(),
      { ...DIMENSION_CONSTRAINT, expression: '#width' },
      { variables: EXPRESSION_VARIABLES },
    );
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    expect(input.value).toBe('#width');
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('#width');
  });
});

describe('SketchDimensionEditor S2：# 变量补全（键盘）', () => {
  it('输入 #w → 菜单；ArrowDown 高亮第二行；Enter 选中并插入 #name；不提交', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit, DIMENSION_CONSTRAINT, { variables: EXPRESSION_VARIABLES });
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#w' } });
    const listbox = screen.getByTestId('sketch-expression-autocomplete');
    expect(listbox.getAttribute('role')).toBe('listbox');
    let options = screen.getAllByTestId('sketch-expression-autocomplete-option');
    expect(options.map((option) => option.getAttribute('data-variable-name')))
      .toEqual(['width', 'wobble']);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    options = screen.getAllByTestId('sketch-expression-autocomplete-option');
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect((screen.getByTestId('sketch-dimension-input') as HTMLInputElement).value).toBe('#wobble');
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
    expect(screen.getByTestId('sketch-dimension-input')).toBeDefined();
  });

  it('补全打开时 Escape 只关闭菜单（第一次），第二次 Escape 才取消对话框', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit, DIMENSION_CONSTRAINT, { variables: EXPRESSION_VARIABLES });
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#' } });
    expect(screen.getByTestId('sketch-expression-autocomplete')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
    expect(screen.getByTestId('sketch-dimension-input')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('sketch-dimension-input')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('无匹配/无变量不渲染菜单；`#` 后无匹配时 Enter 仍按提交语义（invalid → 不提交）', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit, DIMENSION_CONSTRAINT);
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#nope' } });
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId('sketch-dimension-input')).toBeDefined();
  });

  it('光标离开 `#name` token（select 事件）→ 关闭菜单（评审 P3）', () => {
    renderDimensionEditor(vi.fn(), DIMENSION_CONSTRAINT, { variables: EXPRESSION_VARIABLES });
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#w' } });
    expect(screen.getByTestId('sketch-expression-autocomplete')).toBeDefined();

    // caret 移到文本开头：caret 前无 `#token` → 菜单收起。
    input.setSelectionRange(0, 0);
    fireEvent.select(input);
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
  });

  it('Enter 时插入不可应用（caret 已不在 token 内）→ 不吞键、收起菜单（评审 P3）', () => {
    const onCommit = vi.fn();
    renderDimensionEditor(onCommit, DIMENSION_CONSTRAINT, { variables: EXPRESSION_VARIABLES });
    const input = screen.getByTestId('sketch-dimension-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#w' } });
    expect(screen.getByTestId('sketch-expression-autocomplete')).toBeDefined();

    // 不派发 select（菜单保持打开），把 caret 移到开头 → 插入无从应用。
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
    // `#w` 不是有效变量 → 提交守卫拒绝（不写模型），对话框保持打开。
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId('sketch-dimension-input')).toBeDefined();
  });
});
