/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Section Tools Panel Component
 *
 * Provides 6-face sectioning controls:
 * - X, Y, Z axis sectioning
 * - Positive and negative direction for each axis
 * - Section plane position slider
 * - Section state toggle
 */

import React, { useCallback, useEffect, useState } from 'react';
import { IModelApp, Viewport } from '@itwin/core-frontend';
import {
  Vector3d,
  Point3d,
  Range3d,
  ClipVector,
  ClipPrimitive,
  ConvexClipPlaneSet,
  ClipPlane,
} from '@itwin/core-geometry';

export interface SectionToolsPanelProps {
  className?: string;
  style?: React.CSSProperties;
  viewport?: Viewport;
}

interface SectionState {
  enabled: boolean;
  position: number; // 0-100 percentage
}

const SECTION_PLANES = [
  { id: 'xPos', label: 'X+ (右)', axis: 'x', direction: 1, icon: '▶️' },
  { id: 'xNeg', label: 'X- (左)', axis: 'x', direction: -1, icon: '◀️' },
  { id: 'yPos', label: 'Y+ (前)', axis: 'y', direction: 1, icon: '🔼' },
  { id: 'yNeg', label: 'Y- (后)', axis: 'y', direction: -1, icon: '🔽' },
  { id: 'zPos', label: 'Z+ (上)', axis: 'z', direction: 1, icon: '⬆️' },
  { id: 'zNeg', label: 'Z- (下)', axis: 'z', direction: -1, icon: '⬇️' },
] as const;

/**
 * Section Tools Panel Component
 *
 * Controls 6-face clipping of the view.
 */
export const SectionToolsPanel: React.FC<SectionToolsPanelProps> = ({
  className,
  style,
  viewport: propsViewport,
}) => {
  const [viewport, setViewport] = useState<Viewport | undefined>(propsViewport);
  const [sections, setSections] = useState<Record<string, SectionState>>(
    Object.fromEntries(SECTION_PLANES.map((p) => [p.id, { enabled: false, position: 50 }]))
  );
  const [modelRange, setModelRange] = useState<Range3d | null>(null);

  // Get viewport from props or IModelApp
  useEffect(() => {
    if (propsViewport) {
      setViewport(propsViewport);
    } else {
      setViewport(IModelApp.viewManager?.selectedView);
    }
  }, [propsViewport]);

  // Get model range for positioning
  useEffect(() => {
    if (!viewport?.iModel) return;

    const range = viewport.iModel.projectExtents;
    setModelRange(range);
  }, [viewport]);

  /**
   * Apply section clip to viewport
   */
  const applySectionClip = useCallback(() => {
    if (!viewport || !modelRange) return;

    const center = modelRange.center;
    const planes: ClipPlane[] = [];

    // Add enabled section planes
    SECTION_PLANES.forEach((plane) => {
      const state = sections[plane.id];
      if (!state.enabled) return;

      // Calculate position along the axis
      const range = modelRange;
      let pos: number;

      switch (plane.axis) {
        case 'x':
          pos = range.low.x + (range.high.x - range.low.x) * (state.position / 100);
          planes.push(
            ClipPlane.createNormalAndPoint(
              Vector3d.create(plane.direction, 0, 0),
              Point3d.create(pos, center.y, center.z)
            )!
          );
          break;
        case 'y':
          pos = range.low.y + (range.high.y - range.low.y) * (state.position / 100);
          planes.push(
            ClipPlane.createNormalAndPoint(
              Vector3d.create(0, plane.direction, 0),
              Point3d.create(center.x, pos, center.z)
            )!
          );
          break;
        case 'z':
          pos = range.low.z + (range.high.z - range.low.z) * (state.position / 100);
          planes.push(
            ClipPlane.createNormalAndPoint(
              Vector3d.create(0, 0, plane.direction),
              Point3d.create(center.x, center.y, pos)
            )!
          );
          break;
      }
    });

    // Apply or clear clip
    if (planes.length > 0) {
      const clipPlanes = ConvexClipPlaneSet.createPlanes(planes);
      const primitive = ClipPrimitive.createCapture(clipPlanes);
      const clipVector = ClipVector.createCapture([primitive]);
      viewport.view.setViewClip(clipVector);
    } else {
      viewport.view.setViewClip(undefined);
    }

    viewport.invalidateScene();
  }, [viewport, sections, modelRange]);

  // Apply clip when sections change
  useEffect(() => {
    applySectionClip();
  }, [applySectionClip]);

  /**
   * Toggle section plane
   */
  const toggleSection = useCallback((planeId: string, enabled: boolean) => {
    setSections((prev) => ({
      ...prev,
      [planeId]: { ...prev[planeId], enabled },
    }));
  }, []);

  /**
   * Update section position
   */
  const updatePosition = useCallback((planeId: string, position: number) => {
    setSections((prev) => ({
      ...prev,
      [planeId]: { ...prev[planeId], position },
    }));
  }, []);

  /**
   * Clear all sections
   */
  const clearAllSections = useCallback(() => {
    setSections(
      Object.fromEntries(SECTION_PLANES.map((p) => [p.id, { enabled: false, position: 50 }]))
    );
  }, []);

  /**
   * Enable all sections
   */
  const enableAllSections = useCallback(() => {
    setSections(
      Object.fromEntries(SECTION_PLANES.map((p) => [p.id, { enabled: true, position: 50 }]))
    );
  }, []);

  // Check if 3D view
  if (!viewport?.view?.is3d()) {
    return (
      <div
        className={className}
        style={{
          padding: '12px',
          backgroundColor: 'rgba(240, 240, 240, 0.95)',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          minWidth: '200px',
          ...style,
        }}
      >
        <div style={{ color: '#666', fontSize: '14px' }}>剖切工具仅在3D视图中可用</div>
      </div>
    );
  }

  const enabledCount = Object.values(sections).filter((s) => s.enabled).length;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '500px',
        backgroundColor: 'rgba(240, 240, 240, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        minWidth: '260px',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>剖切工具 (Section)</span>
        <span style={{ fontSize: '12px', color: '#666' }}>{enabledCount}/6</span>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #eee',
        }}
      >
        <button
          onClick={enableAllSections}
          style={{
            flex: 1,
            padding: '6px 10px',
            fontSize: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          全部启用
        </button>
        <button
          onClick={clearAllSections}
          style={{
            flex: 1,
            padding: '6px 10px',
            fontSize: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          全部清除
        </button>
      </div>

      {/* Section Planes */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {SECTION_PLANES.map((plane) => {
            const state = sections[plane.id];
            return (
              <div
                key={plane.id}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: state.enabled ? 'rgba(0, 102, 204, 0.08)' : '#fff',
                  border: `1px solid ${state.enabled ? '#0066cc' : '#e0e0e0'}`,
                }}
              >
                {/* Header with checkbox */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    marginBottom: state.enabled ? '8px' : '0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(e) => toggleSection(plane.id, e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ fontSize: '16px', marginRight: '6px' }}>{plane.icon}</span>
                  <span
                    style={{
                      fontWeight: state.enabled ? 'bold' : 'normal',
                      fontSize: '13px',
                      flex: 1,
                    }}
                  >
                    {plane.label}
                  </span>
                </label>

                {/* Position slider */}
                {state.enabled && (
                  <div style={{ paddingLeft: '24px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#666', minWidth: '30px' }}>位置</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={state.position}
                        onChange={(e) => updatePosition(plane.id, parseInt(e.target.value))}
                        style={{
                          flex: 1,
                          cursor: 'pointer',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#666',
                          minWidth: '35px',
                          textAlign: 'right',
                        }}
                      >
                        {state.position}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SectionToolsPanel;
