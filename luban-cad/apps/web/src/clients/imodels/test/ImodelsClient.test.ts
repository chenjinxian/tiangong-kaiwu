// src/clients/imodels/test/ImodelsClient.test.ts
//
// Task 3 失败测试先行（brief Step 1）：mock 官方 @itwin/imodels-client-management
// 的 IModelsClient，断言两件事——
//  1) 调用形状：构造函数收 `{ api: { baseUrl: `${env.hubUrl}/imodels` } }`；
//     每个方法把 `authorization` 回调透传官方操作（官方 v6 形状：
//     `iModels.getRepresentationList({ authorization, urlParams: { iTwinId } })`、
//     `getSingle({ authorization, iModelId })`、`createEmpty({ authorization,
//     iModelProperties })`、`delete({ authorization, iModelId })`——
//     官方无 query({...}) 之名，brief 之「likely」以实测 .d.ts 为准）；
//     回调被调用时经 AuthSession.getValidAccessToken 取 token 并包成
//     `{ scheme: 'Bearer', token }`（懒回调：官方每次发请求都会调它，
//     分页场景下逐页拿新 token）；
//  2) 返回映射：getRepresentationList 返回 EntityListIterator（AsyncIterable），
//     封装层 for-await 收拢为 IModel[]；官方 reject 的 IModelsError
//     （{ code, statusCode?, message }）映射为 ApiClientError（status 三元组
//     契约，与 itwins 封装同姿态）。
//  3) Task 3（B-model P0 前置）：Named Version 通道——listNamedVersions 走
//     `namedVersions.getRepresentationList`（迭代器收拢），createNamedVersion 走
//     `namedVersions.create({ iModelId, namedVersionProperties })`。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@config/env.js';
import { AuthSession } from '../../auth/AuthSession.js';
import { ImodelsClient } from '../ImodelsClient.js';

// ---- 官方客户端 mock（vi.hoisted：factory 提升后仍可引用） ----
// importOriginal 保留 isIModelsApiError 等真实现——错误映射测试走真类型守卫。
const official = vi.hoisted(() => ({
  ctor: vi.fn(),
  getRepresentationList: vi.fn(),
  getSingle: vi.fn(),
  createEmpty: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  // T7：changesets 列表通道（与 iModels.getRepresentationList 分立，断言互不混淆）。
  changesetsGetRepresentationList: vi.fn(),
  // Task 3：Named Version 通道（与 changesets 通道分立）。
  namedVersionsGetRepresentationList: vi.fn(),
  namedVersionsCreate: vi.fn(),
  // P2.3：收藏通道（B 文档卡片收藏）。
  favoriteGetRepresentationList: vi.fn(),
  favoriteAdd: vi.fn(),
  favoriteRemove: vi.fn(),
}));

vi.mock('@itwin/imodels-client-management', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@itwin/imodels-client-management')>();
  return {
    ...actual,
    IModelsClient: class MockIModelsClient {
      public constructor(options?: unknown) {
        official.ctor(options);
      }
      public get iModels() {
        return {
          getRepresentationList: official.getRepresentationList,
          getSingle: official.getSingle,
          createEmpty: official.createEmpty,
          delete: official.delete,
          update: official.update,
        };
      }
      public get favoriteIModels() {
        return {
          getRepresentationList: official.favoriteGetRepresentationList,
          add: official.favoriteAdd,
          remove: official.favoriteRemove,
        };
      }
      public get changesets() {
        return {
          getRepresentationList: official.changesetsGetRepresentationList,
        };
      }
      public get namedVersions() {
        return {
          getRepresentationList: official.namedVersionsGetRepresentationList,
          create: official.namedVersionsCreate,
        };
      }
    },
  };
});

const TOKEN = 'tok-1';

/** 造一个 EntityListIterator 最小替身（封装层只 for-await，不触 byPage）。 */
function asyncIterableOf<T>(items: T[]): AsyncIterableIterator<T> {
  return (async function* () {
    yield* items;
  })();
}

/** 迭代即抛的替身（列表通道官方错误的真实形态：迭代中途 reject）。 */
function asyncIterableError(error: unknown): AsyncIterableIterator<never> {
  return (async function* () {
    throw error;
  })();
}

beforeEach(() => {
  vi.spyOn(AuthSession, 'getValidAccessToken').mockResolvedValue(TOKEN);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ImodelsClient（官方 IModelsClient 封装）', () => {
  it('构造函数以 `${env.hubUrl}/imodels` 作为官方 api.baseUrl', () => {
    new ImodelsClient();
    expect(official.ctor).toHaveBeenCalledWith({ api: { baseUrl: `${env.hubUrl}/imodels` } });
  });

  it('list(iTwinId)：getRepresentationList({ authorization, urlParams:{iTwinId} })，迭代器收拢为数组', async () => {
    const items = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    official.getRepresentationList.mockReturnValue(asyncIterableOf(items));
    const client = new ImodelsClient();

    await expect(client.list('twin-1')).resolves.toEqual(items);
    expect(official.getRepresentationList).toHaveBeenCalledWith(
      expect.objectContaining({ urlParams: { iTwinId: 'twin-1' } }),
    );
  });

  it('authorization 回调懒求值：调回调才取 token，返回 `{ scheme: "Bearer", token }`', async () => {
    official.getSingle.mockResolvedValue({ id: 'a', name: 'A' });
    const client = new ImodelsClient();

    await client.get('a');
    const params = official.getSingle.mock.calls[0]?.[0] as { authorization: () => Promise<unknown> };

    expect(AuthSession.getValidAccessToken).not.toHaveBeenCalled();
    await expect(params.authorization()).resolves.toEqual({ scheme: 'Bearer', token: TOKEN });
    expect(AuthSession.getValidAccessToken).toHaveBeenCalledTimes(1);
  });

  it('get(id)：getSingle({ authorization, iModelId }) 并返回单个 iModel', async () => {
    const imodel = { id: 'a', name: 'A' };
    official.getSingle.mockResolvedValue(imodel);
    const client = new ImodelsClient();

    await expect(client.get('a')).resolves.toEqual(imodel);
    expect(official.getSingle).toHaveBeenCalledWith(
      expect.objectContaining({ iModelId: 'a' }),
    );
  });

  it('create(iTwinId, {name})：createEmpty({ authorization, iModelProperties:{iTwinId,name} })', async () => {
    const created = { id: 'new', name: 'N' };
    official.createEmpty.mockResolvedValue(created);
    const client = new ImodelsClient();

    await expect(client.create('twin-1', { name: 'N' })).resolves.toEqual(created);
    expect(official.createEmpty).toHaveBeenCalledWith(
      expect.objectContaining({ iModelProperties: { iTwinId: 'twin-1', name: 'N' } }),
    );
  });

  it('create 的 description 缺席时不造该键（官方 description 可选）', async () => {
    official.createEmpty.mockResolvedValue({ id: 'new', name: 'N' });
    const client = new ImodelsClient();

    await client.create('twin-1', { name: 'N' });
    const params = official.createEmpty.mock.calls[0]?.[0] as { iModelProperties: Record<string, unknown> };
    expect('description' in params.iModelProperties).toBe(false);
  });

  it('delete(id)：delete({ authorization, iModelId })，resolve void', async () => {
    official.delete.mockResolvedValue(undefined);
    const client = new ImodelsClient();

    await expect(client.delete('a')).resolves.toBeUndefined();
    expect(official.delete).toHaveBeenCalledWith(
      expect.objectContaining({ iModelId: 'a' }),
    );
  });

  it('官方 reject 的 IModelsError 映射为 ApiClientError（status 三元组契约）', async () => {
    official.getSingle.mockRejectedValue({
      code: 'iModelNotFound',
      message: 'iModel not found',
      statusCode: 404,
    });
    const client = new ImodelsClient();

    await expect(client.get('bad')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'IMODELS_REQUEST_FAILED',
    });
  });

  // ---- T7：版本历史数据源（官方 changesets 列表通道）----

  it('listChangesets(iModelId)：changesets.getRepresentationList({ authorization, iModelId })，迭代器收拢为数组', async () => {
    const items = [
      { id: 'cs-2', index: 2, description: '加圆角', displayName: 'cs2' },
      { id: 'cs-1', index: 1, description: '初始特征', displayName: 'cs1' },
    ];
    official.changesetsGetRepresentationList.mockReturnValue(asyncIterableOf(items));
    const client = new ImodelsClient();

    await expect(client.listChangesets('im-1')).resolves.toEqual(items);
    expect(official.changesetsGetRepresentationList).toHaveBeenCalledTimes(1);
    expect(official.changesetsGetRepresentationList).toHaveBeenCalledWith(
      expect.objectContaining({ iModelId: 'im-1' }),
    );
    // 与 iModels 列表通道分立（不误入 iModels.getRepresentationList）。
    expect(official.getRepresentationList).not.toHaveBeenCalled();
  });

  it('listChangesets 的 authorization 回调懒求值：调回调才取 token，返回 `{ scheme: "Bearer", token }`', async () => {
    official.changesetsGetRepresentationList.mockReturnValue(asyncIterableOf([]));
    const client = new ImodelsClient();

    await client.listChangesets('im-1');
    const params = official.changesetsGetRepresentationList.mock.calls[0]?.[0] as {
      authorization: () => Promise<unknown>;
    };

    expect(AuthSession.getValidAccessToken).not.toHaveBeenCalled();
    await expect(params.authorization()).resolves.toEqual({ scheme: 'Bearer', token: TOKEN });
  });

  it('listChangesets：官方 reject 的 IModelsError 映射为 ApiClientError（同三元组契约）', async () => {
    official.changesetsGetRepresentationList.mockReturnValue(
      asyncIterableError({
        code: 'iModelNotFound',
        message: 'iModel not found',
        statusCode: 404,
      }),
    );
    const client = new ImodelsClient();

    await expect(client.listChangesets('bad')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'IMODELS_REQUEST_FAILED',
    });
  });

  // ---- Task 3：Named Version 通道（官方 namedVersions 操作）----

  it('listNamedVersions(iModelId)：namedVersions.getRepresentationList，迭代器收拢为数组', async () => {
    const items = [{ id: 'nv-1', name: 'V1', changesetId: 'cs-2' }];
    official.namedVersionsGetRepresentationList.mockReturnValue(asyncIterableOf(items));
    const client = new ImodelsClient();

    await expect(client.listNamedVersions('im-1')).resolves.toEqual(items);
    expect(official.namedVersionsGetRepresentationList).toHaveBeenCalledWith(
      expect.objectContaining({ iModelId: 'im-1' }),
    );
  });

  it('createNamedVersion：namedVersions.create({ iModelId, namedVersionProperties })', async () => {
    const created = { id: 'nv-2', name: 'V2', changesetId: 'cs-3' };
    official.namedVersionsCreate.mockResolvedValue(created);
    const client = new ImodelsClient();

    await expect(
      client.createNamedVersion('im-1', { name: 'V2', changesetId: 'cs-3' }),
    ).resolves.toEqual(created);
    expect(official.namedVersionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        iModelId: 'im-1',
        namedVersionProperties: { name: 'V2', changesetId: 'cs-3' },
      }),
    );
  });

  // ---- P2.3：B 文档操作（rename / favorite）与 iModel 权限面 ----

  it('update(id, {name})：iModels.update({ authorization, iModelId, iModelProperties })', async () => {
    const updated = { id: 'im-1', name: '新名字' };
    official.update.mockResolvedValue(updated);
    const client = new ImodelsClient();

    await expect(client.update('im-1', { name: '新名字' })).resolves.toEqual(updated);
    expect(official.update).toHaveBeenCalledWith(
      expect.objectContaining({
        iModelId: 'im-1',
        iModelProperties: { name: '新名字' },
      }),
    );
  });

  it('listFavorites(iTwinId)：favoriteIModels.getRepresentationList，迭代器收拢为数组', async () => {
    const items = [{ id: 'im-1', name: 'A' }];
    official.favoriteGetRepresentationList.mockReturnValue(asyncIterableOf(items));
    const client = new ImodelsClient();

    await expect(client.listFavorites('twin-1')).resolves.toEqual(items);
    expect(official.favoriteGetRepresentationList).toHaveBeenCalledWith(
      expect.objectContaining({ urlParams: { iTwinId: 'twin-1' } }),
    );
    expect(official.getRepresentationList).not.toHaveBeenCalled();
  });

  it('addFavorite / removeFavorite 走官方 favoriteIModels.add/remove({iModelId})', async () => {
    official.favoriteAdd.mockResolvedValue(undefined);
    official.favoriteRemove.mockResolvedValue(undefined);
    const client = new ImodelsClient();

    await expect(client.addFavorite('im-1')).resolves.toBeUndefined();
    await expect(client.removeFavorite('im-1')).resolves.toBeUndefined();
    expect(official.favoriteAdd).toHaveBeenCalledWith(expect.objectContaining({ iModelId: 'im-1' }));
    expect(official.favoriteRemove).toHaveBeenCalledWith(expect.objectContaining({ iModelId: 'im-1' }));
  });

  it('listUserPermissions(id)：GET /imodels/:id/permissions/users（Bearer），返回 data 行', async () => {
    const rows = [
      {
        id: 'perm-1',
        iModelId: 'im-1',
        userId: 'member-1',
        role: 'user',
        briefcasesLevel: 'read',
        changesetsLevel: 'read',
        versionsLevel: 'read',
        locksLevel: 'read',
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: rows, hasNextPage: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ImodelsClient();

    await expect(client.listUserPermissions('im-1')).resolves.toEqual(rows);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${env.hubUrl}/imodels/im-1/permissions/users?limit=200&page=1`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('listUserPermissions 跟随 hasNextPage 翻页并合并', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'p1' }], hasNextPage: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'p2' }], hasNextPage: false }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ImodelsClient();

    await expect(client.listUserPermissions('im-1')).resolves.toEqual([{ id: 'p1' }, { id: 'p2' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]![0] as string)).toContain('page=2');
  });

  it('grantPermission(id, input)：POST /imodels/:id/permissions/grant，body 原样透传', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ImodelsClient();
    const input = {
      userId: 'member-1',
      role: 'admin' as const,
      briefcasesLevel: 'manage' as const,
      changesetsLevel: 'manage' as const,
      versionsLevel: 'manage' as const,
      locksLevel: 'manage' as const,
    };

    await expect(client.grantPermission('im-1', input)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${env.hubUrl}/imodels/im-1/permissions/grant`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('revokePermission(id, userId)：DELETE /imodels/:id/permissions/users/:userId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ImodelsClient();

    await expect(client.revokePermission('im-1', 'member-1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${env.hubUrl}/imodels/im-1/permissions/users/member-1`);
    expect(init.method).toBe('DELETE');
  });

  it('权限面非 2xx → ApiClientError（status/code 三元组）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
      json: async () => ({ message: 'forbidden', code: 'FORBIDDEN' }),
    }));
    const client = new ImodelsClient();

    await expect(client.grantPermission('im-1', { userId: 'u' })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'FORBIDDEN',
      message: 'forbidden',
    });
  });
});
