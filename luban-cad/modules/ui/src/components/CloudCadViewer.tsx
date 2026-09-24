/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from "react";
import { IModelConnection, ScreenViewport, ViewState } from "@itwin/core-frontend";

/**
 * Props for CloudCadViewer component
 * @public
 */
export interface CloudCadViewerProps {
  /** iModel connection */
  iModel: IModelConnection;
  /** Initial view state */
  viewState?: ViewState;
  /** CSS class name */
  className?: string;
  /** Style object */
  style?: React.CSSProperties;
}

/**
 * React component for displaying the Cloud CAD 3D viewer
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CloudCadViewer: React.FC<CloudCadViewerProps> = ({
  iModel,
  viewState,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<ScreenViewport | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !iModel) {
      return;
    }

    // Create viewport
    const createViewport = async () => {
      try {
        // Get default view if none provided
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const defaultViewId = await iModel.views.queryDefaultViewId();
         
        const view = viewState || (await iModel.views.load(defaultViewId));

        if (canvasRef.current) {
          viewportRef.current = ScreenViewport.create(canvasRef.current, view);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to create viewport:", error);
      }
    };

    void createViewport();

    // Cleanup
    return () => {
      if (viewportRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        viewportRef.current.dispose();
        viewportRef.current = null;
      }
    };
  }, [iModel, viewState]);

  return (
    <div
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        ...style,
      }}
    />
  );
};
