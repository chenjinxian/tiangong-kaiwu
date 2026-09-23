/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IModelConnection, ScreenViewport } from '@itwin/core-frontend';

/**
 * Viewer initialization options
 */
export interface ViewerOptions {
  /** iModel to open */
  iModelId: string;
  iTwinId: string;

  /** Optional default view name */
  defaultViewName?: string;

  /** Backend RPC URL */
  backendUrl?: string;

  /** Enable/disable features */
  features?: {
    /** Enable editing tools */
    editing?: boolean;
    /** Enable reality data */
    realityData?: boolean;
    /** Enable map layers */
    mapLayers?: boolean;
  };
}

/**
 * Viewer state
 */
export interface ViewerState {
  /** iModel connection */
  iModel?: IModelConnection;
  /** Screen viewport */
  viewport?: ScreenViewport;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error?: Error;
}

/**
 * IModel load result
 */
export interface IModelLoadResult {
  iModel: IModelConnection;
  viewport: ScreenViewport;
}
