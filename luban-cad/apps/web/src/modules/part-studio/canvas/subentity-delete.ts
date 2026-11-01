/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * B6 M-A5.2：面/边删除通道（HITL 确认后的宿主动作）。
 *
 * 用选择条目的**会话级** `cacheId` 调 editor 的 SolidModeling 命令
 * `deleteSubEntities`（OperationType.DeleteSubEntity=22），随后保存 briefcase
 * 事务——可撤销由 BriefcaseTxns 标准通道保证。
 *
 * 边界：
 * - 选择条目携带**持久拓扑 id**（`topologyId`）；删除前在同一 SolidModeling
 *   命令内建几何缓存，并用 `facesFromId`/`edgesFromOwnId` 反查 cache id——
 *   不依赖拾取工具会话级的 cache id（工具/命令切换后仍可寻址）；
 * - 面/边删除不是特征 op（不经过 FeatureService）；树刷新由
 *   `connection.txns.onCommitted` 的既有 refresh 通道带动；
 * - 只删除**主选择**一个子实体（多选删除暂不开放，避免不同 owner/type 混删）。
 */
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { editorBuiltInCmdIds, SubEntityType } from '@itwin/editor-common';
import { EditTools, solidModelingIpc } from '@itwin/editor-frontend';
import type { CanvasSelection } from '../types.js';

export async function deleteSelectedSubEntity(
  connection: BriefcaseConnection,
  selection: readonly CanvasSelection[],
): Promise<void> {
  const primary = selection[selection.length - 1];
  if (!primary || (primary.kind !== 'face' && primary.kind !== 'edge')) {
    throw new Error('面/边删除只接受 face/edge 主选择');
  }
  if (!primary.ownerBodyKey) {
    throw new Error('面/边删除缺少 ownerBodyKey');
  }
  if (!primary.topologyId) {
    throw new Error('面/边删除缺少持久 topologyId（请重新拾取面/边）');
  }

  await EditTools.startCommand<string>({
    commandId: editorBuiltInCmdIds.cmdSolidModeling,
    iModelKey: connection.key,
  });

  // 同一命令内建缓存：后续反查/删除操作依赖它；不同命令的 cache id 不跨用。
  const created = await solidModelingIpc.createElementGeometryCache(primary.ownerBodyKey, {
    parts: true, curves: false, surfaces: true, solids: true, other: false,
  });
  if (!created) {
    throw new Error('无法为所选体建立几何缓存');
  }

  const type = primary.kind === 'face' ? SubEntityType.Face : SubEntityType.Edge;
  const ids = primary.kind === 'face'
    ? await solidModelingIpc.facesFromId(primary.ownerBodyKey, primary.topologyId.nodeId, primary.topologyId.entityId)
    : await solidModelingIpc.edgesFromOwnId(primary.ownerBodyKey, primary.topologyId.nodeId, primary.topologyId.entityId);
  if (!ids || ids.length === 0) {
    throw new Error('无法按持久拓扑 id 反查面/边（几何已变化，请重新拾取）');
  }

  const result = await solidModelingIpc.deleteSubEntities(
    primary.ownerBodyKey,
    { subEntities: ids.map((id) => ({ id: Number(id), type })) },
    {
      writeChanges: true,
      requestId: `LubanCAD.DeleteSubEntity:${primary.ownerBodyKey}:${primary.id}`,
    },
  );
  if (!result) {
    throw new Error('deleteSubEntities 未返回几何结果（内核拒收或目标已变化）');
  }

  // 5.9 起标记 deprecated，但仍是 briefcase 提交的标准入口（useUndoRedo/useBriefcaseConnection 同口径）。
  await connection.saveChanges('LubanCAD: delete sub-entity');
}
