/**
 * ADR-0018 S1e：尺寸标签命中与约束 id 解析（纯逻辑）；
 * 2026-11-15：内联输入框放置（贴标签左侧）与只读单位后缀；
 * 2026-11-16 W10a：可见尺寸对话框（159×47）视口钳制（边缘标签不裁切按钮组）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto } from '@luban-cad/shared';
import type { SketchDimensionLabel } from '@luban-cad/viewer';
import {
  constraintIdFromDimensionLabel,
  hitTestSketchDimensionLabel,
} from '../internal/sketch-dimension-picker.js';
import {
  DIMENSION_EDITOR_DIALOG_HEIGHT,
  DIMENSION_EDITOR_DIALOG_WIDTH,
  DIMENSION_EDITOR_GAP,
  DIMENSION_EDITOR_INPUT_HEIGHT,
  DIMENSION_EDITOR_VIEWPORT_MARGIN,
  DIMENSION_EDITOR_WIDTH,
  computeDimensionEditorPlacement,
  constraintEntityIds,
  dimensionEditorUnit,
  layoutDimensionEditorDialog,
} from '../components/SketchDimensionEditor.js';

const label = (id: string, center: { x: number; y: number }, width = 60, height = 16): SketchDimensionLabel => ({
  id,
  kind: 'linear',
  text: '20',
  center,
  angle: 0,
  rect: {
    left: center.x - width / 2,
    top: center.y - height / 2,
    right: center.x + width / 2,
    bottom: center.y + height / 2,
  },
});

describe('constraintIdFromDimensionLabel', () => {
  it('解析 dimension-<id>', () => {
    expect(constraintIdFromDimensionLabel('dimension-12')).toBe(12);
  });

  it('非标注 id / 非安全整数 → null', () => {
    expect(constraintIdFromDimensionLabel('12')).toBeNull();
    expect(constraintIdFromDimensionLabel('dimension-')).toBeNull();
    expect(constraintIdFromDimensionLabel('dimension-99999999999999999999')).toBeNull();
  });
});

describe('hitTestSketchDimensionLabel', () => {
  const labels = [label('dimension-1', { x: 100, y: 50 }), label('dimension-2', { x: 200, y: 50 })];

  it('中心命中；边界内命中', () => {
    expect(hitTestSketchDimensionLabel(labels, { x: 102, y: 48 })?.id).toBe('dimension-1');
    expect(hitTestSketchDimensionLabel(labels, { x: 100 + 29, y: 50 })?.id).toBe('dimension-1');
  });

  it('容差外未命中', () => {
    expect(hitTestSketchDimensionLabel(labels, { x: 100, y: 50 + 12 })).toBeNull();
    expect(hitTestSketchDimensionLabel(labels, { x: 20, y: 20 })).toBeNull();
  });

  it('重叠时取中心最近者', () => {
    const overlapping = [label('dimension-1', { x: 100, y: 50 }), label('dimension-2', { x: 120, y: 50 })];
    expect(hitTestSketchDimensionLabel(overlapping, { x: 118, y: 50 })?.id).toBe('dimension-2');
    expect(hitTestSketchDimensionLabel(overlapping, { x: 102, y: 50 })?.id).toBe('dimension-1');
  });
});

describe('computeDimensionEditorPlacement（贴标签左侧）', () => {
  const canvasRect = { left: 20, top: 10 };
  const labelRect = { left: 300, top: 90, right: 340, bottom: 106 };

  it('右缘贴标签左缘左侧 gap；垂直中心对齐标签中心', () => {
    const placement = computeDimensionEditorPlacement({
      labelRect,
      canvasRect,
      click: { x: 330, y: 100 },
    });
    // 标签矩形是画布局部坐标 → client 坐标需加 canvasRect 偏移。
    expect(placement.left).toBe(20 + 300 - DIMENSION_EDITOR_GAP - DIMENSION_EDITOR_WIDTH);
    expect(placement.top).toBe(10 + (90 + 106) / 2);
    // 输入框完整落在标签左侧；可见对话框（含按钮组）会覆盖标签区域
    //（live 2026-11-16：不再承诺标签可见，只保证锚点/钳制几何）。
    expect(placement.left + DIMENSION_EDITOR_WIDTH).toBe(20 + labelRect.left - DIMENSION_EDITOR_GAP);
    expect(placement.left + DIMENSION_EDITOR_WIDTH).toBeLessThan(20 + labelRect.left);
  });

  it('无标签矩形 → 回退双击点（水平/垂直居中）', () => {
    const placement = computeDimensionEditorPlacement({
      labelRect: null,
      canvasRect,
      click: { x: 200, y: 150 },
    });
    expect(placement).toEqual({ left: 200 - DIMENSION_EDITOR_WIDTH / 2, top: 150 });
  });

  it('可覆写宽/间距（同一几何规则）', () => {
    const placement = computeDimensionEditorPlacement({
      labelRect,
      canvasRect,
      click: { x: 0, y: 0 },
      width: 80,
      gap: 12,
    });
    expect(placement.left).toBe(20 + 300 - 12 - 80);
  });
});

describe('layoutDimensionEditorDialog（可见对话框 159×47 视口钳制）', () => {
  const viewport = { width: 1024, height: 768 };

  it('未钳制：默认偏移 -1/-13（拖拽条在输入行上方），输入框中心 = 标签中心', () => {
    const anchor = { x: 400, y: 300 };
    const dialog = layoutDimensionEditorDialog({ anchor, viewport });
    expect(dialog.offsetLeft).toBe(-1);
    expect(dialog.offsetTop).toBe(-13);
    expect(dialog.left).toBe(anchor.x - 1);
    expect(dialog.top).toBe(anchor.y - DIMENSION_EDITOR_INPUT_HEIGHT / 2 - 13);
    // 输入框（26px）顶部 = 面板顶部（对话框 + 13px 拖拽条）→ 中心仍在锚点。
    expect(dialog.top + 13 + DIMENSION_EDITOR_INPUT_HEIGHT / 2).toBe(anchor.y);
  });

  it('右/上边缘标签：对话框钳制在 [4, 视口−尺寸−4]，面板与按钮不裁切', () => {
    const dialog = layoutDimensionEditorDialog({
      anchor: { x: viewport.width + 200, y: -100 },
      viewport,
    });
    expect(dialog.left).toBe(viewport.width - DIMENSION_EDITOR_DIALOG_WIDTH - DIMENSION_EDITOR_VIEWPORT_MARGIN);
    expect(dialog.top).toBe(DIMENSION_EDITOR_VIEWPORT_MARGIN);
    expect(dialog.left).toBeGreaterThanOrEqual(DIMENSION_EDITOR_VIEWPORT_MARGIN);
    expect(dialog.left + DIMENSION_EDITOR_DIALOG_WIDTH)
      .toBeLessThanOrEqual(viewport.width - DIMENSION_EDITOR_VIEWPORT_MARGIN);
    expect(dialog.top + DIMENSION_EDITOR_DIALOG_HEIGHT)
      .toBeLessThanOrEqual(viewport.height - DIMENSION_EDITOR_VIEWPORT_MARGIN);
  });

  it('左/下边缘与小于对话框的视口：仍以 4px 边距兜底，不产生负坐标', () => {
    const dialog = layoutDimensionEditorDialog({
      anchor: { x: -50, y: viewport.height + 50 },
      viewport,
    });
    expect(dialog.left).toBe(DIMENSION_EDITOR_VIEWPORT_MARGIN);
    expect(dialog.top).toBe(viewport.height - DIMENSION_EDITOR_DIALOG_HEIGHT - DIMENSION_EDITOR_VIEWPORT_MARGIN);
    const tiny = layoutDimensionEditorDialog({
      anchor: { x: 20, y: 20 },
      viewport: { width: 100, height: 40 },
    });
    expect(tiny.left).toBe(DIMENSION_EDITOR_VIEWPORT_MARGIN);
    expect(tiny.top).toBe(DIMENSION_EDITOR_VIEWPORT_MARGIN);
  });
});

describe('constraintEntityIds（E5：约束 glyph 悬停高亮实体集）', () => {
  const makeConstraint = (refs: SketchConstraintDto['refs']): SketchConstraintDto =>
    ({ id: 1, kind: 'coincident', refs });

  it('数字引用 + 带 entity 的对象引用都收集；去重后升序', () => {
    expect(constraintEntityIds(makeConstraint([
      { entity: 5, part: 'start' },
      5,
      { entity: 2, part: 'center' },
      { entity: 9, part: 'handle', index: 1 },
    ]))).toEqual([2, 5, 9]);
  });

  it('忽略 {origin:true}（原点不是可高亮草图实体）', () => {
    expect(constraintEntityIds(makeConstraint([{ origin: true }, 3]))).toEqual([3]);
    expect(constraintEntityIds(makeConstraint([{ origin: true }]))).toEqual([]);
  });

  it('畸形/非实体引用不抛、不收集', () => {
    const refs = [null, 'x', { foo: 1 }, 4] as unknown as SketchConstraintDto['refs'];
    expect(constraintEntityIds(makeConstraint(refs))).toEqual([4]);
  });
});

describe('dimensionEditorUnit（只读后缀）', () => {
  it('角度 °；长度/半径/直径/距离 mm', () => {
    expect(dimensionEditorUnit('angle')).toBe('°');
    expect(dimensionEditorUnit('length')).toBe('mm');
    expect(dimensionEditorUnit('radius')).toBe('mm');
    expect(dimensionEditorUnit('diameter')).toBe('mm');
    expect(dimensionEditorUnit('distance')).toBe('mm');
  });
});

// live 皮肤钉（jsdom 不计算样式，按仓内先例做 CSS 文本断言）：
// 2026-11-16 live dimension-dialog 计算样式。
const editorCss = readFileSync(resolve(__dirname, '../components/SketchDimensionEditor.css'), 'utf8');

/** 取选择器所属规则体（单层大括号；本仓 CSS 无嵌套——同 SketchValuePopup 先例）。
 * 取**最后一个**匹配：confirm/cancel 先出现在共享规则的选择器组里，独立规则在后。 */
function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const matches = [...editorCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  const match = matches[matches.length - 1];
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

describe('内联编辑/live 皮肤钉（2026-11-16 dimension-dialog）', () => {
  it('锚点包装 100×26 + translateY(-50%)（输入框中心=标签中心）；对话框默认 -1/-13', () => {
    const wrap = cssBlock('.part-studio-dimension-editor-wrap');
    expect(wrap).toContain('position: fixed');
    expect(wrap).toContain('width: 100px');
    expect(wrap).toContain('height: 26px');
    expect(wrap).toContain('transform: translateY(-50%)');
    expect(wrap).toContain('font: 13.3333px');
    const dialog = cssBlock('.part-studio-dimension-editor-dialog');
    expect(dialog).toContain('left: -1px');
    expect(dialog).toContain('top: -13px');
    expect(dialog).toContain('width: 159px');
  });

  it('拖拽条 159×13 白底（装饰性：默认光标，非 move）；24×14 四点握把居中', () => {
    const bar = cssBlock('.part-studio-dimension-editor-dragbar');
    expect(bar).toContain('width: 159px');
    expect(bar).toContain('height: 13px');
    expect(bar).toContain('background: #ffffff');
    expect(bar).not.toContain('cursor: move');
    const grip = cssBlock('.part-studio-dimension-editor-grip');
    expect(grip).toContain('width: 24px');
    expect(grip).toContain('height: 14px');
    expect(grip).toContain('grid-template-columns: repeat(2, 3px)');
  });

  it('面板 159×34 白底 0 圆角、0 5px 10px 阴影、下内边距 5px', () => {
    const panel = cssBlock('.part-studio-dimension-editor-panel');
    expect(panel).toContain('width: 159px');
    expect(panel).toContain('height: 34px');
    expect(panel).toContain('background: #ffffff');
    expect(panel).toContain('border-radius: 0');
    expect(panel).toContain('box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2)');
    expect(panel).toContain('padding: 0 0 5px');
  });

  it('输入 100×26 透明/无边框/radius 0、inset 下划线 #1651b0、13.3333px；错误态 #c0392b', () => {
    const field = cssBlock('.part-studio-dimension-editor-field');
    expect(field).toContain('width: 100px');
    expect(field).toContain('height: 26px');
    const input = cssBlock('.part-studio-dimension-editor');
    expect(input).toContain('border: none');
    expect(input).toContain('border-radius: 0');
    expect(input).toContain('background: transparent');
    expect(input).toContain('box-shadow: inset 0 -1px 0 #1651b0');
    expect(input).toContain('font-size: 13.3333px');
    expect(input).not.toContain('#2850aa');
    const error = cssBlock('.part-studio-dimension-editor[data-error=\'true\']');
    expect(error).toContain('box-shadow: inset 0 -1px 0 #c0392b');
    expect(error).not.toContain('border:');
  });

  it('按钮组 52×28；确认实心 #009400 白勾、取消白底 1px #cccccc 红 X、radius 4', () => {
    const buttons = cssBlock('.part-studio-dimension-editor-buttons');
    expect(buttons).toContain('width: 52px');
    expect(buttons).toContain('height: 28px');
    expect(editorCss).toMatch(
      /\.part-studio-dimension-editor-confirm,[\s\S]*?\.part-studio-dimension-editor-cancel\s*\{[^}]*width: 22px;[^}]*height: 22px;[^}]*border-radius: 4px;/,
    );
    const confirm = cssBlock('.part-studio-dimension-editor-confirm');
    expect(confirm).toContain('background: #009400');
    expect(confirm).toContain('--os-icon-fill-primary--static: #ffffff');
    const cancel = cssBlock('.part-studio-dimension-editor-cancel');
    expect(cancel).toContain('background: #ffffff');
    expect(cancel).toContain('border: 1px solid #cccccc');
    expect(cancel).not.toContain('--os-icon-accent-cancel');
  });

  it('单位后缀只读覆盖在输入右内边距；选中 glyph=纯 #e2f0fa 填充无边框', () => {
    const unit = cssBlock('.part-studio-dimension-editor-unit');
    expect(unit).toContain('position: absolute');
    expect(unit).toContain('right: 6px');
    expect(unit).toContain('pointer-events: none');
    const glyph = cssBlock('.part-studio-constraint-glyph-highlight');
    expect(glyph).toContain('background: #e2f0fa');
    // live 选中 chip 的符号仍可见：HTML 填充必须 multiply 混合（canvas 在下层）。
    expect(glyph).toContain('mix-blend-mode: multiply');
    expect(glyph).not.toContain('border');
    expect(glyph).not.toContain('border-radius');
  });
});
