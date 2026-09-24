/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback, useEffect } from 'react';
import {
  Button,
  IconButton,
  Text,
  Badge,
  Divider,
} from '@itwin/itwinui-react';
import {
  SvgChevronLeft,
  SvgCheckmark,
  SvgDelete,
} from '@itwin/itwinui-icons-react';
import { IModelApp } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import {
  HorizontalConstraintTool,
  VerticalConstraintTool,
  ParallelConstraintTool,
  PerpendicularConstraintTool,
  TangentConstraintTool,
  CoincidentConstraintTool,
  EqualConstraintTool,
  FixConstraintTool,
  ConcentricConstraintTool,
  SymmetricConstraintTool,
  DistanceDimensionTool,
  AngleDimensionTool,
  RadiusDimensionTool,
  DiameterDimensionTool,
  SketchConstraintEvents,
  SketchDimensionEvents,
  type SketchDimension,
} from '../tools';
import './SketchPanel.css';

interface SketchPanelProps {
  isActive: boolean;
  onExit: () => void;
}

interface SketchElement {
  id: string;
  type: 'line' | 'arc' | 'circle' | 'rectangle';
  name: string;
  constraints: string[];
}

const constraintToolMap: Record<string, new () => unknown> = {
  horizontal: HorizontalConstraintTool,
  vertical: VerticalConstraintTool,
  parallel: ParallelConstraintTool,
  perpendicular: PerpendicularConstraintTool,
  tangent: TangentConstraintTool,
  coincident: CoincidentConstraintTool,
  equal: EqualConstraintTool,
  fix: FixConstraintTool,
  concentric: ConcentricConstraintTool,
  symmetric: SymmetricConstraintTool,
};

const dimensionToolMap: Record<string, new () => unknown> = {
  distance: DistanceDimensionTool,
  angle: AngleDimensionTool,
  radius: RadiusDimensionTool,
  diameter: DiameterDimensionTool,
};

/**
 * Sketch Panel - Shows and manages sketch elements and constraints
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SketchPanel: React.FC<SketchPanelProps> = ({ isActive, onExit }) => {
  const [activeTab, setActiveTab] = useState<'elements' | 'constraints' | 'dimensions'>('elements');
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  // Mock sketch elements - in real implementation, this would come from the sketch state
  const [elements, setElements] = useState<SketchElement[]>([
    { id: '1', type: 'line', name: 'Line 1', constraints: ['Horizontal'] },
    { id: '2', type: 'circle', name: 'Circle 1', constraints: [] },
    { id: '3', type: 'arc', name: 'Arc 1', constraints: ['Tangent'] },
  ]);

  const [dimensions, setDimensions] = useState<SketchDimension[]>([]);
  const [activeConstraint, setActiveConstraint] = useState<string | null>(null);
  const [activeDimension, setActiveDimension] = useState<string | null>(null);

  // Listen for constraint and dimension events
  useEffect(() => {
    const unsubscribeConstraint = SketchConstraintEvents.on('constraintAdded', (data) => {
      // Update elements with new constraints
      setElements((prev) =>
        prev.map((el) =>
          data.elementIds.includes(el.id)
            ? { ...el, constraints: [...el.constraints, data.type] }
            : el
        )
      );
      setActiveConstraint(null);
    });

    const unsubscribeDimension = SketchDimensionEvents.on('dimensionAdded', (data) => {
      setDimensions((prev) => [
        ...prev,
        {
          id: data.dimensionId,
          type: data.type,
          elementIds: data.elementIds,
          value: data.value,
          position: { x: 0, y: 0, z: 0 } as Point3d,
        },
      ]);
      setActiveDimension(null);
    });

    return () => {
      unsubscribeConstraint();
      unsubscribeDimension();
    };
  }, []);

  const handleExitSketch = useCallback(() => {
    // Exit sketch mode
    IModelApp.toolAdmin.startDefaultTool();
    onExit();
  }, [onExit]);

  const handleAddConstraint = useCallback(async (type: string) => {
    console.log(`[SketchPanel] Adding constraint: ${type}`);
    const ToolClass = constraintToolMap[type];
    if (ToolClass) {
      setActiveConstraint(type);
      const tool = new ToolClass() as { run(): Promise<boolean> };
      const started = await tool.run();
      if (!started) {
        setActiveConstraint(null);
      }
    }
  }, []);

  const handleAddDimension = useCallback(async (type: string) => {
    console.log(`[SketchPanel] Adding dimension: ${type}`);
    const ToolClass = dimensionToolMap[type];
    if (ToolClass) {
      setActiveDimension(type);
      const tool = new ToolClass() as { run(): Promise<boolean> };
      const started = await tool.run();
      if (!started) {
        setActiveDimension(null);
      }
    }
  }, []);

  if (!isActive) return null;

  return (
    <div className="sketch-panel">
      {/* Header */}
      <div className="sketch-panel-header">
        <div className="sketch-header-left">
          <IconButton
            size="small"
            styleType="borderless"
            onClick={handleExitSketch}
            label="退出草图"
          >
            <SvgChevronLeft />
          </IconButton>
          <Text variant="title">草图编辑</Text>
          <Badge backgroundColor="positive">编辑中</Badge>
        </div>
        <Button
          size="small"
          styleType="high-visibility"
          startIcon={<SvgCheckmark />}
          onClick={handleExitSketch}
        >
          完成
        </Button>
      </div>

      <Divider />

      {/* Tabs */}
      <div className="sketch-tabs">
        <button
          className={`sketch-tab ${activeTab === 'elements' ? 'active' : ''}`}
          onClick={() => setActiveTab('elements')}
        >
          元素
        </button>
        <button
          className={`sketch-tab ${activeTab === 'constraints' ? 'active' : ''}`}
          onClick={() => setActiveTab('constraints')}
        >
          约束
        </button>
        <button
          className={`sketch-tab ${activeTab === 'dimensions' ? 'active' : ''}`}
          onClick={() => setActiveTab('dimensions')}
        >
          尺寸
        </button>
      </div>

      {/* Content */}
      <div className="sketch-panel-content">
        {activeTab === 'elements' && (
          <div className="sketch-elements">
            {elements.length === 0 ? (
              <div className="empty-state">
                <Text variant="small" className="empty-text">
                  暂无草图元素
                </Text>
                <Text variant="small" className="empty-hint">
                  使用工具栏创建草图元素
                </Text>
              </div>
            ) : (
              <div className="element-list">
                {elements.map((element) => (
                  <div
                    key={element.id}
                    className={`element-item ${selectedElement === element.id ? 'selected' : ''}`}
                    onClick={() => setSelectedElement(element.id)}
                  >
                    <div className="element-icon">
                      {element.type === 'line' && '—'}
                      {element.type === 'circle' && '○'}
                      {element.type === 'arc' && '⌒'}
                      {element.type === 'rectangle' && '▭'}
                    </div>
                    <div className="element-info">
                      <Text variant="body" className="element-name">
                        {element.name}
                      </Text>
                      {element.constraints.length > 0 && (
                        <div className="element-constraints">
                          {element.constraints.map((c, i) => (
                            <Badge key={i} backgroundColor="informational">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <IconButton
                      size="small"
                      styleType="borderless"
                      label="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        setElements(prev => prev.filter(el => el.id !== element.id));
                        if (selectedElement === element.id) {
                          setSelectedElement(null);
                        }
                      }}
                    >
                      <SvgDelete />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'constraints' && (
          <div className="sketch-constraints">
            <Text variant="small" className="section-title">
              几何约束
            </Text>
            <div className="constraint-grid">
              <ConstraintButton
                icon="∥"
                label="平行"
                active={activeConstraint === 'parallel'}
                onClick={() => handleAddConstraint('parallel')}
              />
              <ConstraintButton
                icon="⊥"
                label="垂直"
                active={activeConstraint === 'perpendicular'}
                onClick={() => handleAddConstraint('perpendicular')}
              />
              <ConstraintButton
                icon="⌇"
                label="相切"
                active={activeConstraint === 'tangent'}
                onClick={() => handleAddConstraint('tangent')}
              />
              <ConstraintButton
                icon="⌾"
                label="同心"
                active={activeConstraint === 'concentric'}
                onClick={() => handleAddConstraint('concentric')}
              />
              <ConstraintButton
                icon="∿"
                label="相等"
                active={activeConstraint === 'equal'}
                onClick={() => handleAddConstraint('equal')}
              />
              <ConstraintButton
                icon="⌓"
                label="固定"
                active={activeConstraint === 'fix'}
                onClick={() => handleAddConstraint('fix')}
              />
            </div>

            <Divider />

            <Text variant="small" className="section-title">
              对齐约束
            </Text>
            <div className="constraint-grid">
              <ConstraintButton
                icon="—"
                label="水平"
                active={activeConstraint === 'horizontal'}
                onClick={() => handleAddConstraint('horizontal')}
              />
              <ConstraintButton
                icon="|"
                label="垂直"
                active={activeConstraint === 'vertical'}
                onClick={() => handleAddConstraint('vertical')}
              />
              <ConstraintButton
                icon="⌄"
                label="重合"
                active={activeConstraint === 'coincident'}
                onClick={() => handleAddConstraint('coincident')}
              />
              <ConstraintButton
                icon="↔"
                label="对称"
                active={activeConstraint === 'symmetric'}
                onClick={() => handleAddConstraint('symmetric')}
              />
            </div>
          </div>
        )}

        {activeTab === 'dimensions' && (
          <div className="sketch-dimensions">
            <Text variant="small" className="section-title">
              尺寸标注
            </Text>
            <div className="dimension-list">
              <DimensionButton
                icon="📏"
                label="距离"
                active={activeDimension === 'distance'}
                onClick={() => handleAddDimension('distance')}
              />
              <DimensionButton
                icon="∠"
                label="角度"
                active={activeDimension === 'angle'}
                onClick={() => handleAddDimension('angle')}
              />
              <DimensionButton
                icon="⌂"
                label="半径"
                active={activeDimension === 'radius'}
                onClick={() => handleAddDimension('radius')}
              />
              <DimensionButton
                icon="⌂"
                label="直径"
                active={activeDimension === 'diameter'}
                onClick={() => handleAddDimension('diameter')}
              />
            </div>

            <Divider />

            <Text variant="small" className="section-title">
              现有尺寸 ({dimensions.length})
            </Text>
            <div className="dimension-list-existing">
              {dimensions.length === 0 ? (
                <Text variant="small" className="empty-hint">
                  暂无尺寸标注
                </Text>
              ) : (
                dimensions.map((dim) => (
                  <div key={dim.id} className="dimension-item">
                    <span className="dimension-type">
                      {dim.type === 'distance' && '📏'}
                      {dim.type === 'angle' && '∠'}
                      {dim.type === 'radius' && '⌂'}
                      {dim.type === 'diameter' && '⌂'}
                    </span>
                    <span className="dimension-value">
                      {dim.type === 'angle'
                        ? `${dim.value.toFixed(1)}°`
                        : `${dim.value.toFixed(2)} mm`}
                    </span>
                    <IconButton
                      size="small"
                      styleType="borderless"
                      label="删除"
                      onClick={() => {
                        setDimensions((prev) => prev.filter((d) => d.id !== dim.id));
                      }}
                    >
                      <SvgDelete />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ConstraintButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const ConstraintButton: React.FC<ConstraintButtonProps> = ({ icon, label, active, onClick }) => (
  <button className={`constraint-btn ${active ? 'active' : ''}`} onClick={onClick}>
    <span className="constraint-icon">{icon}</span>
    <span className="constraint-label">{label}</span>
  </button>
);

interface DimensionButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const DimensionButton: React.FC<DimensionButtonProps> = ({ icon, label, active, onClick }) => (
  <button className={`dimension-btn ${active ? 'active' : ''}`} onClick={onClick}>
    <span className="dimension-icon">{icon}</span>
    <span className="dimension-label">{label}</span>
  </button>
);
