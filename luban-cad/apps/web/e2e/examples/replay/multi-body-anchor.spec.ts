import { expect, test } from '@playwright/test';
import { selectEdgeTargetBody, selectEdgeTargetBodies } from './multi-body-anchor.js';

test.describe('selectEdgeTargetBody', () => {
  test('单 body 选中边 → 显式锚定', () => {
    expect(selectEdgeTargetBody(['0x2b'], ['0x2b', '0x2c'])).toEqual({ targetBodyId: '0x2b' });
  });

  test('重复 bodyKey 去重后仍唯一', () => {
    expect(selectEdgeTargetBody(['0x2b', '0x2b'], ['0x2b', '0x2c'])).toEqual({
      targetBodyId: '0x2b',
    });
  });

  test('跨 body → 阻塞，不猜', () => {
    const selection = selectEdgeTargetBody(['0x2b', '0x2c'], ['0x2b', '0x2c']);
    expect(selection.targetBodyId).toBeUndefined();
    expect(selection.blockedReason).toContain('跨 2 个 body');
  });

  test('空集 → 阻塞', () => {
    expect(selectEdgeTargetBody([], ['0x2b']).blockedReason).toContain('未归属');
  });

  test('失效 bodyKey → 阻塞', () => {
    expect(selectEdgeTargetBody(['0xdead'], ['0x2b']).blockedReason).toContain('active body');
  });
});

test.describe('selectEdgeTargetBodies（v1.65 多目标）', () => {
  test('单 body → 旧 targetBodyId 形态', () => {
    expect(selectEdgeTargetBodies(['0x2b'], ['0x2b', '0x2c'])).toEqual({ targetBodyId: '0x2b' });
  });
  test('多 body → 排序后的 targetBodyIds（逐边 bodyKey 由 resolver 携带）', () => {
    expect(selectEdgeTargetBodies(['0x2c', '0x2b', '0x2b'], ['0x2b', '0x2c'])).toEqual({
      targetBodyIds: ['0x2b', '0x2c'],
    });
  });
  test('owner 非 active / 空 → blocked，不猜', () => {
    expect(selectEdgeTargetBodies(['0x2c'], ['0x2b']).blockedReason).toContain('active');
    expect(selectEdgeTargetBodies([], ['0x2b']).blockedReason).toContain('未归属');
  });
});
