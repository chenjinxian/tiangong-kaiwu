/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图倒角工具（toolId `Sketch.Chamfer`，Onshape 圆角 ▾ → 倒角首切片
 * 2026-11-13，AIRR `docs/superpowers/specs/2026-11-13-sketch-chamfer-airr.md`）。
 *
 * Live 证据（2026-11-13，自家 LubanLivePostman 副本）：圆角 ▾ → 倒角，点击矩形
 * 角点**立即**生成倒角直线并显示可编辑的距离尺寸（0.5，文档单位），角点保留
 * 标记；工具保持激活可连续倒角。
 *
 * 本工具按同一交互：点击两条直线的共享角点 → 默认距离生成倒角（两线端点回缩 +
 * 连接直线 + coincident×2 + 两条「角点→倒角端点」distance 尺寸）；几何/约束
 * 展开在 `internal/sketch-fillet.ts` 的 `chamferSketchCorner` 纯逻辑。提交走
 * `updateSketch` 乐观整体覆写（可撤销）。
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
import type { SketchDto } from '@luban-cad/shared';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import {
  chamferSketchCorner,
  findSketchFilletCorners,
  nextSketchId,
  type FilletCorner,
  type FilletFailureReason,
} from '../../internal/sketch-fillet.js';

/** 默认倒角距离（与草图圆角同一数值口径；可经距离尺寸双击改值）。 */
export const DEFAULT_SKETCH_CHAMFER_DISTANCE = 5;

const PICK_PX = 12;

export class SketchChamferTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Chamfer';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-fillet';

  private _plane!: SketchPlaneFrame;
  private _nextId = 1;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this._seedNextId();
    this._publishPrompt();
  }

  public override async onCleanup(): Promise<void> {
    clearSketchToolFeedback(this.toolId);
    if (usePartStudioStore.getState().tool.activeToolId === 'sketchChamfer')
      usePartStudioStore.getState().setActiveTool(null);
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    if (this._hintText)
      publishSketchToolHint(this.toolId, this._hintText, this._cursorView);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch) {
      this._notify(i18next.t('partStudio.sketch.chamfer.notOpen'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const corner = this._nearestCorner(sketch, ev.viewPoint, PICK_PX);
    if (!corner) {
      this._notify(i18next.t('partStudio.sketch.chamfer.noCorner'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    this._seedNextId(sketch);
    const result = chamferSketchCorner(
      sketch.entities,
      sketch.constraints,
      corner,
      DEFAULT_SKETCH_CHAMFER_DISTANCE,
      this._nextId,
      { construction: usePartStudioStore.getState().sketch.constructionMode },
    );
    if (!result.ok) {
      this._notifyFailure(result.reason);
      this._publishPrompt();
      return EventHandled.Yes;
    }
    const applied = await sketchSystem.applyUpdate(result.entities, result.constraints);
    if (!applied.ok) {
      this._notify(applied.error ?? i18next.t('partStudio.sketch.chamfer.failed'), OutputMessagePriority.Error);
      this._publishPrompt();
      return EventHandled.Yes;
    }
    this._nextId = result.nextId;
    this._publishPrompt();
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    // Onshape live 2026-11-13：右键=画布菜单（首项「退出 <工具>」），不直接退出；Esc 仍退出。
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    await this.exitTool();
  }

  private _nearestCorner(
    sketch: SketchDto,
    viewPoint: { x: number; y: number },
    maxDistance: number,
  ): FilletCorner | undefined {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport)
      return undefined;
    let best: FilletCorner | undefined;
    let bestDistance = maxDistance;
    for (const corner of findSketchFilletCorners(sketch.entities, sketch.constraints)) {
      const view = viewport.worldToView(this._plane.toWorld({ u: corner.point.x, v: corner.point.y }));
      const distance = Math.hypot(view.x - viewPoint.x, view.y - viewPoint.y);
      if (distance <= bestDistance) {
        best = corner;
        bestDistance = distance;
      }
    }
    return best;
  }

  private _seedNextId(sketch?: SketchDto): void {
    const active = sketch ?? getSketchSystem()?.activeSketch;
    if (active)
      this._nextId = Math.max(this._nextId, nextSketchId(active.entities, active.constraints));
  }

  private _publishPrompt(): void {
    const text = i18next.t('partStudio.sketch.chamfer.prompt', { distance: DEFAULT_SKETCH_CHAMFER_DISTANCE });
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView)
      publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notifyFailure(reason: FilletFailureReason): void {
    if (reason === 'unsupported')
      this._notify(i18next.t('partStudio.sketch.chamfer.unsupported'), OutputMessagePriority.Info);
    else if (reason === 'distance-too-large' || reason === 'radius-too-large')
      this._notify(
        i18next.t('partStudio.sketch.chamfer.distanceTooLarge', { distance: DEFAULT_SKETCH_CHAMFER_DISTANCE }),
        OutputMessagePriority.Warning,
      );
    else if (reason === 'invalid-distance' || reason === 'invalid-radius')
      this._notify(i18next.t('partStudio.sketch.chamfer.invalidDistance'), OutputMessagePriority.Warning);
    else
      this._notify(i18next.t('partStudio.sketch.chamfer.noCorner'), OutputMessagePriority.Info);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

/** 注册草图倒角工具（PartStudioPage 工具注册编排懒引+幂等）。 */
let sketchChamferToolsRegistered = false;
export function registerSketchChamferTools(): void {
  if (sketchChamferToolsRegistered)
    return;
  IModelApp.tools.register(SketchChamferTool);
  sketchChamferToolsRegistered = true;
}
