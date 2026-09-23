/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BeButtonEvent, EventHandled, IModelApp, PrimitiveTool, OutputMessagePriority } from '@itwin/core-frontend';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import { OpenCloudRpcInterface } from '@open-cloud-cad/shared';

/**
 * Mirror Elements Tool - Mirrors selected elements across a plane
 * Tool ID: 'MirrorElements'
 *
 * 使用方法：
 * 1. 点击选择要镜像的元素（可多选）
 * 2. 点击选择镜像平面上的点
 * 3. 点击确定镜像平面法向（或直接右键使用默认法向）
 * 4. 执行镜像操作
 */
export class MirrorElementsTool extends PrimitiveTool {
  public static override toolId = 'MirrorElements';
  public static override iconSpec = 'icon-mirror-elements';
  public static override namespace = 'OpenCloudCad';

  private _selectedElements: string[] = [];
  private _planePoint?: Point3d;
  private _planeNormal?: Vector3d;
  private _step: 'select' | 'plane-point' | 'plane-normal' = 'select';

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, false, 'default', undefined);
    await this.updateInstruction();
  }

  private async updateInstruction(): Promise<void> {
    const messages: Record<typeof this._step, string> = {
      select: `选择要镜像的元素（已选 ${this._selectedElements.length} 个），右键进入下一步`,
      'plane-point': '点击选择镜像平面上的点',
      'plane-normal': '点击确定镜像平面法向，或右键使用默认法向（Y轴）',
    };
    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(1, messages[this._step])
    );
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    switch (this._step) {
      case 'select': {
        // 使用 locate 获取实际选择的元素
        const currHit = IModelApp.locateManager.currHit;
        if (currHit?.isElementHit) {
          const elementId = currHit.sourceId;
          if (!this._selectedElements.includes(elementId)) {
            this._selectedElements.push(elementId);
          }
          await this.updateInstruction();
        }
        break;
      }
      case 'plane-point': {
        this._planePoint = ev.point.clone();
        this._step = 'plane-normal';
        await this.updateInstruction();
        break;
      }
      case 'plane-normal': {
        if (this._planePoint) {
          // 计算法向量为从平面点到点击点的向量
          this._planeNormal = Vector3d.createStartEnd(this._planePoint, ev.point);
          if (this._planeNormal.magnitude() < 0.001) {
            // 如果点太近，使用默认法向
            this._planeNormal = Vector3d.create(0, 1, 0);
          } else {
            this._planeNormal.normalizeInPlace();
          }
          await this.executeMirror();
          await this.onRestartTool();
        }
        break;
      }
    }
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    switch (this._step) {
      case 'select': {
        if (this._selectedElements.length > 0) {
          this._step = 'plane-point';
          await this.updateInstruction();
        } else {
          await this.exitTool();
        }
        break;
      }
      case 'plane-point': {
        // 如果没有选择平面点，使用当前视图中心或原点
        const viewport = IModelApp.viewManager.selectedView;
        if (viewport) {
          const range = viewport.view.computeFitRange();
          this._planePoint = range.center;
        } else {
          this._planePoint = Point3d.create(0, 0, 0);
        }
        this._step = 'plane-normal';
        await this.updateInstruction();
        break;
      }
      case 'plane-normal': {
        // 使用默认法向（Y轴）
        if (this._planePoint) {
          this._planeNormal = Vector3d.create(0, 1, 0);
          await this.executeMirror();
        }
        await this.onRestartTool();
        break;
      }
    }
    return EventHandled.Yes;
  }

  private async executeMirror(): Promise<void> {
    if (!this._planePoint || !this._planeNormal || this._selectedElements.length === 0) return;

    try {
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          `正在镜像 ${this._selectedElements.length} 个元素...`
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

      // 调用 RPC 执行镜像操作
      const rpc = OpenCloudRpcInterface.getClient();

      // 对每个选中的元素执行镜像
      for (const elementId of this._selectedElements) {
        await rpc.startEditCommand(
          'basicManipulation',
          iModel.key,
          'mirrorElement',
          {
            elementId,
            planePoint: {
              x: this._planePoint.x,
              y: this._planePoint.y,
              z: this._planePoint.z,
            },
            planeNormal: {
              x: this._planeNormal.x,
              y: this._planeNormal.y,
              z: this._planeNormal.z,
            },
          }
        );
      }

      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          0,
          `镜像完成: ${this._selectedElements.length} 个元素已镜像`
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          OutputMessagePriority.Error,
          `镜像失败: ${errorMessage}`
        )
      );
      console.error('[MirrorElementsTool] Failed:', err);
    }
  }

  public override async onRestartTool(): Promise<void> {
    this._selectedElements = [];
    this._planePoint = undefined;
    this._planeNormal = undefined;
    this._step = 'select';
    const tool = new MirrorElementsTool();
    if (!await tool.run()) return this.exitTool();
  }

  /**
   * 获取已选择的元素ID列表
   */
  public get selectedElements(): string[] {
    return [...this._selectedElements];
  }

  /**
   * 获取当前步骤
   */
  public get currentStep(): 'select' | 'plane-point' | 'plane-normal' {
    return this._step;
  }
}
