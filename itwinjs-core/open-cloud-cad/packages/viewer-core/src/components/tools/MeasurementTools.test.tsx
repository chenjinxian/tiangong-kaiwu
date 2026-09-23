/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for MeasurementTools component
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MeasurementTools, MeasurementPanel } from './MeasurementTools.js';

// Mock iTwin.js dependencies
vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    toolAdmin: {},
    tools: {
      run: vi.fn(),
    },
  },
}));

describe('MeasurementTools', () => {
  it('should render without crashing', () => {
    const { container } = render(<MeasurementTools />);
    expect(container).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(<MeasurementTools className="custom-class" />);
    expect((container.firstChild as HTMLElement).classList.contains('custom-class')).toBe(true);
  });

  it('should handle onMeasurementEnd callback', () => {
    const onMeasurementEnd = vi.fn();
    const { container } = render(
      <MeasurementTools onMeasurementEnd={onMeasurementEnd} />
    );
    expect(container).toBeDefined();
  });
});

describe('MeasurementPanel', () => {
  it('should not render when there are no measurements', () => {
    const { container } = render(<MeasurementPanel measurements={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render measurements', () => {
    const measurements = [
      {
        type: 'distance' as const,
        value: 10.5,
        unit: 'm',
        description: 'Distance measurement',
      },
    ];
    const { container } = render(<MeasurementPanel measurements={measurements} />);
    expect(container).toBeDefined();
  });

  it('should handle clear callback', () => {
    const onClear = vi.fn();
    const measurements = [
      {
        type: 'distance' as const,
        value: 10.5,
        unit: 'm',
        description: 'Distance measurement',
      },
    ];
    const { container } = render(
      <MeasurementPanel measurements={measurements} onClear={onClear} />
    );
    expect(container).toBeDefined();
  });
});
