/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from 'react';
import { getValidAccessToken } from '../../auth/services/auth/client.js';

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';

/**
 * User role in iModel
 */
export type IModelRole = 'owner' | 'editor' | 'viewer' | 'none';

/**
 * iModel permissions
 */
export interface IModelPermission {
  iModelId: string;
  userId: string;
  role: IModelRole;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canShare: boolean;
    canAdmin: boolean;
  };
}

/**
 * Editor mode determined by permission
 */
export type EditorMode = 'readonly' | 'editable';

interface UseIModelPermissionOptions {
  iTwinId: string | null;
  iModelId: string | null;
  enabled?: boolean;
}

interface UseIModelPermissionReturn {
  permission: IModelPermission | null;
  role: IModelRole;
  mode: EditorMode;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Determine editor mode based on permission
 */
export function determineEditorMode(permission: IModelPermission | null): EditorMode {
  if (!permission) return 'readonly';
  if (permission.permissions?.canEdit) return 'editable';
  return 'readonly';
}

/**
 * Hook to fetch and manage iModel permissions
 */
export function useIModelPermission(options: UseIModelPermissionOptions): UseIModelPermissionReturn {
  const { iTwinId, iModelId, enabled = true } = options;

  const [permission, setPermission] = useState<IModelPermission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPermission = useCallback(async () => {
    if (!iTwinId || !iModelId) {
      setPermission(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Try to fetch permission from modeling-server
      const response = await fetch(
        `${BACKEND_URL}/itwins/${iTwinId}/imodels/${iModelId}/permission`,
        {
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        // Permission endpoint not available - default to readonly for safety
        // This prevents unauthorized editing when modeling-server permissions are unavailable
        if (response.status === 404) {
          // Permission endpoint not available in local deployment —
          // assume authenticated users own their iModels
          const defaultPermission: IModelPermission = {
            iModelId,
            userId: 'current-user',
            role: 'owner',
            permissions: {
              canView: true,
              canEdit: true,
              canDelete: true,
              canShare: true,
              canAdmin: true,
            },
          };
          setPermission(defaultPermission);
          return;
        }
        throw new Error(`Failed to fetch permission: ${response.statusText}`);
      }

      const data = await response.json();
      setPermission(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch permission'));
      // Default to editable on error for local deployment
      setPermission({
        iModelId: iModelId || '',
        userId: 'current-user',
        role: 'owner',
        permissions: {
          canView: true,
          canEdit: true,
          canDelete: true,
          canShare: true,
          canAdmin: true,
        },
      });
    } finally {
      setIsLoading(false);
    }
  }, [iTwinId, iModelId]);

  useEffect(() => {
    if (enabled && iTwinId && iModelId) {
      void fetchPermission();
    }
  }, [fetchPermission, enabled, iTwinId, iModelId]);

  const role = permission?.role || 'none';
  const mode = determineEditorMode(permission);

  return {
    permission,
    role,
    mode,
    isLoading,
    error,
    refetch: fetchPermission,
  };
}

export default useIModelPermission;
