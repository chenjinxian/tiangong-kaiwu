/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Fast Tooltip Component - Instant display, no delay
 */

import React, { useState, useRef, useCallback } from 'react';
import './Tooltip.css';

interface TooltipProps {
  /** Tooltip content */
  content: string;
  /** Child element that triggers tooltip */
  children: React.ReactNode;
  /** Tooltip position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay in ms before showing (default: 0 for instant) */
  delay?: number;
}

/**
 * Fast tooltip with instant display
 * No browser delay - shows immediately on hover
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'right',
  delay = 0,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const showTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (delay > 0) {
      timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
    } else {
      setIsVisible(true);
    }
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  }, []);

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && content && (
        <span className={`tooltip tooltip-${position}`} role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
};

/**
 * Tooltip button wrapper - specifically for toolbar buttons
 * Shows tooltip instantly with no delay
 */
interface TooltipButtonProps {
  /** Tooltip text */
  tooltip: string;
  /** Button content/icon */
  children: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Active state */
  active?: boolean;
  /** Button type */
  type?: 'button' | 'submit' | 'reset';
}

export const TooltipButton: React.FC<TooltipButtonProps> = ({
  tooltip,
  children,
  onClick,
  className = '',
  disabled = false,
  active = false,
  type = 'button',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <button
      type={type}
      className={`tooltip-btn ${active ? 'active' : ''} ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      {isVisible && tooltip && !disabled && (
        <span className="tooltip tooltip-right" role="tooltip">
          {tooltip}
        </span>
      )}
    </button>
  );
};

export default Tooltip;
