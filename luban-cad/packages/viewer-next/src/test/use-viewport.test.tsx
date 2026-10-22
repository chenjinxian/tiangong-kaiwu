// @vitest-environment jsdom
//
// useViewport（web-next M3 Task 3，M4 Task 1 换引用计数接线）：React 宿主 hook 验收——
//  1) 挂载 → acquireViewer 以入参选项启动（幂等 startViewer + 引用计数）；ready 相位透传到 DOM；
//  2) 卸载 → releaseViewer 回收（引用计数 1→0 才真正 shutdown，hook 只管计数出入）；
//  3) acquireViewer 拒绝 → error 相位 + 可读消息。
//
// mock 口径与 web-initializer.test.ts 同族：host/web-initializer 模块级
// mock（零 core-frontend 加载），hook 本体的 ref/相位语义真实参与。

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { acquireViewerMock, releaseViewerMock } = vi.hoisted(() => ({
  acquireViewerMock: vi.fn(),
  releaseViewerMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../host/web-initializer.js', () => ({
  acquireViewer: acquireViewerMock,
  releaseViewer: releaseViewerMock,
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
  acquireViewerMock.mockReset();
  acquireViewerMock.mockResolvedValue(undefined);
  releaseViewerMock.mockClear();
});

// 本包无 setupFiles（globals:false → RTL 自动 cleanup 不生效），用例间显式清场。
afterEach(cleanup);

describe('useViewport', () => {
  it('挂载 → acquireViewer 以选项启动；ready 相位透传 DOM', async () => {
    render(<Harness />);
    expect(acquireViewerMock).toHaveBeenCalledWith({
      backendUrl: 'http://localhost:5310',
      hubUrl: 'http://localhost:5400',
      accessToken: 'jwt-x',
    });
    await waitFor(() =>
      expect(screen.getByTestId('viewport-host').getAttribute('data-phase')).toBe('ready'),
    );
  });

  it('卸载 → releaseViewer 回收', async () => {
    const { unmount } = render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('viewport-host').getAttribute('data-phase')).toBe('ready'),
    );
    unmount();
    expect(releaseViewerMock).toHaveBeenCalledTimes(1);
  });

  it('acquireViewer 拒绝 → error 相位 + 可读消息', async () => {
    acquireViewerMock.mockRejectedValue(new Error('ipc unreachable'));
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('viewport-host').getAttribute('data-phase')).toBe('error'),
    );
    expect(screen.getByTestId('viewport-host').getAttribute('data-error')).toBe('ipc unreachable');
    expect(releaseViewerMock).not.toHaveBeenCalled();
  });
});
