/**
 * 2026-11-15 E5（Onshape live 悬停非尺寸约束 glyph）：SketchDimensionEditor
 * 的画布 mousemove 命中 glyph → 按约束收集引用实体 id 回调（升序去重）；
 * 未命中/mouseleave 回调空数组；同一集合不重复回调；canEdit=false 不监听。
 * 只做显示联动，不改变选择/模型（断言回调载荷即可）。
 *
 * 2026-11-16 W10a（live dimension-dialog）：确认/取消按钮存在且带 live aria
 * 标签；输入框 blur 不关闭对话框（旧 blur-cancel 行为会关闭）；失焦后窗口级
 * Enter/Escape 仍生效；确认走同一 commit 路径、取消丢弃（不写模型）。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchConstraintDto } from '@luban-cad/shared';
import type { SketchConstraintGlyphAnnotation, SketchLinearDimensionAnnotation } from '@luban-cad/viewer';
import { SketchDimensionEditor } from '../components/SketchDimensionEditor.js';

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

function renderDimensionEditor(onCommit: ReturnType<typeof vi.fn> = vi.fn()): {
  canvas: HTMLCanvasElement;
} {
  const { canvas, viewport } = makeViewport();
  // 双击监听在 window 捕获段：canvas 必须挂在 document 上，事件才会传播到
  // window（jsdom 对游离节点只派发到节点自身）。
  canvas.dataset.testCanvas = 'dimension-editor';
  document.querySelectorAll('canvas[data-test-canvas="dimension-editor"]').forEach((stale) => stale.remove());
  document.body.appendChild(canvas);
  render(
    <SketchDimensionEditor
      viewport={viewport}
      annotations={[DIMENSION_ANNOTATION]}
      constraints={[DIMENSION_CONSTRAINT]}
      onCommit={onCommit as unknown as (constraintId: number, value: number) => void}
    />,
  );
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
    // 拖拽条握把 4 个方点（aria-hidden，不参与可访问性树）。
    const dragbar = confirm.closest('.part-studio-dimension-editor-dialog')!
      .querySelector('.part-studio-dimension-editor-dragbar')!;
    expect(dragbar.getAttribute('aria-hidden')).toBe('true');
    expect(dragbar.querySelectorAll('.part-studio-dimension-editor-grip > span')).toHaveLength(4);
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
