/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for ViewerWithUI component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ViewerWithUI, type ViewerWithUIProps } from './ViewerWithUI.js';

// Mock the BaseViewer component
vi.mock('./BaseViewer.js', () => ({
  BaseViewer: vi.fn((props) => (
    <div data-testid="base-viewer" data-itwinid={props.iTwinId} data-imodelid={props.iModelId}>
      BaseViewer Mock
    </div>
  )),
}));

// Mock the tools components
vi.mock('./tools/index.js', () => ({
  ViewerToolbar: vi.fn(() => <div data-testid="viewer-toolbar">Toolbar</div>),
  CompactViewCube: vi.fn(() => <div data-testid="compact-viewcube">ViewCube</div>),
  MeasurementTools: vi.fn(({ onMeasurementEnd }) => (
    <div data-testid="measurement-tools">
      <button
        data-testid="add-measurement"
        onClick={() => onMeasurementEnd?.({
          id: 'test-1',
          type: 'distance',
          value: 10,
          unit: 'm',
          timestamp: Date.now(),
        })}
      >
        Add Measurement
      </button>
    </div>
  )),
  MeasurementPanel: vi.fn(({ measurements, onClear }) => (
    <div data-testid="measurement-panel">
      <span data-testid="measurement-count">{measurements.length}</span>
      <button data-testid="clear-measurements" onClick={onClear}>Clear</button>
    </div>
  )),
  ModelPicker: vi.fn(() => <div data-testid="model-picker">Model Picker</div>),
  CategoryPicker: vi.fn(() => <div data-testid="category-picker">Category Picker</div>),
  SelectionTools: vi.fn(() => <div data-testid="selection-tools">Selection Tools</div>),
  ViewSettingsPanel: vi.fn(() => <div data-testid="view-settings-panel">View Settings</div>),
  ViewSwitcher: vi.fn(() => <div data-testid="view-switcher">View Switcher</div>),
  SavedViewsPanel: vi.fn(() => <div data-testid="saved-views-panel">Saved Views</div>),
  SectionToolsPanel: vi.fn(() => <div data-testid="section-tools-panel">Section Tools</div>),
}));

import { BaseViewer } from './BaseViewer.js';
import {
  ViewerToolbar,
  CompactViewCube,
  MeasurementTools,
  MeasurementPanel,
  ModelPicker,
  CategoryPicker,
  SelectionTools,
  ViewSettingsPanel,
  ViewSwitcher,
  SavedViewsPanel,
  SectionToolsPanel,
} from './tools/index.js';

describe('ViewerWithUI', () => {
  const defaultProps: ViewerWithUIProps = {
    iTwinId: 'test-itwin-id',
    iModelId: 'test-imodel-id',
    accessToken: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render BaseViewer with correct props', () => {
      render(<ViewerWithUI {...defaultProps} />);

      expect(BaseViewer).toHaveBeenCalledWith(
        expect.objectContaining({
          iTwinId: 'test-itwin-id',
          iModelId: 'test-imodel-id',
          accessToken: 'test-token',
        }),
        expect.anything()
      );

      expect(screen.getByTestId('base-viewer')).toBeDefined();
    });

    it('should render with default UI components', () => {
      render(<ViewerWithUI {...defaultProps} />);

      expect(screen.getByTestId('viewer-toolbar')).toBeDefined();
      expect(screen.getByTestId('compact-viewcube')).toBeDefined();
      expect(screen.getByTestId('measurement-tools')).toBeDefined();
    });

    it('should not render toolbar when showToolbar is false', () => {
      render(<ViewerWithUI {...defaultProps} showToolbar={false} />);

      expect(screen.queryByTestId('viewer-toolbar')).toBeNull();
      expect(screen.getByTestId('compact-viewcube')).toBeDefined();
    });

    it('should not render ViewCube when showViewCube is false', () => {
      render(<ViewerWithUI {...defaultProps} showViewCube={false} />);

      expect(screen.getByTestId('viewer-toolbar')).toBeDefined();
      expect(screen.queryByTestId('compact-viewcube')).toBeNull();
    });

    it('should not render measurement tools when showMeasurementTools is false', () => {
      render(<ViewerWithUI {...defaultProps} showMeasurementTools={false} />);

      expect(screen.queryByTestId('measurement-tools')).toBeNull();
      expect(screen.queryByTestId('measurement-panel')).toBeNull();
    });

    it('should hide all UI components when all show flags are false', () => {
      render(
        <ViewerWithUI
          {...defaultProps}
          showToolbar={false}
          showViewCube={false}
          showMeasurementTools={false}
        />
      );

      expect(screen.queryByTestId('viewer-toolbar')).toBeNull();
      expect(screen.queryByTestId('compact-viewcube')).toBeNull();
      expect(screen.queryByTestId('measurement-tools')).toBeNull();
      expect(screen.getByTestId('base-viewer')).toBeDefined();
    });
  });

  describe('Positioning', () => {
    it('should apply correct position styles for toolbar', () => {
      render(<ViewerWithUI {...defaultProps} toolbarPosition="top-right" />);

      const toolbarContainer = screen.getByTestId('viewer-toolbar').parentElement;
      expect(toolbarContainer?.style.position).toBe('absolute');
      expect(toolbarContainer?.style.top).toBe('20px');
      expect(toolbarContainer?.style.right).toBe('20px');
    });

    it('should apply correct position styles for ViewCube', () => {
      render(<ViewerWithUI {...defaultProps} viewCubePosition="bottom-left" />);

      const viewCubeContainer = screen.getByTestId('compact-viewcube').parentElement;
      expect(viewCubeContainer?.style.position).toBe('absolute');
      expect(viewCubeContainer?.style.bottom).toBe('20px');
      expect(viewCubeContainer?.style.left).toBe('20px');
    });

    it('should apply correct position styles for measurement tools', () => {
      render(<ViewerWithUI {...defaultProps} measurementPosition="top-left" />);

      const measurementContainer = screen.getByTestId('measurement-tools').parentElement;
      expect(measurementContainer?.style.position).toBe('absolute');
      expect(measurementContainer?.style.top).toBe('20px');
      expect(measurementContainer?.style.left).toBe('20px');
      expect(measurementContainer?.style.display).toBe('flex');
      expect(measurementContainer?.style.flexDirection).toBe('column');
    });

    it('should apply default positions', () => {
      render(<ViewerWithUI {...defaultProps} />);

      // Default: toolbar top-left, viewcube top-right, measurement bottom-right
      const toolbarContainer = screen.getByTestId('viewer-toolbar').parentElement;
      expect(toolbarContainer?.style.top).toBe('20px');
      expect(toolbarContainer?.style.left).toBe('20px');

      const viewCubeContainer = screen.getByTestId('compact-viewcube').parentElement;
      expect(viewCubeContainer?.style.top).toBe('20px');
      expect(viewCubeContainer?.style.right).toBe('20px');

      const measurementContainer = screen.getByTestId('measurement-tools').parentElement;
      expect(measurementContainer?.style.bottom).toBe('20px');
      expect(measurementContainer?.style.right).toBe('20px');
    });
  });

  describe('Measurement functionality', () => {
    it('should not show measurement panel initially', () => {
      render(<ViewerWithUI {...defaultProps} />);

      // Initially no measurements - panel should not be visible
      expect(screen.queryByTestId('measurement-panel')).toBeNull();
    });

    it('should call onMeasurement callback when measurement is added', () => {
      const onMeasurement = vi.fn();
      render(<ViewerWithUI {...defaultProps} onMeasurement={onMeasurement} />);

      act(() => {
        screen.getByTestId('add-measurement').click();
      });

      expect(onMeasurement).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-1',
          type: 'distance',
          value: 10,
          unit: 'm',
        })
      );
    });

    it('should render measurement tools', () => {
      render(<ViewerWithUI {...defaultProps} />);

      // Measurement tools should be rendered
      expect(screen.getByTestId('measurement-tools')).toBeDefined();
      expect(screen.getByTestId('add-measurement')).toBeDefined();
    });

    it('should hide measurement tools when showMeasurementTools is false', () => {
      render(<ViewerWithUI {...defaultProps} showMeasurementTools={false} />);

      expect(screen.queryByTestId('measurement-tools')).toBeNull();
      expect(screen.queryByTestId('measurement-panel')).toBeNull();
    });
  });

  describe('BaseViewer props forwarding', () => {
    it('should forward viewState to BaseViewer', () => {
      const mockViewState = { id: 'view-1' } as unknown as import('@itwin/core-frontend').ViewState;

      render(<ViewerWithUI {...defaultProps} viewState={mockViewState} />);

      expect(BaseViewer).toHaveBeenCalledWith(
        expect.objectContaining({
          viewState: mockViewState,
        }),
        expect.anything()
      );
    });

    it('should forward className to BaseViewer', () => {
      render(<ViewerWithUI {...defaultProps} className="custom-class" />);

      expect(BaseViewer).toHaveBeenCalledWith(
        expect.objectContaining({
          className: 'custom-class',
        }),
        expect.anything()
      );
    });

    it('should forward loadingComponent to BaseViewer', () => {
      const loadingComponent = <div data-testid="custom-loading">Custom Loading</div>;

      render(<ViewerWithUI {...defaultProps} loadingComponent={loadingComponent} />);

      expect(BaseViewer).toHaveBeenCalledWith(
        expect.objectContaining({
          loadingComponent,
        }),
        expect.anything()
      );
    });

    it('should forward errorComponent to BaseViewer', () => {
      const errorComponent = <div data-testid="custom-error">Custom Error</div>;

      render(<ViewerWithUI {...defaultProps} errorComponent={errorComponent} />);

      expect(BaseViewer).toHaveBeenCalledWith(
        expect.objectContaining({
          errorComponent,
        }),
        expect.anything()
      );
    });

    it('should forward onViewportReady callback to BaseViewer', () => {
      const onViewportReady = vi.fn();

      render(<ViewerWithUI {...defaultProps} onViewportReady={onViewportReady} />);

      expect(BaseViewer).toHaveBeenCalledWith(
        expect.objectContaining({
          onViewportReady,
        }),
        expect.anything()
      );
    });
  });

  describe('Container styling', () => {
    it('should apply correct container styles', () => {
      const { container } = render(<ViewerWithUI {...defaultProps} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper?.style.width).toBe('100%');
      expect(wrapper?.style.height).toBe('100%');
      expect(wrapper?.style.position).toBe('relative');
      expect(wrapper?.style.overflow).toBe('hidden');
    });
  });
});
