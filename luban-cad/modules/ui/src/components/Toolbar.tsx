/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from "react";
import { ToolButton } from "./ToolButton.js";

// Stub types until core package exports them
interface CloudCadTool {
  getMetadata: () => { id: string };
}

interface ToolMetadata {
  id?: string;
}

interface ToolConstructor {
  name: string;
  metadata?: ToolMetadata;
}

interface ToolCategory {
  toolIds: string[];
}

// Stub registry until core package exports it
// eslint-disable-next-line @typescript-eslint/naming-convention
const ToolRegistry = {
  getCategory: (_id: string): ToolCategory | undefined => undefined,
};

// Stub events until core package exports them
// eslint-disable-next-line @typescript-eslint/naming-convention
const CloudCadToolEvents = {
   
  on: (_event: string, _handler: (tool: CloudCadTool) => void) => {
    return () => {};
  },
};

/**
 * Props for Toolbar component
 * @public
 */
export interface ToolbarProps {
  /** Category ID to display tools from */
  category?: string;
  /** Specific tool IDs to display */
  toolIds?: string[];
  /** Custom tool class array */
   
  tools?: any[];
  /** Toolbar orientation */
  orientation?: "horizontal" | "vertical";
  /** Custom class name */
  className?: string;
  /** Show tool labels */
  showLabels?: boolean;
}

/**
 * Toolbar component
 * Displays a collection of tool buttons
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const Toolbar: React.FC<ToolbarProps> = ({
  category,
  toolIds,
  tools,
  orientation = "horizontal",
  className,
}) => {
  const [activeToolId, setActiveToolId] = useState<string | null>(null);

  useEffect(() => {
    // Listen for tool activation events
    const unsubscribe = CloudCadToolEvents.on("tool:activated", (tool: CloudCadTool) => {
      setActiveToolId(tool.getMetadata().id);
    });

    // Listen for tool deactivation
    const unsubscribe2 = CloudCadToolEvents.on("tool:deactivated", () => {
      setActiveToolId(null);
    });

    return () => {
      unsubscribe();
      unsubscribe2();
    };
  }, []);

  // Get tools to display
   
  const getTools = (): { id: string; toolClass?: any }[] => {
    if (tools) {
      return tools.map((t) => {
        const toolClass = t as unknown as ToolConstructor;
        return {
          id: toolClass.metadata?.id || t.name,
          toolClass: t,
        };
      });
    }

    if (toolIds) {
      return toolIds.map((id) => ({ id, toolClass: undefined }));
    }

    if (category) {
      const cat = ToolRegistry.getCategory(category);
      if (cat) {
        return cat.toolIds.map((id) => ({ id, toolClass: undefined }));
      }
    }

    return [];
  };

  const displayTools = getTools();

  if (displayTools.length === 0) {
    return null;
  }

  return (
    <div
      className={`cloud-cad-toolbar ${orientation} ${className || ""}`}
      style={{
        display: "flex",
        flexDirection: orientation === "horizontal" ? "row" : "column",
        gap: "4px",
        padding: "4px",
        background: "#2d2d3a",
        borderRadius: "4px",
      }}
    >
      {displayTools.map(({ id, toolClass }) => (
        <ToolButton
          key={id}
          tool={toolClass || id}
          isActive={activeToolId === id}
          size="small"
        />
      ))}
    </div>
  );
};

export default Toolbar;
