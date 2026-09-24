/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Vitest configuration for web app
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    exclude: ['node_modules/', 'dist/', 'e2e/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        'vite.config.ts',
        'vitest.config.mts',
        // Entry point - minimal logic
        'app/main.tsx',
        // Barrel files - just re-exports
        '**/index.ts',
        // Pages - covered by E2E tests
        'src/pages/',
        // Feature components - covered by E2E tests
        'features/editor/components/',
        'features/imodel/components/',
        'features/itwin/components/',
        'features/modeling/components/',
        'features/version-control/components/',
        'features/viewer/components/',
        // Contexts better covered by E2E
        'app/contexts/',
        'app/providers/',
        // Types
        'shared/types/',
        // Service clients - pass-through to external APIs
        'shared/services/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './app'),
      '@features': path.resolve(__dirname, './features'),
      '@shared': path.resolve(__dirname, './shared'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@styles': path.resolve(__dirname, './styles'),
    },
  },
});
