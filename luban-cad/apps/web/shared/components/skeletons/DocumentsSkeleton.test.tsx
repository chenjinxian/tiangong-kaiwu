/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { DocumentsSkeleton } from './DocumentsSkeleton.js';

describe('DocumentsSkeleton', () => {
  it('should render without crashing', () => {
    const { container } = render(<DocumentsSkeleton />);
    expect(container.querySelector('.documents-skeleton')).toBeDefined();
  });

  it('should render topbar skeleton', () => {
    const { container } = render(<DocumentsSkeleton />);
    expect(container.querySelector('.topbar-skeleton')).toBeDefined();
  });

  it('should render sidebar skeleton', () => {
    const { container } = render(<DocumentsSkeleton />);
    expect(container.querySelector('.sidebar-skeleton')).toBeDefined();
  });

  it('should render main content skeleton', () => {
    const { container } = render(<DocumentsSkeleton />);
    expect(container.querySelector('.main-skeleton')).toBeDefined();
  });

  it('should render sidebar navigation items', () => {
    const { container } = render(<DocumentsSkeleton />);
    const sidebarItems = container.querySelectorAll('.sidebar-item-skeleton');

    expect(sidebarItems.length).toBeGreaterThanOrEqual(4);
  });

  it('should render section header skeleton', () => {
    const { container } = render(<DocumentsSkeleton />);
    expect(container.querySelector('.section-header-skeleton')).toBeDefined();
  });

  it('should render grid of card skeletons', () => {
    const { container } = render(<DocumentsSkeleton />);
    const cards = container.querySelectorAll('.card-skeleton');

    expect(cards.length).toBe(8);
  });

  it('should render card thumbnails and bodies', () => {
    const { container } = render(<DocumentsSkeleton />);
    const thumbnails = container.querySelectorAll('.card-thumb-skeleton');
    const bodies = container.querySelectorAll('.card-body-skeleton');

    expect(thumbnails.length).toBe(8);
    expect(bodies.length).toBe(8);
  });

  it('should render logo and avatar placeholders', () => {
    const { container } = render(<DocumentsSkeleton />);
    expect(container.querySelector('.skeleton-logo')).toBeDefined();
    expect(container.querySelector('.skeleton-avatar')).toBeDefined();
  });
});
