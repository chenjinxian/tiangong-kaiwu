/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * React Hook for Undo/Redo integration
 */

import { useCallback, useEffect, useState } from 'react';
import { undoManager, type UndoRedoStateChangeEventArgs } from './UndoManager.js';
import type { BriefcaseConnection } from '@itwin/core-frontend';

export interface UseUndoManagerOptions {
  /** Connection to track (auto-updates undo manager) */
  connection?: BriefcaseConnection | null;
}

export interface UseUndoManagerResult {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Description of next undo operation */
  undoLabel: string;
  /** Description of next redo operation */
  redoLabel: string;
  /** Perform undo */
  undo: () => Promise<boolean>;
  /** Perform redo */
  redo: () => Promise<boolean>;
  /** Clear history */
  clear: () => void;
  /** Whether undo operation is in progress */
  isUndoing: boolean;
  /** Whether redo operation is in progress */
  isRedoing: boolean;
}

/**
 * React hook for undo/redo functionality
 * Automatically syncs with connection state
 */
export function useUndoManager(options: UseUndoManagerOptions = {}): UseUndoManagerResult {
  const { connection } = options;

  const [state, setState] = useState<UndoRedoStateChangeEventArgs>({
    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',
  });

  // Sync connection with undo manager
  useEffect(() => {
    if (connection) {
      undoManager.setConnection(connection);
    }
  }, [connection]);

  // Subscribe to state changes
  useEffect(() => {
    const handleStateChange = (newState: UndoRedoStateChangeEventArgs) => {
      setState(newState);
    };

    // Get initial state
    setState({
      canUndo: undoManager.canUndo,
      canRedo: undoManager.canRedo,
      undoLabel: undoManager.undoLabel,
      redoLabel: undoManager.redoLabel,
    });

    undoManager.onStateChanged.addListener(handleStateChange);
    return () => {
      undoManager.onStateChanged.removeListener(handleStateChange);
    };
  }, []);

  const undo = useCallback(async () => {
    return undoManager.undo();
  }, []);

  const redo = useCallback(async () => {
    return undoManager.redo();
  }, []);

  const clear = useCallback(() => {
    undoManager.clear();
  }, []);

  return {
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    undoLabel: state.undoLabel,
    redoLabel: state.redoLabel,
    undo,
    redo,
    clear,
    isUndoing: undoManager.isUndoing,
    isRedoing: undoManager.isRedoing,
  };
}
