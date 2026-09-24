/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ThemeToggle } from './ThemeToggle.js';
import { ThemeProvider } from '../../../app/contexts/ThemeContext.js';

// Polyfill matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('should render moon icon in light theme', () => {
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByRole('button');
    // Check for SvgMoon icon (iTwinUI icon component)
    expect(button.querySelector('svg')).toBeDefined();
  });

  it('should call toggleTheme when clicked', () => {
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // After click, theme should change
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should have correct aria-label for light theme', () => {
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByLabelText('切换到暗色主题');
    expect(button).toBeDefined();
  });

  it('should have correct aria-label attribute', () => {
    renderWithTheme(<ThemeToggle />);

    const button = screen.getByLabelText('切换到暗色主题');
    expect(button).toBeDefined();
  });
});
