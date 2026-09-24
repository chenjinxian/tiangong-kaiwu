import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBriefcaseConnection } from './useBriefcaseConnection.js';

// Hoist mock functions so vi.mock factories can reference them
const mockDownloadBriefcase = vi.hoisted(() => vi.fn());
const mockOpenFile = vi.hoisted(() => vi.fn());
const mockSaveChanges = vi.hoisted(() => vi.fn());
const mockPushChanges = vi.hoisted(() => vi.fn());
const mockPullChanges = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());

vi.mock('@itwin/core-frontend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IpcApp: {
    makeIpcProxy: vi.fn(() => ({
      downloadBriefcase: mockDownloadBriefcase,
    })),
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BriefcaseConnection: {
    openFile: mockOpenFile,
  },
}));

vi.mock('@luban-cad/shared', () => ({
  openCloudIpcChannel: 'open-cloud-ipc',
}));

const mockConnection = {
  saveChanges: mockSaveChanges,
  pushChanges: mockPushChanges,
  pullChanges: mockPullChanges,
  close: mockClose,
};

const mockDownloadResult = {
  fileName: '/cache/abc/briefcases/42.bim',
  briefcaseId: 42,
  changeset: { id: 'cs1', index: 5 },
};

describe('useBriefcaseConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownloadBriefcase.mockResolvedValue(mockDownloadResult);
    mockOpenFile.mockResolvedValue(mockConnection);
  });

  it('returns idle state when options is null', () => {
    const { result } = renderHook(() => useBriefcaseConnection(null));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBeNull();
    expect(mockDownloadBriefcase).not.toHaveBeenCalled();
  });

  it('starts loading, then returns open connection', async () => {
    const { result } = renderHook(() =>
      useBriefcaseConnection({ iTwinId: 'xyz', iModelId: 'abc' })
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.connection).toBeNull();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBe(mockConnection);
    expect(result.current.error).toBeNull();
  });

  it('calls downloadBriefcase then BriefcaseConnection.openFile', async () => {
    renderHook(() =>
      useBriefcaseConnection({ iTwinId: 'xyz', iModelId: 'abc' })
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockDownloadBriefcase).toHaveBeenCalledWith('xyz', 'abc', undefined);
    expect(mockOpenFile).toHaveBeenCalledWith({
      fileName: '/cache/abc/briefcases/42.bim',
      key: '/cache/abc/briefcases/42.bim',
      readonly: false,
    });
  });

  it('exposes saveChanges, pushChanges, pullChanges', async () => {
    const { result } = renderHook(() =>
      useBriefcaseConnection({ iTwinId: 'xyz', iModelId: 'abc' })
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => { await result.current.saveChanges('my save'); });
    expect(mockSaveChanges).toHaveBeenCalledWith('my save');

    await act(async () => { await result.current.pushChanges('my push'); });
    expect(mockPushChanges).toHaveBeenCalledWith('my push');

    await act(async () => { await result.current.pullChanges(); });
    expect(mockPullChanges).toHaveBeenCalled();
  });

  it('captures and exposes errors', async () => {
    mockDownloadBriefcase.mockRejectedValue(new Error('Hub unavailable'));

    const { result } = renderHook(() =>
      useBriefcaseConnection({ iTwinId: 'xyz', iModelId: 'abc' })
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error?.message).toBe('Hub unavailable');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBeNull();
  });

  it('closes connection on unmount', async () => {
    const { unmount } = renderHook(() =>
      useBriefcaseConnection({ iTwinId: 'xyz', iModelId: 'abc' })
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    unmount();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockClose).toHaveBeenCalled();
  });
});
