// src/clients/itwins/test/ItwinsClient.test.ts
//
// Task 2 失败测试先行（brief Step 1）：mock 官方 @itwin/itwins-client 的
// ITwinsAccessClient，断言两件事——
//  1) 调用形状：构造函数收 env.hubUrl；每个方法先经 AuthSession.getValidAccessToken
//     取 token，再透传官方方法（参数映射见各用例）；
//  2) 返回映射：官方 ITwinsAPIResponse<T> { data?, status, error? } 解包为 T；
//     error/status>=400 映射为 ApiClientError（status 三元组契约）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@config/env.js';
import { AuthSession } from '../../auth/AuthSession.js';
import { ItwinsClient } from '../ItwinsClient.js';

// ---- 官方客户端 mock（vi.hoisted：factory 提升后仍可引用） ----
const official = vi.hoisted(() => ({
  ctor: vi.fn(),
  queryAsync: vi.fn(),
  getAsync: vi.fn(),
  createiTwin: vi.fn(),
  updateiTwin: vi.fn(),
  deleteiTwin: vi.fn(),
  queryFavoritesAsync: vi.fn(),
  queryRecentsAsync: vi.fn(),
}));

vi.mock('@itwin/itwins-client', () => ({
  ITwinsAccessClient: class MockITwinsAccessClient {
    public constructor(url?: string) {
      official.ctor(url);
    }
    public queryAsync = official.queryAsync;
    public getAsync = official.getAsync;
    public createiTwin = official.createiTwin;
    public updateiTwin = official.updateiTwin;
    public deleteiTwin = official.deleteiTwin;
    public queryFavoritesAsync = official.queryFavoritesAsync;
    public queryRecentsAsync = official.queryRecentsAsync;
  },
}));

const TOKEN = 'tok-1';

beforeEach(() => {
  vi.spyOn(AuthSession, 'getValidAccessToken').mockResolvedValue(TOKEN);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('ItwinsClient（官方 ITwinsAccessClient 封装）', () => {
  it('构造函数以 env.hubUrl 实例化官方客户端', () => {
    new ItwinsClient();
    expect(official.ctor).toHaveBeenCalledWith(env.hubUrl);
  });

  it('list()：queryAsync(token, undefined, params)，解包 data', async () => {
    const data = [{ id: 'a', displayName: 'A' }];
    official.queryAsync.mockResolvedValue({ data, status: 200 });
    const client = new ItwinsClient();

    await expect(client.list()).resolves.toEqual(data);
    expect(official.queryAsync).toHaveBeenCalledWith(TOKEN, undefined, undefined);
  });

  it('list({top,skip})：分页参数原样透传官方 query 参数', async () => {
    official.queryAsync.mockResolvedValue({ data: [], status: 200 });
    const client = new ItwinsClient();

    await client.list({ top: 5, skip: 10 });
    expect(official.queryAsync).toHaveBeenCalledWith(TOKEN, undefined, { top: 5, skip: 10 });
  });

  it('get(id)：getAsync(token, id) 并返回单个 iTwin', async () => {
    const data = { id: 'a', displayName: 'A' };
    official.getAsync.mockResolvedValue({ data, status: 200 });
    const client = new ItwinsClient();

    await expect(client.get('a')).resolves.toEqual(data);
    expect(official.getAsync).toHaveBeenCalledWith(TOKEN, 'a');
  });

  it('create({displayName,class})：createiTwin(token, iTwin)', async () => {
    const data = { id: 'new', displayName: 'N' };
    official.createiTwin.mockResolvedValue({ data, status: 201 });
    const client = new ItwinsClient();

    await expect(client.create({ displayName: 'N', class: 'Thing' })).resolves.toEqual(data);
    expect(official.createiTwin).toHaveBeenCalledWith(TOKEN, { displayName: 'N', class: 'Thing' });
  });

  it('update(id, partial)：updateiTwin(token, id, partial)', async () => {
    const data = { id: 'a', displayName: 'Renamed' };
    official.updateiTwin.mockResolvedValue({ data, status: 200 });
    const client = new ItwinsClient();

    await expect(client.update('a', { displayName: 'Renamed' })).resolves.toEqual(data);
    expect(official.updateiTwin).toHaveBeenCalledWith(TOKEN, 'a', { displayName: 'Renamed' });
  });

  it('delete(id)：deleteiTwin(token, id)，204 无 data 仍 resolve void', async () => {
    official.deleteiTwin.mockResolvedValue({ status: 204 });
    const client = new ItwinsClient();

    await expect(client.delete('a')).resolves.toBeUndefined();
    expect(official.deleteiTwin).toHaveBeenCalledWith(TOKEN, 'a');
  });

  it('listFavorites()/listRecents()：透传 queryFavoritesAsync/queryRecentsAsync', async () => {
    const fav = [{ id: 'f' }];
    const recent = [{ id: 'r' }];
    official.queryFavoritesAsync.mockResolvedValue({ data: fav, status: 200 });
    official.queryRecentsAsync.mockResolvedValue({ data: recent, status: 200 });
    const client = new ItwinsClient();

    await expect(client.listFavorites()).resolves.toEqual(fav);
    await expect(client.listRecents()).resolves.toEqual(recent);
    expect(official.queryFavoritesAsync).toHaveBeenCalledWith(TOKEN);
    expect(official.queryRecentsAsync).toHaveBeenCalledWith(TOKEN);
  });

  it('官方响应带 error 时映射为 ApiClientError（status 三元组契约）', async () => {
    official.getAsync.mockResolvedValue({
      status: 400,
      error: { code: 'InvalidId', message: 'bad id' },
    });
    const client = new ItwinsClient();

    await expect(client.get('bad')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'ITWINS_REQUEST_FAILED',
    });
  });
});
