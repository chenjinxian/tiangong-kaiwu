import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../tokens/onshape-skin.css'), 'utf8');

describe('onshape-skin 令牌', () => {
  it('定义 accent/backdrop/密度/字阶/圆角核心变量', () => {
    for (const name of ['--lx-accent-hsl', '--lx-backdrop', '--lx-surface', '--lx-border',
      '--lx-control-height', '--lx-font-size-body', '--lx-radius']) {
      expect(css).toContain(name);
    }
  });
  it('accent 钉 Onshape 实测蓝（os-01 取色）', () => {
    expect(css).toMatch(/--lx-accent-hsl:\s*\d+ \d+% \d+%/);
  });
  it('提供暗色主题覆写', () => {
    expect(css).toContain("[data-theme='dark']");
  });
  it('backdrop 钉实测中性灰', () => {
    expect(css).toMatch(/--lx-backdrop:\s*#f[0-9a-f]{5}/i);
  });
  it('R6 负向守卫：不覆写 iTwin scrim 语义令牌 --iui-color-background-backdrop', () => {
    // 该变量是 iTwin 遮罩层（scrim）语义锚点，皮肤层覆写会撕裂模态/遮罩表现——
    // 皮肤只定义自有 --lx-* 命名空间令牌（R6 裁决），不得回写 iTwin 令牌。
    expect(css).not.toMatch(/^\s*--iui-color-background-backdrop\s*:/m);
  });
});

// ── M4 Task 8（M3 终审挂账清偿）────────────────────────────────────────────

const partStudioCss = readFileSync(
  resolve(__dirname, '../../modules/part-studio/PartStudioPage.css'),
  'utf8',
);

/** 取选择器所属规则体（单层大括号；本仓 CSS 无嵌套）。 */
function ruleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

describe('M4-T8 T3-①：logo 渐变令牌化（token guard）', () => {
  it('logo 渐变走 --lx-brand-gradient 令牌；组件层规则无裸色值；令牌在皮肤层钉值', () => {
    const block = ruleBlock(partStudioCss, '.part-studio-logo-mark');
    expect(block).toContain('var(--lx-brand-gradient)');
    // token guard：logo 规则体禁裸色值（渐变深端 #0055aa 已令牌化）。
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 令牌本体在皮肤层（唯一允许裸色值取样的地方）钉值。
    expect(css).toMatch(/--lx-brand-gradient:\s*linear-gradient/);
    expect(css).toMatch(/--lx-accent-deep:\s*#[0-9a-fA-F]{6}/);
  });
});

describe('M4-T8 D2：分享钮形态（非全高直角）', () => {
  it('分享钮规则限高 + 圆角（os-11 小圆角钮，不再被 Header actions 拉伸为全高方块）', () => {
    const block = ruleBlock(partStudioCss, '.part-studio-share-button');
    expect(block).toMatch(/block-size:\s*var\(--lx-control-height\)/);
    expect(block).toMatch(/border-radius:\s*var\(--lx-radius\)/);
  });
});
