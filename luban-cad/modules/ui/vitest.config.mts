import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration for ui module
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['node_modules/', 'lib/'],
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
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core/src'),
    },
  },
});
