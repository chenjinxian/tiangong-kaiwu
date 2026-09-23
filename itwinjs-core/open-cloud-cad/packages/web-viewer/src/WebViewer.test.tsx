/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for WebViewer component
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WebViewer } from './WebViewer.js';

// Mock the WebInitializer module
vi.mock('./WebInitializer.js', () => ({
  initializeWeb: vi.fn().mockResolvedValue(undefined),
  shutdownWeb: vi.fn().mockResolvedValue(undefined),
}));

// Mock viewer-core components
vi.mock('@open-cloud-cad/viewer-core', () => ({
  ViewerWithUI: vi.fn((props) => (
    <div data-testid="viewer-with-ui">
      <div data-testid="itwin-id">{props.iTwinId}</div>
      <div data-testid="imodel-id">{props.iModelId}</div>
    </div>
  )),
}));

describe('WebViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state initially', () => {
    const { container } = render(
      <WebViewer
        iTwinId="test-itwin"
        iModelId="test-imodel"
      />
    );

    expect(container.textContent).toContain('Initializing Viewer');
  });

  it('should render viewer with UI after initialization', async () => {
    const { getByTestId } = render(
      <WebViewer
        iTwinId="test-itwin"
        iModelId="test-imodel"
      />
    );

    await waitFor(() => {
      expect(getByTestId('viewer-with-ui')).toBeDefined();
    });
  });

  it('should pass props to ViewerWithUI', async () => {
    const { getByTestId } = render(
      <WebViewer
        iTwinId="test-itwin"
        iModelId="test-imodel"
      />
    );

    await waitFor(() => {
      expect(getByTestId('itwin-id').textContent).toBe('test-itwin');
      expect(getByTestId('imodel-id').textContent).toBe('test-imodel');
    });
  });

  it('should render error state on initialization failure', async () => {
    const { initializeWeb } = await import('./WebInitializer.js');
    // Use mockRejectedValue (not Once) because the component retries once on failure
    vi.mocked(initializeWeb).mockRejectedValue(new Error('Failed to initialize'));

    const { findByText } = render(
      <WebViewer
        iTwinId="test-itwin"
        iModelId="test-imodel"
      />
    );

    const errorText = await findByText(/Initialization Failed/i);
    expect(errorText).toBeDefined();
  });

  it('should apply custom style', async () => {
    const customStyle = { backgroundColor: 'red' };
    const { container } = render(
      <WebViewer
        iTwinId="test-itwin"
        iModelId="test-imodel"
        style={customStyle}
      />
    );

    await waitFor(() => {
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeDefined();
    });
  });
});
