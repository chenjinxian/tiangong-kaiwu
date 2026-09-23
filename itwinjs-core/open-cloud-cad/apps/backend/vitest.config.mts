import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for backend
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['node_modules/', 'dist/', 'src/test-downloaded-baseline.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
