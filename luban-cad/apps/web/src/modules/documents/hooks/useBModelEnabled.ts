/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * B-model 功能开关（P2 D9 / P2.1）：`VITE_B_MODEL_ENABLED` 缺省关，**只认
 * 字符串 'true'**（'1'/'TRUE'/空串/缺席一律关——避免布尔真值或误拼写打开
 * 未验收的 B 双区 UI）。测试经 `vi.stubEnv` 改写 import.meta.env，或模块级
 * mock 本 hook（DocumentsPage 单测口径）。
 */

export function isBModelEnabled(
  raw: string | undefined = import.meta.env.VITE_B_MODEL_ENABLED,
): boolean {
  return raw === 'true';
}

/** 读构建期开关（同一次构建内恒定；调用方无需订阅）。 */
export function useBModelEnabled(): boolean {
  return isBModelEnabled();
}
