/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Editing
 */

import { BentleyError, CompressedId64Set, IModelStatus } from "@itwin/core-bentley";
import { ElementSetTool, IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@itwin/core-frontend";
import {
  AUTHORED_BODY_DELETE_BLOCKED_MESSAGE,
  editorBuiltInCmdIds,
  isAuthoredBodyProps,
} from "@itwin/editor-common";
import { EditTools } from "./EditTool";
import { basicManipulationIpc } from "./EditToolIpc";

// P2.6d 的守卫谓词已上收 editor-common（P2.8 后端 BasicManipulationCommand 复用同一真值表）；
// 从本模块 re-export，保持既有测试/消费方 import 口径不变。
export { AUTHORED_BODY_DELETE_BLOCKED_MESSAGE, isAuthoredBodyProps } from "@itwin/editor-common";

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
