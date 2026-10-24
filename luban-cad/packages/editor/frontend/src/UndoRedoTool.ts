/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Editing
 */

import { IModelApp, IpcApp, Tool } from "@itwin/core-frontend";
import { LUBAN_INIT_TXN_DESCRIPTION } from "@luban-cad/shared";

/** Undo all element changes
 * @beta
 */
export class UndoAllTool extends Tool {
  public static override toolId = "UndoAll";
  public override async run(): Promise<boolean> {
    const imodel = IModelApp.viewManager.selectedView?.view.iModel;
    if (undefined === imodel || imodel.isReadonly || !imodel.isBriefcaseConnection())
      return true;

    if (!await IModelApp.toolAdmin.finishEditCommandForTxnOperation())
      return false;

    return IpcApp.appFunctionIpc.reverseAllTxn(imodel.key).then(() => true).catch(() => false);
  }
}

/** Undo active tool steps, or element changes
 * @beta
 */
export class UndoTool extends Tool {
  public static override toolId = "Undo";
  public override async run(): Promise<boolean> {
    const imodel = IModelApp.viewManager.selectedView?.view.iModel;
    // 鲁班守卫（M6-c 后置）：初始化事务不可撤销——撤销它会删除 BodySolid/schema
    // 定义元素=库损坏向量（新鲜空树 undo 恒可用的产品级缺陷，根因=
    // FeatureService.ensureInitialized 的 init save 进会话撤销栈）。工具栏/快捷键
    // /程序化三路同归此工具，单点封口；查询失败不阻断既有行为。
    if (undefined !== imodel && imodel.isBriefcaseConnection()) {
      try {
        if ((await imodel.txns.getUndoString()) === LUBAN_INIT_TXN_DESCRIPTION)
          return true;
      } catch {
        /* 忽略查询异常——撤销行为回落既有通道 */
      }
    }
    await IModelApp.toolAdmin.doUndoOperation();
    return true;
  }
}

/** Redo active tool steps, or element changes
 * @beta
 */
export class RedoTool extends Tool {
  public static override toolId = "Redo";
  public override async run(): Promise<boolean> {
    await IModelApp.toolAdmin.doRedoOperation();
    return true;
  }
}

