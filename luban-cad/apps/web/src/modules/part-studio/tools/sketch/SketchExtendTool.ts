/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图延伸工具（toolId `Sketch.Extend`，Onshape Extend 首切片 2026-11-12）。
 *
 * Onshape 帮助：Extend 在「修剪」同一工具按钮下拉（快捷键 X）；点击线/弧后
 * 点击新端点或边界几何，延伸到第一个边界。本切片：点击直线靠近的一侧端点，
 * 沿远离另一端点方向延伸到最近线/圆/弧边界；无边界保持原样并提示，弧/圆/
 * 样条作为源诚实提示不支持。命中/反解与 Trim 共用同一屏幕→草图局部算法。
 */
import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import i18next from 'i18next';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import { sketchEntitiesToWorldPolylines } from '../../internal/sketch-curves.js';
import { hitTestSketchEntity } from '../../internal/sketch-entity-picker.js';
import { extendSketchAt } from '../../internal/sketch-extend.js';
import { screenToSketchLocal } from '../../internal/sketch-screen.js';

export class SketchExtendTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Extend';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-extend';

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    publishSketchToolHint(this.toolId, i18next.t('partStudio.sketch.extend.prompt'));
  }

  public override async onCleanup(): Promise<void> {
    clearSketchToolFeedback(this.toolId);
    await super.onCleanup();
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch) {
      this.notify(i18next.t('partStudio.sketch.extend.notOpen'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport)
      return EventHandled.Yes;

    const point = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    const geometry = {
      polylines: sketchEntitiesToWorldPolylines(sketch.entities, sketch.plane),
      controlPoints: [],
    };
    const project = (world: import('@itwin/core-geometry').Point3d): { x: number; y: number } => {
      const view = viewport.worldToView(world);
      return { x: view.x, y: view.y };
    };
    const hit = hitTestSketchEntity(geometry, point, project, sketch.id);
    if (!hit || hit.part !== 'curve')
      return EventHandled.Yes;

    const local = screenToSketchLocal(viewport, sketch.plane, point);
    if (!local) {
      this.notify(i18next.t('partStudio.sketch.extend.invalidPoint'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const extended = extendSketchAt(sketch.entities, hit.entityId, { x: local.u, y: local.v });
    if (!extended.ok) {
      if (extended.reason === 'unsupported')
        this.notify(i18next.t('partStudio.sketch.extend.unsupported'), OutputMessagePriority.Info);
      else if (extended.reason === 'no-boundary')
        this.notify(i18next.t('partStudio.sketch.extend.noBoundary'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const result = await sketchSystem.applyUpdate(extended.entities, sketch.constraints);
    if (!result.ok)
      this.notify(result.error ?? i18next.t('partStudio.sketch.extend.failed'), OutputMessagePriority.Error);
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    await this.exitTool();
  }

  private notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

/** 注册草图延伸工具（PartStudioPage 工具注册编排懒引+幂等）。 */
let sketchExtendToolsRegistered = false;
export function registerSketchExtendTools(): void {
  if (sketchExtendToolsRegistered)
    return;
  IModelApp.tools.register(SketchExtendTool);
  sketchExtendToolsRegistered = true;
}
