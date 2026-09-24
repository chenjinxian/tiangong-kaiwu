/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for web-viewer package exports
 */

import { describe, expect, it } from 'vitest';

// Test that all exports are available - sorted alphabetically
import {
  initializeWeb,
  shutdownWeb,
  type WebInitializerOptions,
  WebViewer,
  type WebViewerProps,
} from './index.js';

describe('Web-viewer package exports', () => {
  it('should export WebViewer component', () => {
    expect(WebViewer).toBeDefined();
  });

  it('should export WebViewerProps type', () => {
    // Type-only export, just verify it doesn't throw
    const _props: WebViewerProps = {
      iTwinId: 'test',
      iModelId: 'test',
    };
    void _props;
    expect(true).toBe(true);
  });

  it('should export initializeWeb function', () => {
    expect(initializeWeb).toBeDefined();
    expect(typeof initializeWeb).toBe('function');
  });

  it('should export shutdownWeb function', () => {
    expect(shutdownWeb).toBeDefined();
    expect(typeof shutdownWeb).toBe('function');
  });

  it('should export WebInitializerOptions type', () => {
    // Type-only export, just verify it doesn't throw
    const _options: WebInitializerOptions = {
      backendUrl: 'http://localhost:4001',
    };
    void _options;
    expect(true).toBe(true);
  });
});
