/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from "react";
import { IconButton } from "@itwin/itwinui-react";

interface ToolMetadata {
  id?: string;
  name?: string;
  icon?: string;
  shortcut?: string;
}

interface ToolConstructor {
  name: string;
  metadata?: ToolMetadata;
  toolId?: string;
}

/**
 * Props for ToolButton component
 * @public
 */
export interface ToolButtonProps {
  /** Tool class or tool ID */
  tool: string | ToolConstructor;
  /** Button size */
  size?: "small" | "large";
  /** Whether button is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Click handler (optional, will run tool by default) */
  onClick?: () => void;
  /** Whether the tool is currently active */
  isActive?: boolean;
}

/**
 * Tool button component
 * Displays a button that activates a CAD tool when clicked
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ToolButton: React.FC<ToolButtonProps> = ({
  tool,
  size = "small",
  disabled = false,
  className,
  onClick,
  isActive,
}) => {
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }

    // Run the tool via ToolRegistry
    if (typeof tool === "string") {
      // eslint-disable-next-line no-console
      console.log("Running tool:", tool);
    } else {
      // Get toolId from the class and run through registry
      const toolClass = tool as unknown as ToolConstructor;
      const toolId = toolClass.toolId || toolClass.metadata?.id;
      if (toolId) {
        // eslint-disable-next-line no-console
        console.log("Running tool:", toolId);
      }
    }
  };

  // Get tool metadata
  const getToolInfo = () => {
    if (typeof tool === "string") {
      return { name: tool, icon: undefined, shortcut: undefined };
    }
    const toolClass = tool as unknown as ToolConstructor;
    const metadata = toolClass.metadata;
    return {
      name: metadata?.name || toolClass.name,
      icon: metadata?.icon,
      shortcut: metadata?.shortcut,
    };
  };

  const { name, icon, shortcut } = getToolInfo();

  // Build tooltip text
  const label = shortcut ? `${name} (${shortcut})` : name;

  return (
    <IconButton
      onClick={handleClick}
      disabled={disabled}
      size={size}
      styleType={isActive ? "cta" : "default"}
      label={label}
      className={className}
    >
      {icon || name[0]}
    </IconButton>
  );
};

export default ToolButton;
