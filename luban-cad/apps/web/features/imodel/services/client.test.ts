/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthorization = vi.fn();

vi.mock('../../../shared/services/imodels/client.js', () => ({
  getAuthorization: (...args: unknown[]) => mockGetAuthorization(...args),
}));

import { copyIModel, getDownloadUrl, NoDownloadLinkError } from './client.js';

const realFetch = global.fetch;
let calls: Array<{ url: string; init?: RequestInit }>;

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockGetAuthorization.mockResolvedValue({ scheme: 'Bearer', token: 'tok' });
  calls = [];
  vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(input), init });
    return respond(200, {});
  }) as typeof fetch);
});

describe('copyIModel', () => {
  it('POSTs to the official clone endpoint and extracts the new id from the Location header', async () => {
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 201, headers: { Location: '/imodels/new-42' } });
    }) as typeof fetch);

    const result = await copyIModel('src-1', 'twin-2', 'My Copy');

    expect(result).toEqual({ iModelId: 'new-42' });
    expect(calls[0].url).toContain('/imodels/src-1/clone');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ name: 'My Copy', targetITwinId: 'twin-2' });
  });

  it('rejects a 201 without a Location header (contract violation)', async () => {
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 201 });
    }) as typeof fetch);

    await expect(copyIModel('src-1', 'twin-2', 'x')).rejects.toThrow(/Location/);
  });
});

describe('getDownloadUrl', () => {
  it('reads the download link from GET /imodels/{id} _links.download', async () => {
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init });
      return respond(200, { id: 'src-1', _links: { download: { href: '/imodels/src-1/baselinefile/download?sig=1' } } });
    }) as typeof fetch);

    const url = await getDownloadUrl('src-1');

    expect(url).toBe('/imodels/src-1/baselinefile/download?sig=1');
    expect(calls[0].url).toMatch(/\/imodels\/src-1$/);
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('throws NoDownloadLinkError when the hub exposes no download link', async () => {
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init });
      return respond(200, { id: 'src-1', _links: { changesets: { href: '/imodels/src-1/changesets' } } });
    }) as typeof fetch);

    await expect(getDownloadUrl('src-1')).rejects.toBeInstanceOf(NoDownloadLinkError);
  });
});

describe('fetch passthrough sanity', () => {
  it('still sends the Authorization header', async () => {
    await getDownloadUrl('src-1').catch(() => undefined);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });
});

void realFetch;
