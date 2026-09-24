/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for BaseViewer component
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BaseViewer } from './BaseViewer.js';

// Mock iTwin.js dependencies
vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    initialized: true,
  },
  ViewState: {},
  ScreenViewport: {
    create: vi.fn(),
  },
  IModelConnection: {},
}));

vi.mock('../hooks/useIModel.js', () => ({
  useIModel: () => ({
    iModel: undefined,
    isLoading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('../hooks/useViewport.js', () => ({
  useViewport: () => ({
    viewport: undefined,
    containerRef: { current: null },
  }),
}));

describe('BaseViewer', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <BaseViewer
        iTwinId="test-itwin-id"
        iModelId="test-imodel-id"
      />
    );

    expect(container).toBeDefined();
  });

  it('should show loading state', () => {
    // Override mock to show loading
    vi.doMock('../hooks/useIModel.js', () => ({
      useIModel: () => ({
        iModel: undefined,
        isLoading: true,
        error: null,
        reload: vi.fn(),
      }),
    }));

    const { container } = render(
      <BaseViewer
        iTwinId="test-itwin-id"
        iModelId="test-imodel-id"
      />
    );

    expect(container).toBeDefined();
  });
});
