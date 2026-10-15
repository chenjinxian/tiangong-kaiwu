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
  addUserMember,
  getAuthorization,
  listRoles,
  listUserMembers,
  removeUserMember,
  updateUserMember,
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

const USERS_ROOT = '/accesscontrol/itwins/twin-1/members/users';

beforeEach(() => {
  vi.unstubAllGlobals();
  calls = [];
});

describe('listUserMembers', () => {
  it('GETs the official users-scoped route and unwraps {members}', async () => {
    stubFetch(() => respond(200, { members: [{ id: 'u-1', email: 'a@b.c', roles: [] }] }));

    const result = await listUserMembers('twin-1');

    expect(result).toEqual([{ id: 'u-1', email: 'a@b.c', roles: [] }]);
    expect(calls[0].url).toMatch(new RegExp(`${USERS_ROOT}$`));
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('returns [] when the envelope is missing', async () => {
    stubFetch(() => respond(200, {}));

    expect(await listUserMembers('twin-1')).toEqual([]);
  });
});

describe('addUserMember', () => {
  it('POSTs the backend DTO {email, roleIds} (plural roleIds, not roleId) and unwraps the single-member envelope', async () => {
    const member = { id: 'u-1', email: 'a@b.c', roles: [] };
    stubFetch(() => respond(201, { members: [member] }));

    const result = await addUserMember('twin-1', { email: 'a@b.c', roleIds: ['r-1'] });

    expect(result).toEqual(member);
    expect(calls[0].url).toMatch(new RegExp(`${USERS_ROOT}$`));
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ email: 'a@b.c', roleIds: ['r-1'] });
  });

  it('rejects when the response carries no member (contract violation)', async () => {
    stubFetch(() => respond(201, { members: [] }));

    await expect(addUserMember('twin-1', { email: 'a@b.c', roleIds: [] })).rejects.toThrow(/no member/);
  });
});

describe('updateUserMember', () => {
  it('PATCHes members/users/:memberId and returns the raw roleIds-shaped member', async () => {
    const member = { id: 'm-1', iTwinId: 'twin-1', userId: 'u-1', email: 'a@b.c', roleIds: ['r-2'] };
    stubFetch(() => respond(200, { member }));

    const result = await updateUserMember('twin-1', 'm-1', { roleIds: ['r-2'] });

    expect(result).toEqual(member);
    expect(calls[0].url).toMatch(new RegExp(`${USERS_ROOT}/m-1$`));
    expect(calls[0].init?.method).toBe('PATCH');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ roleIds: ['r-2'] });
  });
});

describe('removeUserMember', () => {
  it('DELETEs members/users/:memberId', async () => {
    stubFetch(() => respond(200, null));

    await expect(removeUserMember('twin-1', 'm-1')).resolves.toBeUndefined();

    expect(calls[0].url).toMatch(new RegExp(`${USERS_ROOT}/m-1$`));
    expect(calls[0].init?.method).toBe('DELETE');
  });
});

describe('listRoles', () => {
  it('GETs itwins/:id/roles and unwraps {roles} with displayName', async () => {
    stubFetch(() => respond(200, { roles: [{ id: 'r-1', displayName: 'Admin', permissions: ['x'] }] }));

    const result = await listRoles('twin-1');

    expect(result).toEqual([{ id: 'r-1', displayName: 'Admin', permissions: ['x'] }]);
    expect(calls[0].url).toMatch(/\/accesscontrol\/itwins\/twin-1\/roles$/);
  });
});

describe('getAuthorization', () => {
  it('returns the raw access token for SDK callbacks', async () => {
    expect(await getAuthorization()).toBe('tok');
  });
});

describe('error handling', () => {
  it('propagates ApiError from the unified httpClient envelope', async () => {
    stubFetch(() => respond(403, { error: { code: 'Forbidden', message: 'denied' } }));

    const err = await listUserMembers('twin-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(403);
    expect((err as ApiError).message).toBe('无权限访问该资源');
  });
});
