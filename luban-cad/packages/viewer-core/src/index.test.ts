/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for viewer-core package exports
 */

import { describe, expect, it } from 'vitest';

// Test that all exports are available - sorted alphabetically
import {
  BaseViewer,
  CompactViewCube,
  MeasurementPanel,
  MeasurementTools,
  useBriefcaseConnection,
  useIModel,
  useViewport,
  ViewCube,
  ViewerToolbar,
  ViewerWithUI,
} from './index.js';

describe('Viewer-core package exports', () => {
  it('should export BaseViewer', () => {
    expect(BaseViewer).toBeDefined();
  });

  it('should export ViewerWithUI', () => {
    expect(ViewerWithUI).toBeDefined();
  });

  it('should export ViewerToolbar', () => {
    expect(ViewerToolbar).toBeDefined();
  });

  it('should export ViewCube', () => {
    expect(ViewCube).toBeDefined();
  });

  it('should export CompactViewCube', () => {
    expect(CompactViewCube).toBeDefined();
  });

  it('should export MeasurementTools', () => {
    expect(MeasurementTools).toBeDefined();
  });

  it('should export MeasurementPanel', () => {
    expect(MeasurementPanel).toBeDefined();
  });

  it('should export useIModel hook', () => {
    expect(useIModel).toBeDefined();
  });

  it('should export useViewport hook', () => {
    expect(useViewport).toBeDefined();
  });

  it('exports useBriefcaseConnection hook', () => {
    expect(typeof useBriefcaseConnection).toBe('function');
  });
});
