/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test setup file for Vitest
 * Defines import.meta.env for tests
 */

// i18n：初始化真实实例并钉 zh-CN（对齐 Playwright locale=zh-CN 与产品 fallback）。
// 组件内 useTranslation 若拿不到 i18n 实例会退化为键名，中文断言（EditorShell 等）失效。
// 必须在 i18n 模块求值前写入 localStorage（LanguageDetector 首读 localStorage）。
localStorage.setItem('luban-cad-lang', 'zh-CN');
await import('../shared/i18n/index.js');

// jsdom 未实现 Element.scrollTo；itwin-ui Tabs 在 layout effect 里调用
//（ShareITwinDialog/其他 Tabs 组件单测必需，RW4-P3-T3-2）
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: () => undefined,
  });
}

// Define import.meta.env for test environment
(globalThis as unknown as { import: { meta: { env: Record<string, string | boolean> } } }).import = {
  meta: {
    env: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PROD: false,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      DEV: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      MODE: 'test',
    },
  },
};
