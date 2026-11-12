/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图修剪工具（toolId `Sketch.Trim`，Onshape「修剪」首切片 2026-11-12）。
 *
 * 交互：点击草图曲线 → 移除点击处「最近交点之间」的段落；无交点的曲线整体删除
 * （Onshape 帮助语义）。工具保持存活可连续修剪；Esc/右键结束。
 *
 * 几何/约束展开全在 `internal/sketch-trim.ts` 纯逻辑（line/circle/arc + 三次
 * 贝塞尔样条；periodic/非四次控制点/投影样条诚实提示不支持）；命中沿用 picker
 * 的屏幕距离算法（曲线 ≤5px，控制点不参与），
 * 点击点经相机 NPC 射线与草图平面求交反解局部 (u,v)；提交走 `applyUpdate`
 * 乐观整体覆写（可撤销）。
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
import { screenToSketchLocal } from '../../internal/sketch-screen.js';
import { trimSketchAt } from '../../internal/sketch-trim.js';

export class SketchTrimTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Trim';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-trim';

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    publishSketchToolHint(this.toolId, i18next.t('partStudio.sketch.trim.prompt'));
  }

  public override async onCleanup(): Promise<void> {
    clearSketchToolFeedback(this.toolId);
    await super.onCleanup();
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch) {
      this.notify(i18next.t('partStudio.sketch.trim.notOpen'), OutputMessagePriority.Error);
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
      this.notify(i18next.t('partStudio.sketch.trim.invalidPoint'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const trimmed = trimSketchAt(sketch.entities, sketch.constraints, hit.entityId, { x: local.u, y: local.v });
    if (!trimmed.ok) {
      if (trimmed.reason === 'unsupported')
        this.notify(i18next.t('partStudio.sketch.trim.unsupported'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const result = await sketchSystem.applyUpdate(trimmed.entities, trimmed.constraints);
    if (!result.ok)
      this.notify(result.error ?? i18next.t('partStudio.sketch.trim.failed'), OutputMessagePriority.Error);
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    // 不重启（退出即结束会话）；工具无挂起资源。
    await this.exitTool();
  }

  private notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}


/** 注册草图修剪工具（PartStudioPage 工具注册编排懒引+幂等）。 */
let sketchTrimToolsRegistered = false;
export function registerSketchTrimTools(): void {
  if (sketchTrimToolsRegistered)
    return;
  IModelApp.tools.register(SketchTrimTool);
  sketchTrimToolsRegistered = true;
}
