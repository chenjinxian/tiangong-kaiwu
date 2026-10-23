/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * FilletEdgeRef 键控助手（M6-b T6）——**零依赖模块**（不改 shared 契约、不拉
 * editor 基座链）。
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
 * 边引用的无关键：面对无序——{A,B} 与 {B,A} 是同一条边（resolveEdgeRef 契约
 * 注记「恰 2 元素序无关」），去重与移除反查共用本键（旧应用 useEdgeRefPicker
 * refKey 同构移植）。
 */
export function filletEdgeRefKey(ref: FilletEdgeRef): string {
  const a = topoKey(ref.faceA);
  const b = topoKey(ref.faceB);
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}
