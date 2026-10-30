/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * itwins 数据层类型（Task 2）：
 * - `ITwin` 及官方查询参数类型 re-export 自 `@itwin/itwins-client`
 *   （brief 钉死项——官方 `ITwin` 是唯一事实形状，禁止本地另造）；
 * - `ListItwinsParams` / `CreateItwinInput` 为封装层入参：前者是官方
 *   `ITwinsQueryArg` 的 top/skip 分页子集（封装层暂不暴露 search/filter），
 *   后者钉死 create 的最小必填形状（displayName 必填；subClass 走官方
 *   `ITwinSubClass` 枚举）。`class` 可选：调用方通常只发 subClass，由 hub
 *   从 subClass 派生 class（Account→Account；Asset/Portfolio→Thing；
 *   Project/Program/WorkPackage→Endeavor），服务端会校验显式成对时的
 *   合法组合；update 的入参直接用 `Partial<ITwin>`）。
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

/** `ItwinsClient.create` 入参：官方 iTwin 最小形状 + subClass 枚举钉死。
 *  `class` 可省略（服务端由 subClass 派生，并拒绝不合法组合）。
 *  `data` 为本地 hub 持久化的自由 JSON（官方 ITwin 类型未声明）——B-model
 *  项目标记即走此字段（见 `B_MODEL_DATA`）。 */
export interface CreateItwinInput {
  displayName: string;
  class?: ITwinClass;
  subClass?: ITwinSubClass;
  parentId?: string;
  number?: string;
  data?: Record<string, unknown>;
}

/** `ItwinsClient.update` 入参：官方 iTwin 的增量子集。 */
export type UpdateItwinInput = Partial<ITwin>;

// ---------------------------------------------------------------------------
// B-model 项目标记（ADR-0001 D1 / P2 D1）：iTwin.data.luban = { modelMode:'B',
// schemaVersion:1 }；未标记（或坏形）iTwin 一律视为 A 旧文档。官方 ITwin
// 类型未声明 data——**唯一读点**收在此边界类型 + isBModelItwin，禁止在
// 组件里散落 `as any` 读 data。
// ---------------------------------------------------------------------------

/** 官方 `ITwin` 未声明、本地 hub 持久化并回传的扩展字段（宽类型边界）。 */
export type ITwinWithData = ITwin & { data?: Record<string, unknown> };

/** B 项目标记载荷（创建侧使用；P2.3 创建对话框引用本常量）。 */
export const B_MODEL_DATA = {
  luban: { modelMode: 'B', schemaVersion: 1 },
} as const satisfies Record<string, unknown>;

/** 读侧裁决：`itwin.data.luban.modelMode === 'B'` 才是 B；其余（含坏形）A。 */
export function isBModelItwin(itwin: ITwin): boolean {
  const data = (itwin as ITwinWithData).data;
  if (data === undefined || data === null || typeof data !== 'object') return false;
  const luban = data.luban;
  if (luban === undefined || luban === null || typeof luban !== 'object') return false;
  return (luban as Record<string, unknown>).modelMode === 'B';
}
