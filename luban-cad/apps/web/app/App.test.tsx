/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for App component
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import App from './App.js';

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

// Mock iTwinUI
vi.mock('@itwin/itwinui-react', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="itwin-theme-provider">{children}</div>,
  ProgressRadial: () => <div data-testid="progress-radial">Loading...</div>,
}));

// Mock contexts and components
vi.mock('./contexts/UserContext.js', () => ({
   
  UserProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="user-provider">{children}</div>,
}));

vi.mock('../features/editor/components/PrivateRoute.js', () => ({
   
  PrivateRoute: ({ children }: { children: React.ReactNode }) => <div data-testid="private-route">{children}</div>,
}));

// Mock lazy-loaded pages
vi.mock('../src/pages/Login/Login.js', () => ({
  default: () => <div data-testid="login-page">Login Page</div>,
}));

vi.mock('../src/pages/Register/Register.js', () => ({
  default: () => <div data-testid="register-page">Register Page</div>,
}));

vi.mock('../src/pages/Documents/Documents.js', () => ({
  default: () => <div data-testid="documents-page">Documents Page</div>,
}));

vi.mock('../src/pages/ITwinDetail/ITwinDetail.js', () => ({
  default: () => <div data-testid="itwin-detail-page">iTwin Detail Page</div>,
}));

vi.mock('../src/pages/Editor/Editor.js', () => ({
  default: () => <div data-testid="editor-page">Editor Page</div>,
}));

describe('App', () => {
  it('should render without crashing', async () => {
    let container!: Element;
    await act(async () => {
      ({ container } = render(<App />));
    });
    expect(container).toBeDefined();
  });

  it('should render theme provider', async () => {
    let getByTestId!: ReturnType<typeof render>['getByTestId'];
    await act(async () => {
      ({ getByTestId } = render(<App />));
    });
    // The iTwinUI ThemeProvider is rendered inside the custom ThemeProvider
    expect(getByTestId('itwin-theme-provider')).toBeDefined();
  });

  it('should render user provider', async () => {
    let getByTestId!: ReturnType<typeof render>['getByTestId'];
    await act(async () => {
      ({ getByTestId } = render(<App />));
    });
    expect(getByTestId('user-provider')).toBeDefined();
  });
});
