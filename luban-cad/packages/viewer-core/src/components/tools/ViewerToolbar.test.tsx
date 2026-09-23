/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for ViewerToolbar component
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewerToolbar } from './ViewerToolbar.js';

// Mock iTwin.js dependencies
vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    toolAdmin: {
      startDefaultTool: vi.fn(),
    },
    tools: {
      run: vi.fn(),
    },
    viewManager: {
      selectedView: {
        setStandardRotation: vi.fn(),
        synchWithView: vi.fn(),
      },
    },
  },
  StandardViewId: {
    Top: 1,
    Bottom: 2,
    Front: 3,
    Back: 4,
    Left: 5,
    Right: 6,
    Iso: 7,
  },
}));

describe('ViewerToolbar', () => {
  it('should render without crashing', () => {
    const { container } = render(<ViewerToolbar />);
    expect(container).toBeDefined();
  });

  it('should render all navigation buttons', () => {
    render(<ViewerToolbar />);

    // Check for navigation buttons by title
    expect(screen.getByTitle(/旋转.*Rotate/i)).toBeDefined();
    expect(screen.getByTitle(/平移.*Pan/i)).toBeDefined();
    expect(screen.getByTitle(/缩放.*Zoom/i)).toBeDefined();
    expect(screen.getByTitle(/适应视图.*Fit View/i)).toBeDefined();
  });

  it('should render standard view buttons', () => {
    render(<ViewerToolbar />);

    expect(screen.getByTitle(/顶视图.*Top/i)).toBeDefined();
    expect(screen.getByTitle(/前视图.*Front/i)).toBeDefined();
    expect(screen.getByTitle(/右视图.*Right/i)).toBeDefined();
    expect(screen.getByTitle(/等轴测.*Isometric/i)).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(<ViewerToolbar className="custom-class" />);
    expect((container.firstChild as HTMLElement).classList.contains('custom-class')).toBe(true);
  });

  it('should apply custom styles', () => {
    const customStyle = { backgroundColor: 'red' };
    const { container } = render(<ViewerToolbar style={customStyle} />);
    expect((container.firstChild as HTMLElement).style.backgroundColor).toBe('red');
  });
});
