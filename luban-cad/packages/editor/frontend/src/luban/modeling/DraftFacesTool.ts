/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// 同源移植自 apps/web/features/modeling/DraftFacesTool.ts（web-next M4-T3；
// 类名/toolId 不改——Agent 复用规约「同 toolId 禁第二套」）。两处等价改写：
//  1) 动态 `new (await import('@itwin/core-frontend')).NotifyMessageDetails(...)`
//     收敛为静态导入（行为同）；2) app 级 i18n 改包内 toolMessage（见同目录
// messages.ts 头注）。startEditCommand 第 3 参起为 'draftFaces' 后端命令
// 载荷（OpenCloudRpcInterface.startEditCommand 变参契约）。
// 2026-10-22 随 editor 模块收编迁入本包（@itwin/editor-frontend）src/luban/
// modeling/。

import { SubEntityLocationProps, SubEntityType } from '@itwin/editor-common';
import { SolidModelingToolBase, SolidModelingToolBaseOptions } from './SolidModelingToolBase';
import type { SolidModelingEventMap } from './SolidModelingEvents';
import { type BeButtonEvent, EventHandled, IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { OpenCloudRpcInterface } from '@luban-cad/shared';
import { toolMessage } from './messages';

export interface DraftFacesToolOptions extends SolidModelingToolBaseOptions {
  /** 拔模角度（度） */
  draftAngle: number;
  /** 拔模方向（可选，默认为面法向） */
  draftDirection?: { x: number; y: number; z: number };
}

/**
 * 拔模面工具 - 选择面并应用拔模角度
 *
 * 使用方法：
 * 1. 运行工具
 * 2. 点击选择要拔模的面（可多选）
 * 3. 右键完成选择
 * 4. 在对话框中设置拔模角度
 * 5. 确认执行拔模
 */
export class DraftFacesTool extends SolidModelingToolBase<DraftFacesToolOptions> {
  public static override toolId = 'DraftFaces';
  public static override iconSpec = 'icon-draft-faces';
  public static override namespace = 'LubanCad';

  private _draftAngle = 5; // 默认5度
  private _draftDirection?: { x: number; y: number; z: number };

  public override setOptions(options: DraftFacesToolOptions): void {
    super.setOptions(options);
    this._draftAngle = options.draftAngle ?? 5;
    this._draftDirection = options.draftDirection;
  }

  protected override wantSubEntityType(type: SubEntityType): boolean {
    return type === SubEntityType.Face;
  }

  protected override get geometryCacheFilter() {
    return { parts: true, curves: false, surfaces: false, solids: true, other: false };
  }

  protected getEventName(): keyof SolidModelingEventMap {
    return 'draftComplete';
  }

  protected getPromptText(): string {
    return toolMessage('modelingTools.draftPrompt', { angle: this._draftAngle });
  }

  protected getSelectedPromptText(count: number): string {
    return toolMessage('modelingTools.draftSelected', { count });
  }

  protected createRestartTool(): SolidModelingToolBase<DraftFacesToolOptions> {
    const tool = new DraftFacesTool();
    tool.setOptions({
      draftAngle: this._draftAngle,
      draftDirection: this._draftDirection,
      onEntitySelected: this._onEntitySelected,
      onComplete: this._onComplete,
      onCancel: this._onCancel,
    });
    return tool;
  }

  /**
   * 重写完成选择后的处理 - 执行拔模操作
   */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._currentElementId && this._selectedEntities.length > 0) {
      // 执行拔模操作
      await this.executeDraft();

      // 触发回调和事件
      this._onComplete?.(this._currentElementId, this._selectedEntities);
    } else {
      this._onCancel?.();
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /**
   * 执行拔模操作
   */
  private async executeDraft(): Promise<void> {
    if (!this._currentElementId || this._selectedEntities.length === 0) {
      return;
    }

    try {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          1,
          toolMessage('modelingTools.draftApplying', {
            count: this._selectedEntities.length,
            angle: this._draftAngle,
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

      // 准备面索引列表
      const faceIndices = this._selectedEntities.map(entity => entity.subEntity.index);

      // 调用 RPC 执行拔模操作
      const rpc = OpenCloudRpcInterface.getClient();

      // 使用 startEditCommand 启动编辑命令
      await rpc.startEditCommand(
        'solidModeling',
        iModel.key,
        'draftFaces',
        {
          elementId: this._currentElementId,
          faceIndices,
          draftAngle: this._draftAngle,
          draftDirection: this._draftDirection,
        }
      );

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          0,
          toolMessage('modelingTools.draftDone', {
            count: this._selectedEntities.length,
            angle: this._draftAngle,
          })
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          toolMessage('modelingTools.draftFailed', { message: errorMessage })
        )
      );
      // eslint-disable-next-line no-console
      console.error('[DraftFacesTool] Failed:', err);
    }
  }

  /**
   * 获取已选择的面
   */
  public get selectedFaces(): SubEntityLocationProps[] {
    return this.selectedEntities;
  }

  /**
   * 获取拔模角度
   */
  public get draftAngle(): number {
    return this._draftAngle;
  }

  /**
   * 设置拔模角度
   */
  public setDraftAngle(angle: number): void {
    this._draftAngle = angle;
    this.setupAndPromptForNextAction();
  }
}

/**
 * 运行拔模面工具的辅助函数
 */
export async function runDraftFacesTool(
  options: DraftFacesToolOptions,
): Promise<void> {
  const tool = new DraftFacesTool();
  tool.setOptions(options);
  await tool.run();
}
