/**
 * ADR-0018 S1e：尺寸标签命中与约束 id 解析（纯逻辑）；
 * 2026-11-15：内联输入框放置（贴标签左侧）与只读单位后缀；
 * 2026-11-16 W10a：可见尺寸对话框视口钳制（边缘标签不裁切按钮组）；
 * 2026-11-16 W17：对话框 209×47（面板向左扩展 21px，默认偏移 -21/-13）。
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
  clampDimensionEditorPosition,
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

  it('负数 id = 工具预览尺寸哨兵（S2v；dimension--1000 → -1000）', () => {
    expect(constraintIdFromDimensionLabel('dimension--1000')).toBe(-1000);
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

describe('layoutDimensionEditorDialog（可见对话框 209×47 视口钳制）', () => {
  const viewport = { width: 1024, height: 768 };

  it('未钳制：默认偏移 -21/-13（面板向左扩展 21px），输入框中心 = 标签中心', () => {
    const anchor = { x: 400, y: 300 };
    const dialog = layoutDimensionEditorDialog({ anchor, viewport });
    expect(dialog.offsetLeft).toBe(-21);
    expect(dialog.offsetTop).toBe(-13);
    expect(dialog.left).toBe(anchor.x - 21);
    expect(dialog.top).toBe(anchor.y - DIMENSION_EDITOR_INPUT_HEIGHT / 2 - 13);
    // 输入框（26px）顶部 = 面板顶部（对话框 + 13px 拖拽条）→ 中心仍在锚点。
    expect(dialog.top + 13 + DIMENSION_EDITOR_INPUT_HEIGHT / 2).toBe(anchor.y);
    // 输入框左缘 = 面板左缘 + 21（面板 x+21 处是输入框）→ 恰在锚点。
    expect(dialog.left + 21).toBe(anchor.x);
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

// ── ADR-0020 S2 评审 P2：angle 紧凑变体（159 宽 / inputOffset 1）纯几何 ──────
describe('layoutDimensionEditorDialog（angle 159×47 紧凑变体）', () => {
  const viewport = { width: 1024, height: 768 };

  it('未钳制：inputOffset=1 → offsetLeft=-1；输入框左缘/垂直中心仍贴锚点', () => {
    const anchor = { x: 400, y: 300 };
    const dialog = layoutDimensionEditorDialog({ anchor, viewport, width: 159, inputOffset: 1 });
    expect(dialog.offsetLeft).toBe(-1);
    expect(dialog.offsetTop).toBe(-13);
    expect(dialog.left).toBe(anchor.x - 1);
    expect(dialog.left + 1).toBe(anchor.x);
    expect(dialog.top + 13 + DIMENSION_EDITOR_INPUT_HEIGHT / 2).toBe(anchor.y);
  });

  it('右边缘：按 159（不是 209）钳制在 [4, 视口−159−4]', () => {
    const dialog = layoutDimensionEditorDialog({
      anchor: { x: viewport.width + 100, y: 300 },
      viewport,
      width: 159,
      inputOffset: 1,
    });
    expect(dialog.left).toBe(viewport.width - 159 - DIMENSION_EDITOR_VIEWPORT_MARGIN);
    expect(dialog.left + 159).toBeLessThanOrEqual(viewport.width - DIMENSION_EDITOR_VIEWPORT_MARGIN);
  });
});

describe('clampDimensionEditorPosition（拖拽位置 159 宽）', () => {
  const viewport = { width: 1024, height: 768 };

  it('右/下越界：按 159 宽与 47 高钳制到 4px 边距', () => {
    expect(clampDimensionEditorPosition({ left: 5000, top: 5000 }, viewport, 4, 159)).toEqual({
      left: viewport.width - 159 - DIMENSION_EDITOR_VIEWPORT_MARGIN,
      top: viewport.height - DIMENSION_EDITOR_DIALOG_HEIGHT - DIMENSION_EDITOR_VIEWPORT_MARGIN,
    });
    // 视口内原样返回（宽度参数不影响合法位置）。
    expect(clampDimensionEditorPosition({ left: 300, top: 200 }, viewport, 4, 159))
      .toEqual({ left: 300, top: 200 });
  });
});

describe('clampDimensionEditorPosition（拖拽位置 209×47 视口钳制）', () => {
  const viewport = { width: 1024, height: 768 };

  it('视口内原样返回；越界钳制到 4px 边距', () => {
    expect(clampDimensionEditorPosition({ left: 300, top: 200 }, viewport)).toEqual({ left: 300, top: 200 });
    expect(clampDimensionEditorPosition({ left: -100, top: -100 }, viewport))
      .toEqual({ left: DIMENSION_EDITOR_VIEWPORT_MARGIN, top: DIMENSION_EDITOR_VIEWPORT_MARGIN });
    expect(clampDimensionEditorPosition({ left: 5000, top: 5000 }, viewport)).toEqual({
      left: viewport.width - DIMENSION_EDITOR_DIALOG_WIDTH - DIMENSION_EDITOR_VIEWPORT_MARGIN,
      top: viewport.height - DIMENSION_EDITOR_DIALOG_HEIGHT - DIMENSION_EDITOR_VIEWPORT_MARGIN,
    });
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
  it('角度 deg（live W18）；长度/半径/直径/距离 mm', () => {
    expect(dimensionEditorUnit('angle')).toBe('deg');
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

describe('内联编辑/live 皮肤钉（2026-11-16 W17 dimension-dialog）', () => {
  it('锚点包装 100×26 + translateY(-50%)（输入框中心=标签中心）；对话框默认 -21/-13、宽 209', () => {
    const wrap = cssBlock('.part-studio-dimension-editor-wrap');
    expect(wrap).toContain('position: fixed');
    expect(wrap).toContain('width: 100px');
    expect(wrap).toContain('height: 26px');
    expect(wrap).toContain('transform: translateY(-50%)');
    expect(wrap).toContain('font: 13.3333px');
    const dialog = cssBlock('.part-studio-dimension-editor-dialog');
    expect(dialog).toContain('left: -21px');
    expect(dialog).toContain('top: -13px');
    expect(dialog).toContain('width: 209px');
  });

  it('拖拽条 209×13 白底 + 1px #cccccc 边框、cursor move；24×14 三枚 7×7 空心方握把', () => {
    const bar = cssBlock('.part-studio-dimension-editor-dragbar');
    expect(bar).toContain('box-sizing: border-box');
    expect(bar).toContain('width: 209px');
    expect(bar).toContain('height: 13px');
    expect(bar).toContain('background: #ffffff');
    expect(bar).toContain('border: 1px solid #cccccc');
    expect(bar).toContain('cursor: move');
    expect(bar).toContain('touch-action: none');
    const grip = cssBlock('.part-studio-dimension-editor-grip');
    expect(grip).toContain('display: flex');
    expect(grip).toContain('width: 24px');
    expect(grip).toContain('height: 14px');
    expect(grip).toContain('gap: 1px');
    const square = cssBlock('.part-studio-dimension-editor-grip > span');
    expect(square).toContain('width: 7px');
    expect(square).toContain('height: 7px');
    expect(square).toContain('border: 1px solid #333333');
    expect(square).toContain('background: transparent');
  });

  it('面板 209×34 白底 0 圆角、0 5px 10px 阴影、下内边距 5px', () => {
    const panel = cssBlock('.part-studio-dimension-editor-panel');
    expect(panel).toContain('width: 209px');
    expect(panel).toContain('height: 34px');
    expect(panel).toContain('background: #ffffff');
    expect(panel).toContain('border-radius: 0');
    expect(panel).toContain('box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2)');
    expect(panel).toContain('padding: 0 0 5px');
  });

  it('禁用展开器 20×20 #d7d7d7 不可点；禁用参数状态切换 20×20 rgba(16,16,16,0.3) radius 3', () => {
    const expander = cssBlock('.part-studio-dimension-editor-expander');
    expect(expander).toContain('width: 20px');
    expect(expander).toContain('height: 20px');
    expect(expander).toContain('margin: 3px 0 0 1px');
    expect(expander).toContain('color: #d7d7d7');
    expect(expander).toContain('pointer-events: none');
    const toggle = cssBlock('.part-studio-dimension-editor-state-toggle');
    expect(toggle).toContain('width: 20px');
    expect(toggle).toContain('height: 20px');
    expect(toggle).toContain('margin: 5px 0 0 5px');
    expect(toggle).toContain('border-radius: 3px');
    expect(toggle).toContain('background: transparent');
    expect(toggle).toContain('color: rgba(16, 16, 16, 0.3)');
    expect(toggle).toContain('cursor: not-allowed');
  });

  it('输入 100×26 透明/无边框/radius 0、inset 下划线 #1651b0、左内边距 3px；错误态 #c0392b', () => {
    const field = cssBlock('.part-studio-dimension-editor-field');
    expect(field).toContain('width: 100px');
    expect(field).toContain('height: 26px');
    const input = cssBlock('.part-studio-dimension-editor');
    expect(input).toContain('border: none');
    expect(input).toContain('border-radius: 0');
    expect(input).toContain('background: transparent');
    expect(input).toContain('box-shadow: inset 0 -1px 0 #1651b0');
    expect(input).toContain('font-size: 13.3333px');
    expect(input).toContain('padding: 0 24px 0 3px');
    expect(input).not.toContain('#2850aa');
    const error = cssBlock('.part-studio-dimension-editor[data-error=\'true\']');
    expect(error).toContain('box-shadow: inset 0 -1px 0 #c0392b');
    expect(error).not.toContain('border:');
  });

  it('按钮组 52×28（padding 5px 0 0 4px、4px 间距）；确认实心 #009400 白勾、取消白底 1px #cccccc 红 X、radius 4', () => {
    const buttons = cssBlock('.part-studio-dimension-editor-buttons');
    expect(buttons).toContain('width: 52px');
    expect(buttons).toContain('height: 28px');
    expect(buttons).toContain('gap: 4px');
    expect(buttons).toContain('padding: 5px 0 0 4px');
    expect(buttons).toContain('margin-left: 5px');
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
