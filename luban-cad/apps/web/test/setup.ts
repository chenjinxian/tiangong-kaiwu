/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test setup file for Vitest
 * Defines import.meta.env for tests
 */

// Define import.meta.env for test environment
(globalThis as unknown as { import: { meta: { env: Record<string, string | boolean> } } }).import = {
  meta: {
    env: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PROD: false,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      DEV: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      MODE: 'test',
    },
  },
};
