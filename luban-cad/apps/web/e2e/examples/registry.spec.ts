/**
 * 示例 registry 结构回归（不依赖真栈）。
 *
 * 这个 spec 只校验“要建什么”的静态契约；运行态 iModel/UUID 归
 * demo-artifacts/examples/state.json，不在这里断言。
 */
import { expect, test } from '@playwright/test';
import {
  isExampleDataAvailable,
  loadExampleRegistry,
  resolveExample,
  validateExampleRegistry,
} from './registry.js';

test.describe('示例 registry', () => {
  test('结构合法、document/scope slug 唯一', () => {
    const registry = loadExampleRegistry();
    expect(registry.schemaVersion).toBe(1);
    expect(validateExampleRegistry(registry).ok).toBe(true);
    expect(registry.documents.length).toBeGreaterThanOrEqual(12);
    const docIds = new Set<string>();
    const scopeIds = new Set<string>();
    for (const doc of registry.documents) {
      expect(docIds.has(doc.id), `document slug 重复：${doc.id}`).toBe(false);
      docIds.add(doc.id);
      expect(doc.scopes.length).toBeGreaterThan(0);
      for (const scope of doc.scopes) {
        expect(scopeIds.has(scope.id), `scope slug 重复：${scope.id}`).toBe(false);
        scopeIds.add(scope.id);
        expect(scope.expected.bodyCount).toBeGreaterThanOrEqual(0);
        if (scope.expected.totalVolumeMm3 !== undefined)
          expect(scope.expected.totalVolumeMm3).toBeGreaterThan(0);
      }
    }
  });

  test('B0 legacy 条目可按 slug 解析', () => {
    const registry = loadExampleRegistry();
    const tutorial = resolveExample(registry, 'tutorial-2');
    expect(tutorial.id).toBe('tutorial-2');
    const ios = resolveExample(registry, 'tutorial-2-ios');
    expect(ios.id).toBe('tutorial-2-ios');
    expect(resolveExample(registry, 'tutorial-2-ios-first-part').id).toBe('tutorial-2-ios-first-part');
  });

  test('私有 corpus 可选；缺失时只影响 replay，不影响 registry 结构', () => {
    expect(typeof isExampleDataAvailable()).toBe('boolean');
  });
});
