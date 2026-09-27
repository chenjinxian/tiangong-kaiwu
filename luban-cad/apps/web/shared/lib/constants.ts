/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Shared frontend constants. Reconstructed in T2.3 — the original file was
 * never committed (imports landed without their dependency, breaking 7
 * suites + tsc). Values anchored to imodelhub-services' iModelState enum
 * and the modeling dialogs' initial useState values.
 */

/**
 * iModel lifecycle states as served by imodelhub-services
 * (src/imodels/domain/imodel-state.enum.ts — camelCase wire values).
 */
export const IMODEL_STATES = {
  NOT_INITIALIZED: 'notInitialized',
  INITIALIZED: 'initialized',
  MISSING_FILES: 'missingFiles',
  FAILED: 'failed',
} as const;

export type IModelState = (typeof IMODEL_STATES)[keyof typeof IMODEL_STATES];

/**
 * Default parameter values for the solid-modeling dialogs (meters / radians
 * on the wire — geometry-unit domain, not UI display units). CHAMFER_LENGTH
 * and CHORD_TOLERANCE are pinned by useSolidModeling.test.ts expectations;
 * the rest follow the same magnitude family.
 */
export const SOLID_MODELING_DEFAULTS = {
  CHAMFER_LENGTH: 0.01,
  CHAMFER_DISTANCE: 0.01,
  CHAMFER_ANGLE: 45, // degrees; converted to radians at use sites
  BLEND_RADIUS: 0.1,
  HOLLOW_THICKNESS: 0.01,
  OFFSET_DISTANCE: 0.01,
  CHORD_TOLERANCE: 0.001,
} as const;
