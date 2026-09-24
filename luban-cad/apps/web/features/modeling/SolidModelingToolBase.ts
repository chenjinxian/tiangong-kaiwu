/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  LocateSubEntityTool,
} from '@itwin/editor-frontend';
import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
} from '@itwin/core-frontend';
import { SubEntityLocationProps } from '@itwin/editor-common';
import { solidModelingEvents, SolidModelingEventMap } from './SolidModelingEvents.js';

export interface SolidModelingToolBaseOptions {
  /** 选择子实体时的回调 */
  onEntitySelected?: (elementId: string, entity: SubEntityLocationProps) => void;
  /** 完成选择时的回调 */
  onComplete?: (elementId: string, entities: SubEntityLocationProps[]) => void;
  /** 取消选择时的回调 */
  onCancel?: () => void;
}

/**
 * 实体建模工具基类 - 提供边/面选择的通用逻辑
 * RoundEdgesTool, ChamferEdgesTool, HollowFacesTool 继承此类
 */
export abstract class SolidModelingToolBase<
  TOptions extends SolidModelingToolBaseOptions = SolidModelingToolBaseOptions,
> extends LocateSubEntityTool {
  protected _onEntitySelected?: (elementId: string, entity: SubEntityLocationProps) => void;
  protected _onComplete?: (elementId: string, entities: SubEntityLocationProps[]) => void;
  protected _onCancel?: () => void;
  protected _selectedEntities: SubEntityLocationProps[] = [];
  protected _currentElementId?: string;

  public override requireWriteableTarget(): boolean {
    return true;
  }

  /**
   * Initialize tool - enable element location for BRep sub-entity detection.
   */
  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    // Enable element location with dynamics (needed for sub-entity highlighting)
    this.initLocateElements(true, false, undefined, undefined);
  }

  /** 设置工具选项（子类应调用 super） */
  public setOptions(options: TOptions): void {
    this._onEntitySelected = options.onEntitySelected;
    this._onComplete = options.onComplete;
    this._onCancel = options.onCancel;
  }

  /** 获取要 emit 的事件名 */
  protected abstract getEventName(): keyof SolidModelingEventMap;

  /** 获取提示文本（用于 setupAndPromptForNextAction） */
  protected abstract getPromptText(): string;

  /** 获取已选择子实体后的提示文本 */
  protected abstract getSelectedPromptText(count: number): string;

  /** 创建新工具实例并设置相同选项（用于 onRestartTool） */
  protected abstract createRestartTool(): SolidModelingToolBase<TOptions>;

  /**
   * 当选中子实体时调用
   */
  protected override async addSubEntity(
    id: string,
    props: SubEntityLocationProps,
  ): Promise<void> {
    await super.addSubEntity(id, props);
    this._currentElementId = id;
    this._selectedEntities.push(props);
    this._onEntitySelected?.(id, props);

    IModelApp.notifications.outputPrompt(this.getSelectedPromptText(this._selectedEntities.length));
  }

  /**
   * 当取消选择子实体时调用
   */
  protected override async removeSubEntity(
    id: string,
    props?: SubEntityLocationProps,
  ): Promise<void> {
    await super.removeSubEntity(id, props);
    if (props) {
      this._selectedEntities = this._selectedEntities.filter(
        (entity) => entity.subEntity.index !== props.subEntity.index,
      );
    }
  }

  /**
   * 处理数据按钮按下 - 选择子实体
   */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    await super.onDataButtonDown(ev);
    return EventHandled.No;
  }

  /**
   * 处理重置按钮（右键）- 完成选择
   */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._currentElementId && this._selectedEntities.length > 0) {
      this._onComplete?.(this._currentElementId, this._selectedEntities);
      solidModelingEvents.emit(
        this.getEventName(),
        this._currentElementId,
        this._selectedEntities,
      );
    } else {
      this._onCancel?.();
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /**
   * 工具清理
   */
  public override async onCleanup(): Promise<void> {
    await super.onCleanup();
    this._selectedEntities = [];
  }

  /**
   * 重启工具
   */
  public override async onRestartTool(): Promise<void> {
    const tool = this.createRestartTool();
    if (!(await tool.run())) {
      return this.exitTool();
    }
  }

  /**
   * 设置工具提示
   */
  protected override setupAndPromptForNextAction(): void {
    IModelApp.notifications.outputPrompt(this.getPromptText());
  }

  /**
   * 获取已选择的子实体（返回副本）
   */
  public get selectedEntities(): SubEntityLocationProps[] {
    return [...this._selectedEntities];
  }

  /**
   * 获取当前元素ID
   */
  public get currentElementId(): string | undefined {
    return this._currentElementId;
  }
}
