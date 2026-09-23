/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useState } from 'react';
import type {
  BlendEdgesProps,
  ChamferEdgesProps,
  ElementGeometryResultOptions,
  ElementGeometryResultProps,
  HollowFacesProps,
  SubEntityLocationProps,
  SubEntityProps,
} from '@itwin/editor-common';
import { SOLID_MODELING_DEFAULTS } from '../../../shared/lib/constants.js';
import { executeEditCommand } from '../executeEditCommand.js';

export interface SolidModelingOptions {
  /** iModel key (briefcase Id) */
  iModelKey: string;
}

export interface SolidModelingState {
  isProcessing: boolean;
  error: string | null;
  lastResult: ElementGeometryResultProps | undefined;
}

export interface BlendEdgesParams {
  edges: SubEntityLocationProps[];
  radius: number;
  propagateSmooth?: boolean;
}

export interface ChamferEdgesParams {
  edges: SubEntityLocationProps[];
  mode: import('@itwin/editor-common').ChamferMode;
  length?: number;
  distanceLeft?: number;
  distanceRight?: number;
  angle?: number;
  propagateSmooth?: boolean;
}

export interface HollowFacesParams {
  faces: SubEntityLocationProps[];
  shellThickness: number;
  faceThickness?: number;
}

export interface OffsetFacesParams {
  faces: SubEntityLocationProps[];
  offsetDistance: number;
}

export interface UseSolidModelingReturn extends SolidModelingState {
  /** Apply round edges (fillet) to selected edges */
  blendEdges: (elementId: string, params: BlendEdgesParams, opts?: Partial<ElementGeometryResultOptions>) => Promise<ElementGeometryResultProps | undefined>;
  /** Apply chamfer to selected edges */
  chamferEdges: (elementId: string, params: ChamferEdgesParams, opts?: Partial<ElementGeometryResultOptions>) => Promise<ElementGeometryResultProps | undefined>;
  /** Hollow faces (shell) - remove selected faces and create thin wall */
  hollowFaces: (elementId: string, params: HollowFacesParams, opts?: Partial<ElementGeometryResultOptions>) => Promise<ElementGeometryResultProps | undefined>;
  /** Offset faces - offset selected faces by a distance */
  offsetFaces: (elementId: string, params: OffsetFacesParams, opts?: Partial<ElementGeometryResultOptions>) => Promise<ElementGeometryResultProps | undefined>;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook for solid modeling operations
 * Wraps backend EditCommand calls for blendEdges, chamferEdges, hollowFaces
 */
export function useSolidModeling(options: SolidModelingOptions): UseSolidModelingReturn {
  const { iModelKey } = options;
  const [state, setState] = useState<SolidModelingState>({
    isProcessing: false,
    error: null,
    lastResult: undefined,
  });

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const blendEdges = useCallback(async (
    elementId: string,
    params: BlendEdgesParams,
    opts?: Partial<ElementGeometryResultOptions>
  ): Promise<ElementGeometryResultProps | undefined> => {
    const defaultOpts: ElementGeometryResultOptions = {
      wantGraphic: true,
      chordTolerance: SOLID_MODELING_DEFAULTS.CHORD_TOLERANCE,
      requestId: `blendEdges:${elementId}`,
      writeChanges: true,
      ...opts,
    };

    return executeEditCommand(iModelKey, 'blendEdges', elementId, async () => {
      const edges: SubEntityProps[] = params.edges.map(loc => loc.subEntity);
      const blendProps: BlendEdgesProps = {
        edges,
        radii: params.radius,
        propagateSmooth: params.propagateSmooth ?? true,
      };
      return blendProps;
    }, defaultOpts, setState);
  }, [iModelKey]);

  const chamferEdges = useCallback(async (
    elementId: string,
    params: ChamferEdgesParams,
    opts?: Partial<ElementGeometryResultOptions>
  ): Promise<ElementGeometryResultProps | undefined> => {
    const defaultOpts: ElementGeometryResultOptions = {
      wantGraphic: true,
      chordTolerance: SOLID_MODELING_DEFAULTS.CHORD_TOLERANCE,
      requestId: `chamferEdges:${elementId}`,
      writeChanges: true,
      ...opts,
    };

    return executeEditCommand(iModelKey, 'chamferEdges', elementId, async () => {
      const edges: SubEntityProps[] = params.edges.map(loc => loc.subEntity);

      let values1: number | number[];
      let values2: number | number[] | undefined;

      switch (params.mode) {
        case 1: // ChamferMode.Length
          values1 = params.length ?? SOLID_MODELING_DEFAULTS.CHAMFER_LENGTH;
          break;
        case 2: // ChamferMode.Distances
          values1 = params.distanceLeft ?? SOLID_MODELING_DEFAULTS.CHAMFER_DISTANCE;
          values2 = params.distanceRight ?? SOLID_MODELING_DEFAULTS.CHAMFER_DISTANCE;
          break;
        case 3: // ChamferMode.DistanceAngle
          values1 = params.distanceLeft ?? SOLID_MODELING_DEFAULTS.CHAMFER_DISTANCE;
          values2 = params.angle ?? (SOLID_MODELING_DEFAULTS.CHAMFER_ANGLE * Math.PI) / 180;
          break;
        case 4: // ChamferMode.AngleDistance
          values1 = params.angle ?? (SOLID_MODELING_DEFAULTS.CHAMFER_ANGLE * Math.PI) / 180;
          values2 = params.distanceRight ?? SOLID_MODELING_DEFAULTS.CHAMFER_DISTANCE;
          break;
        default:
          values1 = params.length ?? SOLID_MODELING_DEFAULTS.CHAMFER_LENGTH;
      }

      const chamferProps: ChamferEdgesProps = {
        mode: params.mode,
        edges,
        values1,
        values2,
        propagateSmooth: params.propagateSmooth ?? true,
      };
      return chamferProps;
    }, defaultOpts, setState);
  }, [iModelKey]);

  const hollowFaces = useCallback(async (
    elementId: string,
    params: HollowFacesParams,
    opts?: Partial<ElementGeometryResultOptions>
  ): Promise<ElementGeometryResultProps | undefined> => {
    const defaultOpts: ElementGeometryResultOptions = {
      wantGraphic: true,
      chordTolerance: SOLID_MODELING_DEFAULTS.CHORD_TOLERANCE,
      requestId: `hollowFaces:${elementId}`,
      writeChanges: true,
      ...opts,
    };

    return executeEditCommand(iModelKey, 'hollowFaces', elementId, async () => {
      const faces: SubEntityProps[] = params.faces.map(loc => loc.subEntity);
      const faceThickness = params.faceThickness ?? 0;
      const shellThickness = params.shellThickness > 0
        ? params.shellThickness
        : SOLID_MODELING_DEFAULTS.HOLLOW_THICKNESS;
      const distances = faceThickness > 0
        ? faces.map(() => faceThickness)
        : faces.map(() => shellThickness);

      const hollowProps: HollowFacesProps = {
        defaultDistance: shellThickness,
        faces,
        distances,
      };
      return hollowProps;
    }, defaultOpts, setState);
  }, [iModelKey]);

  const offsetFaces = useCallback(async (
    elementId: string,
    params: OffsetFacesParams,
    opts?: Partial<ElementGeometryResultOptions>
  ): Promise<ElementGeometryResultProps | undefined> => {
    const defaultOpts: ElementGeometryResultOptions = {
      wantGraphic: true,
      chordTolerance: SOLID_MODELING_DEFAULTS.CHORD_TOLERANCE,
      requestId: `offsetFaces:${elementId}`,
      writeChanges: true,
      ...opts,
    };

    return executeEditCommand(iModelKey, 'offsetFaces', elementId, async () => {
      const faces: SubEntityProps[] = params.faces.map(loc => loc.subEntity);
      return {
        faces,
        offsetDistance: params.offsetDistance,
      };
    }, defaultOpts, setState);
  }, [iModelKey]);

  return {
    ...state,
    blendEdges,
    chamferEdges,
    hollowFaces,
    offsetFaces,
    clearError,
  };
}

export default useSolidModeling;
