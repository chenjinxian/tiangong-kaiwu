// @vitest-environment jsdom
//
// P2.8 E2E 观测面（e2e-hooks）：
//  - VITE_E2E_HOOKS 非 'true' → 零副作用（生产/发布镜像不得暴露内部模块）；
//  - 'true' → window.__lubanE2E 暴露 coreFrontend/coreCommon，且重复安装幂等。

import { afterEach, describe, expect, it } from 'vitest';
import { installE2EHooks } from '../e2e-hooks.js';

describe('installE2EHooks', () => {
  afterEach(() => {
    delete (window as unknown as { __lubanE2E?: unknown }).__lubanE2E;
  });

  it('未开启 → 不挂载（生产安全）', () => {
    installE2EHooks(false);
    expect((window as unknown as { __lubanE2E?: unknown }).__lubanE2E).toBeUndefined();
  });

  it('开启 → 暴露 coreFrontend/coreCommon；重复安装幂等', () => {
    installE2EHooks(true);
    const hook = (window as unknown as {
      __lubanE2E?: { coreFrontend: { IModelApp?: unknown }; coreCommon: unknown };
    }).__lubanE2E;
    expect(hook).toBeDefined();
    expect(hook?.coreFrontend.IModelApp).toBeDefined();
    expect(hook?.coreCommon).toBeDefined();
    installE2EHooks(true);
    expect((window as unknown as { __lubanE2E?: unknown }).__lubanE2E).toBe(hook);
  });
});
