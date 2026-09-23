/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  AccuDrawHintBuilder,
  BeButtonEvent,
  EventHandled,
  IModelApp,
  PrimitiveTool,
  SnapDetail,
} from '@itwin/core-frontend';

/**
 * One-shot tool: click a face to set AccuDraw's construction plane to that
 * face's surface normal, letting subsequent sketch tools draw on that plane.
 *
 * Register with: IModelApp.tools.register(SetSketchPlaneTool);
 * Activate with: IModelApp.tools.run('SetSketchPlane');
 */
export class SetSketchPlaneTool extends PrimitiveTool {
  public static override toolId = 'SetSketchPlane';
  public static override iconSpec = 'icon-plane';
  public static override namespace = 'OpenCloudCad';

  public override requireWriteableTarget(): boolean { return false; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, false, 'default', undefined);
    IModelApp.locateManager.options.allowDecorations = false;
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    // SnapDetail (extends HitDetail) carries the surface normal at the snap point
    const snapHit = IModelApp.accuSnap.currHit;

    const hints = new AccuDrawHintBuilder();

    if (snapHit instanceof SnapDetail && snapHit.normal !== undefined) {
      // Face snap with surface normal — set AccuDraw plane to this face
      hints.setNormal(snapHit.normal);
      hints.setOrigin(snapHit.hitPoint);
    } else if (snapHit) {
      // Any other snap — just update origin
      hints.setOrigin(snapHit.hitPoint);
    } else {
      // No snap — use viewport's view Z vector as plane normal
      const vp = ev.viewport;
      if (vp) {
        hints.setNormal(vp.view.getZVector());
        hints.setOrigin(ev.point);
      }
    }

    hints.sendHints(false);

    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SetSketchPlaneTool();
    if (!await tool.run())
      return this.exitTool();
  }
}
