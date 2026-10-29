/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * FilletEdgeRef 键控助手（M6-b T6 引入；M6-d v1.9 随契约纯换为边自身 id 单键）——
 * **零依赖模块**（不改 shared 契约、不拉 editor 基座链）。
 *
 * 独立成模块的裁决（同 sketch-tool-events.ts 的拆分理由）：FeatureDialog
 * （chips 去重/移除反查）需要本助手在**运行期**可用，而拾取工具模块
 * （FilletEdgePickTool.ts）静态依赖 @itwin/editor-frontend（LocateSubEntityTool
 * 基座）——后者经 core-frontend 全链加载，若对话框静态导入会把该存在性强加给
 * 全部 FeatureDialog 消费方（含 jsdom 测试的 mock 面）。故纯函数拆出零依赖
 * 模块：对话框与工具各自导入，互不牵连。
 */

import type { FilletEdgeRef } from '@luban-cad/shared';

/** 单个拓扑 id 的键（nodeId:entityId）。 */
function topoKey(id: { nodeId: number; entityId: number }): string {
  return `${id.nodeId}:${id.entityId}`;
}

/**
 * 边引用的无关键：边自身持久 id（M6-d v1.9 起契约 `{edge}`——布尔分裂片同 id
 * 多持属同一逻辑边，重拾分裂片即同键去重；旧面对形态 `{faceA,faceB}` 已退役）。
 * 去重与移除反查共用本键。
 */
export function filletEdgeRefKey(ref: FilletEdgeRef): string {
  return topoKey(ref.edge);
}
