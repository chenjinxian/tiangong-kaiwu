/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback } from "react";

/**
 * Available main tools
 * @public
 */
export type MainTool = "select" | "sketch" | "extrude" | "revolve" | "sweep" | "fillet" | "chamfer";

/**
 * Props for MainToolbar component
 * @public
 */
export interface MainToolbarProps {
  /** Currently active tool */
  activeTool?: MainTool;
  /** Callback when a tool is selected */
  onSelectTool?: (tool: MainTool) => void;
  /** CSS class name */
  className?: string;
  /** Style object */
  style?: React.CSSProperties;
}

/**
 * React component for main CAD toolbar
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MainToolbar: React.FC<MainToolbarProps> = ({
  activeTool,
  onSelectTool,
  className,
  style,
}) => {
  const tools: Array<{ id: MainTool; label: string; icon: string }> = [
    { id: "select", label: "Select", icon: "↖" },
    { id: "sketch", label: "Sketch", icon: "✎" },
    { id: "extrude", label: "Extrude", icon: "▲" },
    { id: "revolve", label: "Revolve", icon: "↻" },
    { id: "sweep", label: "Sweep", icon: "➤" },
    { id: "fillet", label: "Fillet", icon: "◠" },
    { id: "chamfer", label: "Chamfer", icon: "⊿" },
  ];

  const handleToolClick = useCallback(
    (tool: MainTool) => {
      onSelectTool?.(tool);
    },
    [onSelectTool]
  );

  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap: "4px",
        padding: "8px",
        backgroundColor: "#f5f5f5",
        borderRadius: "8px",
        ...style,
      }}
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => handleToolClick(tool.id)}
          title={tool.label}
          style={{
            padding: "8px 12px",
            backgroundColor: activeTool === tool.id ? "#2196f3" : "white",
            color: activeTool === tool.id ? "white" : "#333",
            border: "1px solid #ddd",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            minWidth: "60px",
          }}
        >
          <span style={{ fontSize: "1.2em" }}>{tool.icon}</span>
          <span style={{ fontSize: "0.75em" }}>{tool.label}</span>
        </button>
      ))}
    </div>
  );
};
