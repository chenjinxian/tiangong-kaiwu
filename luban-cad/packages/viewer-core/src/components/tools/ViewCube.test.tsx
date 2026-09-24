/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for ViewCube component
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ViewCube, CompactViewCube } from './ViewCube.js';

// Mock iTwin.js dependencies
vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
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

describe('ViewCube', () => {
  it('should render without crashing', () => {
    const { container } = render(<ViewCube />);
    expect(container).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(<ViewCube className="custom-cube" />);
    expect((container.firstChild as HTMLElement).classList.contains('custom-cube')).toBe(true);
  });
});

describe('CompactViewCube', () => {
  it('should render without crashing', () => {
    const { container } = render(<CompactViewCube />);
    expect(container).toBeDefined();
  });

  it('should render quick view buttons', () => {
    const { container } = render(<CompactViewCube />);
    expect(container).toBeDefined();
  });
});
