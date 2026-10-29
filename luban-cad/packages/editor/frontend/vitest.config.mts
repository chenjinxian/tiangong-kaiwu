/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Vitest configuration for editor-frontend package（2026-10-22 收编 luban-cad 时
 * 随 src/luban/ 随迁测试设立；形态同 viewer）
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // lib/ 是 tsc 产物（含编译后的测试），不排除会与 src/ 双跑（2026-10-03
    // viewer dist/ 同款实测教训）
    exclude: ['node_modules/', 'lib/'],
  },
});
