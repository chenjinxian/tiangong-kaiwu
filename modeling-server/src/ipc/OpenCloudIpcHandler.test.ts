import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @itwin/core-backend before importing handler
vi.mock('@itwin/core-backend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IpcHandler: class {
    static register() {}
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BriefcaseManager: {
    getCachedBriefcases: vi.fn(),
    downloadBriefcase: vi.fn(),
    getFileName: vi.fn(),
    acquireNewBriefcaseId: vi.fn().mockResolvedValue(42),
    releaseBriefcase: vi.fn().mockResolvedValue(undefined),
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelHost: {
    getAccessToken: vi.fn().mockResolvedValue({}),
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelJsFs: {
    unlinkSync: vi.fn(),
  },
}));

// IModelError lives in @itwin/core-common — mock it there
vi.mock('@itwin/core-common', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelError: class extends Error {
    constructor(public errorNumber: number, message: string) {
      super(message);
    }
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BriefcaseIdValue: {
    FirstValid: 2,
  },
}));

vi.mock('@luban-cad/shared', () => ({
  openCloudIpcChannel: 'open-cloud-ipc',
}));


import { OpenCloudIpcHandler } from './OpenCloudIpcHandler.js';
import { BriefcaseManager, IModelJsFs } from '@itwin/core-backend';
import { IModelStatus } from '@itwin/core-bentley';
import { IModelError } from '@itwin/core-common';

const mockCachedBriefcase = {
  fileName: '/cache/abc/briefcases/42.bim',
  briefcaseId: 42,
  iModelId: 'abc',
  iTwinId: 'xyz',
  changeset: { id: 'cs1', index: 5 },
  fileSize: 1024,
};

describe('OpenCloudIpcHandler', () => {
  let handler: OpenCloudIpcHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new OpenCloudIpcHandler();
  });

  it('returns cached briefcase without downloading', async () => {
    vi.mocked(BriefcaseManager.getCachedBriefcases).mockReturnValue([mockCachedBriefcase]);

    const result = await handler.downloadBriefcase('xyz', 'abc');

    expect(result.fileName).toBe('/cache/abc/briefcases/42.bim');
    expect(result.briefcaseId).toBe(42);
    expect(result.changeset.id).toBe('cs1');
    expect(BriefcaseManager.downloadBriefcase).not.toHaveBeenCalled();
  });

  it('downloads when no cached briefcase exists', async () => {
    vi.mocked(BriefcaseManager.getCachedBriefcases).mockReturnValue([]);
    vi.mocked(BriefcaseManager.downloadBriefcase).mockResolvedValue(mockCachedBriefcase);

    const result = await handler.downloadBriefcase('xyz', 'abc');

    expect(BriefcaseManager.downloadBriefcase).toHaveBeenCalledWith({ iTwinId: 'xyz', iModelId: 'abc', briefcaseId: 42 });
    expect(result.fileName).toBe('/cache/abc/briefcases/42.bim');
  });

  it('deletes orphaned file and retries on FileAlreadyExists', async () => {
    const orphanedError = new IModelError(IModelStatus.FileAlreadyExists, 'File exists');
    vi.mocked(BriefcaseManager.getCachedBriefcases).mockReturnValue([]);
    vi.mocked(BriefcaseManager.downloadBriefcase)
      .mockRejectedValueOnce(orphanedError)
      .mockResolvedValueOnce(mockCachedBriefcase);
    vi.mocked(BriefcaseManager.getFileName).mockReturnValue('/cache/abc/briefcases/0.bim');

    const result = await handler.downloadBriefcase('xyz', 'abc');

    expect(IModelJsFs.unlinkSync).toHaveBeenCalledWith('/cache/abc/briefcases/0.bim');
    expect(BriefcaseManager.downloadBriefcase).toHaveBeenCalledTimes(2);
    expect(result.briefcaseId).toBe(42);
  });

  it('rethrows non-FileAlreadyExists errors', async () => {
    vi.mocked(BriefcaseManager.getCachedBriefcases).mockReturnValue([]);
    vi.mocked(BriefcaseManager.downloadBriefcase).mockRejectedValue(new Error('Network error'));

    await expect(handler.downloadBriefcase('xyz', 'abc')).rejects.toThrow('Network error');
  });

  it('serializes concurrent calls for the same iModelId', async () => {
    vi.mocked(BriefcaseManager.getCachedBriefcases).mockReturnValue([]);
    let downloadCount = 0;
    vi.mocked(BriefcaseManager.downloadBriefcase).mockImplementation(async () => {
      downloadCount++;
      await new Promise((r) => setTimeout(r, 10));
      return mockCachedBriefcase;
    });

    // Both calls happen concurrently for the same iModelId
    const [r1, r2] = await Promise.all([
      handler.downloadBriefcase('xyz', 'abc'),
      handler.downloadBriefcase('xyz', 'abc'),
    ]);

    // Only one actual download should have happened
    expect(downloadCount).toBe(1);
    expect(r1.fileName).toBe(mockCachedBriefcase.fileName);
    expect(r2.fileName).toBe(mockCachedBriefcase.fileName);
  });
});
