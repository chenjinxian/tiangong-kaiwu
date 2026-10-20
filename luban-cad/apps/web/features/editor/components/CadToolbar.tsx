/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp } from '@itwin/core-frontend';
import { ButtonGroup, Divider, IconButton, Text, Tooltip } from '@itwin/itwinui-react';
import { CircularPatternDialog, LinearPatternDialog } from '../../../features/modeling/components/PatternDialogs.js';
import './CadToolbar.css';

interface CadToolbarProps {
  /** Whether edit mode is active with a live briefcase connection */
  isEditMode: boolean;
  /** Whether editing scope is ready (required for tools to work) */
  isReady?: boolean;
  /** Callback when entering sketch mode */
  onEnterSketchMode?: () => void;
  /** Whether currently in sketch mode */
  isSketchMode?: boolean;
}

interface ToolDef {
  /** Exact toolId string registered by EditTools.initialize() — passed to IModelApp.tools.run() */
  id: string;
  /** i18n key in the `editor` namespace (`cadToolbar.tools.*`) — label + tooltip */
  labelKey: string;
  /** Icon component */
  icon: React.ReactNode;
}

// Custom SVG Icons for CAD tools - designed to be visually descriptive with outline style
const SketchPlaneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="2 2" />
    <path d="M3 12h18" strokeWidth="1.5" />
    <path d="M12 3v18" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="1.5" fill="none" />
  </svg>
);

const EditSketchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 4v16M4 12h16" strokeDasharray="2 2" />
    <path d="M17 3l4 4-10 10-4 1 1-4 9-9z" fill="none" />
    <circle cx="17" cy="7" r="1.5" fill="none" />
  </svg>
);

const LineIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="4" y1="20" x2="20" y2="4" />
    <circle cx="4" cy="20" r="1.5" fill="none" />
    <circle cx="20" cy="4" r="1.5" fill="none" />
  </svg>
);

const ArcIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 20 Q12 4 20 20" />
    <circle cx="4" cy="20" r="1.5" fill="none" />
    <circle cx="20" cy="20" r="1.5" fill="none" />
    <circle cx="12" cy="10" r="1.5" fill="none" />
  </svg>
);

const CircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="4" x2="12" y2="12" />
    <circle cx="12" cy="12" r="1.5" fill="none" />
  </svg>
);

const EllipseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <ellipse cx="12" cy="12" rx="9" ry="5" />
    <line x1="12" y1="7" x2="12" y2="12" />
    <circle cx="12" cy="12" r="1.5" fill="none" />
  </svg>
);

const RectangleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="6" width="16" height="12" rx="1" />
    <circle cx="4" cy="6" r="1.5" fill="none" />
    <circle cx="20" cy="18" r="1.5" fill="none" />
  </svg>
);

const SplineIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 18 C6 8 10 6 12 12 S18 18 20 8" />
    <circle cx="4" cy="18" r="1.5" fill="none" />
    <circle cx="12" cy="12" r="1.5" fill="none" />
    <circle cx="20" cy="8" r="1.5" fill="none" />
  </svg>
);

const SphereIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="8" />
    <ellipse cx="12" cy="12" rx="8" ry="3" />
    <ellipse cx="12" cy="12" rx="3" ry="8" transform="rotate(30 12 12)" />
  </svg>
);

const CylinderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <ellipse cx="12" cy="5" rx="7" ry="3" />
    <path d="M5 5v14a7 3 0 0 0 14 0V5" />
    <ellipse cx="12" cy="19" rx="7" ry="3" strokeDasharray="2 2" />
  </svg>
);

const BoxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" />
    <path d="M4 8l8 4 8-4" />
    <line x1="12" y1="12" x2="12" y2="20" />
    <line x1="4" y1="8" x2="4" y2="16" strokeDasharray="2 2" />
    <line x1="20" y1="8" x2="20" y2="16" strokeDasharray="2 2" />
  </svg>
);

const MoveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="8" y="8" width="8" height="8" rx="1" />
    <path d="M8 4v4M16 4v4M8 20v-4M16 20v-4M4 8h4M4 16h4M20 8h-4M20 16h-4" />
    <circle cx="12" cy="12" r="1.5" fill="none" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="6" y="6" width="12" height="12" rx="1" />
    <rect x="10" y="10" width="8" height="8" rx="1" strokeDasharray="2 2" />
    <path d="M10 10V6a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-4" />
  </svg>
);

const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 6h16M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
    <path d="M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const RotateIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 4a8 8 0 1 1-6.2 13.2" />
    <path d="M12 4v4l3-2" />
    <circle cx="12" cy="12" r="3" fill="none" />
    <circle cx="12" cy="12" r="1" fill="none" />
  </svg>
);

const UniteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="12" r="5" />
    <circle cx="15" cy="12" r="5" />
    <path d="M12 7v10" strokeDasharray="2 2" />
    <path d="M12 9v6" strokeWidth="2" />
    <path d="M9 12h6" strokeWidth="2" />
  </svg>
);

const SubtractIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="12" r="5" />
    <circle cx="15" cy="12" r="5" strokeDasharray="2 2" />
    <line x1="5" y1="12" x2="13" y2="12" strokeWidth="2" />
  </svg>
);

const IntersectIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="12" r="5" />
    <circle cx="15" cy="12" r="5" />
    <path d="M12 7v10" strokeWidth="1.5" />
    <ellipse cx="12" cy="12" rx="3" ry="5" />
  </svg>
);

const FilletIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 20V10a6 6 0 0 1 6-6h10" />
    <path d="M4 20h10a6 6 0 0 0 6-6V4" strokeDasharray="2 2" />
    <path d="M10 4a6 6 0 0 0-6 6v0" strokeDasharray="2 2" opacity="0.6" />
  </svg>
);

const ChamferIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 20V10h10V4" />
    <path d="M4 20h10a6 6 0 0 0 6-6V4" strokeDasharray="2 2" />
    <path d="M4 10l10-6" strokeDasharray="2 2" />
  </svg>
);

const ShellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
    <path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3" />
  </svg>
);

const OffsetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <rect x="6" y="6" width="12" height="12" rx="1" strokeDasharray="2 2" />
    <path d="M6 6l-3-3M18 6l3-3M6 18l-3 3M18 18l3 3" />
  </svg>
);

const SweepIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="8" height="6" rx="1" />
    <rect x="4" y="14" width="8" height="6" rx="1" />
    <path d="M8 10v4" strokeDasharray="2 2" />
    <path d="M14 7l4 4-4 4" />
    <path d="M14 17l4 4" />
  </svg>
);

const DraftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 20L8 6l12-2" />
    <path d="M4 20h16a4 4 0 0 0 4-4V6" strokeDasharray="2 2" />
    <path d="M8 6l12-2" strokeDasharray="2 2" />
    <path d="M12 7l-2 8" opacity="0.5" />
  </svg>
);

const HoleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="3" fill="none" strokeWidth="1.5" />
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
  </svg>
);

const MirrorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
    <rect x="4" y="8" width="6" height="8" rx="1" />
    <rect x="14" y="8" width="6" height="8" rx="1" />
    <path d="M10 12h4" />
  </svg>
);

const LinearPatternIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="4" height="4" rx="1" />
    <rect x="10" y="3" width="4" height="4" rx="1" />
    <rect x="17" y="3" width="4" height="4" rx="1" />
    <rect x="3" y="10" width="4" height="4" rx="1" />
    <rect x="10" y="10" width="4" height="4" rx="1" />
    <rect x="17" y="10" width="4" height="4" rx="1" />
    <rect x="3" y="17" width="4" height="4" rx="1" />
    <rect x="10" y="17" width="4" height="4" rx="1" />
    <rect x="17" y="17" width="4" height="4" rx="1" />
  </svg>
);

const CircularPatternIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="18" cy="8" r="1.5" />
    <circle cx="18" cy="16" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
    <circle cx="6" cy="16" r="1.5" />
    <circle cx="6" cy="8" r="1.5" />
    <circle cx="12" cy="12" r="7" strokeDasharray="2 2" opacity="0.5" />
  </svg>
);

// Tool definitions with descriptive icons（文案全部走 editor ns，zh 保留「中文 (English)」
// 形态——demo-flow/modeling-tools spec 以该文案为精确锚点）
const SKETCH_TOOLS: ToolDef[] = [
  { id: 'SetSketchPlane', labelKey: 'cadToolbar.tools.setSketchPlane', icon: <SketchPlaneIcon /> },
  { id: 'CreateLineString', labelKey: 'cadToolbar.tools.line', icon: <LineIcon /> },
  { id: 'CreateArc', labelKey: 'cadToolbar.tools.arc', icon: <ArcIcon /> },
  { id: 'CreateCircle', labelKey: 'cadToolbar.tools.circle', icon: <CircleIcon /> },
  { id: 'CreateEllipse', labelKey: 'cadToolbar.tools.ellipse', icon: <EllipseIcon /> },
  { id: 'CreateRectangle', labelKey: 'cadToolbar.tools.rectangle', icon: <RectangleIcon /> },
  { id: 'CreateBCurve', labelKey: 'cadToolbar.tools.bSpline', icon: <SplineIcon /> },
];

const SOLID_TOOLS: ToolDef[] = [
  { id: 'CreateSphere', labelKey: 'cadToolbar.tools.sphere', icon: <SphereIcon /> },
  { id: 'CreateCylinder', labelKey: 'cadToolbar.tools.cylinder', icon: <CylinderIcon /> },
  { id: 'CreateBox', labelKey: 'cadToolbar.tools.box', icon: <BoxIcon /> },
];

const BOOLEAN_TOOLS: ToolDef[] = [
  { id: 'UniteSolids', labelKey: 'cadToolbar.tools.unite', icon: <UniteIcon /> },
  { id: 'SubtractSolids', labelKey: 'cadToolbar.tools.subtract', icon: <SubtractIcon /> },
  { id: 'IntersectSolids', labelKey: 'cadToolbar.tools.intersect', icon: <IntersectIcon /> },
];

const EDGE_TOOLS: ToolDef[] = [
  { id: 'RoundEdges', labelKey: 'cadToolbar.tools.fillet', icon: <FilletIcon /> },
  { id: 'ChamferEdges', labelKey: 'cadToolbar.tools.chamfer', icon: <ChamferIcon /> },
];

const FACE_TOOLS: ToolDef[] = [
  { id: 'HollowFaces', labelKey: 'cadToolbar.tools.shell', icon: <ShellIcon /> },
  { id: 'OffsetFaces', labelKey: 'cadToolbar.tools.offsetFace', icon: <OffsetIcon /> },
  { id: 'SweepFaces', labelKey: 'cadToolbar.tools.sweepFace', icon: <SweepIcon /> },
  { id: 'DraftFaces', labelKey: 'cadToolbar.tools.draft', icon: <DraftIcon /> },
];

const TRANSFORM_TOOLS: ToolDef[] = [
  { id: 'MoveElements', labelKey: 'cadToolbar.tools.move', icon: <MoveIcon /> },
  { id: 'RotateElements', labelKey: 'cadToolbar.tools.rotate', icon: <RotateIcon /> },
  { id: 'CopyElements', labelKey: 'cadToolbar.tools.copy', icon: <CopyIcon /> },
  { id: 'DeleteElements', labelKey: 'cadToolbar.tools.delete', icon: <DeleteIcon /> },
];

const ADVANCED_TOOLS: ToolDef[] = [
  { id: 'CreateHole', labelKey: 'cadToolbar.tools.hole', icon: <HoleIcon /> },
  { id: 'MirrorElements', labelKey: 'cadToolbar.tools.mirror', icon: <MirrorIcon /> },
  { id: 'LinearPattern', labelKey: 'cadToolbar.tools.linearPattern', icon: <LinearPatternIcon /> },
  { id: 'CircularPattern', labelKey: 'cadToolbar.tools.circularPattern', icon: <CircularPatternIcon /> },
];

/**
 * Horizontal CAD toolbar for top placement (Onshape/FreeCAD style).
 * Groups tools by category: Sketch, Solid, Transform, Boolean, Edge, Face.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CadToolbar: React.FC<CadToolbarProps> = React.memo(({ isEditMode, isReady, onEnterSketchMode, isSketchMode }) => {
  const { t } = useTranslation('editor');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [showLinearPatternDialog, setShowLinearPatternDialog] = useState(false);
  const [showCircularPatternDialog, setShowCircularPatternDialog] = useState(false);

  if (!isEditMode) return null;

  const handleToolClick = async (toolId: string): Promise<void> => {
    if (!isReady) {
      console.warn('[CadToolbar] Editor not ready yet, please wait...');
      return;
    }

    // Handle pattern tools with dialogs
    if (toolId === 'LinearPattern') {
      setShowLinearPatternDialog(true);
      return;
    }
    if (toolId === 'CircularPattern') {
      setShowCircularPatternDialog(true);
      return;
    }

    setActiveTool(toolId);

    try {
      const result = await IModelApp.tools.run(toolId);
      if (!result) {
        console.warn(`[CadToolbar] Tool ${toolId} returned false - tool failed to start`);
      }
    } catch (err) {
      console.error(`[CadToolbar] Tool ${toolId} failed with error:`, err);
    }
  };

  return (
    <div className="cad-toolbar-horizontal">
      {/* Sketch Tools */}
      <div className="cad-toolbar-group">
        <Text variant="small" className="cad-toolbar-label">{t('cadToolbar.categories.sketch')}</Text>
        <ButtonGroup className="cad-toolbar-buttons">
          {SKETCH_TOOLS.map((tool) => (
            <Tooltip key={tool.id} content={t(tool.labelKey)} placement="bottom">
              <IconButton
                size="small"
                styleType={activeTool === tool.id ? 'cta' : 'borderless'}
                onClick={async () => handleToolClick(tool.id)}
                label={t(tool.labelKey)}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon">{tool.icon}</span>
              </IconButton>
            </Tooltip>
          ))}
          {onEnterSketchMode && (
            <Tooltip content={t('cadToolbar.editSketchTooltip')} placement="bottom">
              <IconButton
                size="small"
                styleType={isSketchMode ? 'cta' : 'borderless'}
                onClick={onEnterSketchMode}
                label={t('cadToolbar.editSketch')}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon"><EditSketchIcon /></span>
              </IconButton>
            </Tooltip>
          )}
        </ButtonGroup>
      </div>

      <Divider orientation="vertical" className="cad-toolbar-divider" />

      {/* Solid Tools */}
      <div className="cad-toolbar-group">
        <Text variant="small" className="cad-toolbar-label">{t('cadToolbar.categories.solid')}</Text>
        <ButtonGroup className="cad-toolbar-buttons">
          {SOLID_TOOLS.map((tool) => (
            <Tooltip key={tool.id} content={t(tool.labelKey)} placement="bottom">
              <IconButton
                size="small"
                styleType={activeTool === tool.id ? 'cta' : 'borderless'}
                onClick={async () => handleToolClick(tool.id)}
                label={t(tool.labelKey)}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon">{tool.icon}</span>
              </IconButton>
            </Tooltip>
          ))}
        </ButtonGroup>
      </div>

      <Divider orientation="vertical" className="cad-toolbar-divider" />

      {/* Transform Tools */}
      <div className="cad-toolbar-group">
        <Text variant="small" className="cad-toolbar-label">{t('cadToolbar.categories.transform')}</Text>
        <ButtonGroup className="cad-toolbar-buttons">
          {TRANSFORM_TOOLS.map((tool) => (
            <Tooltip key={tool.id} content={t(tool.labelKey)} placement="bottom">
              <IconButton
                size="small"
                styleType={activeTool === tool.id ? 'cta' : 'borderless'}
                onClick={async () => handleToolClick(tool.id)}
                label={t(tool.labelKey)}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon">{tool.icon}</span>
              </IconButton>
            </Tooltip>
          ))}
        </ButtonGroup>
      </div>

      <Divider orientation="vertical" className="cad-toolbar-divider" />

      {/* Boolean Tools */}
      <div className="cad-toolbar-group">
        <Text variant="small" className="cad-toolbar-label">{t('cadToolbar.categories.boolean')}</Text>
        <ButtonGroup className="cad-toolbar-buttons">
          {BOOLEAN_TOOLS.map((tool) => (
            <Tooltip key={tool.id} content={t(tool.labelKey)} placement="bottom">
              <IconButton
                size="small"
                styleType={activeTool === tool.id ? 'cta' : 'borderless'}
                onClick={async () => handleToolClick(tool.id)}
                label={t(tool.labelKey)}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon">{tool.icon}</span>
              </IconButton>
            </Tooltip>
          ))}
        </ButtonGroup>
      </div>

      <Divider orientation="vertical" className="cad-toolbar-divider" />

      {/* Edge Tools */}
      <div className="cad-toolbar-group">
        <Text variant="small" className="cad-toolbar-label">{t('cadToolbar.categories.edges')}</Text>
        <ButtonGroup className="cad-toolbar-buttons">
          {EDGE_TOOLS.map((tool) => (
            <Tooltip key={tool.id} content={t(tool.labelKey)} placement="bottom">
              <IconButton
                size="small"
                styleType={activeTool === tool.id ? 'cta' : 'borderless'}
                onClick={async () => handleToolClick(tool.id)}
                label={t(tool.labelKey)}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon">{tool.icon}</span>
              </IconButton>
            </Tooltip>
          ))}
        </ButtonGroup>
      </div>

      <Divider orientation="vertical" className="cad-toolbar-divider" />

      {/* Face Tools */}
      <div className="cad-toolbar-group">
        <Text variant="small" className="cad-toolbar-label">{t('cadToolbar.categories.faces')}</Text>
        <ButtonGroup className="cad-toolbar-buttons">
          {FACE_TOOLS.map((tool) => (
            <Tooltip key={tool.id} content={t(tool.labelKey)} placement="bottom">
              <IconButton
                size="small"
                styleType={activeTool === tool.id ? 'cta' : 'borderless'}
                onClick={async () => handleToolClick(tool.id)}
                label={t(tool.labelKey)}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon">{tool.icon}</span>
              </IconButton>
            </Tooltip>
          ))}
        </ButtonGroup>
      </div>

      <Divider orientation="vertical" className="cad-toolbar-divider" />

      {/* Advanced Tools */}
      <div className="cad-toolbar-group">
        <Text variant="small" className="cad-toolbar-label">{t('cadToolbar.categories.advanced')}</Text>
        <ButtonGroup className="cad-toolbar-buttons">
          {ADVANCED_TOOLS.map((tool) => (
            <Tooltip key={tool.id} content={t(tool.labelKey)} placement="bottom">
              <IconButton
                size="small"
                styleType={activeTool === tool.id ? 'cta' : 'borderless'}
                onClick={async () => handleToolClick(tool.id)}
                label={t(tool.labelKey)}
                className="cad-tool-btn"
              >
                <span className="cad-tool-icon">{tool.icon}</span>
              </IconButton>
            </Tooltip>
          ))}
        </ButtonGroup>
      </div>
      {/* Pattern Dialogs */}
      <LinearPatternDialog
        isOpen={showLinearPatternDialog}
        onClose={() => setShowLinearPatternDialog(false)}
      />
      <CircularPatternDialog
        isOpen={showCircularPatternDialog}
        onClose={() => setShowCircularPatternDialog(false)}
      />
    </div>
  );
});

// Display name for debugging
CadToolbar.displayName = 'CadToolbar';

export default CadToolbar;
