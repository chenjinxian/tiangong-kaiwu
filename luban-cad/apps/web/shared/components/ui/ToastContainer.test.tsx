/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useToast } from './ToastContainer.js';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty toasts', () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.showToast).toBeDefined();
    expect(result.current.ToastContainer).toBeDefined();
  });

  it('should show a toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Test message', 'info');
    });

    const { container } = render(<result.current.ToastContainer />);
    expect(container.textContent).toContain('Test message');
  });

  it('should show multiple toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('First message', 'info');
    });

    act(() => {
      vi.advanceTimersByTime(1);
    });

    act(() => {
      result.current.showToast('Second message', 'success');
    });

    const { container } = render(<result.current.ToastContainer />);
    expect(container.textContent).toContain('First message');
    expect(container.textContent).toContain('Second message');
  });

  it('should auto-remove toast after duration', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Test message', 'info');
    });

    const { container, rerender } = render(<result.current.ToastContainer />);
    expect(container.textContent).toContain('Test message');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    rerender(<result.current.ToastContainer />);
    expect(container.textContent).not.toContain('Test message');
  });

  it('should use info type as default', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Default type message');
    });

    const { container } = render(<result.current.ToastContainer />);
    expect(container.textContent).toContain('Default type message');
  });

  it('should close toast when onClose is called', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Test message', 'info');
    });

    const { container, rerender } = render(<result.current.ToastContainer />);
    expect(container.textContent).toContain('Test message');

    // Click the close button (iTwinUI Alert uses aria-label="Close")
    const closeButton = screen.getByRole('button', { name: /close/i });
    act(() => {
      closeButton.click();
    });

    rerender(<result.current.ToastContainer />);
    expect(container.textContent).not.toContain('Test message');
  });

  it('should show different toast types', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Info message', 'info');
    });

    act(() => {
      vi.advanceTimersByTime(1);
    });

    act(() => {
      result.current.showToast('Success message', 'success');
    });

    act(() => {
      vi.advanceTimersByTime(1);
    });

    act(() => {
      result.current.showToast('Error message', 'error');
    });

    const { container } = render(<result.current.ToastContainer />);
    expect(container.textContent).toContain('Info message');
    expect(container.textContent).toContain('Success message');
    expect(container.textContent).toContain('Error message');
  });
});
