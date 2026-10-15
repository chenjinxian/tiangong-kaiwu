/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Step 1 核对结论：iTwinUI 3.22.0 的 accent 种子实为 `--iui-color-informational-hsl` 的别名，
// 原始种子值采用 `Hdeg S% L%` 格式（如 `203deg 100% 31%`），故覆写值沿用 deg 单位。
const css = readFileSync(resolve(__dirname, 'variables.css'), 'utf8');

describe('品牌 token 映射', () => {
  it('light 主题映射品牌 teal 到 iTwinUI accent 种子', () => {
    expect(css).toMatch(/\[data-theme="light"\][\s\S]*?--iui-color-accent-hsl:\s*167deg 100% 36\.1%/);
  });
  it('dark 主题映射品牌亮 teal', () => {
    expect(css).toMatch(/\[data-theme="dark"\][\s\S]*?--iui-color-accent-hsl:\s*167deg 100% 44\.7%/);
  });
  it('旧 --color-* 别名标记 deprecated', () => {
    expect(css).toContain('@deprecated');
  });
});
