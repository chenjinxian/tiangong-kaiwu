/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图阵列会话提交桥（AIRR 2026-11-12）：阵列是 canvas gizmo，不是
 * PrimitiveTool；草图对话框「成品」/画布右键「确认 草图 N」退出前必须先提交
 * 未完成的阵列。Gizmo 挂载时注册提交函数，卸载清空；宿主确认链调用
 * `commitActiveSketchPattern()`，失败则不退出草图（保留预览）。
 */
type SketchPatternCommit = () => Promise<boolean>;

let activeCommit: SketchPatternCommit | null = null;

export function registerSketchPatternCommit(commit: SketchPatternCommit | null): void {
  activeCommit = commit;
}

export function hasActiveSketchPattern(): boolean {
  return activeCommit !== null;
}

/** 提交当前阵列；无活动阵列返回 true（等价 nothing to commit）。 */
export async function commitActiveSketchPattern(): Promise<boolean> {
  if (!activeCommit)
    return true;
  return activeCommit();
}
