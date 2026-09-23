/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Point3d, Point2d, Vector3d, Matrix3d, Transform, Angle, YawPitchRollAngles } from '@itwin/core-geometry';
import { CopyElementsTool } from '@itwin/editor-frontend';
import { Id64Array, Id64String, Id64Arg } from '@itwin/core-bentley';
import { GeometricElementProps, Code, isPlacement2dProps, Placement2d, Placement3d } from '@itwin/core-common';
import { basicManipulationIpc } from '@itwin/editor-frontend';
import { EditTools } from '@itwin/editor-frontend';
import { DialogItem, DialogProperty, DialogPropertySyncItem, PropertyDescriptionHelper, PropertyEditorParamTypes, RangeEditorParams } from '@itwin/appui-abstract';

/**
 * Linear Pattern Tool - Creates linear array of selected elements
 * Extends CopyElementsTool to leverage its copy infrastructure
 * Tool ID: 'LinearPattern'
 */
export class LinearPatternTool extends CopyElementsTool {
  public static override toolId = 'LinearPattern';
  public static override iconSpec = 'icon-linear-pattern';

  private _direction?: Vector3d;

  // Tool settings properties
  private _countProperty: DialogProperty<number> | undefined;
  private _spacingProperty: DialogProperty<number> | undefined;

  public override requireWriteableTarget(): boolean { return true; }

  // Don't require user click to accept selection - process immediately
  protected override get requireAcceptForSelectionSetOperation(): boolean { return false; }

  // Disable repeat operation - pattern should execute once and exit
  protected override get wantRepeatOperation(): boolean { return false; }

  // Don't wait for additional input - process immediately after selection
  protected override get wantAdditionalInput(): boolean { return false; }

  // Disable dynamics - no cursor following graphics
  protected override get wantDynamics(): boolean { return false; }

  // Count property (number of copies to create)
  public get countProperty(): DialogProperty<number> {
    if (!this._countProperty)
      this._countProperty = new DialogProperty<number>(
        PropertyDescriptionHelper.buildNumberEditorDescription('patternCount', '数量',
          { type: PropertyEditorParamTypes.Range, minimum: 2 } as RangeEditorParams), 3);
    return this._countProperty;
  }

  public get patternCount(): number { return this.countProperty.value; }
  public set patternCount(value: number) { this.countProperty.value = value; }

  // Spacing property (distance between copies)
  public get spacingProperty(): DialogProperty<number> {
    if (!this._spacingProperty)
      this._spacingProperty = new DialogProperty<number>(
        PropertyDescriptionHelper.buildNumberEditorDescription('patternSpacing', '间距',
          { type: PropertyEditorParamTypes.Range, minimum: 0.001 } as RangeEditorParams), 20);
    return this._spacingProperty;
  }

  public get patternSpacing(): number { return this.spacingProperty.value; }
  public set patternSpacing(value: number) { this.spacingProperty.value = value; }

  /**
   * Set pattern parameters
   */
  public setParameters(count: number, spacing: number, direction?: Vector3d): void {
    this.patternCount = Math.max(2, count);
    this.patternSpacing = Math.max(0.001, spacing);
    this._direction = direction;
  }

  protected override async doTransformedCopy(ids: Id64Array, _transform: Transform, _numCopies: number): Promise<Id64Arg | undefined> {
    // Use default X direction if not specified
    const dirVector = this._direction ?? Vector3d.create(1, 0, 0);
    dirVector.normalizeInPlace();

    const newIds: Id64Array = [];
    await EditTools.startCommand<string>({
      commandId: 'basicManipulation',
      iModelKey: this.iModel.key
    });

    try {
      for (const id of ids) {
        // Load element props with geometry - same as CopyElementsTool
        const props = await this.iModel.elements.loadProps(id, { wantGeometry: true, wantBRepData: true }) as GeometricElementProps;
        if (!props?.placement) continue;

        const placement = isPlacement2dProps(props.placement)
          ? Placement2d.fromJSON(props.placement)
          : Placement3d.fromJSON(props.placement);

        if (!placement.isValid) continue;

        let newId: Id64String | undefined;

        // Create multiple copies along direction
        for (let i = 1; i < this.patternCount; i++) {
          const offset = dirVector.scale(this.patternSpacing * i);

          // Clone placement and apply offset
          const newPlacement = placement instanceof Placement3d
            ? new Placement3d(
                placement.origin.plus(offset),
                placement.angles,
                placement.bbox
              )
            : new Placement2d(
                Point2d.create(placement.origin.x + offset.x, placement.origin.y + offset.y),
                placement.angle,
                placement.bbox
              );

          const newProps: GeometricElementProps = {
            classFullName: props.classFullName,
            model: props.model,
            category: props.category,
            code: Code.createEmpty(),
            placement: newPlacement,
            geom: props.geom,
          };

          if (props.userLabel) {
            (newProps as any).userLabel = `${props.userLabel}_Pattern_${i}`;
          }

          newId = await basicManipulationIpc.insertGeometricElement(newProps);
        }

        if (newId) newIds.push(newId);
      }

      return newIds.length > 0 ? newIds : undefined;
    } catch (err) {
      console.error('[LinearPatternTool] Error:', err);
      return undefined;
    }
  }

  // Override to execute pattern immediately when selection is complete
  protected override async processAgendaImmediate(): Promise<void> {
    const newIds = await this.doTransformedCopy(this.agenda.elements, Transform.createIdentity(), this.patternCount - 1);
    if (newIds) {
      await this.saveChanges();
      await this.replaceAgenda(newIds);
    }
    // Exit tool after pattern is created
    await this.onProcessComplete();
  }

  // Exit tool immediately after processing - don't allow repeat
  public override async onProcessComplete(): Promise<void> {
    return this.exitTool();
  }

  // Tool Settings - handle property changes
  public override async applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): Promise<boolean> {
    if (updatedValue.propertyName === this.countProperty.name && undefined !== updatedValue.value.value)
      this.patternCount = updatedValue.value.value as number;
    else if (updatedValue.propertyName === this.spacingProperty.name && undefined !== updatedValue.value.value)
      this.patternSpacing = updatedValue.value.value as number;
    else
      return false;
    return true;
  }

  // Tool Settings - supply properties to display
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();
    toolSettings.push(this.countProperty.toDialogItem({ rowPriority: 1, columnIndex: 2 }));
    toolSettings.push(this.spacingProperty.toDialogItem({ rowPriority: 2, columnIndex: 2 }));
    return toolSettings;
  }

  public override async onInstall(): Promise<boolean> {
    if (!await super.onInstall())
      return false;
    // Initialize tool setting property values
    this.initializeToolSettingPropertyValues([this.countProperty, this.spacingProperty]);
    return true;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new LinearPatternTool();
    tool.patternCount = this.patternCount;
    tool.patternSpacing = this.patternSpacing;
    if (!await tool.run()) return this.exitTool();
  }
}

/**
 * Circular Pattern Tool - Creates circular array of selected elements
 * Extends CopyElementsTool to leverage its copy infrastructure
 * Tool ID: 'CircularPattern'
 */
export class CircularPatternTool extends CopyElementsTool {
  public static override toolId = 'CircularPattern';
  public static override iconSpec = 'icon-circular-pattern';

  private _centerPoint?: Point3d;

  // Tool settings properties
  private _countProperty: DialogProperty<number> | undefined;
  private _totalAngleProperty: DialogProperty<number> | undefined;

  public override requireWriteableTarget(): boolean { return true; }

  // Don't require user click to accept selection - process immediately
  protected override get requireAcceptForSelectionSetOperation(): boolean { return false; }

  // Disable repeat operation - pattern should execute once and exit
  protected override get wantRepeatOperation(): boolean { return false; }

  // Don't wait for additional input - process immediately after selection
  protected override get wantAdditionalInput(): boolean { return false; }

  // Disable dynamics - no cursor following graphics
  protected override get wantDynamics(): boolean { return false; }

  // Count property (number of copies to create)
  public get countProperty(): DialogProperty<number> {
    if (!this._countProperty)
      this._countProperty = new DialogProperty<number>(
        PropertyDescriptionHelper.buildNumberEditorDescription('patternCount', '数量',
          { type: PropertyEditorParamTypes.Range, minimum: 2 } as RangeEditorParams), 4);
    return this._countProperty;
  }

  public get patternCount(): number { return this.countProperty.value; }
  public set patternCount(value: number) { this.countProperty.value = value; }

  // Total angle property (degrees)
  public get totalAngleProperty(): DialogProperty<number> {
    if (!this._totalAngleProperty)
      this._totalAngleProperty = new DialogProperty<number>(
        PropertyDescriptionHelper.buildNumberEditorDescription('patternTotalAngle', '总角度',
          { type: PropertyEditorParamTypes.Range, minimum: 1, maximum: 360 } as RangeEditorParams), 360);
    return this._totalAngleProperty;
  }

  public get patternTotalAngle(): number { return this.totalAngleProperty.value; }
  public set patternTotalAngle(value: number) { this.totalAngleProperty.value = Math.max(1, Math.min(360, value)); }

  /**
   * Set pattern parameters
   */
  public setParameters(count: number, totalAngle: number, centerPoint?: Point3d): void {
    this.patternCount = Math.max(2, count);
    this.patternTotalAngle = Math.max(1, Math.min(360, totalAngle));
    this._centerPoint = centerPoint;
  }

  protected override async doTransformedCopy(ids: Id64Array, _transform: Transform, _numCopies: number): Promise<Id64Arg | undefined> {
    const center = this._centerPoint ?? Point3d.create(0, 0, 0);
    const angleStep = Angle.createDegrees(this.patternTotalAngle / this.patternCount);

    const newIds: Id64Array = [];
    await EditTools.startCommand<string>({
      commandId: 'basicManipulation',
      iModelKey: this.iModel.key
    });

    try {
      for (const id of ids) {
        const props = await this.iModel.elements.loadProps(id, { wantGeometry: true, wantBRepData: true }) as GeometricElementProps;
        if (!props?.placement) continue;

        const placement = isPlacement2dProps(props.placement)
          ? Placement2d.fromJSON(props.placement)
          : Placement3d.fromJSON(props.placement);

        if (!placement.isValid) continue;

        const sourceOrigin = placement instanceof Placement3d
          ? Point3d.createFrom(placement.origin)
          : Point3d.create(placement.origin.x, placement.origin.y, 0);

        let newId: Id64String | undefined;

        // Create multiple copies around center
        for (let i = 1; i < this.patternCount; i++) {
          const angle = Angle.createRadians(angleStep.radians * i);

          // Create rotation transform around Z axis
          const rotation = Matrix3d.createRotationAroundVector(Vector3d.create(0, 0, 1), angle);
          if (!rotation) continue;

          // Transform: translate to origin, rotate, translate back
          const toOrigin = Transform.createTranslationXYZ(-center.x, -center.y, -center.z);
          const rotate = Transform.createRefs(undefined, rotation);
          const fromOrigin = Transform.createTranslation(center);
          const combinedTransform = fromOrigin.multiplyTransformTransform(
            rotate.multiplyTransformTransform(toOrigin)
          );

          // Apply transform to origin
          const newOrigin = combinedTransform.multiplyPoint3d(sourceOrigin);

          // Create new placement
          let newPlacement;
          if (placement instanceof Placement3d) {
            const currentAngles = placement.angles;
            const currentMatrix = currentAngles.toMatrix3d();
            const newMatrix = currentMatrix.multiplyMatrixMatrix(rotation);
            const newAngles = YawPitchRollAngles.createFromMatrix3d(newMatrix);

            newPlacement = new Placement3d(newOrigin, newAngles || currentAngles, placement.bbox);
          } else {
            const angle2d = typeof placement.angle === 'number' ? placement.angle : placement.angle.radians;
            const newOrigin2d = Point2d.create(newOrigin.x, newOrigin.y);
            newPlacement = new Placement2d(newOrigin2d, Angle.createRadians(angle2d + angle.radians), placement.bbox);
          }

          const newProps: GeometricElementProps = {
            classFullName: props.classFullName,
            model: props.model,
            category: props.category,
            code: Code.createEmpty(),
            placement: newPlacement,
            geom: props.geom,
          };

          if (props.userLabel) {
            (newProps as any).userLabel = `${props.userLabel}_Circular_${i}`;
          }

          newId = await basicManipulationIpc.insertGeometricElement(newProps);
        }

        if (newId) newIds.push(newId);
      }

      return newIds.length > 0 ? newIds : undefined;
    } catch (err) {
      console.error('[CircularPatternTool] Error:', err);
      return undefined;
    }
  }

  // Override to execute pattern immediately when selection is complete
  protected override async processAgendaImmediate(): Promise<void> {
    const newIds = await this.doTransformedCopy(this.agenda.elements, Transform.createIdentity(), this.patternCount - 1);
    if (newIds) {
      await this.saveChanges();
      await this.replaceAgenda(newIds);
    }
    // Exit tool after pattern is created
    await this.onProcessComplete();
  }

  // Exit tool immediately after processing - don't allow repeat
  public override async onProcessComplete(): Promise<void> {
    return this.exitTool();
  }

  // Tool Settings - handle property changes
  public override async applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): Promise<boolean> {
    if (updatedValue.propertyName === this.countProperty.name && undefined !== updatedValue.value.value)
      this.patternCount = updatedValue.value.value as number;
    else if (updatedValue.propertyName === this.totalAngleProperty.name && undefined !== updatedValue.value.value)
      this.patternTotalAngle = updatedValue.value.value as number;
    else
      return false;
    return true;
  }

  // Tool Settings - supply properties to display
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();
    toolSettings.push(this.countProperty.toDialogItem({ rowPriority: 1, columnIndex: 2 }));
    toolSettings.push(this.totalAngleProperty.toDialogItem({ rowPriority: 2, columnIndex: 2 }));
    return toolSettings;
  }

  public override async onInstall(): Promise<boolean> {
    if (!await super.onInstall())
      return false;
    // Initialize tool setting property values
    this.initializeToolSettingPropertyValues([this.countProperty, this.totalAngleProperty]);
    return true;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new CircularPatternTool();
    tool.patternCount = this.patternCount;
    tool.patternTotalAngle = this.patternTotalAngle;
    if (!await tool.run()) return this.exitTool();
  }
}
