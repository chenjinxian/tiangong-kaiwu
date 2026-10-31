/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * P2.8：生产安全 E2E 观测面。
 *
 * 背景：e2e 曾用 Vite dev-only 的 `import('/@id/@itwin/core-frontend')` 读取
 * 运行中的模块实例；发布镜像没有 `/@id/`，9 个用例在 :5301 上以 MIME 错误失败。
 * 本模块只在构建期 `VITE_E2E_HOOKS=true`（E2E 测试镜像/源码 e2e dev server）时，
 * 把 core-frontend / core-common 的模块命名空间挂到 `window.__lubanE2E`；生产与
 * 发布镜像缺省不设置该变量，hook 不安装（页面脚本无法借此拿到内部模块）。
 *
 * 注意：hook 必须在 viewer host 启动链中安装（web-initializer 的 doStartViewer），
 * 且仅在浏览器环境。e2e 的 `readOpenBriefcaseInfo` 等 helper 在页面内消费。
 */

import * as coreFrontend from '@itwin/core-frontend';
import * as coreCommon from '@itwin/core-common';

export interface LubanE2EHook {
  readonly coreFrontend: typeof coreFrontend;
  readonly coreCommon: typeof coreCommon;
}

declare global {
  interface Window {
    __lubanE2E?: LubanE2EHook;
  }
}

/** 安装 E2E 观测面（幂等；VITE_E2E_HOOKS !== 'true' 时不生效）。
 *  `forceEnabled` 仅用于单测（生产调用不传，读构建期 env）。 */
export function installE2EHooks(forceEnabled?: boolean): void {
  if (typeof window === 'undefined') return;
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const enabled = forceEnabled ?? env?.VITE_E2E_HOOKS === 'true';
  if (!enabled) return;
  if (window.__lubanE2E) return;
  window.__lubanE2E = Object.freeze({ coreFrontend, coreCommon });
}
