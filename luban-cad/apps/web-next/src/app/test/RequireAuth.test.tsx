// src/app/test/RequireAuth.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../guards/RequireAuth.js';

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: { getStoredAuth: vi.fn() },
}));

import { AuthSession } from '@clients/auth/AuthSession.js';

describe('RequireAuth', () => {
  it('无会话跳 /login', () => {
    (AuthSession.getStoredAuth as ReturnType<typeof vi.fn>).mockReturnValue(null);
    render(
      <MemoryRouter initialEntries={['/documents']}>
        <RequireAuth><div data-testid="protected">protected</div></RequireAuth>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('有会话渲染 children', () => {
    (AuthSession.getStoredAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: '1' }, accessToken: 'x' });
    render(
      <MemoryRouter initialEntries={['/documents']}>
        <RequireAuth><div data-testid="protected">protected</div></RequireAuth>
      </MemoryRouter>
    );
    expect(screen.getByTestId('protected')).toBeDefined();
  });
});
