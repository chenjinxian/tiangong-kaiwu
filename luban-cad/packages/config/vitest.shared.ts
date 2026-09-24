import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest configuration for LubanCAD packages
 *
 * Usage:
 * ```ts
 * import { defineConfig, mergeConfig } from 'vitest/config';
 * import sharedConfig from '@luban-cad/config/vitest.shared';
 *
 * export default mergeConfig(sharedConfig, defineConfig({
 *   // package-specific config
 * }));
 * ```
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['node_modules/', 'dist/', 'lib/', 'e2e/'],
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'lib/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        'test/',
        'e2e/',
      ],
    },
  },
});
