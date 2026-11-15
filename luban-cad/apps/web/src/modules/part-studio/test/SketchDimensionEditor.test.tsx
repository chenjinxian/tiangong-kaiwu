/**
 * 2026-11-15 E5（Onshape live 悬停非尺寸约束 glyph）：SketchDimensionEditor
 * 的画布 mousemove 命中 glyph → 按约束收集引用实体 id 回调（升序去重）；
 * 未命中/mouseleave 回调空数组；同一集合不重复回调；canEdit=false 不监听。
 * 只做显示联动，不改变选择/模型（断言回调载荷即可）。
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchConstraintDto } from '@luban-cad/shared';
import type { SketchConstraintGlyphAnnotation } from '@luban-cad/viewer';
import { SketchDimensionEditor } from '../components/SketchDimensionEditor.js';

function makeViewport(): { canvas: HTMLCanvasElement; viewport: ScreenViewport } {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    }),
  });
  const viewport = {
    canvas,
    worldToView: (point: Point3d) => ({ x: point.x, y: point.y }),
    onViewChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  } as unknown as ScreenViewport;
  return { canvas, viewport };
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

function renderEditor(options?: { canEdit?: boolean }): {
  canvas: HTMLCanvasElement;
  onGlyphHover: ReturnType<typeof vi.fn>;
} {
  const { canvas, viewport } = makeViewport();
  const onGlyphHover = vi.fn();
  render(
    <SketchDimensionEditor
      viewport={viewport}
      annotations={[]}
      glyphs={[GLYPH]}
      constraints={[CONSTRAINT]}
      canEdit={options?.canEdit ?? true}
      onCommit={() => undefined}
      onGlyphHover={onGlyphHover}
    />,
  );
  return { canvas, onGlyphHover };
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
});
