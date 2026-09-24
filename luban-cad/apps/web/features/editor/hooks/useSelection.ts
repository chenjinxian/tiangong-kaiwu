/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from 'react';
import { IModelConnection, SelectionSetEvent } from '@itwin/core-frontend';

export interface UseSelectionResult {
  /** Currently selected element IDs */
  selectedIds: Set<string>;
  /** Number of selected elements */
  count: number;
  /** Clear the selection */
  clear: () => void;
}

/**
 * Hook to track the current selection set
 * @example
 * ```tsx
 * const { selectedIds, count, clear } = useSelection(iModel);
 *
 * useEffect(() => {
 *   console.log(`Selected ${count} elements`);
 * }, [count]);
 * ```
 */
export function useSelection(iModel: IModelConnection | null): UseSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!iModel) {
      setSelectedIds(new Set());
      return;
    }

    const handleSelectionChanged = (_event: SelectionSetEvent): void => {
      const newSelection = new Set<string>();

      // Get current selection
      for (const id of iModel.selectionSet.elements) {
        newSelection.add(id);
      }

      setSelectedIds(newSelection);
    };

    // Subscribe to selection changes
    const unsubscribe = iModel.selectionSet.onChanged.addListener(handleSelectionChanged);

    // Initialize with current selection
    const initialSelection = new Set<string>();
    for (const id of iModel.selectionSet.elements) {
      initialSelection.add(id);
    }
    setSelectedIds(initialSelection);

    return () => {
      unsubscribe();
    };
  }, [iModel]);

  const clear = useCallback((): void => {
    if (iModel) {
      iModel.selectionSet.emptyAll();
    }
  }, [iModel]);

  return {
    selectedIds,
    count: selectedIds.size,
    clear,
  };
}

export default useSelection;
