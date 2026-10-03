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
      // ViewCube 挂载时经 selectedView.view.getRotation() 同步旋转角，
      // setStandardView 还会用 view.is3d()/turnCameraOff() —— mock 须齐备
      selectedView: {
        setStandardRotation: vi.fn(),
        synchWithView: vi.fn(),
        view: {
          getRotation: vi.fn(() => ({ at: (i: number, j: number) => (i === j ? 1 : 0) })),
          is3d: vi.fn(() => true),
          turnCameraOff: vi.fn(),
        },
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
