/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Toast } from './Toast.js';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render with success type', () => {
    render(<Toast message="Success message" type="success" />);

    expect(screen.getByText('Success message')).toBeDefined();
    // iTwinUI Alert uses positive type for success
    expect(document.querySelector('[data-iui-status="positive"]')).not.toBeNull();
  });

  it('should render with error type', () => {
    render(<Toast message="Error message" type="error" />);

    expect(screen.getByText('Error message')).toBeDefined();
    // iTwinUI Alert uses negative type for error
    expect(document.querySelector('[data-iui-status="negative"]')).not.toBeNull();
  });

  it('should render with info type', () => {
    render(<Toast message="Info message" type="info" />);

    expect(screen.getByText('Info message')).toBeDefined();
    // iTwinUI Alert uses informational type for info
    expect(document.querySelector('[data-iui-status="informational"]')).not.toBeNull();
  });

  it('should call onClose after default duration', () => {
    const mockOnClose = vi.fn();
    render(<Toast message="Test" type="info" onClose={mockOnClose} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose after custom duration', () => {
    const mockOnClose = vi.fn();
    render(<Toast message="Test" type="info" onClose={mockOnClose} duration={5000} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should not auto-close when duration is 0', () => {
    const mockOnClose = vi.fn();
    render(<Toast message="Test" type="info" onClose={mockOnClose} duration={0} />);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should show close button when onClose is provided', () => {
    const mockOnClose = vi.fn();
    render(<Toast message="Test" type="info" onClose={mockOnClose} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toBeDefined();
  });

  it('should not show close button when onClose is not provided', () => {
    render(<Toast message="Test" type="info" />);

    const closeButton = screen.queryByRole('button', { name: /close/i });
    expect(closeButton).toBeNull();
  });

  it('should call onClose when close button is clicked', () => {
    const mockOnClose = vi.fn();
    render(<Toast message="Test" type="info" onClose={mockOnClose} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should clear timeout on unmount', () => {
    const mockOnClose = vi.fn();
    const { unmount } = render(<Toast message="Test" type="info" onClose={mockOnClose} />);

    unmount();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // onClose should not be called after unmount
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
