import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for web-agent
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['node_modules/', 'dist/'],
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
