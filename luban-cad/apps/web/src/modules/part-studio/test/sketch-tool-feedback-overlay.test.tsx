// src/modules/part-studio/test/sketch-tool-feedback-overlay.test.tsx
//
// 草图工具反馈覆盖层（2026-11-15 E4 Onshape live）：阶段提示=顶部居中浅蓝
// pill（ⓘ 图标 + 文案），光标旁白卡片只保留实时尺寸（无尺寸不渲染）。
// 样式钉走 CSS 文本断言（jsdom 不算样式；repo 既有约定）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SketchToolFeedbackOverlay } from '../components/SketchToolFeedbackOverlay.js';
import {
  clearSketchToolFeedback,
  publishSketchToolFeedback,
  publishSketchToolHint,
} from '../tools/sketch/sketch-tool-feedback.js';

afterEach(() => clearSketchToolFeedback());

const overlayCss = readFileSync(
  resolve(__dirname, '../components/SketchToolFeedbackOverlay.css'),
  'utf8',
);

/** 取选择器所属规则体（单层大括号；本仓 CSS 无嵌套——同 SketchValuePopup.test 先例）。 */
function cssRuleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const matches = [...overlayCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  const match = matches[matches.length - 1];
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

describe('SketchToolFeedbackOverlay（顶部提示 pill + 光标旁尺寸卡片）', () => {
  it('hint + measures + cursor：顶部 pill 显示提示，卡片只显示尺寸且不含提示文案', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Rectangle',
      hint: '点击放置矩形对角点',
      measures: [{ labelKey: 'partStudio.sketch.live.width', value: '82.55' }],
      cursor: { x: 500, y: 300 },
    });
    render(<SketchToolFeedbackOverlay />);

    const pill = screen.getByTestId('sketch-tool-hint');
    expect(pill.className).toContain('part-studio-sketch-hint-pill');
    expect(pill.getAttribute('data-tool')).toBe('Sketch.Rectangle');
    expect(pill.textContent).toContain('点击放置矩形对角点');
    expect(pill.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    const card = screen.getByTestId('sketch-tool-feedback');
    expect(card.getAttribute('data-measures')).toBe('width=82.55');
    expect(card.textContent).toContain('82.55');
    expect(card.textContent).not.toContain('点击放置矩形对角点');
    expect(card.querySelector('.part-studio-sketch-hint-pill')).toBeNull();
  });

  it('hint-only + cursor：pill 渲染，无白卡片', () => {
    publishSketchToolHint('Sketch.Mirror', '选择要镜像的实体', { x: 220, y: 180 });
    render(<SketchToolFeedbackOverlay />);

    expect(screen.getByTestId('sketch-tool-hint').textContent).toContain('选择要镜像的实体');
    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
  });

  it('hint-only 无 cursor：pill 仍然渲染，无卡片', () => {
    publishSketchToolHint('Sketch.Mirror', '选择镜像线');
    render(<SketchToolFeedbackOverlay />);

    expect(screen.getByTestId('sketch-tool-hint').textContent).toContain('选择镜像线');
    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
  });

  it('measures-only + cursor：卡片渲染，无 pill', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Line',
      measures: [{ labelKey: 'partStudio.sketch.live.length', value: '42' }],
      cursor: { x: 120, y: 90 },
    });
    render(<SketchToolFeedbackOverlay />);

    expect(screen.getByTestId('sketch-tool-feedback').getAttribute('data-measures')).toBe('length=42');
    expect(screen.queryByTestId('sketch-tool-hint')).toBeNull();
  });

  it('measures 无 cursor：不渲染卡片（保持既有行为）', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Line',
      measures: [{ labelKey: 'partStudio.sketch.live.length', value: '42' }],
    });
    const { container } = render(<SketchToolFeedbackOverlay />);

    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('无 feedback：不渲染任何内容', () => {
    const { container } = render(<SketchToolFeedbackOverlay />);
    expect(container.innerHTML).toBe('');
  });
});

describe('SketchToolFeedbackOverlay 样式钉版（CSS 文本）', () => {
  it('顶部 pill：Onshape live 实测 token（#e2f0fa / #1c4070 / 13px / 4px / 10px / 50%）', () => {
    const pill = cssRuleBlock('.part-studio-sketch-hint-pill');
    expect(pill).toMatch(/position:\s*absolute/);
    expect(pill).toMatch(/top:\s*10px/);
    expect(pill).toMatch(/left:\s*50%/);
    expect(pill).toMatch(/transform:\s*translateX\(-50%\)/);
    expect(pill).toMatch(/background:\s*#e2f0fa/);
    expect(pill).toMatch(/color:\s*#1c4070/);
    expect(pill).toMatch(/font-size:\s*13px/);
    expect(pill).toMatch(/border-radius:\s*4px/);
    expect(pill).toMatch(/white-space:\s*nowrap/);
    expect(pill).toMatch(/pointer-events:\s*none/);
    expect(pill).toMatch(/user-select:\s*none/);
  });

  it('光标旁卡片保留白底（尺寸承载方）', () => {
    const card = cssRuleBlock('.part-studio-sketch-feedback');
    expect(card).toMatch(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.97\)/);
  });
});
