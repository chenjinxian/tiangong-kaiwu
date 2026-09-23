/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback } from "react";

/**
 * Available sketch tools
 * @public
 */
export type SketchTool = "line" | "circle" | "arc" | "rectangle" | "polygon" | "constraint";

/**
 * Props for SketchToolbar component
 * @public
 */
export interface SketchToolbarProps {
  /** Currently active tool */
  activeTool?: SketchTool;
  /** Callback when a tool is selected */
  onSelectTool?: (tool: SketchTool) => void;
  /** Callback when finish sketch is clicked */
  onFinishSketch?: () => void;
  /** CSS class name */
  className?: string;
  /** Style object */
  style?: React.CSSProperties;
}

/**
 * React component for sketch toolbar
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SketchToolbar: React.FC<SketchToolbarProps> = ({
  activeTool,
  onSelectTool,
  onFinishSketch,
  className,
  style,
}) => {
  const tools: Array<{ id: SketchTool; label: string; icon: string }> = [
    { id: "line", label: "Line", icon: "━" },
    { id: "circle", label: "Circle", icon: "○" },
    { id: "arc", label: "Arc", icon: "⌒" },
    { id: "rectangle", label: "Rectangle", icon: "▭" },
    { id: "polygon", label: "Polygon", icon: "⬡" },
    { id: "constraint", label: "Constraint", icon: "⚓" },
  ];

  const handleToolClick = useCallback(
    (tool: SketchTool) => {
      onSelectTool?.(tool);
    },
    [onSelectTool]
  );

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "12px",
        backgroundColor: "#f5f5f5",
        borderRadius: "8px",
        ...style,
      }}
    >
      <h4 style={{ margin: "0 0 8px 0" }}>Sketch Tools</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            style={{
              padding: "8px 12px",
              backgroundColor: activeTool === tool.id ? "#2196f3" : "white",
              color: activeTool === tool.id ? "white" : "#333",
              border: "1px solid #ddd",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>
      <button
        onClick={onFinishSketch}
        style={{
          marginTop: "12px",
          padding: "10px",
          backgroundColor: "#4caf50",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        Finish Sketch
      </button>
    </div>
  );
};
