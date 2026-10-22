// src/app/test/RequireAuth.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireAuth, redirectLocationFrom } from '../guards/RequireAuth.js';

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

// ── M4 Task 8（M3 终审挂账清偿）────────────────────────────────────────────

describe('M4-T8 T1-③：redirectLocationFrom 形状守卫', () => {
  it('from 非 Location 形状（缺/空 pathname）回退 ROUTE_DOCUMENTS；合法形状原样保留', () => {
    expect(redirectLocationFrom(undefined)).toEqual({ pathname: '/documents' });
    expect(redirectLocationFrom({})).toEqual({ pathname: '/documents' });
    expect(redirectLocationFrom({ pathname: '' })).toEqual({ pathname: '/documents' });
    expect(redirectLocationFrom({ pathname: '/documents/itwin-9/im-1' })).toEqual({
      pathname: '/documents/itwin-9/im-1',
    });
  });
});
