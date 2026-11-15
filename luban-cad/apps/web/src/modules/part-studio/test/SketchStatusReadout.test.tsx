// src/modules/part-studio/test/SketchStatusReadout.test.tsx
//
// 草图底部状态读数（2026-11-15 E4/S4b Onshape live）：标签 13.3333px / #666、
// 值深色、固定 mm 3 位小数、仅长度段带小尺图标；无数据自隐。
// 样式钉走 CSS 文本断言（jsdom 不算样式；repo 既有约定，见
// sketch-tool-feedback-overlay.test.tsx）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SketchStatusReadout } from '../components/SketchStatusReadout.js';

const readoutCss = readFileSync(
  resolve(__dirname, '../components/SketchStatusReadout.css'),
  'utf8',
);

/** 取选择器所属规则体（单层大括号；本仓 CSS 无嵌套——同 SketchValuePopup.test 先例）。 */
function cssRuleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const matches = [...readoutCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  const match = matches[matches.length - 1];
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

describe('SketchStatusReadout（Onshape 右下角状态读数）', () => {
  it('点 + 长度：标签带冒号、mm 3 位小数、长度段前置小尺图标', () => {
    render(
      <SketchStatusReadout
        point={{ x: 1.23456, y: -2, z: 0.0004 }}
        length={{ kind: 'length', valueMm: 12.3456 }}
      />,
    );

    const readout = screen.getByTestId('sketch-status-readout');
    expect(readout.className).toContain('part-studio-sketch-status');

    const length = screen.getByTestId('sketch-status-length');
    expect(length.getAttribute('data-kind')).toBe('length');
    expect(length.textContent).toContain('长度:');
    expect(length.textContent).toContain('12.346 mm');
    expect(length.querySelector('.part-studio-sketch-status__ruler')).not.toBeNull();

    const point = screen.getByTestId('sketch-status-point');
    expect(point.textContent).toContain('点:');
    expect(point.textContent).toContain('X 1.235 mm Y -2.000 mm Z 0.000 mm');
    // 点段无尺图标（仅长度段承载）。
    expect(point.querySelector('[data-testid="sketch-status-ruler"]')).toBeNull();
  });

  it('仅点：只渲染点段，长度段与小尺图标不出现', () => {
    render(<SketchStatusReadout point={{ x: 0, y: 0, z: 0 }} />);

    expect(screen.getByTestId('sketch-status-point').textContent).toContain(
      'X 0.000 mm Y 0.000 mm Z 0.000 mm',
    );
    expect(screen.queryByTestId('sketch-status-length')).toBeNull();
    expect(screen.queryByTestId('sketch-status-ruler')).toBeNull();
  });

  it('仅长度：只渲染长度段；半径沿用既有 live 词条「半径」', () => {
    const { unmount } = render(
      <SketchStatusReadout length={{ kind: 'radius', valueMm: 5 }} />,
    );
    const length = screen.getByTestId('sketch-status-length');
    expect(length.getAttribute('data-kind')).toBe('radius');
    expect(length.textContent).toContain('半径:');
    expect(length.textContent).toContain('5.000 mm');
    expect(screen.queryByTestId('sketch-status-point')).toBeNull();
    unmount();

    render(<SketchStatusReadout length={{ kind: 'length', valueMm: 0 }} />);
    expect(screen.getByTestId('sketch-status-length').textContent).toContain('长度:');
    expect(screen.getByTestId('sketch-status-length').textContent).toContain('0.000 mm');
    expect(screen.queryByTestId('sketch-status-point')).toBeNull();
  });

  it('无数据：不渲染读数（草图外/无选择/光标离开时由宿主传空）', () => {
    const { container } = render(<SketchStatusReadout />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('sketch-status-readout')).toBeNull();
  });
});

describe('SketchStatusReadout 样式钉版（CSS 文本）', () => {
  it('标签：Onshape live `.measurement-name` = 13.3333px / 400 / #666', () => {
    const label = cssRuleBlock('.part-studio-sketch-status__label');
    expect(label).toMatch(/color:\s*#666666/);
    expect(label).toMatch(/font-size:\s*13\.3333px/);
    expect(label).toMatch(/font-weight:\s*400/);
  });

  it('值：深色正文 #333 + 同字号 + 等宽数字', () => {
    const value = cssRuleBlock('.part-studio-sketch-status__value');
    expect(value).toMatch(/color:\s*#333333/);
    expect(value).toMatch(/font-size:\s*13\.3333px/);
    expect(value).toMatch(/font-weight:\s*400/);
    expect(value).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('读数容器：右下角绝对定位、等宽不换行、不挡拾取', () => {
    const root = cssRuleBlock('.part-studio-sketch-status');
    expect(root).toMatch(/position:\s*absolute/);
    expect(root).toMatch(/right:\s*10px/);
    expect(root).toMatch(/bottom:\s*8px/);
    expect(root).toMatch(/font-size:\s*13\.3333px/);
    expect(root).toMatch(/white-space:\s*nowrap/);
    expect(root).toMatch(/pointer-events:\s*none/);
    expect(root).toMatch(/user-select:\s*none/);
  });
});
