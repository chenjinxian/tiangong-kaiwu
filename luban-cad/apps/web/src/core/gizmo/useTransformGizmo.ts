/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useTransformGizmo — React hook for managing the 3D transform gizmo.
 *
 * Handles gizmo registration, axis picking, drag-to-transform,
 * and callbacks for move, rotate, and scale.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IModelApp,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import { TransformGizmo, type GizmoAxis, type GizmoMode } from './TransformGizmo.js';
export type { GizmoMode, GizmoAxis };

export interface UseTransformGizmoOptions {
  viewport: ScreenViewport | null;
  /** Center of the gizmo in world space */
  center: Point3d;
  /** Current transform mode */
  mode: GizmoMode;
  /** Whether the gizmo should be visible */
  isVisible: boolean;
  /** Callback when a move transform is committed */
  onMove?: (dx: number, dy: number, dz: number) => void;
  /** Callback when a rotate transform is committed */
  onRotate?: (axis: 'x' | 'y' | 'z', angleRadians: number) => void;
  /** Callback when a scale transform is committed */
  onScale?: (sx: number, sy: number, sz: number) => void;
}

export interface UseTransformGizmoResult {
  /** Currently hovered axis */
  hoveredAxis: GizmoAxis | null;
  /** Whether a drag operation is active */
  isDragging: boolean;
  /** Set the active transform mode */
  setMode: (mode: GizmoMode) => void;
}

interface DragState {
  axis: GizmoAxis;
  startScreen: Point3d;
  startWorldOnPlane: Point3d;
  startAxisCoord: number;
}

/** Intersect a ray (defined by near/far world points) with a plane. */
function intersectRayPlane(
  rayOrigin: Point3d,
  rayDir: Vector3d,
  planePoint: Point3d,
  planeNormal: Vector3d
): Point3d | null {
  const denom = rayDir.dotProduct(planeNormal);
  if (Math.abs(denom) < 1e-6) return null;
  const t = Vector3d.createStartEnd(rayOrigin, planePoint).dotProduct(planeNormal) / denom;
  return rayOrigin.clone().plusScaled(rayDir, t);
}

/** Project point p onto line through origin with direction dir. Returns distance from origin. */
function projectPointOnAxis(p: Point3d, origin: Point3d, dir: Vector3d): number {
  const op = Vector3d.createStartEnd(origin, p);
  return op.dotProduct(dir);
}

export function useTransformGizmo(options: UseTransformGizmoOptions): UseTransformGizmoResult {
  const { viewport, center, mode, isVisible, onMove, onRotate, onScale } = options;

  const gizmoRef = useRef<TransformGizmo | null>(null);
  const [hoveredAxis, setHoveredAxis] = useState<GizmoAxis | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const activeModeRef = useRef<GizmoMode>(mode);
  activeModeRef.current = mode;

  // Create/update gizmo decorator
  useEffect(() => {
    if (!isVisible) {
      if (gizmoRef.current) {
        gizmoRef.current.dispose();
        gizmoRef.current = null;
      }
      return;
    }

    if (!gizmoRef.current) {
      gizmoRef.current = new TransformGizmo({ center, activeAxis: hoveredAxis, mode });
      IModelApp.viewManager.addDecorator(gizmoRef.current);
    } else {
      gizmoRef.current.update({ center, activeAxis: hoveredAxis, mode });
    }

    return () => {
      if (gizmoRef.current) {
        gizmoRef.current.dispose();
        gizmoRef.current = null;
      }
    };
  }, [isVisible, center, hoveredAxis, mode]);

  // Mouse event handlers
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!viewport || !gizmoRef.current) return;

    const screenPt = Point3d.create(e.clientX, e.clientY, 0);

    if (dragStateRef.current) {
      // Dragging: compute transform delta
      const drag = dragStateRef.current;
      const axisDir =
        drag.axis === 'x' ? Vector3d.unitX() :
          drag.axis === 'y' ? Vector3d.unitY() :
            Vector3d.unitZ();

      // Determine plane for ray intersection
      // Use plane through center with normal = camera view direction
      const viewZ = viewport.rotation.getRow(2);
      const planeNormal = Vector3d.create(viewZ.x, viewZ.y, viewZ.z);

      // Get ray from screen point
      const near = viewport.viewToWorld(Point3d.create(e.clientX, e.clientY, 0));
      const far = viewport.viewToWorld(Point3d.create(e.clientX, e.clientY, 1));
      const rayDir = Vector3d.createStartEnd(near, far).normalize();
      if (!rayDir) return;

      const hit = intersectRayPlane(near, rayDir, center, planeNormal);
      if (!hit) return;

      const currentAxisCoord = projectPointOnAxis(hit, center, axisDir);
      const delta = currentAxisCoord - drag.startAxisCoord;

      if (activeModeRef.current === 'move' && onMove) {
        const dx = drag.axis === 'x' ? delta : 0;
        const dy = drag.axis === 'y' ? delta : 0;
        const dz = drag.axis === 'z' ? delta : 0;
        onMove(dx, dy, dz);
      } else if (activeModeRef.current === 'scale' && onScale) {
        const scale = 1 + delta; // simple linear scale factor
        const sx = Math.max(0.1, drag.axis === 'x' ? scale : 1);
        const sy = Math.max(0.1, drag.axis === 'y' ? scale : 1);
        const sz = Math.max(0.1, drag.axis === 'z' ? scale : 1);
        onScale(sx, sy, sz);
      } else if (activeModeRef.current === 'rotate' && onRotate) {
        // Rotation: use angle sweep in plane perpendicular to axis
        const toStart = Vector3d.createStartEnd(center, drag.startWorldOnPlane);
        const toCurrent = Vector3d.createStartEnd(center, hit);

        // Reject onto plane perpendicular to axis
        const startScale = toStart.dotProduct(axisDir);
        const currentScale = toCurrent.dotProduct(axisDir);
        const startProj = toStart.plusScaled(axisDir, -startScale);
        const currentProj = toCurrent.plusScaled(axisDir, -currentScale);

        const startLen = startProj.magnitude();
        const currentLen = currentProj.magnitude();
        if (startLen < 1e-6 || currentLen < 1e-6) return;

        // Compute signed angle using cross product
        const dot = startProj.dotProduct(currentProj) / (startLen * currentLen);
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const angleMag = Math.acos(clampedDot);
        const cross = startProj.crossProduct(currentProj);
        const sign = cross.dotProduct(axisDir) >= 0 ? 1 : -1;
        const angle = angleMag * sign;

        onRotate(drag.axis, angle);

        // Update drag start so incremental angles are applied
        drag.startWorldOnPlane = hit.clone();
      }

      // Update starting point for incremental deltas in move/scale
      if (activeModeRef.current !== 'rotate') {
        drag.startAxisCoord = currentAxisCoord;
      }
      return;
    }

    // Hover detection
    const picked = gizmoRef.current.pickAxis(viewport, screenPt, 16);
    setHoveredAxis(picked);
  }, [viewport, center, onMove, onRotate, onScale]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!viewport || !gizmoRef.current || e.button !== 0) return;
    const screenPt = Point3d.create(e.clientX, e.clientY, 0);
    const picked = gizmoRef.current.pickAxis(viewport, screenPt, 16);
    if (!picked) return;

    e.preventDefault();
    e.stopPropagation();

    const axisDir =
      picked === 'x' ? Vector3d.unitX() :
        picked === 'y' ? Vector3d.unitY() :
          Vector3d.unitZ();

    // Get initial hit on view-aligned plane
    const viewZ = viewport.rotation.getRow(2);
    const planeNormal = Vector3d.create(viewZ.x, viewZ.y, viewZ.z);
    const near = viewport.viewToWorld(Point3d.create(e.clientX, e.clientY, 0));
    const far = viewport.viewToWorld(Point3d.create(e.clientX, e.clientY, 1));
    const rayDir = Vector3d.createStartEnd(near, far).normalize();
    if (!rayDir) return;

    const hit = intersectRayPlane(near, rayDir, center, planeNormal);
    if (!hit) return;

    dragStateRef.current = {
      axis: picked,
      startScreen: screenPt,
      startWorldOnPlane: hit.clone(),
      startAxisCoord: projectPointOnAxis(hit, center, axisDir),
    };
    setIsDragging(true);
    setHoveredAxis(picked);
  }, [viewport, center]);

  const handleMouseUp = useCallback(() => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      setIsDragging(false);
    }
  }, []);

  // Attach/detach mouse listeners to the viewport's parent div
  useEffect(() => {
    if (!viewport || !isVisible) return;

    const parent = viewport.parentDiv;
    if (!parent) return;

    parent.addEventListener('mousemove', handleMouseMove);
    parent.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      parent.removeEventListener('mousemove', handleMouseMove);
      parent.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [viewport, isVisible, handleMouseMove, handleMouseDown, handleMouseUp]);

  const setMode = useCallback((m: GizmoMode) => {
    activeModeRef.current = m;
  }, []);

  return { hoveredAxis, isDragging, setMode };
}
