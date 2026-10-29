/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useCanvasBodySelection（B6 M-A5 Task 1）：画布选择集 → store.canvas.selection
 * 的 body 映射桥。`connection.selectionSet`（每连接 SelectionSet，vendored
 * core-frontend SelectionSet.ts——画布 pick 的权威选择源）映射为
 * `CanvasSelection`（kind='part'，id=body.bodyKey，label=body.name），供
 * 既有消费面（CanvasContextMenu 右键按 kind 重构/对话框 chips）零改动复用。
 *
 * 语义（brief task-1 钉死）：
 * - 仅当 `enabled`（M-A5.2 T1：store.canvas.selectionMode === 'body'）、
 *   `connection` 且 `bodies !== undefined`（body 读面可用）时订阅；
 *   `bodies === undefined`（legacy 回退：MS<1.15/读面故障）或 `enabled=false`
 *   （face/edge 子实体模式）**完全不接管** store 选择集——不订阅、不清空，
 *   模式切换后的选择集归子实体工具管；
 * - 挂载/连接与 bodies 变化/enabled 翻转/每次 `onChanged` 都以 `elements`
 *   当前集为权威（不应用事件 delta：delta 只描述本次增删，晚到/并发事件后
 *   必须按全量重算），按 elements 迭代序映射到 `active && authored !== false`
 *   的 body；非 body/未知/已被消费（active=false）/orphan（authored=false）
 *   元素忽略；映射为空写 `[]`。同一 body 经 Map 去重（bodyKey 唯一寻址）；
 * - 写前比较稳定 key（canvasSelectionKey：kind+id+label+owner+topology）：
 *   相同则不 set——zustand set 每次换数组引用，逐事件重写会打穿选择驱动 UI
 *   的 memo 与下游订阅；
 * - **不写 tree.selectedNodeIds**：树→画布 emphasize 由 useCanvasSelection
 *   单向承担；此处回写树选中会形成 canvas→tree→emphasize 回环/双高亮。
 *
 * 订阅生命周期：BeEvent.addListener 返回退订 disposer（vendored core-frontend
 * BeEvent 契约），effect cleanup 直接调用——连接替换/卸载/模式切出均不残留
 * 旧监听。不做全局订阅（无 IModelApp.selectionSet；iTwin.js 选择集按
 * connection 归属）。
 *
 * 单点挂载：PartStudioSession 调用一次（`featureSystem.bodiesLoaded ?
 * featureSystem.bodies : undefined`，enabled=selectionMode === 'body'）；
 * 不得在 FeatureTree/FeatureDialog/SketchDialog 再挂（双挂=双写选择集）。
 */

import { useEffect } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { BodyInfo } from '@luban-cad/shared';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { CanvasSelection } from '../types.js';

/**
 * 稳定 key：kind+id+label+ownerBodyKey+topology 六元组。子实体选择虽不经
 * 本桥写入，但 store 可能由工具写入 face/edge；未来若复用等值守卫，必须
 * 保证同 id 不同 owner/topology 不被误判。
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

/**
 * elements 当前集 → CanvasSelection[]（纯函数，权威全量重算）：
 * - 先建 active authored body 的 bodyKey→BodyInfo 索引（同 bodyKey 重复条目
 *   去重，首个 active authored 生效；inactive/consumed/orphan 不入索引）；
 * - 按 elements 迭代序输出，未知/非 body id 静默跳过。
 */
function mapBodiesToSelection(
  elements: ReadonlySet<string>,
  bodies: readonly BodyInfo[],
): CanvasSelection[] {
  const bodyById = new Map<string, BodyInfo>();
  for (const body of bodies) {
    if (body.active && body.authored !== false && !bodyById.has(body.bodyKey)) {
      bodyById.set(body.bodyKey, body);
    }
  }

  const selection: CanvasSelection[] = [];
  for (const id of elements) {
    const body = bodyById.get(id);
    if (!body) continue;
    selection.push({ kind: 'part', id: body.bodyKey, label: body.name });
  }
  return selection;
}

/**
 * @param connection briefcase 连接（`selectionSet` 每连接归属；未就绪传 undefined）
 * @param bodies body 读面（`featureSystem.bodiesLoaded ? featureSystem.bodies : undefined`；
 *   undefined = 读面不可用，本 hook 不接管 store 选择集）
 * @param enabled 选择模式门（M-A5.2 T1：`selectionMode === 'body'`；缺省 true
 *   保持既有测试/调用面语义。false=子实体模式，退订且不写 store）
 */
export function useCanvasBodySelection(
  connection: BriefcaseConnection | undefined,
  bodies: readonly BodyInfo[] | undefined,
  enabled = true,
): void {
  useEffect(() => {
    // legacy 回退：读面不可用（bodies undefined）不订阅、不清空——保持现状。
    // M-A5.2 T1：face/edge 子实体模式（enabled=false）同口径退订、不写 store。
    if (!enabled || !connection || bodies === undefined) return;

    const selectionSet = connection.selectionSet;
    const sync = (): void => {
      const next = mapBodiesToSelection(selectionSet.elements, bodies);
      const store = usePartStudioStore.getState();
      if (canvasSelectionKey(store.canvas.selection) === canvasSelectionKey(next)) return;
      store.setCanvasSelection(next);
    };

    // 挂载/重新启用即同步一次：订阅前已在选择集中的元素（页签重开/程序化
    // replace/模式切回 body）也要回流，不能等下一次 onChanged。
    sync();

    // BeEvent.addListener 返回退订 disposer——连接替换/卸载/模式切出由 effect
    // cleanup 调用。
    return selectionSet.onChanged.addListener(sync);
  }, [connection, bodies, enabled]);
}
