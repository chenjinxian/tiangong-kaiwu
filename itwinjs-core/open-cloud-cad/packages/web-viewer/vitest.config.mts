/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Vitest configuration for web-viewer package
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
