/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/*
 * 环境说明：仓库全局 setupFiles（test/setup.ts）在模块求值期即写入 localStorage 并初始化
 * i18n，纯粹 node 环境会于 setup 阶段抛 ReferenceError。故沿用默认 jsdom 环境；
 * 本测试只使用 Node 的 fs/path API，不依赖任何 DOM 能力，仍保持快速与确定性。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * iTwinUI token 完整性守护（RW4-P5-T5-2b）
 *
 * 背景：`@itwin/itwinui-react` 3.22 并未定义应用曾消费的若干令牌
 * （--iui-border-radius、--iui-font-size-small/body、--iui-color-background-surface*、
 * --iui-color-text-success 等），声明会静默失效并回退到 initial/inherited。
 *
 * 本测试以已安装包的 styles.css 为唯一事实源，同时接受应用 CSS 自身定义的
 * --iui-* 令牌（局部定义合法）；任何无法解析的 `var(--iui-*)` 引用都会失败，
 * 并在错误信息中列出 token 与全部引用文件。
 */

const APP_ROOT = resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

/** 扫描应用内全部 .css/.ts/.tsx（跳过 dist/node_modules 等构建产物目录）。
 *  TSX 内联样式同样会 `var(--iui-*)`（ErrorBoundary/Register 曾各有一处无效令牌），
 *  一并纳入守护面。 */
const SCANNED_EXTENSIONS = new Set(['.css', '.ts', '.tsx']);
function collectAppFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectAppFiles(resolve(dir, entry.name), out);
    } else if (SCANNED_EXTENSIONS.has(extname(entry.name))) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

/** 自定义属性声明（定义处），如 `--iui-color-background: …`。 */
const DEFINITION_RE = /(--iui-[\w-]+)\s*:/g;
/** 令牌消费（var 引用），无论是否带 fallback 都必须有定义。 */
const USAGE_RE = /var\(\s*(--iui-[\w-]+)/g;

function collectDefinitions(css: string, into: Set<string>): void {
  for (const match of css.matchAll(DEFINITION_RE)) {
    into.add(match[1]);
  }
}

const itwinuiStylesPath = createRequire(import.meta.url).resolve('@itwin/itwinui-react/styles.css');
const itwinuiStyles = readFileSync(itwinuiStylesPath, 'utf8');

// 一次性读取所有应用 CSS/TS/TSX，保持测试在亚秒级完成。
const appCssFiles = collectAppFiles(APP_ROOT)
  .sort()
  .map((file) => ({
    file,
    relativePath: relative(APP_ROOT, file).replace(/\\/g, '/'),
    css: readFileSync(file, 'utf8'),
  }));

const definedTokens = new Set<string>();
collectDefinitions(itwinuiStyles, definedTokens);
for (const { css } of appCssFiles) {
  collectDefinitions(css, definedTokens);
}

describe('iTwinUI token 完整性守护', () => {
  it('已安装的 iTwinUI styles.css 可解析且包含令牌定义', () => {
    expect(itwinuiStylesPath).toMatch(/[\\/]@itwin[\\/]itwinui-react[\\/]styles\.css$/);
    expect(itwinuiStyles).toMatch(/--iui-color-background\s*:/);
    expect(definedTokens.size).toBeGreaterThan(100);
  });

  it('应用 CSS/TS/TSX 中的 var(--iui-*) 均有定义（无 fallback 兜底也不算合法）', () => {
    const undefinedUsages = new Map<string, Set<string>>();

    for (const { relativePath, css } of appCssFiles) {
      for (const match of css.matchAll(USAGE_RE)) {
        const token = match[1];
        if (definedTokens.has(token)) continue;
        if (!undefinedUsages.has(token)) undefinedUsages.set(token, new Set());
        undefinedUsages.get(token)!.add(relativePath);
      }
    }

    const offenders = [...undefinedUsages.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([token, files]) => `${token} ← ${[...files].sort().join(', ')}`);

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `发现未定义的 iTwinUI 令牌（token ← 引用文件）:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
