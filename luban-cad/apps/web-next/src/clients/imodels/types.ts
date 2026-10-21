/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * imodels 数据层类型（Task 3）：
 * - `IModel` 及官方操作参数类型 re-export 自 `@itwin/imodels-client-management`
 *   （brief 钉死项——官方 `IModel` 是唯一事实形状，禁止本地另造）；
 * - `CreateImodelInput` 为封装层 create 入参的最小必填形状（name 必填、
 *   description 可选，与官方 `IModelProperties` 的可选性对齐；extent/GCS 等
 *   高级字段暂不暴露，真实需求出现再扩）。
 */

export type {
  Authorization,
  AuthorizationCallback,
  IModel,
  MinimalIModel,
} from '@itwin/imodels-client-management';

/** `ImodelsClient.create` 入参：name 必填、description 可选（官方 IModelProperties 子集）。 */
export interface CreateImodelInput {
  name: string;
  description?: string;
}
