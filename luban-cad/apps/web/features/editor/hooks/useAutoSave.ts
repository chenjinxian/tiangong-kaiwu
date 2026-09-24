/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useAutoSave — React hook for auto-saving after inactivity.
 *
 * Calls save() after 3 seconds of inactivity when hasChanges is true.
 */

import { useEffect, useRef } from 'react';

export interface UseAutoSaveOptions {
  /** Whether there are unsaved changes */
  hasChanges: boolean;
  /** Save callback */
  onSave: () => Promise<void>;
  /** Inactivity delay in milliseconds */
  delay?: number;
}

export function useAutoSave({ hasChanges, onSave, delay = 3000 }: UseAutoSaveOptions): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!hasChanges || isSavingRef.current) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      if (!isSavingRef.current) {
        isSavingRef.current = true;
        void onSave().finally(() => {
          isSavingRef.current = false;
        });
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [hasChanges, onSave, delay]);
}
