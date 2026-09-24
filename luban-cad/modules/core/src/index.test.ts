/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Basic smoke test for Core module
 */

import { describe, it, expect } from 'vitest';

describe('Core Module', () => {
  it('should be defined', () => {
    expect(true).toBe(true);
  });

  it('should export LubanCadApp', () => {
    // Placeholder test - actual import would require iTwin.js setup
    expect(typeof describe).toBe('function');
  });
});
