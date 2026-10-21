import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import itwinPlugin from '@itwin/eslint-plugin';

// 配置补形（brief 两边界块原样保留）：block 1 须用 TS parser，否则 espree 解析
// TS 专属语法（类型注解/非空断言）即 Parsing error。@typescript-eslint/parser 是
// @itwin/eslint-plugin 的直接依赖，但 pnpm 严格布局下无法从包根直接 import，
// 故锚定在插件入口（.pnpm store 实路径）处解析。
const pluginRequire = createRequire(fileURLToPath(import.meta.resolve('@itwin/eslint-plugin')));
const tsParser = pluginRequire('@typescript-eslint/parser');

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@itwin': itwinPlugin },
  },
  {
    // spec §1 规则 4：跨 module 只准走 index.ts barrel
    files: ['src/modules/**/*.ts', 'src/modules/**/*.tsx'],
    ignores: ['src/modules/*/index.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@modules/*/*', '@modules/*/*/**'],
          message: '跨模块只准 import 模块入口 @modules/<name>（index.ts barrel）',
        }],
      }],
    },
  },
  {
    // 分层方向：下层禁引上层
    files: ['src/clients/**/*.ts', 'src/common/**/*.ts', 'src/components/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@app/**', '@routes/**', '@modules/**'],
          message: 'clients/common/components 不得依赖上层（app/routes/modules）',
        }],
      }],
    },
  },
];
