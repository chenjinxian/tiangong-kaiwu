/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BeButtonEvent, EventHandled, IModelApp, PrimitiveTool, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { OpenCloudRpcInterface } from '@luban-cad/shared';

/** Dimension types supported in sketch mode */
export type DimensionType = 'distance' | 'angle' | 'radius' | 'diameter';

/** Interface for dimension data */
export interface SketchDimension {
  id: string;
  type: DimensionType;
  elementIds: string[];
  value: number;
  position: Point3d;
  text?: string;
}

/**
 * Base class for sketch dimension tools
 */
export abstract class SketchDimensionTool extends PrimitiveTool {
  protected _selectedElements: string[] = [];
  protected _dimensionPoint?: Point3d;
  protected abstract _requiredElementCount: number;
  protected _dimensionType: DimensionType;

  constructor(dimensionType: DimensionType) {
    super();
    this._dimensionType = dimensionType;
  }

  public override requireWriteableTarget(): boolean {
    return true;
  }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, false, 'default', undefined);
    await this.updateInstruction();
  }

  protected async updateInstruction(): Promise<void> {
    const remaining = this._requiredElementCount - this._selectedElements.length;
    const message = this.getInstructionMessage(remaining);
    IModelApp.notifications.outputMessage(
      new NotifyMessageDetails(OutputMessagePriority.Info, message)
    );
  }

  protected abstract getInstructionMessage(remaining: number): string;

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    // First phase: select elements
    if (this._selectedElements.length < this._requiredElementCount) {
      const currHit = IModelApp.locateManager.currHit;
      if (!currHit?.isElementHit) return EventHandled.No;

      const elementId = currHit.sourceId;
      if (!this._selectedElements.includes(elementId)) {
        this._selectedElements.push(elementId);
        await this.updateInstruction();

        if (this._selectedElements.length >= this._requiredElementCount) {
          // Move to placement phase
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(
              OutputMessagePriority.Info,
              '点击放置尺寸标注位置'
            )
          );
        }
      }
      return EventHandled.Yes;
    }

    // Second phase: place dimension
    this._dimensionPoint = ev.point.clone();
    await this.placeDimension();
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._selectedElements.length > 0) {
      this._selectedElements.pop();
      await this.updateInstruction();
    } else {
      await this.exitTool();
    }
    return EventHandled.Yes;
  }

  protected async placeDimension(): Promise<void> {
    try {
      const viewport = IModelApp.viewManager.selectedView;
      if (!viewport?.iModel?.isBriefcaseConnection()) {
        throw new Error('Editing requires a briefcase connection');
      }

      const iModel = viewport.iModel;
      const rpc = OpenCloudRpcInterface.getClient();

      // Call RPC to place dimension
      const result = await rpc.startEditCommand(
        'sketch',
        iModel.key,
        'addDimension',
        {
          type: this._dimensionType,
          elementIds: this._selectedElements,
          position: this._dimensionPoint ? {
            x: this._dimensionPoint.x,
            y: this._dimensionPoint.y,
            z: this._dimensionPoint.z,
          } : undefined,
        }
      ) as { value: number; dimensionId: string } | undefined;

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          `${this.getDimensionLabel()}标注已添加: ${result?.value.toFixed(2) ?? 'N/A'}`
        )
      );

      // Emit dimension added event
      SketchDimensionEvents.emit('dimensionAdded', {
        type: this._dimensionType,
        elementIds: this._selectedElements,
        value: result?.value ?? 0,
        dimensionId: result?.dimensionId ?? '',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          `标注添加失败: ${errorMessage}`
        )
      );
      console.error(`[SketchDimensionTool] Failed to add ${this._dimensionType}:`, err);
    }
  }

  private getDimensionLabel(): string {
    const labels: Record<DimensionType, string> = {
      distance: '距离',
      angle: '角度',
      radius: '半径',
      diameter: '直径',
    };
    return labels[this._dimensionType] || this._dimensionType;
  }

  public override async onRestartTool(): Promise<void> {
    this._selectedElements = [];
    this._dimensionPoint = undefined;
    const tool = this.createNewInstance();
    if (!await tool.run()) return this.exitTool();
  }

  protected abstract createNewInstance(): SketchDimensionTool;
}

/** Event system for sketch dimensions */
export interface SketchDimensionEventMap {
  dimensionAdded: { type: DimensionType; elementIds: string[]; value: number; dimensionId: string };
  dimensionRemoved: { dimensionId: string };
  dimensionUpdated: { dimension: SketchDimension };
}

class SketchDimensionEventEmitter {
  private listeners: {
    [K in keyof SketchDimensionEventMap]?: Array<(data: SketchDimensionEventMap[K]) => void>;
  } = {};

  on<K extends keyof SketchDimensionEventMap>(
    event: K,
    callback: (data: SketchDimensionEventMap[K]) => void
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
    return () => this.off(event, callback);
  }

  off<K extends keyof SketchDimensionEventMap>(
    event: K,
    callback: (data: SketchDimensionEventMap[K]) => void
  ): void {
    const listeners = this.listeners[event];
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit<K extends keyof SketchDimensionEventMap>(
    event: K,
    data: SketchDimensionEventMap[K]
  ): void {
    const listeners = this.listeners[event];
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }
}

export const SketchDimensionEvents = new SketchDimensionEventEmitter();

/**
 * Distance dimension tool - Adds a linear distance dimension
 */
export class DistanceDimensionTool extends SketchDimensionTool {
  public static override toolId = 'DistanceDimension';
  public static override iconSpec = 'icon-dimension-distance';
  protected override _requiredElementCount = 2;

  constructor() {
    super('distance');
  }

  protected getInstructionMessage(remaining: number): string {
    if (remaining === 2) return '选择第一个点或线';
    if (remaining === 1) return '选择第二个点或线';
    return '点击放置尺寸标注位置';
  }

  protected createNewInstance(): SketchDimensionTool {
    return new DistanceDimensionTool();
  }
}

/**
 * Angle dimension tool - Adds an angle dimension between two lines
 */
export class AngleDimensionTool extends SketchDimensionTool {
  public static override toolId = 'AngleDimension';
  public static override iconSpec = 'icon-dimension-angle';
  protected override _requiredElementCount = 2;

  constructor() {
    super('angle');
  }

  protected getInstructionMessage(remaining: number): string {
    if (remaining === 2) return '选择第一条线';
    if (remaining === 1) return '选择第二条线';
    return '点击放置角度标注位置';
  }

  protected createNewInstance(): SketchDimensionTool {
    return new AngleDimensionTool();
  }
}

/**
 * Radius dimension tool - Adds a radius dimension to an arc or circle
 */
export class RadiusDimensionTool extends SketchDimensionTool {
  public static override toolId = 'RadiusDimension';
  public static override iconSpec = 'icon-dimension-radius';
  protected override _requiredElementCount = 1;

  constructor() {
    super('radius');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择圆或弧（还需 ${remaining} 个）`
      : '点击放置半径标注位置';
  }

  protected createNewInstance(): SketchDimensionTool {
    return new RadiusDimensionTool();
  }
}

/**
 * Diameter dimension tool - Adds a diameter dimension to a circle
 */
export class DiameterDimensionTool extends SketchDimensionTool {
  public static override toolId = 'DiameterDimension';
  public static override iconSpec = 'icon-dimension-diameter';
  protected override _requiredElementCount = 1;

  constructor() {
    super('diameter');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择圆（还需 ${remaining} 个）`
      : '点击放置直径标注位置';
  }

  protected createNewInstance(): SketchDimensionTool {
    return new DiameterDimensionTool();
  }
}

/** Helper function to register all sketch dimension tools */
export function registerSketchDimensionTools(): void {
  const tools = [
    DistanceDimensionTool,
    AngleDimensionTool,
    RadiusDimensionTool,
    DiameterDimensionTool,
  ];

  for (const tool of tools) {
    IModelApp.tools.register(tool);
  }
}
