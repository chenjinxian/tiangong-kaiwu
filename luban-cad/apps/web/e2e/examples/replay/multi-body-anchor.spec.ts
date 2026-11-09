import { expect, test } from '@playwright/test';
import { selectEdgeTargetBody } from './multi-body-anchor.js';

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
