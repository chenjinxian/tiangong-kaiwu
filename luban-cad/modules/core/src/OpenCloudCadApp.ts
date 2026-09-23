/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  IModelApp,
  IModelAppOptions,
} from "@itwin/core-frontend";
import { BrowserAuthorizationClient } from "@itwin/browser-authorization";

/**
 * Open Cloud CAD application options
 * @public
 */
export interface OpenCloudCadOptions extends IModelAppOptions {
  /** Authentication configuration */
  authConfig?: {
    clientId: string;
    redirectUri: string;
    scope: string;
    authority?: string;
  };
}

/**
 * Main application class for Open Cloud CAD.
 * Extends IModelApp to provide CAD-specific functionality.
 * @public
 */
export class OpenCloudCadApp extends IModelApp {
  private static _authClient: BrowserAuthorizationClient | undefined;

  /**
   * Get the authorization client
   */
  public static override get authorizationClient(): BrowserAuthorizationClient | undefined {
    return this._authClient;
  }

  /**
   * Initialize the Open Cloud CAD application
   * @param options - Application configuration options
   */
  public static override async startup(options?: OpenCloudCadOptions): Promise<void> {
    // Setup authentication before starting the core application
    let authClient: BrowserAuthorizationClient | undefined;
    if (options?.authConfig) {
      authClient = new BrowserAuthorizationClient({
        clientId: options.authConfig.clientId,
        redirectUri: options.authConfig.redirectUri,
        scope: options.authConfig.scope,
        authority: options.authConfig.authority,
      });
      this._authClient = authClient;

      // Attempt silent sign-in
      try {
        await authClient.signInSilent();
      } catch {
        // Silent sign-in failed, user needs to sign in explicitly
      }
    }

    // Start the core application
    // Note: Remove authConfig before passing to parent - authorizationClient is
    // read-only in newer iTwin.js versions and must be set via our static getter
    const { authConfig: _, ...parentOptions } = options ?? {};
    await super.startup(parentOptions);
  }

  /**
   * Sign in the user
   */
  public static async signIn(): Promise<void> {
    if (this._authClient) {
      await this._authClient.signIn();
    }
  }

  /**
   * Sign out the user
   */
  public static async signOut(): Promise<void> {
    if (this._authClient) {
      await this._authClient.signOut();
    }
  }
}

/**
 * Initialize OpenCloudCadApp for the current platform
 * @public
 */
export async function initializeOpenCloudCad(options?: OpenCloudCadOptions): Promise<void> {
  await OpenCloudCadApp.startup(options);
}

// Re-export iTwin.js types for convenience
export {
  IModelApp,
  IModelConnection,
  ScreenViewport,
  Viewport,
  ViewState,
  ViewTool,
  FitViewTool,
  PrimitiveTool,
  BeButtonEvent,
  DecorateContext,
  EventHandled,
} from "@itwin/core-frontend";

export { BrowserAuthorizationClient } from "@itwin/browser-authorization";

// Geometry types
export {
  Point2d,
  Point3d,
  Vector2d,
  Vector3d,
  Matrix3d,
  Transform,
  Range2d,
  Range3d,
  Angle,
  LineSegment3d,
  Arc3d,
  Path,
  Loop,
} from "@itwin/core-geometry";

// Common types
export {
  ColorDef,
  RenderMode,
  ViewFlags,
  Cartographic,
  GeometryClass,
} from "@itwin/core-common";

// Bentley types
export { Id64, Id64String, Guid, GuidString, BeEvent, BeUiEvent } from "@itwin/core-bentley";

// Authentication type from core-common
export { type AuthorizationClient } from "@itwin/core-common";

// Version
export const VERSION = "2.0.0";
