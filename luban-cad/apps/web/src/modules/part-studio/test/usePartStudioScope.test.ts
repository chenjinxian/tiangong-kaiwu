/**
 * ADR-0017 Stage C：`nextPartStudioName` 纯函数——`+` 与空文档自动创建共用，
 * 生成未占用的 Onshape 自动命名 `Part Studio N`（修复重复 Part Studio 1）。
 */
import { describe, expect, it } from 'vitest';
import type { PartStudioInfo } from '@luban-cad/shared';
import { nextPartStudioName } from '../hooks/usePartStudioScope.js';

function studio(name: string): Pick<PartStudioInfo, 'name'> {
  return { name };
}

describe('nextPartStudioName', () => {
  it('空文档 → Part Studio 1', () => {
    expect(nextPartStudioName([])).toBe('Part Studio 1');
  });

  it('已有 Part Studio 1 → Part Studio 2（不再重复默认名）', () => {
    expect(nextPartStudioName([studio('Part Studio 1')])).toBe('Part Studio 2');
  });

  it('最小未占用：删除中间项后复用空号', () => {
    expect(nextPartStudioName([studio('Part Studio 1'), studio('Part Studio 3')]))
      .toBe('Part Studio 2');
  });

  it('自定义名称不占用自动编号；两侧空白/大小写不改变编号语义', () => {
    expect(nextPartStudioName([studio('支架'), studio('  Part Studio 2  ')]))
      .toBe('Part Studio 1');
    expect(nextPartStudioName([studio('part studio 1')])).toBe('Part Studio 2');
  });

  it('非编号名（Part Studio A / Part Studio 1 copy）不占用编号', () => {
    expect(nextPartStudioName([
      studio('Part Studio A'),
      studio('Part Studio 1 copy'),
      studio('Part Studio 2'),
    ])).toBe('Part Studio 1');
  });
});
