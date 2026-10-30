/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 种子安全谓词回归（P2.6a review L4/L7/L8）：不起浏览器、不碰 real-stack 数据，
 * 只钉死 reset/open 的判定面——
 * 1) B 项目标记必须**精确**匹配 P2.1 形态（modelMode='B' 且 schemaVersion=1）；
 *    缺 schemaVersion / 版本不符 / 大小写偏差一律不得被采纳为 e2e 种子
 *    （否则 reset 会删改人工同名项目）。
 * 2) 同名重复必须抛错，绝不任取第一个（否则 reset 与 open 可能命中不同行：
 *    「重置了一个库、测试打开另一个库」）。
 *
 * 真实栈的删除顺序（marker 校验先于任何 iModel 删除）由 seed.ts 结构保证，
 * 本文件只固定谓词语义——便宜、稳定，且能在任何分支上独立回归。
 */

import { expect, test } from '@playwright/test';
import { uniqueMatch } from './helpers';
import { hasExactBModelMarker } from './seed';

test.describe('seed 安全谓词（P2.6a L4/L7/L8）', () => {
  test('B 标记精确匹配：modelMode=B 且 schemaVersion=1', () => {
    expect(hasExactBModelMarker({ luban: { modelMode: 'B', schemaVersion: 1 } })).toBe(true);
    // 缺版本 / 版本不符 / 大小写偏差 / 坏形 / 缺席 → 全部拒绝
    expect(hasExactBModelMarker({ luban: { modelMode: 'B' } })).toBe(false);
    expect(hasExactBModelMarker({ luban: { modelMode: 'B', schemaVersion: 2 } })).toBe(false);
    expect(hasExactBModelMarker({ luban: { modelMode: 'b', schemaVersion: 1 } })).toBe(false);
    expect(hasExactBModelMarker({ luban: { modelMode: 'A', schemaVersion: 1 } })).toBe(false);
    expect(hasExactBModelMarker({ luban: 'B' })).toBe(false);
    expect(hasExactBModelMarker({ luban: null })).toBe(false);
    expect(hasExactBModelMarker({})).toBe(false);
    expect(hasExactBModelMarker(undefined)).toBe(false);
  });

  test('同名重复 → 抛错（不任取第一个）；唯一/缺席返回确定结果', () => {
    const rows = [
      { id: 'a', displayName: 'E2E B 项目' },
      { id: 'b', displayName: 'E2E B 项目' },
      { id: 'c', displayName: '其他项目' },
    ];
    expect(() =>
      uniqueMatch(rows, (row) => row.displayName, 'E2E B 项目', '种子项目'),
    ).toThrow(/2 个同名/);

    // 唯一命中 → 该行；缺席 → undefined；name 回退读取同样生效。
    expect(uniqueMatch(rows, (row) => row.displayName, '其他项目', '种子项目')).toEqual({
      id: 'c',
      displayName: '其他项目',
    });
    expect(uniqueMatch(rows, (row) => row.displayName, '不存在', '种子项目')).toBeUndefined();
    expect(
      uniqueMatch([{ id: 'd', name: 'E2E B Seed' }], (row) => row.name, 'E2E B Seed', '种子库'),
    ).toEqual({ id: 'd', name: 'E2E B Seed' });
  });
});
