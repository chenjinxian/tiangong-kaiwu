/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图延伸工具（toolId `Sketch.Extend`，Onshape Extend 首切片 2026-11-12）。
 *
 * Onshape 帮助：Extend 在「修剪」同一工具按钮下拉（快捷键 X）；**先点击线/弧**，
 * 再点击新端点位置或边界几何。本切片按两相实现：第一击选直线（记录点击侧端点），
 * 第二击命中其它曲线=延伸到该边界最近交点，否则投影到延伸射线上的自由端点；
 * 弧/圆/样条作为源诚实提示不支持，无边界保持原样。命中/反解与 Trim 共用
 * `sketch-screen.ts`。
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
import { extendSketchTo } from '../../internal/sketch-extend.js';
import { screenToSketchLocal } from '../../internal/sketch-screen.js';

interface ExtendFirstPick {
  entityId: number;
  local: { x: number; y: number };
}

export class SketchExtendTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Extend';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-extend';
  /** Onshape 两相：第一击选线（记录端点侧），第二击新端点/边界。 */
  private _firstPick: ExtendFirstPick | null = null;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    publishSketchToolHint(this.toolId, i18next.t('partStudio.sketch.extend.prompt'));
  }

  public override async onCleanup(): Promise<void> {
    this._firstPick = null;
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
    const local = screenToSketchLocal(viewport, sketch.plane, point);
    if (!local) {
      this.notify(i18next.t('partStudio.sketch.extend.invalidPoint'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    // 第一击：选目标线（Onshape 先选线/弧；本切片源限直线）。
    const firstPick = this._firstPick;
    if (!firstPick) {
      if (!hit || hit.part !== 'curve')
        return EventHandled.Yes;
      const entity = sketch.entities.find((candidate) => candidate.id === hit.entityId);
      if (!entity || entity.kind !== 'line') {
        this.notify(i18next.t('partStudio.sketch.extend.unsupported'), OutputMessagePriority.Info);
        return EventHandled.Yes;
      }
      this._firstPick = { entityId: hit.entityId, local: { x: local.u, y: local.v } };
      publishSketchToolHint(this.toolId, i18next.t('partStudio.sketch.extend.selected'));
      return EventHandled.Yes;
    }

    // 第二击：命中其它曲线=边界；否则按自由端点位置。
    const boundaryId = hit && hit.part === 'curve' && hit.entityId !== firstPick.entityId
      ? hit.entityId
      : undefined;
    const extended = extendSketchTo(
      sketch.entities,
      firstPick.entityId,
      firstPick.local,
      { point: { x: local.u, y: local.v }, ...(boundaryId !== undefined ? { boundaryId } : {}) },
    );
    this._firstPick = null;
    publishSketchToolHint(this.toolId, i18next.t('partStudio.sketch.extend.prompt'));
    if (!extended.ok) {
      if (extended.reason === 'unsupported')
        this.notify(i18next.t('partStudio.sketch.extend.unsupported'), OutputMessagePriority.Info);
      else if (extended.reason === 'no-boundary')
        this.notify(i18next.t('partStudio.sketch.extend.noBoundary'), OutputMessagePriority.Info);
      else
        this.notify(i18next.t('partStudio.sketch.extend.invalidPoint'), OutputMessagePriority.Info);
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
