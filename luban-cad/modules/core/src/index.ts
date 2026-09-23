/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Open Cloud CAD Core Module - V2
 *
 * This module provides the core CAD functionality for Open Cloud CAD.
 * It extends iTwin.js to provide CAD-specific features while leveraging
 * the powerful 3D rendering and data management capabilities of iTwin.js.
 *
 * V2 Changes:
 * - Simplified architecture
 * - Removed duplicate implementations
 * - Direct iTwin.js integration
 *
 * @packageDocumentation
 */

// Main application and re-exports
export * from "./OpenCloudCadApp.js";

// Version
export const VERSION = "2.0.0";
