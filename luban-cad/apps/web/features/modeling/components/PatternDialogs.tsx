/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';
import { Vector3d, Point3d } from '@itwin/core-geometry';

interface LinearPatternDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LinearPatternDialog: React.FC<LinearPatternDialogProps> = ({ isOpen, onClose }) => {
  const [count, setCount] = useState(3);
  const [spacing, setSpacing] = useState(20);
  const [dirX, setDirX] = useState(1);
  const [dirY, setDirY] = useState(0);
  const [dirZ, setDirZ] = useState(0);

  if (!isOpen) return null;

  const handleApply = async () => {
    const direction = Vector3d.create(dirX, dirY, dirZ);
    onClose();

    // Run the tool first
    const result = await IModelApp.tools.run('LinearPattern');
    if (result) {
      // Delay to ensure tool is fully initialized, then set parameters
      setTimeout(() => {
        const activeTool = IModelApp.toolAdmin.currentTool as any;
        if (activeTool && activeTool.setParameters) {
          activeTool.setParameters(count, spacing, direction);
        }
      }, 100);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="modal-content" style={{
        backgroundColor: '#2d2d2d',
        padding: '20px',
        borderRadius: '8px',
        minWidth: '300px',
        color: '#fff',
      }}>
        <h3 style={{ marginTop: 0 }}>线性阵列 (Linear Pattern)</h3>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>数量 (Count):</label>
          <input
            type="number"
            min={2}
            value={count}
            onChange={(e) => setCount(Math.max(2, parseInt(e.target.value) || 2))}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>间距 (Spacing):</label>
          <input
            type="number"
            min={0.001}
            step={0.1}
            value={spacing}
            onChange={(e) => setSpacing(Math.max(0.001, parseFloat(e.target.value) || 0.001))}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>方向 (Direction):</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="number"
              placeholder="X"
              value={dirX}
              onChange={(e) => setDirX(parseFloat(e.target.value) || 0)}
              style={{
                width: '60px',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #555',
                color: '#fff',
                borderRadius: '4px',
              }}
            />
            <input
              type="number"
              placeholder="Y"
              value={dirY}
              onChange={(e) => setDirY(parseFloat(e.target.value) || 0)}
              style={{
                width: '60px',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #555',
                color: '#fff',
                borderRadius: '4px',
              }}
            />
            <input
              type="number"
              placeholder="Z"
              value={dirZ}
              onChange={(e) => setDirZ(parseFloat(e.target.value) || 0)}
              style={{
                width: '60px',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #555',
                color: '#fff',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#555',
              border: 'none',
              color: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0066cc',
              border: 'none',
              color: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

interface CircularPatternDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CircularPatternDialog: React.FC<CircularPatternDialogProps> = ({ isOpen, onClose }) => {
  const [count, setCount] = useState(4);
  const [totalAngle, setTotalAngle] = useState(360);
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [centerZ, setCenterZ] = useState(0);

  if (!isOpen) return null;

  const handleApply = async () => {
    const centerPoint = Point3d.create(centerX, centerY, centerZ);
    onClose();

    // Run the tool first
    const result = await IModelApp.tools.run('CircularPattern');
    if (result) {
      // Delay to ensure tool is fully initialized, then set parameters
      setTimeout(() => {
        const activeTool = IModelApp.toolAdmin.currentTool as any;
        if (activeTool && activeTool.setParameters) {
          activeTool.setParameters(count, totalAngle, centerPoint);
        }
      }, 100);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="modal-content" style={{
        backgroundColor: '#2d2d2d',
        padding: '20px',
        borderRadius: '8px',
        minWidth: '300px',
        color: '#fff',
      }}>
        <h3 style={{ marginTop: 0 }}>圆形阵列 (Circular Pattern)</h3>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>数量 (Count):</label>
          <input
            type="number"
            min={2}
            value={count}
            onChange={(e) => setCount(Math.max(2, parseInt(e.target.value) || 2))}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>总角度 (Total Angle):</label>
          <input
            type="number"
            min={1}
            max={360}
            value={totalAngle}
            onChange={(e) => setTotalAngle(Math.max(1, Math.min(360, parseInt(e.target.value) || 360)))}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>中心点 (Center):</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="number"
              placeholder="X"
              value={centerX}
              onChange={(e) => setCenterX(parseFloat(e.target.value) || 0)}
              style={{
                width: '60px',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #555',
                color: '#fff',
                borderRadius: '4px',
              }}
            />
            <input
              type="number"
              placeholder="Y"
              value={centerY}
              onChange={(e) => setCenterY(parseFloat(e.target.value) || 0)}
              style={{
                width: '60px',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #555',
                color: '#fff',
                borderRadius: '4px',
              }}
            />
            <input
              type="number"
              placeholder="Z"
              value={centerZ}
              onChange={(e) => setCenterZ(parseFloat(e.target.value) || 0)}
              style={{
                width: '60px',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #555',
                color: '#fff',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#555',
              border: 'none',
              color: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0066cc',
              border: 'none',
              color: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
