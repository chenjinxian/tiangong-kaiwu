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

/** 从内联 transform 提取 rotate 角度（jsdom 不算样式，读 React 写入的字符串）。 */
function rotationDeg(element: HTMLElement): number {
  const match = /rotate\((-?[\d.]+)deg\)/.exec(element.style.transform);
  return match ? Number(match[1]) : Number.NaN;
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

  it('badge + hint + measures：徽标按 (x,y) 渲染，含圆点/文本，且不在尺寸卡片内', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Fillet',
      hint: '点击圆角移除',
      measures: [{ labelKey: 'partStudio.sketch.live.width', value: '82.55' }],
      cursor: { x: 500, y: 300 },
      badge: { x: 260, y: 240, text: 'R5' },
    });
    render(<SketchToolFeedbackOverlay />);

    const badge = screen.getByTestId('sketch-tool-badge');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.style.left).toBe('260px');
    expect(badge.style.top).toBe('240px');
    expect(badge.textContent).toContain('R5');
    expect(badge.querySelector('.part-studio-sketch-hint-badge__dot')).not.toBeNull();
    expect(screen.getByTestId('sketch-tool-hint').textContent).toContain('点击圆角移除');

    const card = screen.getByTestId('sketch-tool-feedback');
    expect(card.contains(badge)).toBe(false);
  });

  it('无 badge 的反馈：不渲染徽标', () => {
    publishSketchToolHint('Sketch.Fillet', '点击圆角移除', { x: 100, y: 100 });
    render(<SketchToolFeedbackOverlay />);

    expect(screen.getByTestId('sketch-tool-hint')).not.toBeNull();
    expect(screen.queryByTestId('sketch-tool-badge')).toBeNull();
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

  it('drawLabels（edge）：宽/高贴在对应边中点外侧，且不再渲染同项白卡片', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Rectangle',
      hint: '点击放置矩形对角点',
      measures: [
        { labelKey: 'partStudio.sketch.live.width', value: '82.55' },
        { labelKey: 'partStudio.sketch.live.height', value: '19.05' },
      ],
      cursor: { x: 200, y: 200 },
      drawLabels: [
        {
          kind: 'edge',
          labelKey: 'partStudio.sketch.live.width',
          value: '82.55',
          start: { x: 100, y: 100 },
          end: { x: 200, y: 100 },
        },
        {
          kind: 'edge',
          labelKey: 'partStudio.sketch.live.height',
          value: '19.05',
          start: { x: 200, y: 100 },
          end: { x: 200, y: 200 },
        },
      ],
    });
    render(<SketchToolFeedbackOverlay />);

    const width = screen.getByTestId('sketch-draw-edge-label-width');
    expect(width.textContent).toBe('82.55');
    expect(width.getAttribute('aria-hidden')).toBe('true');
    expect(width.style.left).toBe('150px');
    expect(width.style.top).toBe('92px');
    expect(rotationDeg(width)).toBeCloseTo(0, 6);

    const height = screen.getByTestId('sketch-draw-edge-label-height');
    expect(height.textContent).toBe('19.05');
    expect(height.style.left).toBe('208px');
    expect(height.style.top).toBe('150px');
    expect(rotationDeg(height)).toBeCloseTo(90, 6);

    // 阶段提示 pill 保留；两项尺寸已贴边，白卡片不再出现。
    expect(screen.getByTestId('sketch-tool-hint').textContent).toContain('点击放置矩形对角点');
    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
  });

  it('drawLabels（edge）：对角边 45° 旋转，反向边翻正（不加 180° 颠倒）', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Rectangle',
      measures: [
        { labelKey: 'partStudio.sketch.live.width', value: '10' },
        { labelKey: 'partStudio.sketch.live.height', value: '10' },
      ],
      cursor: { x: 200, y: 200 },
      drawLabels: [
        {
          kind: 'edge',
          labelKey: 'partStudio.sketch.live.width',
          value: '10',
          start: { x: 100, y: 100 },
          end: { x: 200, y: 200 },
        },
        {
          kind: 'edge',
          labelKey: 'partStudio.sketch.live.height',
          value: '10',
          start: { x: 200, y: 200 },
          end: { x: 100, y: 100 },
        },
      ],
    });
    render(<SketchToolFeedbackOverlay />);

    const width = screen.getByTestId('sketch-draw-edge-label-width');
    const height = screen.getByTestId('sketch-draw-edge-label-height');
    expect(rotationDeg(width)).toBeCloseTo(45, 6);
    expect(rotationDeg(height)).toBeCloseTo(45, 6); // −135° + 180°
  });

  it('零长度边（投影折叠）：该边不渲染标签，对应 measure 回落白卡片（不静默消失）', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Rectangle',
      measures: [
        { labelKey: 'partStudio.sketch.live.width', value: '0' },
        { labelKey: 'partStudio.sketch.live.height', value: '100' },
      ],
      cursor: { x: 100, y: 200 },
      drawLabels: [
        // 第二角点与第一角点同 u：宽边两端点投影重合（零长度）。
        {
          kind: 'edge',
          labelKey: 'partStudio.sketch.live.width',
          value: '0',
          start: { x: 100, y: 100 },
          end: { x: 100, y: 100 },
        },
        {
          kind: 'edge',
          labelKey: 'partStudio.sketch.live.height',
          value: '100',
          start: { x: 100, y: 100 },
          end: { x: 100, y: 200 },
        },
      ],
    });
    render(<SketchToolFeedbackOverlay />);

    expect(screen.queryByTestId('sketch-draw-edge-label-width')).toBeNull();
    expect(screen.getByTestId('sketch-draw-edge-label-height').textContent).toBe('100');
    // 宽度的边标签没渲染 → 仍进白卡片；高度已贴边 → 不进卡片。
    expect(screen.getByTestId('sketch-tool-feedback').getAttribute('data-measures')).toBe('width=0');
  });

  it('无 drawLabels 时行为不变：线长仍用白卡片', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Line',
      measures: [{ labelKey: 'partStudio.sketch.live.length', value: '42' }],
      cursor: { x: 120, y: 90 },
    });
    render(<SketchToolFeedbackOverlay />);

    expect(screen.getByTestId('sketch-tool-feedback').getAttribute('data-measures')).toBe('length=42');
    expect(screen.queryByTestId('sketch-draw-edge-label-length')).toBeNull();
    expect(screen.queryByTestId('sketch-draw-edge-label-width')).toBeNull();
  });

  it('drawLabels（edge·直线）：长度贴在线中点上方并随线旋转，角度卡一并抑制（无白卡片）', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Line',
      measures: [
        { labelKey: 'partStudio.sketch.live.length', value: '14.14' },
        { labelKey: 'partStudio.sketch.live.angle', value: '45.0°' },
      ],
      cursor: { x: 200, y: 200 },
      drawLabels: [{
        kind: 'edge',
        labelKey: 'partStudio.sketch.live.length',
        value: '14.14',
        start: { x: 100, y: 100 },
        end: { x: 200, y: 200 },
        // live：直线拖拽同一帧只有旋转的长度读数，没有白卡片。
        suppressesLabelKeys: ['partStudio.sketch.live.angle'],
      }],
    });
    render(<SketchToolFeedbackOverlay />);

    const label = screen.getByTestId('sketch-draw-edge-label-length');
    expect(label.textContent).toBe('14.14');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    // 单条边标签的内部参考点=自身中点 → 法线不翻转：右向对角边偏移到上方。
    const offset = 8 * Math.SQRT1_2;
    expect(Number.parseFloat(label.style.left)).toBeCloseTo(150 + offset, 6);
    expect(Number.parseFloat(label.style.top)).toBeCloseTo(150 - offset, 6);
    expect(rotationDeg(label)).toBeCloseTo(45, 6);

    // 长度已贴边 + 角度被同一标签抑制 → 不渲染白卡片。
    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
  });

  it('drawLabels（edge·直线）：未声明抑制角度时角度仍留白卡片（抑制按 key 驱动，不按工具一刀切）', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Line',
      measures: [
        { labelKey: 'partStudio.sketch.live.length', value: '14.14' },
        { labelKey: 'partStudio.sketch.live.angle', value: '45.0°' },
      ],
      cursor: { x: 200, y: 200 },
      drawLabels: [{
        kind: 'edge',
        labelKey: 'partStudio.sketch.live.length',
        value: '14.14',
        start: { x: 100, y: 100 },
        end: { x: 200, y: 200 },
      }],
    });
    render(<SketchToolFeedbackOverlay />);

    expect(screen.getByTestId('sketch-tool-feedback').getAttribute('data-measures')).toBe('angle=45.0°');
  });

  it('drawLabels（point·圆）：Ø 直径标签水平落在半径段中点，半径白卡片被抑制', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.CenterCircle',
      hint: '点击放置圆半径点',
      measures: [{ labelKey: 'partStudio.sketch.live.radius', value: '5' }],
      cursor: { x: 160, y: 140 },
      drawLabels: [{
        kind: 'point',
        labelKey: 'partStudio.sketch.live.diameter',
        suppressesLabelKeys: ['partStudio.sketch.live.radius'],
        value: '10',
        point: { x: 130, y: 120 },
        prefix: 'Ø',
      }],
    });
    render(<SketchToolFeedbackOverlay />);

    const label = screen.getByTestId('sketch-draw-point-label-diameter');
    expect(label.textContent).toBe('Ø10');
    expect(label.className).toContain('part-studio-sketch-draw-label');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(label.style.left).toBe('130px');
    expect(label.style.top).toBe('120px');
    // 水平不旋转：只有居中平移，没有 rotate。
    expect(label.style.transform).toBe('translate(-50%, -50%)');
    expect(label.style.transform).not.toContain('rotate');

    // 半径卡被直径点标签替代；阶段提示 pill 保留。
    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
    expect(screen.getByTestId('sketch-tool-hint').textContent).toContain('点击放置圆半径点');
  });

  it('drawLabels（point）与未配对的 measure：白卡片只保留未替代项', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.CenterCircle',
      measures: [
        { labelKey: 'partStudio.sketch.live.radius', value: '5' },
        { labelKey: 'partStudio.sketch.live.angle', value: '0.0°' },
      ],
      cursor: { x: 160, y: 140 },
      drawLabels: [{
        kind: 'point',
        labelKey: 'partStudio.sketch.live.diameter',
        suppressesLabelKeys: ['partStudio.sketch.live.radius'],
        value: '10',
        point: { x: 130, y: 120 },
        prefix: 'Ø',
      }],
    });
    render(<SketchToolFeedbackOverlay />);

    expect(screen.getByTestId('sketch-draw-point-label-diameter').textContent).toBe('Ø10');
    expect(screen.getByTestId('sketch-tool-feedback').getAttribute('data-measures')).toBe('angle=0.0°');
  });

  it('drawLabels（point·三点圆弧）：R 半径标签水平落在弧中点外侧，半径白卡片被抑制', () => {
    publishSketchToolFeedback({
      toolId: 'Sketch.Arc3Point',
      hint: '点击放置圆弧上的点',
      measures: [{ labelKey: 'partStudio.sketch.live.radius', value: '1.897' }],
      cursor: { x: 180, y: 60 },
      drawLabels: [{
        kind: 'point',
        labelKey: 'partStudio.sketch.live.radius',
        suppressesLabelKeys: ['partStudio.sketch.live.radius'],
        value: '1.897',
        point: { x: 140, y: 110 },
        prefix: 'R',
      }],
    });
    render(<SketchToolFeedbackOverlay />);

    const label = screen.getByTestId('sketch-draw-point-label-radius');
    expect(label.textContent).toBe('R1.897');
    expect(label.className).toContain('part-studio-sketch-draw-label');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(label.style.left).toBe('140px');
    expect(label.style.top).toBe('110px');
    // 水平不旋转：只有居中平移，没有 rotate。
    expect(label.style.transform).toBe('translate(-50%, -50%)');
    expect(label.style.transform).not.toContain('rotate');

    // 半径卡被 R 点标签替代（live 同帧无白卡片）；阶段提示 pill 保留。
    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
    expect(screen.getByTestId('sketch-tool-hint').textContent).toContain('点击放置圆弧上的点');
  });

  it('drawLabels（point·内切多边形）：Ø 直径标签复用圆心→光标半径段中点口径，半径白卡片被抑制', () => {
    publishSketchToolFeedback({
      toolId: 'sketchInscribedPolygon',
      hint: '点击确定构造圆半径',
      measures: [{ labelKey: 'partStudio.sketch.live.radius', value: '3.576' }],
      cursor: { x: 160, y: 140 },
      drawLabels: [{
        kind: 'point',
        labelKey: 'partStudio.sketch.live.diameter',
        suppressesLabelKeys: ['partStudio.sketch.live.radius'],
        value: '7.15',
        point: { x: 130, y: 120 },
        prefix: 'Ø',
      }],
    });
    render(<SketchToolFeedbackOverlay />);

    const label = screen.getByTestId('sketch-draw-point-label-diameter');
    expect(label.textContent).toBe('Ø7.15');
    expect(label.style.left).toBe('130px');
    expect(label.style.top).toBe('120px');
    // 水平不旋转：只有居中平移，没有 rotate。
    expect(label.style.transform).toBe('translate(-50%, -50%)');
    expect(label.style.transform).not.toContain('rotate');

    // 半径卡被 Ø 点标签替代（与圆同一抑制配对）；阶段提示 pill 保留。
    expect(screen.queryByTestId('sketch-tool-feedback')).toBeNull();
    expect(screen.getByTestId('sketch-tool-hint').textContent).toContain('点击确定构造圆半径');
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

  it('画布数值标签（边/点共用）：Onshape live token（#4a90e2 / 13.3333px / 无底色描边）', () => {
    const label = cssRuleBlock('.part-studio-sketch-draw-label');
    expect(label).toMatch(/position:\s*absolute/);
    expect(label).toMatch(/color:\s*#4a90e2/);
    expect(label).toMatch(/font-size:\s*13\.3333px/);
    expect(label).toMatch(/pointer-events:\s*none/);
    expect(label).toMatch(/white-space:\s*nowrap/);
    expect(label).not.toMatch(/background/);
    expect(label).not.toMatch(/border/);
    expect(label).not.toMatch(/box-shadow/);
  });

  it('悬停角点徽标：Onshape live token（圆点 #f0b93f 9px、标签 #cfa574 13px + 白描边）', () => {
    const dot = cssRuleBlock('.part-studio-sketch-hint-badge__dot');
    expect(dot).toMatch(/background:\s*#f0b93f/);
    expect(dot).toMatch(/width:\s*9px/);
    expect(dot).toMatch(/height:\s*9px/);

    const label = cssRuleBlock('.part-studio-sketch-hint-badge__label');
    expect(label).toMatch(/color:\s*#cfa574/);
    expect(label).toMatch(/font-size:\s*13px/);
    expect(label).toMatch(/white-space:\s*nowrap/);
    expect(label).toMatch(/text-shadow:\s*0 0 2px #ffffff,\s*0 0 2px #ffffff/);
  });
});
