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
// RW4-P1.5：全局 `a` 色规则收窄（评审 Important①）亦属样式 token 纪律，归并本文件断言。
const indexCss = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

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

describe('品牌 accent 别名族覆写（RW4-P1.5，P0-T4 契约兑现）', () => {
  // i22 实况：accent 别名族（background/border/text/icon-accent）指向 informational 蓝，
  // high-visibility 按钮链走 --iui-color-background-accent——种子覆写半径不足，须逐别名覆写。
  it('light 主题覆写 background-accent(+hover) 为品牌 teal', () => {
    expect(css).toMatch(
      /\[data-theme="light"\][\s\S]*?--iui-color-background-accent:\s*hsl\(167deg 100% 36\.1%\)/,
    );
    expect(css).toMatch(
      /\[data-theme="light"\][\s\S]*?--iui-color-background-accent-hover:\s*hsl\(167deg 100% 30%\)/,
    );
  });
  it('dark 主题覆写 background-accent(+hover) 为品牌亮 teal', () => {
    expect(css).toMatch(
      /\[data-theme="dark"\][\s\S]*?--iui-color-background-accent:\s*hsl\(167deg 100% 44\.7%\)/,
    );
    expect(css).toMatch(
      /\[data-theme="dark"\][\s\S]*?--iui-color-background-accent-hover:\s*hsl\(167deg 100% 52%\)/,
    );
  });
  it('border/text/icon accent 同映射种子（light 36.1% / dark 44.7%）', () => {
    for (const token of [
      '--iui-color-border-accent',
      '--iui-color-text-accent',
      '--iui-color-icon-accent',
    ]) {
      expect(css).toMatch(new RegExp(`\\[data-theme="light"\\][\\s\\S]*?${token}:\\s*hsl\\(167deg 100% 36\\.1%\\)`));
      expect(css).toMatch(new RegExp(`\\[data-theme="dark"\\][\\s\\S]*?${token}:\\s*hsl\\(167deg 100% 44\\.7%\\)`));
    }
  });
  it('红线：不覆写 --iui-color-informational-*（信息色语义不污染）', () => {
    // 断言「声明位置」零定义（注释提及不算）
    expect(css).not.toMatch(/^\s*--iui-color-informational[^:]*:/m);
  });
});

describe('全局链接色收窄（RW4-P1.5 评审 Important①）', () => {
  // 原 `a { color }` 无条件命中 itwinui 组件锚点（Button as={Link} 渲染 <a class="iui-button …">），
  // 无 layer 全局规则压过 @layer 组件色 → 404 按钮 teal 字叠 accent 底。收窄后组件锚点色权交还组件层。
  it('全局 a 色规则排除 itwinui 组件锚点（[class*=iui] 不命中）', () => {
    expect(indexCss).toMatch(/a:where\(:not\(\[class\*='iui'\]\)\)\s*\{\s*color:\s*var\(--color-primary\)/);
    expect(indexCss).toMatch(/a:where\(:not\(\[class\*='iui'\]\)\):hover\s*\{\s*color:\s*var\(--color-primary-hover\)/);
  });
  it('不再存在无条件全局 a 色声明', () => {
    expect(indexCss).not.toMatch(/^a\s*\{\s*color:/m);
  });
});
