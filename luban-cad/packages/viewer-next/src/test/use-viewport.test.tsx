// @vitest-environment jsdom
//
// useViewport（web-next M3 Task 3）：React 宿主 hook 验收——
//  1) 挂载 → startViewer 以入参选项启动；ready 相位透传到 DOM；
//  2) 卸载 → stopViewer 回收；
//  3) startViewer 拒绝 → error 相位 + 可读消息。
//
// mock 口径与 web-initializer.test.ts 同族：host/web-initializer 模块级
// mock（零 core-frontend 加载），hook 本体的 ref/相位语义真实参与。

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { startViewerMock, stopViewerMock } = vi.hoisted(() => ({
  startViewerMock: vi.fn(),
  stopViewerMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../host/web-initializer.js', () => ({
  startViewer: startViewerMock,
  stopViewer: stopViewerMock,
}));

import { useViewport } from '../viewport/use-viewport.js';

function Harness(): React.JSX.Element {
  const { viewportRef, phase, error } = useViewport({
    backendUrl: 'http://localhost:5310',
    hubUrl: 'http://localhost:5400',
    accessToken: 'jwt-x',
  });
  return (
    <div
      ref={viewportRef}
      data-testid="viewport-host"
      data-phase={phase}
      data-error={error ?? ''}
    />
  );
}

beforeEach(() => {
  startViewerMock.mockReset();
  startViewerMock.mockResolvedValue(undefined);
  stopViewerMock.mockClear();
});

// 本包无 setupFiles（globals:false → RTL 自动 cleanup 不生效），用例间显式清场。
afterEach(cleanup);

describe('useViewport', () => {
  it('挂载 → startViewer 以选项启动；ready 相位透传 DOM', async () => {
    render(<Harness />);
    expect(startViewerMock).toHaveBeenCalledWith({
      backendUrl: 'http://localhost:5310',
      hubUrl: 'http://localhost:5400',
      accessToken: 'jwt-x',
    });
    await waitFor(() =>
      expect(screen.getByTestId('viewport-host').getAttribute('data-phase')).toBe('ready'),
    );
  });

  it('卸载 → stopViewer 回收', async () => {
    const { unmount } = render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('viewport-host').getAttribute('data-phase')).toBe('ready'),
    );
    unmount();
    expect(stopViewerMock).toHaveBeenCalledTimes(1);
  });

  it('startViewer 拒绝 → error 相位 + 可读消息', async () => {
    startViewerMock.mockRejectedValue(new Error('ipc unreachable'));
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('viewport-host').getAttribute('data-phase')).toBe('error'),
    );
    expect(screen.getByTestId('viewport-host').getAttribute('data-error')).toBe('ipc unreachable');
    expect(stopViewerMock).not.toHaveBeenCalled();
  });
});
