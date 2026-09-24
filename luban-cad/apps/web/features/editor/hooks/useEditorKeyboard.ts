/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useEffect } from 'react';
import { keyboardManager } from '../../../src/core/shortcuts/index.js';

/**
 * Hook for keyboard shortcuts in the editor.
 * Handles Delete key for element deletion and delegates to keyboardManager.
 */
export function useEditorKeyboard(
  isEditable: boolean,
  deleteSelected: () => Promise<void>,
  onStatusChange: (status: string) => void,
): void {
  useEffect(() => {
    if (!isEditable) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      const tag = document.activeElement?.tagName;
      if (e.key === 'Delete' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        void deleteSelected().catch((err: unknown) =>
          onStatusChange(`删除失败: ${err instanceof Error ? err.message : String(err)}`)
        );
      }

      // Pass to keyboard manager for shortcut handling
      keyboardManager.handleKeyDown(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditable, deleteSelected, onStatusChange]);
}
