/**
 * ADR-0017 追补：零件读面 UI 投影——滤除后端 init 占位 BodySolid（无源/无几何），
 * 空 Part Studio 与 Onshape 一致显示 0 零件；有源/有体积的真实体保留。
 */
import { describe, expect, it } from 'vitest';
import type { BodyInfo, FeatureTreeEntry } from '@luban-cad/shared';
import { bodiesForDisplay, treeHasBodyFeature } from '../internal/body-display.js';

const EMPTY_TREE: FeatureTreeEntry[] = [];
const EXTRUDE_TREE: FeatureTreeEntry[] = [
  { id: 'f1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
];

function body(overrides: Partial<BodyInfo> = {}): BodyInfo {
  return { bodyKey: '0x100', name: 'Body 1', active: true, authored: true, ...overrides };
}

describe('bodiesForDisplay', () => {
  it('空文档：无源占位体被滤除（零件数 0、基准面可见的前提）', () => {
    expect(bodiesForDisplay([body()], EMPTY_TREE)).toEqual([]);
  });

  it('有源特征驱动体保留（即使体积未读到）', () => {
    const real = body({ sourceFeatureId: '0x200' });
    expect(bodiesForDisplay([real], EMPTY_TREE)).toEqual([real]);
  });

  it('无源但体积>0（导入/直改副本）保留；体积=0 滤除', () => {
    const imported = body({ bodyKey: '0x300' });
    const mass = new Map([['0x300', { volume: 12.5 }]]);
    expect(bodiesForDisplay([imported], EMPTY_TREE, mass)).toEqual([imported]);
    const placeholder = body({ bodyKey: '0x301' });
    const zero = new Map([['0x301', { volume: 0 }]]);
    expect(bodiesForDisplay([placeholder], EMPTY_TREE, zero)).toEqual([]);
  });

  it('无源且体积未知：树上有产体特征时乐观保留，空文档隐藏', () => {
    const candidate = body();
    expect(bodiesForDisplay([candidate], EMPTY_TREE)).toEqual([]);
    expect(bodiesForDisplay([candidate], EXTRUDE_TREE)).toEqual([candidate]);
  });

  it('consumed（active=false）/非 authored 一律不显示', () => {
    expect(bodiesForDisplay([
      body({ active: false, sourceFeatureId: '0x200' }),
      body({ authored: false, sourceFeatureId: '0x200' }),
    ], EXTRUDE_TREE)).toEqual([]);
  });

  it('treeHasBodyFeature 忽略 suppressed', () => {
    expect(treeHasBodyFeature(EMPTY_TREE)).toBe(false);
    expect(treeHasBodyFeature(EXTRUDE_TREE)).toBe(true);
    expect(treeHasBodyFeature([{ ...EXTRUDE_TREE[0]!, suppressed: true }])).toBe(false);
  });
});
