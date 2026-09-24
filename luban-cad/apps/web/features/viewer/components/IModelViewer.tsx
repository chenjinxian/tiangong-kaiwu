/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * IModelViewer - 3D Viewer Component
 * Uses @itwin/web-viewer-react for iModel visualization
 */

import React from 'react';
import { Viewer } from '@itwin/web-viewer-react';
import { getStoredAuth } from '../../../features/auth/services/auth/client.js';
import { BriefcaseStatus } from '../../imodel/components/BriefcaseStatus.js';
import { useIModelPermission } from '../../imodel/hooks/useIModelPermission.js';

// Create a compatible auth client for the Viewer
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- authClient type not exported by @itwin/web-viewer-react
const viewerAuthClient = {
  getAccessToken: async () => {
    const { tokens } = getStoredAuth();
    return tokens?.accessToken || '';
  },
};

interface IModelViewerProps {
  /** iTwin/Project ID */
  iTwinId: string;
  /** iModel ID */
  iModelId: string;
  /** Optional changeset ID for specific version */
  changesetId?: string;
  /** Enable performance monitors */
  enablePerformanceMonitors?: boolean;
  /** UI configuration */
  uiConfig?: {
    hideNavigationAid?: boolean;
    hideStatusBar?: boolean;
    hideToolSettings?: boolean;
  };
  /** Custom frontstage (UI layout) */
  frontstage?: React.ReactNode;
  /** View state options */
  viewStateOptions?: {
    /** Fit view on load */
    fitView?: boolean;
    /** Camera view angle */
    viewRotation?: {
      yaw: number;
      pitch: number;
      roll: number;
    };
  };
  /** Callback when viewer is initialized */
  onInitialized?: () => void;
  /** Callback when iModel is loaded */
  onIModelLoaded?: () => void;
  /** Error callback */
  onError?: (error: Error) => void;
}

/**
 * IModelViewer Component
 *
 * Renders a 3D CAD model using the iTwin.js viewer.
 * Requires authentication via authClient.
 *
 * @example
 * ```tsx
 * <IModelViewer
 *   iTwinId="3fa85f64-5717-4562-b3fc-2c963f66afa6"
 *   iModelId="8c289d96-92fa-4f4b-b4b6-2c8c9c5c8b3a"
 *   enablePerformanceMonitors={true}
 *   onIModelLoaded={() => console.log('Model loaded')}
 * />
 * ```
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function IModelViewer({
  iTwinId,
  iModelId,
  changesetId,
  enablePerformanceMonitors = false,
  uiConfig = {
    hideNavigationAid: false,
    hideStatusBar: false,
    hideToolSettings: false,
  },
  frontstage,
  onInitialized,
  onIModelLoaded,
}: IModelViewerProps) {
  const { permission, mode } = useIModelPermission({
    iTwinId,
    iModelId,
    enabled: true,
  });
  const userCanEdit = mode === 'editable' || permission?.role === 'owner';

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <Viewer
        iTwinId={iTwinId}
        iModelId={iModelId}
        changeSetId={changesetId}
        authClient={viewerAuthClient as any}
        defaultUiConfig={{
          ...uiConfig,
        }}
        enablePerformanceMonitors={enablePerformanceMonitors}
        onIModelAppInit={onInitialized}
        onIModelConnected={onIModelLoaded}
      />
      {frontstage && (
        <div className="viewer-frontstage">{frontstage}</div>
      )}
      {/* Briefcase Status - Edit Permission Controls */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          padding: '8px 16px',
        }}
      >
        <BriefcaseStatus imodelId={iModelId} canEdit={userCanEdit} />
      </div>
    </div>
  );
}

/**
 * IModelViewer with Briefcase Connection
 * For local editing workflows
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function IModelViewerWithBriefcase({
  iTwinId,
  iModelId,
  briefcaseId: _briefcaseId,
  ...props
}: IModelViewerProps & { briefcaseId: number }) {
  // Note: briefcase connection would require additional setup
  // This is a placeholder for future implementation
  return (
    <IModelViewer
      iTwinId={iTwinId}
      iModelId={iModelId}
      {...props}
    />
  );
}

export default IModelViewer;
