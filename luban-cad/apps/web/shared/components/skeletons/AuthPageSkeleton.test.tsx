/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { AuthPageSkeleton } from './AuthPageSkeleton.js';

describe('AuthPageSkeleton', () => {
  it('should render without crashing', () => {
    const { container } = render(<AuthPageSkeleton />);
    expect(container.querySelector('.auth-page-skeleton')).toBeDefined();
  });

  it('should render brand side skeleton', () => {
    const { container } = render(<AuthPageSkeleton />);
    expect(container.querySelector('.brand-side-skeleton')).toBeDefined();
  });

  it('should render form side skeleton', () => {
    const { container } = render(<AuthPageSkeleton />);
    expect(container.querySelector('.form-side-skeleton')).toBeDefined();
  });

  it('should render logo and title placeholders', () => {
    const { container } = render(<AuthPageSkeleton />);
    expect(container.querySelector('.skeleton-logo')).toBeDefined();
    expect(container.querySelector('.skeleton-title')).toBeDefined();
  });

  it('should render form field placeholders', () => {
    const { container } = render(<AuthPageSkeleton />);
    const labels = container.querySelectorAll('.skeleton-label');
    const inputs = container.querySelectorAll('.skeleton-input');

    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('should render button placeholder', () => {
    const { container } = render(<AuthPageSkeleton />);
    expect(container.querySelector('.skeleton-button')).toBeDefined();
  });

  it('should render feature placeholders', () => {
    const { container } = render(<AuthPageSkeleton />);
    const features = container.querySelectorAll('.skeleton-feature');

    expect(features.length).toBeGreaterThanOrEqual(4);
  });
});
