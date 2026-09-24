/**-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useState } from "react";

// Stub type until core package exports it
 
interface SketchSystem {
   
  activate: (_plane: any) => Promise<void>;
  deactivate: () => Promise<void>;
}

/**
 * Hook to manage sketch state
 * @public
 */
export const useSketch = (sketchSystem: SketchSystem | undefined) => {
  const [isActive, setIsActive] = useState(false);
  const [activeTool, setActiveTool] = useState<string | undefined>();

  const startSketch = useCallback(
     
    async (plane: any) => {
      if (!sketchSystem) return;
      await sketchSystem.activate(plane);
      setIsActive(true);
    },
    [sketchSystem]
  );

  const finishSketch = useCallback(async () => {
    if (!sketchSystem) return;
    await sketchSystem.deactivate();
    setIsActive(false);
    setActiveTool(undefined);
  }, [sketchSystem]);

  const selectTool = useCallback((tool: string) => {
    setActiveTool(tool);
    // TODO: Integrate with actual sketch tool system
  }, []);

  return {
    isActive,
    activeTool,
    startSketch,
    finishSketch,
    selectTool,
  };
};
