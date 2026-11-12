/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ADR-0017 Stage F：自动保存手动冲刷桥（e2e/legacy helper 用）。
 *
 * 页面在连接就绪时注册 `flush(description)`：若仍有未保存/未推送变更则
 * `connection.pushChanges(description)` 并返回 true。`pushExampleChanges`
 * 用它保留「显式描述」能力（自动保存默认描述是「自动保存」）；无连接或
 * 无 pending 时返回 false（不制造空 changeset）。
 */

export type AutoPushFlush = (description: string) => Promise<boolean>;

let current: AutoPushFlush | undefined;

export function registerAutoPushFlush(flush: AutoPushFlush | undefined): () => void {
  current = flush;
  return () => {
    if (current === flush) current = undefined;
  };
}

export async function flushAutoPush(description: string): Promise<boolean> {
  if (!current) return false;
  try {
    return await current(description);
  } catch {
    return false;
  }
}
