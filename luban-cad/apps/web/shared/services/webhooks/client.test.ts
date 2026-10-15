/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

// fetchWithAuth sources tokens from the auth client; mock it so the stubbed
// global fetch is the only network boundary.
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  getValidAccessToken: vi.fn(async () => 'tok'),
  refreshAccessToken: vi.fn(async () => null),
}));

import {
  createWebhook,
  deleteWebhook,
  getAuthorization,
  getWebhook,
  listWebhooks,
  updateWebhook,
  type WebhookSubscription,
} from './client.js';
import { ApiError } from '../../api/httpClient.js';

let calls: Array<{ url: string; init?: RequestInit }>;

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function stubFetch(responder: () => Response) {
  vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(input), init });
    return responder();
  }) as typeof fetch);
}

const webhook: WebhookSubscription = {
  id: 'wh-1',
  callbackUrl: 'https://example.com/hook',
  eventTypes: ['iModels.iModelCreated.v1'],
  scope: 'iTwin',
  scopeId: 'twin-1',
  active: false,
};

beforeEach(() => {
  vi.unstubAllGlobals();
  calls = [];
});

describe('listWebhooks', () => {
  it('GETs the official /webhooks root (not the stale /itwins/:id/webhooks) and unwraps the envelope', async () => {
    stubFetch(() => respond(200, { webhooks: [webhook] }));

    const result = await listWebhooks();

    expect(result).toEqual([webhook]);
    expect(calls[0].url).toMatch(/\/webhooks$/);
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('forwards scope/scopeId as query filters when provided', async () => {
    stubFetch(() => respond(200, { webhooks: [] }));

    await listWebhooks('iTwin', 'twin-1');

    expect(calls[0].url).toMatch(/\/webhooks\?scope=iTwin&scopeId=twin-1$/);
  });

  it('omits the query string when no filters are given', async () => {
    stubFetch(() => respond(200, { webhooks: [] }));

    await listWebhooks();

    expect(calls[0].url).not.toContain('?');
  });

  it('returns [] when the envelope is missing', async () => {
    stubFetch(() => respond(200, {}));

    expect(await listWebhooks()).toEqual([]);
  });
});

describe('createWebhook', () => {
  it('POSTs the official body {callbackUrl, eventTypes, scope, scopeId} to /webhooks', async () => {
    stubFetch(() => respond(201, { ...webhook, secret: 'one-time-secret' }));

    const result = await createWebhook({
      callbackUrl: 'https://example.com/hook',
      eventTypes: ['iModels.iModelCreated.v1'],
      scope: 'iTwin',
      scopeId: 'twin-1',
    });

    expect(calls[0].url).toMatch(/\/webhooks$/);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      callbackUrl: 'https://example.com/hook',
      eventTypes: ['iModels.iModelCreated.v1'],
      scope: 'iTwin',
      scopeId: 'twin-1',
    });
    expect(result.id).toBe('wh-1');
    // 创建响应独有的一次性 secret（HMAC 验签用）必须透出给调用方
    expect(result.secret).toBe('one-time-secret');
  });
});

describe('getWebhook', () => {
  it('GETs /webhooks/:webhookId', async () => {
    stubFetch(() => respond(200, webhook));

    const result = await getWebhook('wh-1');

    expect(result).toEqual(webhook);
    expect(calls[0].url).toMatch(/\/webhooks\/wh-1$/);
  });
});

describe('updateWebhook', () => {
  it('PATCHes /webhooks/:webhookId with only the provided fields', async () => {
    stubFetch(() => respond(200, { ...webhook, active: true }));

    const result = await updateWebhook('wh-1', { active: true });

    expect(result.active).toBe(true);
    expect(calls[0].url).toMatch(/\/webhooks\/wh-1$/);
    expect(calls[0].init?.method).toBe('PATCH');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ active: true });
  });
});

describe('deleteWebhook', () => {
  it('DELETEs /webhooks/:webhookId and resolves on 204', async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await expect(deleteWebhook('wh-1')).resolves.toBeUndefined();

    expect(calls[0].url).toMatch(/\/webhooks\/wh-1$/);
    expect(calls[0].init?.method).toBe('DELETE');
  });
});

describe('getAuthorization', () => {
  it('returns the raw access token for SDK callbacks', async () => {
    expect(await getAuthorization()).toBe('tok');
  });
});

describe('error handling', () => {
  it('propagates ApiError from the unified httpClient envelope', async () => {
    stubFetch(() => respond(404, { error: { code: 'NotFound', message: 'webhook missing' } }));

    const err = await getWebhook('wh-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(404);
    expect((err as ApiError).code).toBe('NotFound');
    expect((err as ApiError).message).toBe('webhook missing');
  });

  it('falls back to the HTTP status text when the body is not an envelope', async () => {
    stubFetch(() => new Response('not json', { status: 500, statusText: 'Internal Server Error' }));

    const err = await listWebhooks().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(500);
    expect((err as ApiError).message).toBe('HTTP 500');
  });
});
