/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

// fetchWithAuth (shared/api/httpClient) sources tokens from the auth client;
// mock it so the stubbed global fetch is the only network boundary.
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  getValidAccessToken: vi.fn(async () => 'tok'),
  refreshAccessToken: vi.fn(async () => null),
}));

import { copyIModel, getDownloadUrl, NoDownloadLinkError } from './client.js';

const realFetch = global.fetch;
let calls: Array<{ url: string; init?: RequestInit }>;

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

beforeEach(() => {
  vi.unstubAllGlobals();
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
  it('reads _links.download.href from GET /imodels/{id}/baselinefile (official baselineFile envelope)', async () => {
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init });
      return respond(200, {
        baselineFile: {
          id: 'bf-1',
          displayName: 'baseline.bim',
          state: 'initialized',
          _links: { download: { href: 'https://blob.example.com/baseline.bim?sig=1' } },
        },
      });
    }) as typeof fetch);

    const url = await getDownloadUrl('src-1');

    expect(url).toBe('https://blob.example.com/baseline.bim?sig=1');
    expect(calls[0].url).toMatch(/\/imodels\/src-1\/baselinefile$/);
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('also accepts a flat _links.download envelope without the baselineFile wrapper', async () => {
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init });
      return respond(200, { iModelId: 'src-1', state: 'initialized', _links: { download: { href: 'https://blob.example.com/flat.bim?sig=2' } } });
    }) as typeof fetch);

    await expect(getDownloadUrl('src-1')).resolves.toBe('https://blob.example.com/flat.bim?sig=2');
  });

  it('throws NoDownloadLinkError when baselinefile exposes no download link', async () => {
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init });
      return respond(200, { iModelId: 'src-1', baselineBriefcaseId: '1', fileSize: 12, state: 'initialized' });
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
