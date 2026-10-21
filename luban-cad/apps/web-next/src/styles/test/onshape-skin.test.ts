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
});
