/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
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
import { SubEntityLocationProps, SubEntityType } from '@itwin/editor-common';

export type SubEntitySelectionMode = 'face' | 'edge' | 'vertex';

export interface SelectSubEntityToolOptions {
  /** Selection mode - what type of sub-entities to select */
  mode: SubEntitySelectionMode;
  /** Callback when sub-entity is selected */
  onSubEntitySelected?: (elementId: string, subEntity: SubEntityLocationProps) => void;
  /** Callback when sub-entity is deselected */
  onSubEntityDeselected?: (elementId: string, subEntity: SubEntityLocationProps) => void;
  /** Callback when selection is complete (tool exited) */
  onComplete?: () => void;
}

/**
 * Tool for selecting sub-entities (faces, edges, vertices) of geometric elements.
 * Extends LocateSubEntityTool from @itwin/editor-frontend.
 */
export class SelectSubEntityTool extends LocateSubEntityTool {
  public static override toolId = 'SelectSubEntity';
  public static override iconSpec = 'icon-select-subentity';
  public static override namespace = 'OpenCloudCad';

  private _mode: SubEntitySelectionMode = 'face';
  private _onSubEntitySelected?: (elementId: string, subEntity: SubEntityLocationProps) => void;
  private _onSubEntityDeselected?: (elementId: string, subEntity: SubEntityLocationProps) => void;
  private _onComplete?: () => void;

  public setOptions(options: SelectSubEntityToolOptions): void {
    this._mode = options.mode;
    this._onSubEntitySelected = options.onSubEntitySelected;
    this._onSubEntityDeselected = options.onSubEntityDeselected;
    this._onComplete = options.onComplete;
  }

  public override requireWriteableTarget(): boolean {
    return false;
  }

  /**
   * Determine which sub-entity types we want to locate based on selection mode.
   */
  protected override wantSubEntityType(type: SubEntityType): boolean {
    switch (this._mode) {
      case 'face':
        return type === SubEntityType.Face;
      case 'edge':
        return type === SubEntityType.Edge;
      case 'vertex':
        return type === SubEntityType.Vertex;
      default:
        return false;
    }
  }

  /**
   * Override to get custom sub-entity filter based on mode.
   */
  protected override getSubEntityFilter() {
    // Return undefined to accept all sub-entities of the wanted types
    // Could be extended to filter by planar faces, smooth edges, etc.
    return undefined;
  }

  /**
   * Enable BRep geometry detection for sub-entity selection.
   */
  protected override get geometryCacheFilter() {
    return { parts: true, curves: false, surfaces: false, solids: true, other: false };
  }

  /**
   * Called when a sub-entity is accepted (selected).
   */
  protected override async addSubEntity(
    id: string,
    props: SubEntityLocationProps
  ): Promise<void> {
    await super.addSubEntity(id, props);
    this._onSubEntitySelected?.(id, props);
  }

  /**
   * Called when a sub-entity is removed from selection.
   */
  protected override async removeSubEntity(
    id: string,
    props?: SubEntityLocationProps
  ): Promise<void> {
    await super.removeSubEntity(id, props);
    if (props) {
      this._onSubEntityDeselected?.(id, props);
    }
  }

  /**
   * Handle data button down - select sub-entity at cursor.
   */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    await super.onDataButtonDown(ev);

    // Continue tool to allow multiple selections
    return EventHandled.No;
  }

  /**
   * Handle reset button - exit tool.
   */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  /**
   * Called when tool exits - notify callback.
   */
  public override async onCleanup(): Promise<void> {
    await super.onCleanup();
    this._onComplete?.();
  }

  /**
   * Restart tool - create new instance.
   */
  public override async onRestartTool(): Promise<void> {
    const tool = new SelectSubEntityTool();
    tool.setOptions({
      mode: this._mode,
      onSubEntitySelected: this._onSubEntitySelected,
      onSubEntityDeselected: this._onSubEntityDeselected,
      onComplete: this._onComplete,
    });
    if (!(await tool.run())) {
      return this.exitTool();
    }
  }

  /**
   * Provide tool assistance instructions.
   */
  protected override setupAndPromptForNextAction(): void {
    const modeText = {
      face: '面 (Face)',
      edge: '边 (Edge)',
      vertex: '顶点 (Vertex)',
    }[this._mode];

    IModelApp.notifications.outputPrompt(
      `点击选择${modeText}，右键完成选择`
    );
  }
}

/**
 * Helper function to run the sub-entity selection tool.
 */
export async function runSelectSubEntityTool(
  options: SelectSubEntityToolOptions
): Promise<void> {
  const tool = new SelectSubEntityTool();
  tool.setOptions(options);
  await tool.run();
}
