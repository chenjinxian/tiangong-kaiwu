/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BeButtonEvent, EventHandled, IModelApp, PrimitiveTool, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { OpenCloudRpcInterface } from '@luban-cad/shared';

/** Constraint types supported in sketch mode */
export type ConstraintType =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'concentric'
  | 'equal'
  | 'fix'
  | 'symmetric';

/** Interface for constraint data */
export interface SketchConstraint {
  id: string;
  type: ConstraintType;
  elementIds: string[];
  parameters?: Record<string, number>;
}

/**
 * Base class for sketch constraint tools
 */
export abstract class SketchConstraintTool extends PrimitiveTool {
  protected _selectedElements: string[] = [];
  protected abstract _requiredElementCount: number;
  protected _constraintType: ConstraintType;

  constructor(constraintType: ConstraintType) {
    super();
    this._constraintType = constraintType;
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

  public override async onDataButtonDown(_ev: BeButtonEvent): Promise<EventHandled> {
    const currHit = IModelApp.locateManager.currHit;
    if (!currHit?.isElementHit) return EventHandled.No;

    const elementId = currHit.sourceId;
    if (!this._selectedElements.includes(elementId)) {
      this._selectedElements.push(elementId);
      await this.updateInstruction();

      if (this._selectedElements.length >= this._requiredElementCount) {
        await this.applyConstraint();
        await this.exitTool();
      }
    }
    return EventHandled.Yes;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._selectedElements.length > 0) {
      // Clear last selection on reset
      this._selectedElements.pop();
      await this.updateInstruction();
    } else {
      await this.exitTool();
    }
    return EventHandled.Yes;
  }

  protected async applyConstraint(): Promise<void> {
    try {
      const viewport = IModelApp.viewManager.selectedView;
      if (!viewport?.iModel?.isBriefcaseConnection()) {
        throw new Error('Editing requires a briefcase connection');
      }

      const iModel = viewport.iModel;
      const rpc = OpenCloudRpcInterface.getClient();

      // Call RPC to apply constraint
      await rpc.startEditCommand(
        'sketch',
        iModel.key,
        'addConstraint',
        {
          type: this._constraintType,
          elementIds: this._selectedElements,
        }
      );

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          `${this.getConstraintLabel()}约束已应用`
        )
      );

      // Emit constraint added event
      SketchConstraintEvents.emit('constraintAdded', {
        type: this._constraintType,
        elementIds: this._selectedElements,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          `约束应用失败: ${errorMessage}`
        )
      );
      console.error(`[SketchConstraintTool] Failed to apply ${this._constraintType}:`, err);
    }
  }

  private getConstraintLabel(): string {
    const labels: Record<ConstraintType, string> = {
      coincident: '重合',
      horizontal: '水平',
      vertical: '垂直',
      parallel: '平行',
      perpendicular: '垂直',
      tangent: '相切',
      concentric: '同心',
      equal: '相等',
      fix: '固定',
      symmetric: '对称',
    };
    return labels[this._constraintType] || this._constraintType;
  }

  public override async onRestartTool(): Promise<void> {
    this._selectedElements = [];
    const tool = this.createNewInstance();
    if (!await tool.run()) return this.exitTool();
  }

  protected abstract createNewInstance(): SketchConstraintTool;
}

/** Event system for sketch constraints */
export interface SketchConstraintEventMap {
  constraintAdded: { type: ConstraintType; elementIds: string[] };
  constraintRemoved: { constraintId: string };
  constraintUpdated: { constraint: SketchConstraint };
}

class SketchConstraintEventEmitter {
  private listeners: {
    [K in keyof SketchConstraintEventMap]?: Array<(data: SketchConstraintEventMap[K]) => void>;
  } = {};

  on<K extends keyof SketchConstraintEventMap>(
    event: K,
    callback: (data: SketchConstraintEventMap[K]) => void
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
    return () => this.off(event, callback);
  }

  off<K extends keyof SketchConstraintEventMap>(
    event: K,
    callback: (data: SketchConstraintEventMap[K]) => void
  ): void {
    const listeners = this.listeners[event];
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit<K extends keyof SketchConstraintEventMap>(
    event: K,
    data: SketchConstraintEventMap[K]
  ): void {
    const listeners = this.listeners[event];
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }
}

export const SketchConstraintEvents = new SketchConstraintEventEmitter();

/**
 * Horizontal constraint tool - Makes a line horizontal
 */
export class HorizontalConstraintTool extends SketchConstraintTool {
  public static override toolId = 'HorizontalConstraint';
  public static override iconSpec = 'icon-constraint-horizontal';
  protected override _requiredElementCount = 1;

  constructor() {
    super('horizontal');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要应用水平约束的线（还需 ${remaining} 个）`
      : '应用水平约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new HorizontalConstraintTool();
  }
}

/**
 * Vertical constraint tool - Makes a line vertical
 */
export class VerticalConstraintTool extends SketchConstraintTool {
  public static override toolId = 'VerticalConstraint';
  public static override iconSpec = 'icon-constraint-vertical';
  protected override _requiredElementCount = 1;

  constructor() {
    super('vertical');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要应用垂直约束的线（还需 ${remaining} 个）`
      : '应用垂直约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new VerticalConstraintTool();
  }
}

/**
 * Parallel constraint tool - Makes two lines parallel
 */
export class ParallelConstraintTool extends SketchConstraintTool {
  public static override toolId = 'ParallelConstraint';
  public static override iconSpec = 'icon-constraint-parallel';
  protected override _requiredElementCount = 2;

  constructor() {
    super('parallel');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要应用平行约束的线（还需 ${remaining} 个）`
      : '应用平行约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new ParallelConstraintTool();
  }
}

/**
 * Perpendicular constraint tool - Makes two lines perpendicular
 */
export class PerpendicularConstraintTool extends SketchConstraintTool {
  public static override toolId = 'PerpendicularConstraint';
  public static override iconSpec = 'icon-constraint-perpendicular';
  protected override _requiredElementCount = 2;

  constructor() {
    super('perpendicular');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要应用垂直约束的线（还需 ${remaining} 个）`
      : '应用垂直约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new PerpendicularConstraintTool();
  }
}

/**
 * Tangent constraint tool - Makes a line tangent to a curve
 */
export class TangentConstraintTool extends SketchConstraintTool {
  public static override toolId = 'TangentConstraint';
  public static override iconSpec = 'icon-constraint-tangent';
  protected override _requiredElementCount = 2;

  constructor() {
    super('tangent');
  }

  protected getInstructionMessage(remaining: number): string {
    if (remaining === 2) return '选择曲线（圆或弧）';
    if (remaining === 1) return '选择要相切的线';
    return '应用相切约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new TangentConstraintTool();
  }
}

/**
 * Coincident constraint tool - Makes two points coincident
 */
export class CoincidentConstraintTool extends SketchConstraintTool {
  public static override toolId = 'CoincidentConstraint';
  public static override iconSpec = 'icon-constraint-coincident';
  protected override _requiredElementCount = 2;

  constructor() {
    super('coincident');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要重合的点（还需 ${remaining} 个）`
      : '应用重合约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new CoincidentConstraintTool();
  }
}

/**
 * Equal constraint tool - Makes two elements equal in length/radius
 */
export class EqualConstraintTool extends SketchConstraintTool {
  public static override toolId = 'EqualConstraint';
  public static override iconSpec = 'icon-constraint-equal';
  protected override _requiredElementCount = 2;

  constructor() {
    super('equal');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要设为等长的元素（还需 ${remaining} 个）`
      : '应用等长约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new EqualConstraintTool();
  }
}

/**
 * Fix constraint tool - Fixes an element in place
 */
export class FixConstraintTool extends SketchConstraintTool {
  public static override toolId = 'FixConstraint';
  public static override iconSpec = 'icon-constraint-fix';
  protected override _requiredElementCount = 1;

  constructor() {
    super('fix');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要固定的元素（还需 ${remaining} 个）`
      : '应用固定约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new FixConstraintTool();
  }
}

/**
 * Concentric constraint tool - Makes two circles/arcs concentric
 */
export class ConcentricConstraintTool extends SketchConstraintTool {
  public static override toolId = 'ConcentricConstraint';
  public static override iconSpec = 'icon-constraint-concentric';
  protected override _requiredElementCount = 2;

  constructor() {
    super('concentric');
  }

  protected getInstructionMessage(remaining: number): string {
    return remaining > 0
      ? `选择要同心的圆或弧（还需 ${remaining} 个）`
      : '应用同心约束...';
  }

  protected createNewInstance(): SketchConstraintTool {
    return new ConcentricConstraintTool();
  }
}

/**
 * Symmetric constraint tool - Makes two elements symmetric about a centerline
 */
export class SymmetricConstraintTool extends SketchConstraintTool {
  public static override toolId = 'SymmetricConstraint';
  public static override iconSpec = 'icon-constraint-symmetric';
  protected override _requiredElementCount = 3;

  constructor() {
    super('symmetric');
  }

  protected getInstructionMessage(remaining: number): string {
    if (remaining === 3) return '选择对称中心线';
    return `选择要对称的元素（还需 ${remaining - 1} 个）`;
  }

  protected createNewInstance(): SketchConstraintTool {
    return new SymmetricConstraintTool();
  }
}

/** Helper function to register all sketch constraint tools */
export function registerSketchConstraintTools(): void {
  const tools = [
    HorizontalConstraintTool,
    VerticalConstraintTool,
    ParallelConstraintTool,
    PerpendicularConstraintTool,
    TangentConstraintTool,
    CoincidentConstraintTool,
    EqualConstraintTool,
    FixConstraintTool,
    ConcentricConstraintTool,
    SymmetricConstraintTool,
  ];

  for (const tool of tools) {
    // Tools are automatically registered when used via IModelApp.tools.register
    IModelApp.tools.register(tool);
  }
}
