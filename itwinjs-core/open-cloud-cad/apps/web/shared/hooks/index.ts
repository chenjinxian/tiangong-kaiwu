/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared Hooks
 *
 * Note: Feature-specific hooks are now located in their respective features/ directories.
 * This file only exports truly shared/generic hooks.
 */

// Performance Monitoring
export {
  usePerformanceMonitor,
  useOperationTimer,
  withPerformanceMonitoring,
} from './usePerformanceMonitor.js';
