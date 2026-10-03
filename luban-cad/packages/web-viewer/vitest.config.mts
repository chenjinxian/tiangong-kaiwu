/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Vitest configuration for web-viewer package
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // dist/ 是 tsc 产物（含编译后的旧测试），不排除会与 src/ 双跑（2026-10-03 实测）
    exclude: ['node_modules/', 'dist/'],
  },
});
