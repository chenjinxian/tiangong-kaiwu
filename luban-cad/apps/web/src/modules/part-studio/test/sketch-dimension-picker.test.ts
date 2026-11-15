/**
 * ADR-0018 S1e：尺寸标签命中与约束 id 解析（纯逻辑）；
 * 2026-11-15：内联输入框放置（贴标签左侧）与只读单位后缀。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SketchDimensionLabel } from '@luban-cad/viewer';
import {
  constraintIdFromDimensionLabel,
  hitTestSketchDimensionLabel,
} from '../internal/sketch-dimension-picker.js';
import {
  DIMENSION_EDITOR_GAP,
  DIMENSION_EDITOR_WIDTH,
  computeDimensionEditorPlacement,
  dimensionEditorUnit,
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
    // 输入框完整落在标签左侧（标签保持可见、不被覆盖）。
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
// ui-evidence/dialog-audit-20261115/extra/item6-fillet-radius-popup-detail。
const editorCss = readFileSync(resolve(__dirname, '../components/SketchDimensionEditor.css'), 'utf8');

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const match = editorCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

describe('内联编辑/live 皮肤钉', () => {
  it('输入 100×26 白底 1px #2850aa radius 2 无阴影 13.3333px', () => {
    const wrap = cssBlock('.part-studio-dimension-editor-wrap');
    expect(wrap).toContain('width: 100px');
    expect(wrap).toContain('height: 26px');
    expect(wrap).toContain('transform: translateY(-50%)');
    expect(wrap).toContain('font: 13.3333px');
    const input = cssBlock('.part-studio-dimension-editor');
    expect(input).toContain('border: 1px solid #2850aa');
    expect(input).toContain('border-radius: 2px');
    expect(input).toContain('box-shadow: none');
    expect(input).toContain('background: #ffffff');
    expect(input).not.toContain('translate(-50%');
  });

  it('单位后缀只读覆盖在输入右内边距；选中 glyph=纯 #e2f0fa 填充无边框', () => {
    const unit = cssBlock('.part-studio-dimension-editor-unit');
    expect(unit).toContain('position: absolute');
    expect(unit).toContain('right: 6px');
    expect(unit).toContain('pointer-events: none');
    const glyph = cssBlock('.part-studio-constraint-glyph-highlight');
    expect(glyph).toContain('background: #e2f0fa');
    expect(glyph).not.toContain('border');
    expect(glyph).not.toContain('border-radius');
  });
});
