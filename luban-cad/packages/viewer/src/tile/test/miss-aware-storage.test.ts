/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * P2.8：tile cache miss 哨兵——204/404 必须抛错（TileStorage 转为 undefined →
 * 原生回退）；200 正常返回；URL 与内置 FetchCloudStorage 同形。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrontendConfigDownloadInput } from '@itwin/object-storage-core/lib/frontend';
import { MissAwareFetchCloudStorage } from '../miss-aware-storage.js';

const URL_INPUT = {
  url: 'http://example.test/tile',
  storageType: 'azure',
  transferType: 'buffer',
} as const;

const CONFIG_INPUT = {
  transferType: 'buffer',
  reference: {
    baseDirectory: 'im-1',
    relativeDirectory: 'tiles/tree-1/changeset-1',
    objectName: 'content-1',
  },
  transferConfig: {
    baseUrl: 'http://example.test',
    expiration: new Date(Date.now() + 60_000),
    storageType: 'azure',
    authentication: 'sv=1&sig=x',
  },
} as unknown as FrontendConfigDownloadInput & { transferType: 'buffer' };

function response(status: number, bytes?: Uint8Array): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 200 ? 'OK' : 'Error',
    arrayBuffer: async () => bytes?.buffer ?? new ArrayBuffer(0),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MissAwareFetchCloudStorage', () => {
  it('200 returns the tile bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const storage = new MissAwareFetchCloudStorage();

    const bytes = await storage.download(URL_INPUT);
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('204 miss sentinel throws (so TileStorage falls back)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(204)));
    const storage = new MissAwareFetchCloudStorage();
    await expect(storage.download(URL_INPUT)).rejects.toThrow('tile cache miss');
  });

  it('404 direct Azurite miss throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404)));
    const storage = new MissAwareFetchCloudStorage();
    await expect(storage.download(URL_INPUT)).rejects.toThrow('tile cache miss');
  });

  it('config input builds the canonical object URL with SAS', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);
    const storage = new MissAwareFetchCloudStorage();

    await storage.download(CONFIG_INPUT);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://example.test/im-1/tiles/tree-1/changeset-1/content-1?sv=1&sig=x',
    );
  });
});
