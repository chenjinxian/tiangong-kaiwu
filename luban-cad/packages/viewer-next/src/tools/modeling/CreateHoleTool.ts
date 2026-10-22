/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// 同源移植自 apps/web/features/modeling/CreateHoleTool.ts（web-next M4-T3；
// 类名/toolId 不改——Agent 复用规约）。等价改写同 DraftFacesTool 头注：动态
// import 收敛静态导入；app 级 i18n 改包内 toolMessage。

import { BeButtonEvent, EventHandled, IModelApp, NotifyMessageDetails, OutputMessagePriority, PrimitiveTool } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { OpenCloudRpcInterface } from '@luban-cad/shared';
import { toolMessage } from '../messages.js';

/**
 * Create Hole Tool - Creates holes on selected faces
 * Tool ID: 'CreateHole'
 *
 * 使用方法：
 * 1. 点击选择打孔位置
 * 2. 在对话框中设置直径和深度
 * 3. 确认执行打孔
 */
export class CreateHoleTool extends PrimitiveTool {
  public static override toolId = 'CreateHole';
  public static override iconSpec = 'icon-create-hole';
  public static override namespace = 'LubanCad';

  private _centerPoint?: Point3d;
  private _diameter = 10;
  private _depth = 20;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, false, 'face', undefined);
    IModelApp.notifications.outputMessage(
      new NotifyMessageDetails(
        OutputMessagePriority.Info,
        toolMessage('modelingTools.holePrompt')
      )
    );
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (!this._centerPoint) {
      this._centerPoint = ev.point;
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Info,
          toolMessage('modelingTools.holePositionSelected', {
            x: this._centerPoint.x.toFixed(2),
            y: this._centerPoint.y.toFixed(2),
            z: this._centerPoint.z.toFixed(2),
          })
        )
      );
      return EventHandled.Yes;
    }

    await this.executeHole();
    // 重置位置，允许连续打孔
    this._centerPoint = ev.point;
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._centerPoint) {
      await this.executeHole();
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  private async executeHole(): Promise<void> {
    if (!this._centerPoint) return;

    try {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Info,
          toolMessage('modelingTools.holeApplying', {
            diameter: this._diameter,
            depth: this._depth,
          })
        )
      );

      // 获取当前 iModel 连接
      const viewport = IModelApp.viewManager.selectedView;
      if (!viewport || !viewport.iModel) {
        throw new Error('No active viewport or iModel');
      }

      const iModel = viewport.iModel;
      if (!iModel.isBriefcaseConnection()) {
        throw new Error('Editing requires a briefcase connection');
      }

      // 调用 RPC 执行打孔操作
      const rpc = OpenCloudRpcInterface.getClient();

      // 使用 startEditCommand 启动编辑命令
      await rpc.startEditCommand(
        'solidModeling',
        iModel.key,
        'createHole',
        {
          centerPoint: {
            x: this._centerPoint.x,
            y: this._centerPoint.y,
            z: this._centerPoint.z,
          },
          diameter: this._diameter,
          depth: this._depth,
        }
      );

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          toolMessage('modelingTools.holeDone', {
            diameter: this._diameter,
            depth: this._depth,
          })
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          toolMessage('modelingTools.holeFailed', { message: errorMessage })
        )
      );
      // eslint-disable-next-line no-console
      console.error('[CreateHoleTool] Failed:', err);
    }
  }

  public override async onRestartTool(): Promise<void> {
    this._centerPoint = undefined;
    const tool = new CreateHoleTool();
    if (!await tool.run()) return this.exitTool();
  }

  /**
   * 设置打孔参数
   */
  public setParameters(diameter: number, depth: number): void {
    this._diameter = diameter;
    this._depth = depth;
  }

  /**
   * 获取当前参数
   */
  public getParameters(): { diameter: number; depth: number } {
    return { diameter: this._diameter, depth: this._depth };
  }
}
