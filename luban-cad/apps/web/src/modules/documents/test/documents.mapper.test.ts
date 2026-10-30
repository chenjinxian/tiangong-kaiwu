// src/modules/documents/test/documents.mapper.test.ts
//
// Task 4 失败测试先行（brief Step 1）：官方 ITwin → DocumentSummary 映射。
// 钉死三件事——
//  1) 标准字段直映：id/name/owner(createdBy)/role(subClass)/createdAt；
//  2) modifiedAt 裁决链：lastModifiedDateTime（官方类型未声明、本地 hub DTO
//     已输出——防御性宽类型读取）→ 回退 createdDateTime → 双缺席 null（UI 显「—」）；
//  3) thumbnailUrl：image 在场才产出该键，缺席则键不出现（undefined）。

import { ITwinSubClass, type ITwin } from '@itwin/itwins-client';
import { describe, expect, it } from 'vitest';
import {
  B_MODEL_DATA,
  isBModelItwin,
  type CreateItwinInput,
  type ITwinWithData,
} from '@clients/itwins/types.js';
import { toDocumentSummary } from '../internal/documents.mapper.js';

function makeITwin(overrides: Record<string, unknown> = {}): ITwin {
  return {
    id: 'itwin-1',
    displayName: '支座总成',
    createdBy: 'user-9',
    subClass: ITwinSubClass.Project,
    type: 'Workflow',
    createdDateTime: '2026-10-01T08:00:00.0000000+00:00',
    ...overrides,
  } as ITwin;
}

describe('toDocumentSummary（官方 ITwin → DocumentSummary）', () => {
  it('标准字段直映：id/name/owner←createdBy/role←subClass/createdAt', () => {
    const summary = toDocumentSummary(makeITwin());
    expect(summary).toEqual({
      id: 'itwin-1',
      name: '支座总成',
      owner: 'user-9',
      role: 'Project',
      createdAt: '2026-10-01T08:00:00.0000000+00:00',
      modifiedAt: '2026-10-01T08:00:00.0000000+00:00',
      mode: 'A',
      projectId: 'itwin-1',
    });
    expect(summary.thumbnailUrl).toBeUndefined();
  });

  it('role 回退：subClass 缺席时取 type', () => {
    const summary = toDocumentSummary(makeITwin({ subClass: undefined }));
    expect(summary.role).toBe('Workflow');
  });

  it('modifiedAt 优先取 lastModifiedDateTime（hub DTO 已带，官方类型未声明）', () => {
    const raw = {
      ...makeITwin(),
      lastModifiedDateTime: '2026-10-20T12:30:00.0000000+00:00',
    } as ITwin;
    expect(toDocumentSummary(raw).modifiedAt).toBe('2026-10-20T12:30:00.0000000+00:00');
  });

  it('modifiedAt 回退：lastModifiedDateTime 缺席 → createdDateTime', () => {
    expect(toDocumentSummary(makeITwin()).modifiedAt).toBe('2026-10-01T08:00:00.0000000+00:00');
  });

  it('modifiedAt 双缺席 → null（UI 显示「—」）', () => {
    const summary = toDocumentSummary(makeITwin({ createdDateTime: undefined }));
    expect(summary.modifiedAt).toBeNull();
    expect(summary.createdAt).toBe('');
  });

  it('thumbnailUrl：image 在场产出该键；缺席则不产出（键不出现）', () => {
    const withImage = toDocumentSummary(makeITwin({ image: 'https://hub/thumbs/a.png' }));
    expect(withImage.thumbnailUrl).toBe('https://hub/thumbs/a.png');
    const bare = toDocumentSummary(makeITwin());
    expect('thumbnailUrl' in bare).toBe(false);
  });

  // ---------------------------------------------------------------------
  // B-model P2.1：itwin.data.luban.modelMode 标记分类（未标记 = A 旧文档）。
  // ---------------------------------------------------------------------
  it('B 标记：data.luban.modelMode="B" → mode B + projectId/projectName', () => {
    const summary = toDocumentSummary(
      makeITwin({ data: { luban: { modelMode: 'B', schemaVersion: 1 } } }),
    );
    expect(summary.mode).toBe('B');
    expect(summary.projectId).toBe('itwin-1');
    expect(summary.projectName).toBe('支座总成');
  });

  it('未标记 → A（旧文档），且 projectName 键不产出', () => {
    const summary = toDocumentSummary(makeITwin());
    expect(summary.mode).toBe('A');
    expect(summary.projectId).toBe('itwin-1');
    expect('projectName' in summary).toBe(false);
  });

  it.each([
    ['data 缺席', undefined],
    ['data 空对象', {}],
    ['luban 非对象', { luban: 'B' }],
    ['luban.modelMode 小写', { luban: { modelMode: 'b' } }],
    ['luban 无 modelMode', { luban: { schemaVersion: 1 } }],
    ['luban 为 null', { luban: null }],
  ])('坏形 / 未标记（%s）→ A，绝不误判为 B', (_label, data) => {
    const summary = toDocumentSummary(makeITwin(data === undefined ? {} : { data }));
    expect(summary.mode).toBe('A');
  });

  it('isBModelItwin：只认 data.luban.modelMode==="B"（边界宽类型唯一读点）', () => {
    expect(isBModelItwin(makeITwin({ data: B_MODEL_DATA }))).toBe(true);
    expect(isBModelItwin(makeITwin())).toBe(false);
    expect(isBModelItwin(makeITwin({ data: { luban: { modelMode: 'A' } } }))).toBe(false);
    // 官方 ITwin 类型未声明 data——边界类型 ITwinWithData 承载读取。
    const withData: ITwinWithData = makeITwin({ data: B_MODEL_DATA });
    expect(withData.data?.luban).toEqual({ modelMode: 'B', schemaVersion: 1 });
  });

  it('B_MODEL_DATA 载荷符合 CreateItwinInput.data 契约（P2.3 创建侧复用）', () => {
    const input: CreateItwinInput = { displayName: 'B 项目', data: B_MODEL_DATA };
    expect(input.data).toEqual({ luban: { modelMode: 'B', schemaVersion: 1 } });
  });
});
