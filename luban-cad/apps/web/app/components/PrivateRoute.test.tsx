/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for PrivateRoute component
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute.js';

// Mock UserContext — PrivateRoute only consumes isAuthenticated/isLoading
const { mockUseUser } = vi.hoisted(() => ({ mockUseUser: vi.fn() }));
vi.mock('../contexts/UserContext.js', () => ({
  useUser: mockUseUser,
}));

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/documents']}>
      <Routes>
        <Route
          path="/documents"
          element={
            <PrivateRoute>
              <div>protected content</div>
            </PrivateRoute>
          }
        />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('PrivateRoute', () => {
  beforeEach(() => {
    mockUseUser.mockReset();
  });

  it('renders a ProgressRadial while auth state is loading', async () => {
    mockUseUser.mockReturnValue({ isAuthenticated: false, isLoading: true });
    const { container } = renderWithRouter();
    // Flush the microtask iTwinUI's ShadowRoot uses to portal its internals
    await act(async () => {});
    // itwinui-react v3 renders the radial as a version-prefixed class
    // (e.g. `_iui3220-progress-indicator-radial`), so match by substring
    expect(container.querySelector('[class*="progress-indicator-radial"]')).not.toBeNull();
    expect(container.querySelector('[data-iui-indeterminate="true"]')).not.toBeNull();
    expect(screen.queryByText('login page')).toBeNull();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseUser.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderWithRouter();
    expect(screen.getByText('login page')).toBeDefined();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('renders children when authenticated', () => {
    mockUseUser.mockReturnValue({ isAuthenticated: true, isLoading: false });
    renderWithRouter();
    expect(screen.getByText('protected content')).toBeDefined();
    expect(screen.queryByText('login page')).toBeNull();
  });
});
