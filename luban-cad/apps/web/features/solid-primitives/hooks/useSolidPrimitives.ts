/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Solid Primitives Hook
 * Manages creation of basic solid shapes
 */

import { useCallback, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';

export type SolidPrimitiveType =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'torus';

export interface SolidPrimitiveParams {
  box: { width: number; height: number; depth: number };
  cylinder: { radius: number; height: number };
  sphere: { radius: number };
  cone: { baseRadius: number; topRadius: number; height: number };
  torus: { majorRadius: number; minorRadius: number };
}

export function useSolidPrimitives() {
  const [isCreating, setIsCreating] = useState(false);
  const [activeType, setActiveType] = useState<SolidPrimitiveType | null>(null);

  const createPrimitive = useCallback(async (
    type: SolidPrimitiveType,
    params?: Partial<SolidPrimitiveParams[typeof type]>
  ) => {
    setIsCreating(true);
    setActiveType(type);

    const toolMap: Record<SolidPrimitiveType, string> = {
      box: 'CreateBox',
      cylinder: 'CreateCylinder',
      sphere: 'CreateSphere',
      cone: 'CreateCone',
      torus: 'CreateTorus',
    };

    try {
      const success = await IModelApp.tools.run(toolMap[type], params);
      return success;
    } finally {
      setIsCreating(false);
      setActiveType(null);
    }
  }, []);

  return {
    isCreating,
    activeType,
    createPrimitive,
  };
}
