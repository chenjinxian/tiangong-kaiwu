/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iModel（模型）数据层客户端（Task 3）：对官方 `@itwin/imodels-client-management`
 * `IModelsClient` 的薄封装——
 * - 构造时以 `env.hubUrl`（同源 origin，代理路径 /imodels）作为官方
 *   `api.baseUrl` 实例化官方客户端（官方缺省为 Bentley 云，必须覆写）；
 * - 官方 v6 方法形状为「操作参数对象 + authorization 回调」：每个方法收
 *   `{ authorization, ... }`，回调在官方客户端**每次发请求**时被调（分页场景
 *   逐页调），故封装层把 `AuthSession.getValidAccessToken()` 接进懒回调
 *   （过期单飞刷新逻辑在 AuthSession 内部），返回 `{ scheme: 'Bearer', token }`；
 * - 列表走 `iModels.getRepresentationList`（全量表示，官方返回
 *   EntityListIterator 异步迭代器，内部自动翻页），封装层 for-await 收拢为
 *   `IModel[]`；brief 之 `query({...})` 为旧版猜测，以实测 .d.ts 为准；
 * - Named Version 通道（B-model P0 前置）：`namedVersions.getRepresentationList`
 *   同上收拢为 `NamedVersion[]`；`namedVersions.create` 直通封装层入参
 *   （changesetId 必填：本产品不命名 baseline）；
 * - 官方错误通道是 reject `IModelsError`（`{ code, statusCode?, message }`，
 *   经 `isIModelsApiError` 判定），映射为 ApiClientError（status/code/i18nKey
 *   三元组契约，与 itwins 封装同姿态）；非官方错误（网络层等）原样上抛
 *   （对齐 T2 的已注记姿态）。
 */

import {
  IModelsClient,
  isIModelsApiError,
} from '@itwin/imodels-client-management';
import type {
  AuthorizationCallback,
  Changeset,
  IModel,
  NamedVersion,
} from '@itwin/imodels-client-management';
import { env } from '@config/env.js';
import { AuthSession } from '../auth/AuthSession.js';
import { ApiClientError } from '../http/ApiClientError.js';
import type { CreateImodelInput, CreateNamedVersionInput } from './types.js';

/** 官方 Changeset / NamedVersion 实体类型直通 re-export（版本历史消费面唯一类型入口）。 */
export type { Changeset, NamedVersion };

export class ImodelsClient {
  private readonly client: IModelsClient;

  public constructor() {
    this.client = new IModelsClient({ api: { baseUrl: `${env.hubUrl}/imodels` } });
  }

  /** iTwin 下的 iModel 列表（全量表示；官方迭代器自动翻页，收拢为数组）。 */
  public async list(iTwinId: string): Promise<IModel[]> {
    return this.invoke(async () => {
      const iterator = this.client.iModels.getRepresentationList({
        authorization: this.authorization(),
        urlParams: { iTwinId },
      });
      const imodels: IModel[] = [];
      for await (const imodel of iterator) {
        imodels.push(imodel);
      }
      return imodels;
    });
  }

  /** 单个 iModel 详情。 */
  public get(id: string): Promise<IModel> {
    return this.invoke(() =>
      this.client.iModels.getSingle({
        authorization: this.authorization(),
        iModelId: id,
      })
    );
  }

  /** 新建空 iModel（name 必填、description 可选）。 */
  public create(iTwinId: string, input: CreateImodelInput): Promise<IModel> {
    return this.invoke(() =>
      this.client.iModels.createEmpty({
        authorization: this.authorization(),
        iModelProperties: { iTwinId, ...input },
      })
    );
  }

  /** 删除 iModel（官方 resolve void）。 */
  public async delete(id: string): Promise<void> {
    await this.invoke(() =>
      this.client.iModels.delete({
        authorization: this.authorization(),
        iModelId: id,
      })
    );
  }

  /**
   * iModel 的 changeset 列表（全量表示；官方迭代器自动翻页，收拢为数组）。
   * 版本历史面板数据源（web M4-T7；官方
   * `changesets.getRepresentationList`——旧应用 useChangesets.ts 同通道）。
   */
  public async listChangesets(iModelId: string): Promise<Changeset[]> {
    return this.invoke(async () => {
      const iterator = this.client.changesets.getRepresentationList({
        authorization: this.authorization(),
        iModelId,
      });
      const changesets: Changeset[] = [];
      for await (const changeset of iterator) {
        changesets.push(changeset);
      }
      return changesets;
    });
  }

  /** iModel 的 Named Version 列表（全量表示；官方迭代器自动翻页）。 */
  public async listNamedVersions(iModelId: string): Promise<NamedVersion[]> {
    return this.invoke(async () => {
      const iterator = this.client.namedVersions.getRepresentationList({
        authorization: this.authorization(),
        iModelId,
      });
      const versions: NamedVersion[] = [];
      for await (const version of iterator) {
        versions.push(version);
      }
      return versions;
    });
  }

  /** 在指定 changeset 上创建 Named Version。 */
  public createNamedVersion(
    iModelId: string,
    input: CreateNamedVersionInput,
  ): Promise<NamedVersion> {
    return this.invoke(() =>
      this.client.namedVersions.create({
        authorization: this.authorization(),
        iModelId,
        namedVersionProperties: input,
      }),
    );
  }

  // ---- authorization / 错误裁决 ----

  /** 懒回调：官方每次发请求都会调它（分页逐页取新 token）。 */
  private authorization(): AuthorizationCallback {
    return async () => {
      const token = await AuthSession.getValidAccessToken();
      return { scheme: 'Bearer', token };
    };
  }

  /** 官方 IModelsError → ApiClientError 三元组；其余错误原样上抛。 */
  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isIModelsApiError(error)) {
        throw new ApiClientError({
          status: error.statusCode ?? 500,
          code: 'IMODELS_REQUEST_FAILED',
          message: error.message,
        });
      }
      throw error;
    }
  }
}
