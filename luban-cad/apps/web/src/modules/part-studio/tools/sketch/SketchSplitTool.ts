/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图分割工具（toolId `Sketch.Split`，Onshape「修剪 ▾ → 分割」首切片
 * 2026-11-13，AIRR `docs/superpowers/specs/2026-11-13-sketch-split-airr.md`）。
 *
 * 交互：点击草图路径上的位置 → 曲线在该处断成两段（一次 updateSketch 提交，
 * 可撤销）；工具保持存活可连续分割；Esc/右键结束。几何展开在
 * `internal/sketch-trim.ts` 的 `splitSketchAt`（line/arc/三次贝塞尔样条；
 * 圆/periodic/投影样条/端点附近诚实拒收）；命中沿用 picker 的屏幕距离算法，
 * 点击点经相机 NPC 射线与草图平面求交反解局部 (u,v)。
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
import { splitSketchAt } from '../../internal/sketch-trim.js';

export class SketchSplitTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Split';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-trim';

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    publishSketchToolHint(this.toolId, i18next.t('partStudio.sketch.split.prompt'));
  }

  public override async onCleanup(): Promise<void> {
    clearSketchToolFeedback(this.toolId);
    await super.onCleanup();
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch) {
      this.notify(i18next.t('partStudio.sketch.split.notOpen'), OutputMessagePriority.Error);
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
      this.notify(i18next.t('partStudio.sketch.split.invalidPoint'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const split = splitSketchAt(sketch.entities, sketch.constraints, hit.entityId, { x: local.u, y: local.v });
    if (!split.ok) {
      if (split.reason === 'unsupported')
        this.notify(i18next.t('partStudio.sketch.split.unsupported'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const result = await sketchSystem.applyUpdate(split.entities, split.constraints);
    if (!result.ok)
      this.notify(result.error ?? i18next.t('partStudio.sketch.split.failed'), OutputMessagePriority.Error);
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

/** 注册草图分割工具（PartStudioPage 工具注册编排懒引+幂等）。 */
let sketchSplitToolsRegistered = false;
export function registerSketchSplitTools(): void {
  if (sketchSplitToolsRegistered)
    return;
  IModelApp.tools.register(SketchSplitTool);
  sketchSplitToolsRegistered = true;
}
