/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Editing
 */

import { BentleyError, CompressedId64Set, IModelStatus } from "@itwin/core-bentley";
import type { ElementProps } from "@itwin/core-common";
import { ElementSetTool, IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@itwin/core-frontend";
import { editorBuiltInCmdIds } from "@itwin/editor-common";
import { EditTools } from "./EditTool";
import { basicManipulationIpc } from "./EditToolIpc";

/** 拒删 authored body 的用户可见文案（zh/en；warning 级）。 */
export const AUTHORED_BODY_DELETE_BLOCKED_MESSAGE =
  "无法直接删除实体：实体由特征树管理，请删除驱动特征。 / " +
  "Cannot delete a body directly: bodies are managed by the feature tree. Delete the driving feature instead.";

/** LubanCAD BodySolid 的 ECClassName（后端 schema 名；前端读 props 的唯一类判据）。 */
const LUBAN_BODY_SOLID_CLASS = "LubanCAD:BodySolid";

/**
 * 是否为受特征树管理的 LubanCAD body（P2.6d / review C6）。
 *
 * 判据：
 * - classFullName 必须是 `LubanCAD:BodySolid`；
 * - `jsonProperties.luban.body` marker 显式 `authored:false`（直改 orphan）才算
 *   非 authored；**缺 marker 的历史 body 保守视为 authored**（后端 isAuthoredBody
 *   的旧库 heuristic 会把默认体/有源体视为 authored——前端无法反查，
 *   故以「非显式 orphan 即拒删」兜底，绝不放过生命周期 body）。
 * - jsonProperties 兼容对象/字符串两种读回形态（同后端 readBodyMarker 防御）。
 *
 * 纯函数（无 iModel/工具态依赖），供 DeleteElementsTool 与单测共用。
 */
export function isAuthoredBodyProps(
  props: Pick<ElementProps, "classFullName" | "jsonProperties">,
): boolean {
  if (props.classFullName !== LUBAN_BODY_SOLID_CLASS)
    return false;
  const marker = readBodyMarker(props.jsonProperties);
  return marker?.authored !== false;
}

function readBodyMarker(jsonProperties: unknown): { authored?: boolean } | undefined {
  const asObject = (value: unknown): Record<string, unknown> | undefined => {
    if (undefined === value || null === value)
      return undefined;
    if ("string" === typeof value) {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return undefined; // 库外直写脏 JSON：按无 marker 处理（保守 → authored）
      }
    }
    return "object" === typeof value ? value as Record<string, unknown> : undefined;
  };
  const luban = asObject(asObject(jsonProperties)?.luban);
  const marker = luban?.body;
  if (!marker || "object" !== typeof marker)
    return undefined;
  const authored = (marker as { authored?: unknown }).authored;
  return { authored: "boolean" === typeof authored ? authored : undefined };
}

/** @alpha Delete elements immediately from active selection set or prompt user to identify elements to delete. */
export class DeleteElementsTool extends ElementSetTool {
  public static override toolId = "DeleteElements";
  public static override iconSpec = "icon-delete";

  protected override get allowSelectionSet(): boolean { return true; }
  protected override get allowGroups(): boolean { return true; }
  protected override get allowDragSelect(): boolean { return true; }
  protected override get controlKeyContinuesSelection(): boolean { return true; }
  protected override get requireAcceptForSelectionSetOperation(): boolean { return false; }

  public override async processAgendaImmediate(): Promise<void> {
    try {
      // C6 守卫（P2.6d）：BodySolid 是特征树管理实体——全局 Delete 直删会破坏
      // Part Studio 图不变量（init BodySolid 缺失 → 后端 getBodies 500）。
      // **在任何 EditCommand/事务之前**取 props 并拒删；非 body 选择照旧。
      // 注：`getProps` 需要真实 Id64Arg，压缩集合须先解压（不是直接传压缩串）。
      const selectedIds = CompressedId64Set.decompressArray(this.agenda.compressIds());
      if (selectedIds.length > 0) {
        const props = await this.iModel.elements.getProps(selectedIds);
        if (props.some(isAuthoredBodyProps)) {
          IModelApp.notifications.outputMessage(new NotifyMessageDetails(
            OutputMessagePriority.Warning,
            AUTHORED_BODY_DELETE_BLOCKED_MESSAGE,
          ));
          return; // 不 startCommand、不 deleteElements、不 saveChanges
        }
      }
      await EditTools.startCommand<string>({ commandId: editorBuiltInCmdIds.cmdBasicManipulation, iModelKey: this.iModel.key });
      if (IModelStatus.Success === await basicManipulationIpc.deleteElements(this.agenda.compressIds()))
        await this.saveChanges();
    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, BentleyError.getErrorMessage(err) || "An unknown error occurred."));
    }
  }

  public async onRestartTool() {
    const tool = new DeleteElementsTool();
    if (!await tool.run())
      return this.exitTool();
  }
}
