/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import ITwinDetailSkeleton, { IModelsListSkeleton } from './ITwinDetailSkeleton.js';

describe('ITwinDetailSkeleton', () => {
  it('should render without crashing', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    expect(container.querySelector('.itwin-detail-skeleton')).toBeDefined();
  });

  it('should render topbar skeleton', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    expect(container.querySelector('.topbar-skeleton')).toBeDefined();
  });

  it('should render hero section skeleton', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    expect(container.querySelector('.hero-skeleton')).toBeDefined();
  });

  it('should render toolbar skeleton', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    expect(container.querySelector('.toolbar-skeleton')).toBeDefined();
  });

  it('should render grid of iModel card skeletons', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    const cards = container.querySelectorAll('.imodel-card-skeleton');

    expect(cards.length).toBe(6);
  });

  it('should render card thumbnails with status', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    const thumbs = container.querySelectorAll('.imodel-thumb-skeleton');
    const statuses = container.querySelectorAll('.skeleton-status');

    expect(thumbs.length).toBe(6);
    expect(statuses.length).toBe(6);
  });

  it('should render breadcrumb placeholder', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    expect(container.querySelector('.skeleton-breadcrumb')).toBeDefined();
  });

  it('should render hero info with title and meta', () => {
    const { container } = render(<ITwinDetailSkeleton />);
    expect(container.querySelector('.hero-info-skeleton')).toBeDefined();
  });
});

describe('IModelsListSkeleton', () => {
  it('should render without crashing', () => {
    const { container } = render(<IModelsListSkeleton />);
    expect(container.querySelector('.imodels-list-skeleton')).toBeDefined();
  });

  it('should render toolbar skeleton', () => {
    const { container } = render(<IModelsListSkeleton />);
    expect(container.querySelector('.toolbar-skeleton')).toBeDefined();
  });

  it('should render grid of iModel card skeletons', () => {
    const { container } = render(<IModelsListSkeleton />);
    const cards = container.querySelectorAll('.imodel-card-skeleton');

    expect(cards.length).toBe(4);
  });

  it('should render badge placeholder', () => {
    const { container } = render(<IModelsListSkeleton />);
    expect(container.querySelector('.skeleton-badge')).toBeDefined();
  });
});
