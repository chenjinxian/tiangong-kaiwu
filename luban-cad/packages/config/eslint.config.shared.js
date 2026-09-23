import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import iTwinPlugin from '@itwin/eslint-plugin';

/**
 * Shared ESLint configuration for Open Cloud CAD packages
 *
 * Usage:
 * ```js
 * import sharedConfig from '@open-cloud-cad/config/eslint.config.shared.js';
 *
 * export default [
 *   ...sharedConfig,
 *   // package-specific rules
 * ];
 * ```
 */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/naming-convention': 'off',

      // General rules
      'no-console': 'off',
      'no-debugger': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts'],
    rules: {
      // Relaxed rules for test files
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: [
      'dist/',
      'lib/',
      'node_modules/',
      '*.config.ts',
      '*.config.mts',
      '*.config.cjs',
    ],
  },
];
