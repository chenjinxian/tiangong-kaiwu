/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Professional ViewCube Component - Autodesk Forge Viewer Style
 *
 * Features:
 * - 3D cube with 6 clickable faces
 * - Corner and edge hotspots for isometric views
 * - Smooth animations and hover effects
 * - Compass ring for orientation
 * - Home button to reset view
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { IModelApp, StandardViewId } from '@itwin/core-frontend';

export interface ViewCubeProps {
  className?: string;
  style?: React.CSSProperties;
}

interface CubeFace {
  id: StandardViewId;
  label: string;
  labelZh: string;
  transform: string;
  bgGradient: string;
  borderColor: string;
}

const CUBE_SIZE = 40;
const CUBE_HALF = CUBE_SIZE / 2;

const CUBE_FACES: CubeFace[] = [
  {
    id: StandardViewId.Front,
    label: 'FRONT',
    labelZh: '前',
    transform: `translateZ(${CUBE_HALF}px)`,
    bgGradient: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
    borderColor: '#dee2e6',
  },
  {
    id: StandardViewId.Back,
    label: 'BACK',
    labelZh: '后',
    transform: `rotateY(180deg) translateZ(${CUBE_HALF}px)`,
    bgGradient: 'linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%)',
    borderColor: '#ced4da',
  },
  {
    id: StandardViewId.Right,
    label: 'RIGHT',
    labelZh: '右',
    transform: `rotateY(90deg) translateZ(${CUBE_HALF}px)`,
    bgGradient: 'linear-gradient(135deg, #f1f3f5 0%, #e9ecef 100%)',
    borderColor: '#dee2e6',
  },
  {
    id: StandardViewId.Left,
    label: 'LEFT',
    labelZh: '左',
    transform: `rotateY(-90deg) translateZ(${CUBE_HALF}px)`,
    bgGradient: 'linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%)',
    borderColor: '#ced4da',
  },
  {
    id: StandardViewId.Top,
    label: 'TOP',
    labelZh: '顶',
    transform: `rotateX(90deg) translateZ(${CUBE_HALF}px)`,
    bgGradient: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    borderColor: '#e9ecef',
  },
  {
    id: StandardViewId.Bottom,
    label: 'BOTTOM',
    labelZh: '底',
    transform: `rotateX(-90deg) translateZ(${CUBE_HALF}px)`,
    bgGradient: 'linear-gradient(135deg, #dee2e6 0%, #ced4da 100%)',
    borderColor: '#adb5bd',
  },
];

interface CornerConfig {
  id: string;
  position: [number, number, number];
  rotation: string;
  viewId: StandardViewId;
}

const CORNERS: CornerConfig[] = [
  { id: 'top-front-right', position: [1, 1, 1], rotation: '-35,45', viewId: StandardViewId.Iso },
  { id: 'top-front-left', position: [-1, 1, 1], rotation: '-35,-45', viewId: StandardViewId.Iso },
  { id: 'top-back-right', position: [1, -1, 1], rotation: '-35,135', viewId: StandardViewId.Iso },
  { id: 'top-back-left', position: [-1, -1, 1], rotation: '-35,-135', viewId: StandardViewId.Iso },
];

/**
 * Professional ViewCube - Autodesk Forge Viewer Style
 */
export const ViewCube: React.FC<ViewCubeProps> = ({ className, style }) => {
  const [rotation, setRotation] = useState({ x: -25, y: 45 });
  const [hoveredFace, setHoveredFace] = useState<StandardViewId | null>(null);
  const [activeFace, setActiveFace] = useState<StandardViewId>(StandardViewId.Iso);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, rotX: 0, rotY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync with current viewport rotation
  useEffect(() => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (!viewport) return;

    const updateRotation = () => {
      const matrix = viewport.view.getRotation();
      // Extract approximate rotation angles from matrix
      const sy = Math.sqrt(matrix.at(0, 0) ** 2 + matrix.at(0, 1) ** 2);
      const x = Math.atan2(-matrix.at(1, 2), matrix.at(2, 2)) * (180 / Math.PI);
      const y = Math.atan2(matrix.at(0, 2), sy) * (180 / Math.PI);
      setRotation({ x: -x, y: y });
    };

    updateRotation();
  }, []);

  const setStandardView = useCallback((viewId: StandardViewId, face?: StandardViewId) => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (!viewport) return;

    // Set standard rotation
    viewport.setStandardRotation(viewId);

    // Enable orthographic (camera off) for orthographic projection
    const view = viewport.view;
    if (view.is3d()) {
      view.turnCameraOff();
    }

    viewport.synchWithView({});

    if (face !== undefined) {
      setActiveFace(face);
      // Update cube rotation to show the face
      switch (face) {
        case StandardViewId.Front:
          setRotation({ x: 0, y: 0 });
          break;
        case StandardViewId.Back:
          setRotation({ x: 0, y: 180 });
          break;
        case StandardViewId.Left:
          setRotation({ x: 0, y: -90 });
          break;
        case StandardViewId.Right:
          setRotation({ x: 0, y: 90 });
          break;
        case StandardViewId.Top:
          setRotation({ x: -90, y: 0 });
          break;
        case StandardViewId.Bottom:
          setRotation({ x: 90, y: 0 });
          break;
        case StandardViewId.Iso:
        case StandardViewId.RightIso:
        case StandardViewId.NotStandard:
          setRotation({ x: -35, y: 45 });
          break;
      }
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX: rotation.x,
      rotY: rotation.y,
    };
    e.preventDefault();
  }, [rotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    setRotation({
      x: dragStartRef.current.rotX - deltaY * 0.5,
      y: dragStartRef.current.rotY + deltaX * 0.5,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleHomeClick = useCallback(() => {
    setStandardView(StandardViewId.Iso, StandardViewId.Iso);
  }, [setStandardView]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '8px',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        backdropFilter: 'blur(10px)',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Compass Label */}
      <div
        style={{
          fontSize: '8px',
          fontWeight: 700,
          color: '#495057',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          textShadow: '0 1px 1px rgba(0,0,0,0.1)',
        }}
      >
        {CUBE_FACES.find((f) => f.id === activeFace)?.labelZh || '前'}
      </div>

      {/* Cube Container */}
      <div
        style={{
          width: `${CUBE_SIZE}px`,
          height: `${CUBE_SIZE}px`,
          perspective: '200px',
          cursor: isDragging ? 'grabbing' : 'grab',
          position: 'relative',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 3D Cube */}
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {CUBE_FACES.map((face) => {
            const isHovered = hoveredFace === face.id;
            const isActive = activeFace === face.id;

            return (
              <div
                key={face.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setStandardView(face.id, face.id);
                }}
                onMouseEnter={() => setHoveredFace(face.id)}
                onMouseLeave={() => setHoveredFace(null)}
                style={{
                  position: 'absolute',
                  width: `${CUBE_SIZE}px`,
                  height: `${CUBE_SIZE}px`,
                  transform: face.transform,
                  background: isActive
                    ? 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)'
                    : isHovered
                      ? 'linear-gradient(135deg, #339af0 0%, #228be6 100%)'
                      : face.bgGradient,
                  border: `2px solid ${isActive ? '#004494' : isHovered ? '#1c7ed6' : face.borderColor}`,
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: isActive
                    ? '0 0 15px rgba(0, 102, 204, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s ease',
                  backfaceVisibility: 'hidden',
                }}
              >
                <span
                  style={{
                    fontSize: '6px',
                    fontWeight: 700,
                    color: isActive || isHovered ? '#fff' : '#495057',
                    textShadow: isActive || isHovered ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                    letterSpacing: '0.3px',
                  }}
                >
                  {face.label}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: isActive || isHovered ? '#fff' : '#212529',
                    marginTop: '1px',
                  }}
                >
                  {face.labelZh}
                </span>
              </div>
            );
          })}

          {/* Corner Hotspots for Isometric Views */}
          {CORNERS.map((corner) => (
            <div
              key={corner.id}
              onClick={(e) => {
                e.stopPropagation();
                const [rx, ry] = corner.rotation.split(',').map(Number);
                setRotation({ x: rx, y: ry });
                setStandardView(StandardViewId.Iso, StandardViewId.Iso);
              }}
              style={{
                position: 'absolute',
                width: '6px',
                height: '6px',
                background: 'rgba(255, 107, 107, 0.9)',
                borderRadius: '50%',
                cursor: 'pointer',
                transform: `translate3d(${corner.position[0] * CUBE_HALF}px, ${-corner.position[1] * CUBE_HALF}px, ${
                  corner.position[2] * CUBE_HALF
                }px)`,
                boxShadow: '0 0 4px rgba(255, 107, 107, 0.6)',
                transition: 'transform 0.2s ease',
              }}
              title="等轴测视图"
            />
          ))}
        </div>

        {/* Compass Ring */}
        <div
          style={{
            position: 'absolute',
            inset: '-6px',
            border: '1px solid rgba(0, 102, 204, 0.3)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        >
          {/* North Indicator */}
          <div
            style={{
              position: 'absolute',
              top: '-4px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '0',
              height: '0',
              borderLeft: '3px solid transparent',
              borderRight: '3px solid transparent',
              borderBottom: '5px solid #0066cc',
            }}
          />
          {/* N Label */}
          <div
            style={{
              position: 'absolute',
              top: '1px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '6px',
              fontWeight: 700,
              color: '#0066cc',
            }}
          >
            N
          </div>
        </div>
      </div>

      {/* Quick View Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          padding: '4px',
          background: 'rgba(248, 249, 250, 0.8)',
          borderRadius: '4px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        {[
          { id: StandardViewId.Iso, label: 'Iso', title: '等轴测' },
          { id: StandardViewId.Top, label: '顶', title: '顶视图' },
          { id: StandardViewId.Front, label: '前', title: '前视图' },
          { id: StandardViewId.Right, label: '右', title: '右视图' },
        ].map((view) => (
          <button
            key={view.id}
            onClick={() => setStandardView(view.id, view.id)}
            title={view.title}
            style={{
              padding: '2px 6px',
              fontSize: '8px',
              fontWeight: 600,
              border: '1px solid #dee2e6',
              borderRadius: '3px',
              background: activeFace === view.id ? '#0066cc' : '#fff',
              color: activeFace === view.id ? '#fff' : '#495057',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: activeFace === view.id ? '0 1px 2px rgba(0,102,204,0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
            }}
            onMouseEnter={(e) => {
              if (activeFace !== view.id) {
                e.currentTarget.style.background = '#e7f5ff';
                e.currentTarget.style.borderColor = '#339af0';
              }
            }}
            onMouseLeave={(e) => {
              if (activeFace !== view.id) {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = '#dee2e6';
              }
            }}
          >
            {view.label}
          </button>
        ))}
      </div>

      {/* Home Button */}
      <button
        onClick={handleHomeClick}
        style={{
          width: '20px',
          height: '20px',
          border: '1px solid #dee2e6',
          borderRadius: '50%',
          background: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#0066cc';
          e.currentTarget.style.borderColor = '#0052a3';
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#fff';
          e.currentTarget.style.borderColor = '#dee2e6';
          e.currentTarget.style.color = '#333';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title="重置视图 (Home)"
      >
        🏠
      </button>
    </div>
  );
};

/**
 * Compact ViewCube for small spaces
 */
export const CompactViewCube: React.FC<ViewCubeProps> = ({ className, style }) => {
  const setStandardView = useCallback((viewId: StandardViewId) => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (!viewport) return;
    viewport.setStandardRotation(viewId);

    // Enable orthographic (camera off) for orthographic projection
    const view = viewport.view;
    if (view.is3d()) {
      view.turnCameraOff();
    }

    viewport.synchWithView({});
  }, []);

  const views = [
    { id: StandardViewId.Iso, icon: '📦', title: '等轴测' },
    { id: StandardViewId.Top, icon: '⬆️', title: '顶视图' },
    { id: StandardViewId.Front, icon: '🔲', title: '前视图' },
    { id: StandardViewId.Right, icon: '▶️', title: '右视图' },
  ];

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        ...style,
      }}
    >
      {views.map((view) => (
        <button
          key={view.id}
          title={view.title}
          onClick={() => setStandardView(view.id)}
          style={{
            width: '32px',
            height: '32px',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#0066cc';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = '#0052a3';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#fff';
            e.currentTarget.style.color = '#333';
            e.currentTarget.style.borderColor = '#dee2e6';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {view.icon}
        </button>
      ))}
    </div>
  );
};

export default ViewCube;
