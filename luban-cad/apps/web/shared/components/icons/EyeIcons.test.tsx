/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import {
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  AlertIcon,
  LoaderIcon,
} from './EyeIcons.js';

describe('EyeIcon', () => {
  it('should render with default size', () => {
    const { container } = render(<EyeIcon />);
    const svg = container.querySelector('svg');

    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should render with custom size', () => {
    const { container } = render(<EyeIcon size={24} />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
  });

  it('should apply custom className', () => {
    const { container } = render(<EyeIcon className="custom-class" />);
    const svg = container.querySelector('svg');

    expect(svg?.classList.contains('custom-class')).toBe(true);
  });

  it('should render path and circle elements', () => {
    const { container } = render(<EyeIcon />);

    expect(container.querySelector('path')).toBeDefined();
    expect(container.querySelector('circle')).toBeDefined();
  });
});

describe('EyeOffIcon', () => {
  it('should render with default size', () => {
    const { container } = render(<EyeOffIcon />);
    const svg = container.querySelector('svg');

    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');
  });

  it('should render with custom size and className', () => {
    const { container } = render(<EyeOffIcon size={20} className="hidden-icon" />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
    expect(svg?.classList.contains('hidden-icon')).toBe(true);
  });

  it('should render paths and line elements', () => {
    const { container } = render(<EyeOffIcon />);
    const paths = container.querySelectorAll('path');
    const lines = container.querySelectorAll('line');

    expect(paths.length).toBeGreaterThanOrEqual(3);
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});

describe('CheckIcon', () => {
  it('should render with default size', () => {
    const { container } = render(<CheckIcon />);
    const svg = container.querySelector('svg');

    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('height')).toBe('16');
  });

  it('should render polyline element', () => {
    const { container } = render(<CheckIcon />);

    expect(container.querySelector('polyline')).toBeDefined();
  });
});

describe('AlertIcon', () => {
  it('should render with default size', () => {
    const { container } = render(<AlertIcon />);
    const svg = container.querySelector('svg');

    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('height')).toBe('16');
  });

  it('should render circle and line elements', () => {
    const { container } = render(<AlertIcon />);

    expect(container.querySelector('circle')).toBeDefined();
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(2);
  });
});

describe('LoaderIcon', () => {
  it('should render with default size', () => {
    const { container } = render(<LoaderIcon />);
    const svg = container.querySelector('svg');

    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });

  it('should render path element', () => {
    const { container } = render(<LoaderIcon />);

    expect(container.querySelector('path')).toBeDefined();
  });
});
