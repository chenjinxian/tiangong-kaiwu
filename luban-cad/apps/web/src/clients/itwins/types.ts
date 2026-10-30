/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * itwins 数据层类型（Task 2）：
 * - `ITwin` 及官方查询参数类型 re-export 自 `@itwin/itwins-client`
 *   （brief 钉死项——官方 `ITwin` 是唯一事实形状，禁止本地另造）；
 * - `ListItwinsParams` / `CreateItwinInput` 为封装层入参：前者是官方
 *   `ITwinsQueryArg` 的 top/skip 分页子集（封装层暂不暴露 search/filter），
 *   后者钉死 create 的最小必填形状（displayName 必填；class/subClass 走
 *   官方 `ITwinClass`/`ITwinSubClass` 枚举——hub taxonomy 迁移后
 *   `class:'Project'` 不再是合法值，建项目必须显式 Endeavor/Project；
 *   update 的入参直接用 `Partial<ITwin>`）。
 */

export type {
  ITwin,
  ITwinClass,
  ITwinSubClass,
  ITwinsAPIResponse,
  ITwinsQueryArg,
} from '@itwin/itwins-client';

import type { ITwin, ITwinClass, ITwinSubClass } from '@itwin/itwins-client';

/** `ItwinsClient.list` 分页参数（官方 `ITwinsQueryArg` 的 top/skip 子集）。 */
export interface ListItwinsParams {
  top?: number;
  skip?: number;
}

/** `ItwinsClient.create` 入参：官方 iTwin 最小形状 + class/subClass 枚举钉死。 */
export interface CreateItwinInput {
  displayName: string;
  class?: ITwinClass;
  subClass?: ITwinSubClass;
  parentId?: string;
  number?: string;
}

/** `ItwinsClient.update` 入参：官方 iTwin 的增量子集。 */
export type UpdateItwinInput = Partial<ITwin>;
