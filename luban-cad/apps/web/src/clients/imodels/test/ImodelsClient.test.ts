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
  // T7：changesets 列表通道（与 iModels.getRepresentationList 分立，断言互不混淆）。
  changesetsGetRepresentationList: vi.fn(),
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
        };
      }
      public get changesets() {
        return {
          getRepresentationList: official.changesetsGetRepresentationList,
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
});
