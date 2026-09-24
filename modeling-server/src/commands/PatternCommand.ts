/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditCommand } from '@itwin/editor-backend';
import { GeometricElement3d } from '@itwin/core-backend';
import { Point3d, Vector3d, Matrix3d, Transform, YawPitchRollAngles, Angle } from '@itwin/core-geometry';
import { Code, Placement3d, GeometricElementProps, isPlacement2dProps, Placement2d, ElementLoadProps } from '@itwin/core-common';

/**
 * Pattern Command - Provides linear and circular array operations
 * Command ID: 'openCloudPattern'
 */
export class PatternCommand extends EditCommand {
  public static override commandId = 'openCloudPattern';
  public static override version = '1.0.0';

  /**
   * Linear Pattern - Creates multiple copies of an element along a direction vector
   */
  public async linearPattern(params: {
    elementId: string;
    direction: { x: number; y: number; z: number };
    count: number;
    spacing: number;
  }): Promise<{ success: boolean; message: string; newElementIds?: string[] }> {
    const { elementId, direction, count, spacing } = params;
    console.log('[PatternCommand] linearPattern called:', { elementId, direction, count, spacing });
    try {
      const iModel = this.iModel;
      console.log('[PatternCommand] Got iModel, key:', iModel.key);

      // Get the source element
      const element = iModel.elements.getElement(elementId);
      console.log('[PatternCommand] Got element:', element?.constructor?.name, 'id:', element?.id);
      if (!element) {
        return { success: false, message: 'Element not found' };
      }

      // Check if element is geometric
      if (!(element instanceof GeometricElement3d)) {
        console.log('[PatternCommand] Element is not GeometricElement3d, type:', element.constructor.name);
        return { success: false, message: 'Element is not a geometric element' };
      }

      console.log('[PatternCommand] Element is GeometricElement3d, placement:', element.placement);

      // Load element props with geometry using ElementLoadProps
      const loadProps: ElementLoadProps = {
        id: elementId,
        wantGeometry: true,
        wantBRepData: true,
      };
      const props = iModel.elements.getElementProps<GeometricElementProps>(loadProps);
      if (!props?.placement) {
        return { success: false, message: 'Element has no placement' };
      }

      console.log('[PatternCommand] Element geom:', props.geom ? 'present' : 'missing');

      const newElementIds: string[] = [];
      const dirVector = Vector3d.create(direction.x, direction.y, direction.z);
      dirVector.normalizeInPlace();
      console.log('[PatternCommand] Direction vector normalized:', dirVector);

      try {
        // Create copies
        for (let i = 1; i < count; i++) {
          console.log(`[PatternCommand] Creating copy ${i}/${count - 1}`);
          const offset = dirVector.scale(spacing * i);

          // Create new placement with offset
          const sourcePlacement = element.placement;
          const newOrigin = sourcePlacement.origin.plus(offset);
          const newPlacement = new Placement3d(
            newOrigin,
            sourcePlacement.angles,
            sourcePlacement.bbox
          );

          console.log(`[PatternCommand] New origin:`, newOrigin);

          // Create new element props - same pattern as CopyElementsTool
          const newProps: GeometricElementProps = {
            classFullName: element.classFullName,
            model: props.model,
            category: props.category,
            code: Code.createEmpty(),
            placement: newPlacement,
            geom: props.geom, // Copy geometry data
          };

          // Add user label if original has one
          if (element.userLabel) {
            (newProps as any).userLabel = `${element.userLabel}_Pattern_${i}`;
          }

          console.log(`[PatternCommand] Inserting element ${i} with geom:`, newProps.geom ? 'yes' : 'no');
          // Insert the new element
          const newId = iModel.elements.insertElement(newProps);
          console.log(`[PatternCommand] Inserted element ${i}, newId:`, newId);
          newElementIds.push(newId);
        }

        console.log('[PatternCommand] Linear pattern complete, created:', newElementIds.length, 'elements');
        return {
          success: true,
          message: `Created ${newElementIds.length} copies in linear pattern`,
          newElementIds,
        };
      } catch (err) {
        console.error('[PatternCommand] Error during linear pattern:', err);
        throw err;
      }
    } catch (err) {
      console.error('[PatternCommand] Linear pattern failed:', err);
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error during linear pattern',
      };
    }
  }

  /**
   * Circular Pattern - Creates multiple copies of an element around a center point
   */
  public async circularPattern(params: {
    elementId: string;
    centerPoint: { x: number; y: number; z: number };
    count: number;
    totalAngle: number;
  }): Promise<{ success: boolean; message: string; newElementIds?: string[] }> {
    const { elementId, centerPoint, count, totalAngle } = params;
    console.log('[PatternCommand] circularPattern called:', { elementId, centerPoint, count, totalAngle });
    try {
      const iModel = this.iModel;
      console.log('[PatternCommand] Got iModel, key:', iModel.key);

      // Get the source element
      const element = iModel.elements.getElement(elementId);
      console.log('[PatternCommand] Got element:', element?.constructor?.name, 'id:', element?.id);
      if (!element) {
        return { success: false, message: 'Element not found' };
      }

      // Check if element is geometric
      if (!(element instanceof GeometricElement3d)) {
        console.log('[PatternCommand] Element is not GeometricElement3d, type:', element.constructor.name);
        return { success: false, message: 'Element is not a geometric element' };
      }

      console.log('[PatternCommand] Element is GeometricElement3d, placement:', element.placement);

      // Load element props with geometry using ElementLoadProps
      const loadProps: ElementLoadProps = {
        id: elementId,
        wantGeometry: true,
        wantBRepData: true,
      };
      const props = iModel.elements.getElementProps<GeometricElementProps>(loadProps);
      if (!props?.placement) {
        return { success: false, message: 'Element has no placement' };
      }

      console.log('[PatternCommand] Element geom:', props.geom ? 'present' : 'missing');

      const newElementIds: string[] = [];
      const center = Point3d.create(centerPoint.x, centerPoint.y, centerPoint.z);
      const angleStep = Angle.createDegrees(totalAngle / count);
      console.log('[PatternCommand] Center:', center, 'angleStep:', angleStep.degrees, 'degrees');

      try {
        const sourcePlacement = element.placement;
        const sourceOrigin = sourcePlacement.origin;

        // Create copies
        for (let i = 1; i < count; i++) {
          console.log(`[PatternCommand] Creating copy ${i}/${count - 1}`);
          const angle = Angle.createRadians(angleStep.radians * i);

          // Calculate rotation matrix around Z axis through center point
          const rotation = Matrix3d.createRotationAroundVector(
            Vector3d.create(0, 0, 1),
            angle,
          );

          if (!rotation) {
            throw new Error('Failed to create rotation matrix');
          }

          // Transform: translate to origin, rotate, translate back
          const toOrigin = Transform.createTranslationXYZ(
            -center.x,
            -center.y,
            -center.z,
          );
          const rotate = Transform.createRefs(undefined, rotation);
          const fromOrigin = Transform.createTranslation(center);

          // Combined transform
          const transform = fromOrigin.multiplyTransformTransform(
            rotate.multiplyTransformTransform(toOrigin),
          );

          // Apply transform to origin
          const newOrigin = transform.multiplyPoint3d(sourceOrigin);
          console.log(`[PatternCommand] New origin:`, newOrigin);

          // Apply rotation to angles
          const currentAngles = YawPitchRollAngles.fromJSON(sourcePlacement.angles);
          const currentMatrix = currentAngles.toMatrix3d();
          const newMatrix = currentMatrix.multiplyMatrixMatrix(rotation);
          const newAngles = YawPitchRollAngles.createFromMatrix3d(newMatrix);

          // Create new placement
          const newPlacement = new Placement3d(
            newOrigin,
            newAngles || sourcePlacement.angles,
            sourcePlacement.bbox
          );

          // Create new element props - same pattern as CopyElementsTool
          const newProps: GeometricElementProps = {
            classFullName: element.classFullName,
            model: props.model,
            category: props.category,
            code: Code.createEmpty(),
            placement: newPlacement,
            geom: props.geom, // Copy geometry data
          };

          // Add user label if original has one
          if (element.userLabel) {
            (newProps as any).userLabel = `${element.userLabel}_Circular_${i}`;
          }

          console.log(`[PatternCommand] Inserting element ${i} with geom:`, newProps.geom ? 'yes' : 'no');
          // Insert the new element
          const newId = iModel.elements.insertElement(newProps);
          console.log(`[PatternCommand] Inserted element ${i}, newId:`, newId);
          newElementIds.push(newId);
        }

        console.log('[PatternCommand] Circular pattern complete, created:', newElementIds.length, 'elements');
        return {
          success: true,
          message: `Created ${newElementIds.length} copies in circular pattern`,
          newElementIds,
        };
      } catch (err) {
        console.error('[PatternCommand] Error during circular pattern:', err);
        throw err;
      }
    } catch (err) {
      console.error('[PatternCommand] Circular pattern failed:', err);
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error during circular pattern',
      };
    }
  }
}
