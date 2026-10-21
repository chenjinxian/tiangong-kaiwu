// src/routes/test/DevViewerRoute.test.tsx
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '@clients/auth/AuthSession.js';

const startViewerMock = vi.fn().mockResolvedValue(undefined);
const stopViewerMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@luban-cad/viewer-next', () => ({
  startViewer: (...a: unknown[]) => startViewerMock(...a),
  stopViewer: (...a: unknown[]) => stopViewerMock(...a),
}));

import { DevViewerRoute } from '../DevViewerRoute.js';

describe('DevViewerRoute', () => {
  // 本项目 vitest globals:false → RTL 自动 cleanup 不生效（同 App.test.tsx 约定）；
  // stubGlobal 的 IModelApp 补形须逐用例撤销，防串染登录用例。
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('点击启动后调用 startViewer 并显示 toolAdmin 状态', async () => {
    vi.stubGlobal('IModelApp', { toolAdmin: {} });
    render(<DevViewerRoute />);
    await userEvent.click(screen.getByRole('button', { name: '启动查看器' }));
    await waitFor(() =>
      expect(screen.getByTestId('viewer-status').textContent).toMatch(/toolAdmin: ready/),
    );
    expect(startViewerMock).toHaveBeenCalledTimes(1);
  });

  it('登录成功后会话落库并显示已登录用户', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: 'jwt-x',
      refreshToken: 'r1',
      tokenExpires: Date.now() + 900_000,
      user: { id: '3', email: 'test@example.com', name: 'Test User' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<DevViewerRoute />);
    await userEvent.type(screen.getByTestId('dev-login-email'), 'test@example.com');
    await userEvent.type(screen.getByTestId('dev-login-password'), 'Test123!@#');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() =>
      expect(screen.getByTestId('dev-login-state').textContent).toMatch(/Test User/),
    );
    expect(AuthSession.getStoredAuth()?.accessToken).toBe('jwt-x');
  });

  it('StrictMode 双挂载下登录态更新不被吞（mountedRef 哨兵回归）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: 'jwt-x',
      refreshToken: 'r1',
      tokenExpires: Date.now() + 900_000,
      user: { id: '3', email: 'test@example.com', name: 'Test User' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    // main.tsx 以 StrictMode 包壳：挂载→清理→再挂载，mountedRef 哨兵须在二次挂载拨回 true
    render(
      <React.StrictMode>
        <DevViewerRoute />
      </React.StrictMode>,
    );
    await userEvent.type(screen.getByTestId('dev-login-email'), 'test@example.com');
    await userEvent.type(screen.getByTestId('dev-login-password'), 'Test123!@#');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() =>
      expect(screen.getByTestId('dev-login-state').textContent).toMatch(/Test User/),
    );
  });
});
