/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 选择权威（X-03，2026-11-04）：`store.canvas.selection` 是唯一选择事实源，
 * `BriefcaseConnection.selectionSet` 只是 **part（body 元素）选择** 的单向投影，
 * 供标准元素集工具（DeleteElements/Move/Rotate 等）在 onPostInstall 读取。
 *
 * 为什么不是双向桥：
 * - 旧 `useCanvasBodySelection` 订阅 selectionSet.onChanged 再写回 store，和树
 *   effect / Onshape 工具 / 右键菜单的多处直写形成双权威，undo 快照与清空时序
 *   难以推理（X-03）。
 * - 本模块是唯一写 selectionSet 的产品代码路径；子实体（face/edge/vertex）永远
 *   不写入 selectionSet（iTwin SelectionSet 只承载元素 id）。
 * - 工具启动时（activeToolChanged 先于 onPostInstall）如需保留输入选择集，用
 *   `preserveToolSelection` 显式跳过投影——这是标准 ElementSetTool 的输入契约，
 *   不是第二套选择状态。
 *
 * 所有函数只做同步 store/selectionSet 写入（无 React effect 延迟），保证
 * “树选中 part → 立刻 Delete/Move”拿到稳定的 selectionSet。
 */

import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { BodyInfo } from '@luban-cad/shared';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { CanvasSelection } from '../types.js';

/**
 * 稳定 key：kind+id+label+ownerBodyKey+topology 六元组。用于等值守卫，
 * 避免同值重写 store 数组引用（打穿选择驱动 UI 的 memo）。
 */
export function canvasSelectionKey(selection: readonly CanvasSelection[]): string {
  return JSON.stringify(selection.map((entry) => [
    entry.kind,
    entry.id,
    entry.label ?? null,
    entry.ownerBodyKey ?? null,
    entry.topologyId?.nodeId ?? null,
    entry.topologyId?.entityId ?? null,
  ]));
}

/** selection 中的 part id（保持选择顺序；子实体条目不投影）。 */
export function bodyIdsFromCanvasSelection(selection: readonly CanvasSelection[]): string[] {
  return selection
    .filter((entry) => entry.kind === 'part')
    .map((entry) => entry.id);
}

/** active authored body 索引（同 bodyKey 重复条目取首个；consumed/orphan 排除）。 */
export function activeAuthoredBodiesById(
  bodies: readonly BodyInfo[],
): Map<string, BodyInfo> {
  const byId = new Map<string, BodyInfo>();
  for (const body of bodies) {
    if (body.active && body.authored !== false && !byId.has(body.bodyKey))
      byId.set(body.bodyKey, body);
  }
  return byId;
}

/**
 * 树 selectedNodeIds → part 选择（只保留 active authored body；顺序同 selectedNodeIds）。
 * 空集返回 []——调用方决定是否保持现有画布选择（旧语义：树选特征节点不清画布）。
 */
export function partSelectionsFromTree(
  selectedNodeIds: readonly string[],
  bodies: readonly BodyInfo[],
): CanvasSelection[] {
  const byId = activeAuthoredBodiesById(bodies);
  const selection: CanvasSelection[] = [];
  for (const id of selectedNodeIds) {
    const body = byId.get(id);
    if (body)
      selection.push({ kind: 'part', id: body.bodyKey, label: body.name });
  }
  return selection;
}

/**
 * store.canvas.selection → connection.selectionSet（唯一投影写点）。
 * 子实体/空选择 → 清空；part 选择 → replace(part ids)。
 * 同序列等值守卫：重复调用不触发 SelectionSet.onChanged。
 */
export function projectCanvasSelectionToSelectionSet(
  connection: BriefcaseConnection | undefined,
  selection: readonly CanvasSelection[],
): void {
  if (!connection)
    return;

  const selectionSet = connection.selectionSet;
  if (!selectionSet)
    return;

  const next = bodyIdsFromCanvasSelection(selection);
  // SelectionSet.elements is always present in production; keep the guard so
  // minimal test doubles that only implement replace() remain usable.
  const current = (selectionSet.elements as ReadonlySet<string> | undefined)
    ? [...selectionSet.elements]
    : [];

  if (next.length === 0) {
    if (current.length > 0)
      selectionSet.emptyAll();
    return;
  }

  if (current.length === next.length && current.every((id, index) => id === next[index]))
    return;

  selectionSet.replace(next);
}

export interface ApplyCanvasSelectionOptions {
  /** 清空 tree.selectedNodeIds（画布子实体拾取/空白清除为 true；树→画布 part 选择为 false）。 */
  clearTree?: boolean;
  /** 跳过 selectionSet 投影（仅在工具启动路径显式保留输入选择集时使用）。 */
  project?: boolean;
}

/** 写 store（可选清树）并投影 selectionSet；等值守卫避免无谓数组替换。 */
export function applyCanvasSelection(
  connection: BriefcaseConnection | undefined,
  selection: readonly CanvasSelection[],
  options?: ApplyCanvasSelectionOptions,
): void {
  const store = usePartStudioStore.getState();
  if (options?.clearTree && store.tree.selectedNodeIds.length > 0)
    store.setSelectedNodeIds([]);

  if (canvasSelectionKey(store.canvas.selection) !== canvasSelectionKey(selection))
    store.setCanvasSelection(selection);

  if (options?.project !== false)
    projectCanvasSelectionToSelectionSet(connection, selection);
}

/**
 * 清空选择（store + 树 + selectionSet）。
 * `preserveToolSelection`：元素集工具启动时保留 selectionSet 作为其 onPostInstall
 * 输入（标准 ElementSetTool 契约）；store/树仍清空以维持 Onshape 空闲态语义。
 */
export function clearCanvasSelection(
  connection: BriefcaseConnection | undefined,
  options?: { preserveToolSelection?: boolean },
): void {
  const store = usePartStudioStore.getState();
  if (store.canvas.selection.length > 0)
    store.setCanvasSelection([]);
  if (store.tree.selectedNodeIds.length > 0)
    store.setSelectedNodeIds([]);

  if (!options?.preserveToolSelection)
    projectCanvasSelectionToSelectionSet(connection, []);
}

/**
 * 按当前 store 选择重新投影（工具退出/Onshape 工具重新激活时调用，修复
 * “工具启动时保留输入选择集”造成的临时分叉）。
 */
export function syncCanvasSelectionProjection(connection: BriefcaseConnection | undefined): void {
  projectCanvasSelectionToSelectionSet(connection, usePartStudioStore.getState().canvas.selection);
}
