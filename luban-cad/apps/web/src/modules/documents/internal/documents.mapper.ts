/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * documents mapper（Task 4）：官方 `ITwin`（数据层）→ `DocumentSummary`（UI 层）。
 * 映射规则（测试钉死，见 test/documents.mapper.test.ts）——
 * - id/name/owner/createdAt 直映（owner ← createdBy）；
 * - role ← subClass，缺席回退 type；
 * - modifiedAt 裁决链：`lastModifiedDateTime ?? createdDateTime ?? null`
 *   （官方 ITwin 类型未声明 lastModifiedDateTime，但本地 hub 响应 DTO
 *    itwin-response.dto.ts 已输出该字段——防御性宽类型读取；
 *    双缺席为 null，UI 显示「—」）；
 * - thumbnailUrl ← image，缺席时键不产出（保持对象形状诚实）；
 * - B/A 分类：`data.luban.modelMode==='B'`（P2.1 标记）为 B，未标记/坏形为 A；
 *   B 项目产出 projectName（= displayName），A 不产出该键。data 的宽类型读取
 *   唯一收口在 `clients/itwins/types.ts`（isBModelItwin / ITwinWithData）。
 */

import type { ITwin } from '@itwin/itwins-client';
import { isBModelItwin, type ITwinWithData } from '@clients/itwins/types.js';
import type { DocumentSummary } from '../types.js';

/** 官方类型未声明、hub 实际输出的字段（防御性宽类型）。 */
type ITwinRaw = ITwinWithData & { lastModifiedDateTime?: string };

export function toDocumentSummary(itwin: ITwin): DocumentSummary {
  const raw = itwin as ITwinRaw;
  const thumbnailUrl = itwin.image ?? undefined;
  const mode = isBModelItwin(itwin) ? 'B' : 'A';
  return {
    id: itwin.id ?? '',
    name: itwin.displayName ?? '',
    owner: itwin.createdBy ?? '',
    role: itwin.subClass ?? itwin.type ?? '',
    createdAt: itwin.createdDateTime ?? '',
    modifiedAt: raw.lastModifiedDateTime ?? itwin.createdDateTime ?? null,
    mode,
    projectId: itwin.id ?? '',
    ...(mode === 'B' ? { projectName: itwin.displayName ?? '' } : {}),
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
  };
}
