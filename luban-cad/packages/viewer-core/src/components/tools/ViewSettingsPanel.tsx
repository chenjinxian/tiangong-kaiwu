/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * View Settings Panel Component
 *
 * Provides advanced display settings:
 * - Render mode selection
 * - View flags configuration
 * - Display style selector
 * - Background color
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  IModelApp,
  Viewport,
  DisplayStyleState,
  DisplayStyle3dState,
  DisplayStyle2dState,
} from '@itwin/core-frontend';
import { RenderMode, ColorDef, GridOrientationType } from '@itwin/core-common';
import { Id64String } from '@itwin/core-bentley';

export interface ViewSettingsPanelProps {
  className?: string;
  style?: React.CSSProperties;
  viewport?: Viewport;
}

interface ViewFlagOption {
  name: string;
  flag: string;
  label: string;
}

const VIEW_FLAGS: ViewFlagOption[] = [
  { name: 'shadows', flag: 'shadows', label: '阴影 (Shadows)' },
  { name: 'lighting', flag: 'lighting', label: '光照 (Lighting)' },
  { name: 'fill', flag: 'fill', label: '填充 (Fill)' },
  { name: 'materials', flag: 'materials', label: '材质 (Materials)' },
  { name: 'textures', flag: 'textures', label: '纹理 (Textures)' },
  { name: 'visibleEdges', flag: 'visibleEdges', label: '可见边 (Visible Edges)' },
  { name: 'hiddenEdges', flag: 'hiddenEdges', label: '隐藏边 (Hidden Edges)' },
  { name: 'backgroundMap', flag: 'backgroundMap', label: '背景地图 (Background Map)' },
  { name: 'monochrome', flag: 'monochrome', label: '单色模式 (Monochrome)' },
  { name: 'ambientOcclusion', flag: 'ambientOcclusion', label: '环境光遮蔽 (AO)' },
  { name: 'transparency', flag: 'transparency', label: '透明度 (Transparency)' },
  { name: 'weights', flag: 'weights', label: '线宽 (Line Weights)' },
  { name: 'styles', flag: 'styles', label: '线型 (Line Styles)' },
  { name: 'constructions', flag: 'constructions', label: '构造元素 (Constructions)' },
  { name: 'clipVolume', flag: 'clipVolume', label: '裁剪体积 (Clip Volume)' },
];

const RENDER_MODES = [
  { name: '线框 (Wireframe)', value: RenderMode.Wireframe },
  { name: '实心填充 (Solid Fill)', value: RenderMode.SolidFill },
  { name: '隐藏线 (Hidden Line)', value: RenderMode.HiddenLine },
  { name: '平滑着色 (Smooth Shade)', value: RenderMode.SmoothShade },
];

const GRID_ORIENTATIONS = [
  { value: GridOrientationType.View, label: '视图 (View)' },
  { value: GridOrientationType.WorldXY, label: '世界 XY (World XY)' },
  { value: GridOrientationType.WorldYZ, label: '世界 YZ (World YZ)' },
  { value: GridOrientationType.WorldXZ, label: '世界 XZ (World XZ)' },
  { value: GridOrientationType.AuxCoord, label: '辅助坐标 (ACS)' },
];

/**
 * View Settings Panel Component
 */
export const ViewSettingsPanel: React.FC<ViewSettingsPanelProps> = ({
  className,
  style,
  viewport: propsViewport,
}) => {
  const [viewport, setViewport] = useState<Viewport | undefined>(propsViewport);
  const [renderMode, setRenderMode] = useState<RenderMode>(RenderMode.SmoothShade);
  const [viewFlags, setViewFlags] = useState<Record<string, boolean>>({});
  const [backgroundColor, setBackgroundColor] = useState<string>('#000000');
  const [displayStyles, setDisplayStyles] = useState<{ id: Id64String; name: string }[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<Id64String>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  // ACS and Grid states
  const [acsEnabled, setAcsEnabled] = useState<boolean>(false);
  const [gridEnabled, setGridEnabled] = useState<boolean>(false);
  const [gridSpacing, setGridSpacing] = useState<number>(1);
  const [gridGridsPerRef, setGridGridsPerRef] = useState<number>(10);
  const [gridOrientation, setGridOrientation] = useState<GridOrientationType>(GridOrientationType.WorldXY);

  // Get viewport from props or IModelApp
  useEffect(() => {
    if (propsViewport) {
      setViewport(propsViewport);
    } else {
      setViewport(IModelApp.viewManager?.selectedView);
    }
  }, [propsViewport]);

  // Listen for theme changes
  useEffect(() => {
    const checkTheme = () => {
      const html = document.documentElement;
      const theme = html.getAttribute('data-iui-theme') || html.getAttribute('data-theme') || 'light';
      setIsDarkTheme(theme === 'dark');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-iui-theme'],
    });
    return () => observer.disconnect();
  }, []);

  // Load initial settings
  useEffect(() => {
    if (!viewport?.view) {
      setIsLoading(false);
      return;
    }

    const view = viewport.view;
    const flags = view.viewFlags;

    // Set render mode
    setRenderMode(flags.renderMode);

    // Set view flags
    const flagsState: Record<string, boolean> = {};
    VIEW_FLAGS.forEach((opt) => {
      flagsState[opt.flag] = (flags as any)[opt.flag] ?? false;
    });
    setViewFlags(flagsState);

    // Set background color
    const bgColor = view.displayStyle.backgroundColor;
    setBackgroundColor(bgColor.toHexString());

    // Set ACS and Grid states from view flags
    setAcsEnabled(flags.acsTriad ?? false);
    setGridEnabled(flags.grid ?? false);

    // Set Grid settings
    setGridSpacing(view.details.gridSpacing.x);
    setGridGridsPerRef(view.details.gridsPerRef);
    setGridOrientation(view.details.gridOrientation);

    // Load display styles
    const loadDisplayStyles = async () => {
      try {
        const is3d = view.is3d();
        const sqlName = is3d ? DisplayStyle3dState.classFullName : DisplayStyle2dState.classFullName;
        const props = await viewport.iModel.elements.queryProps({
          from: sqlName,
          where: 'IsPrivate=FALSE',
        });

        const styles = props.map((p) => ({
          id: p.id!,
          name: p.code?.value || `Style ${p.id}`,
        }));
        setDisplayStyles(styles);
        setSelectedStyle(view.displayStyle.id);
      } catch (error) {
        console.error('Failed to load display styles:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadDisplayStyles();
  }, [viewport]);

  /**
   * Change render mode
   */
  const handleRenderModeChange = useCallback(
    (mode: RenderMode) => {
      if (!viewport?.view) return;

      viewport.viewFlags = viewport.viewFlags.withRenderMode(mode);
      viewport.invalidateScene();
      setRenderMode(mode);
    },
    [viewport]
  );

  /**
   * Toggle view flag
   */
  const handleFlagToggle = useCallback(
    (flag: string, enabled: boolean) => {
      if (!viewport?.view) return;

      viewport.viewFlags = viewport.viewFlags.with(flag as any, enabled);
      viewport.invalidateScene();
      setViewFlags((prev) => ({ ...prev, [flag]: enabled }));
    },
    [viewport]
  );

  /**
   * Change background color
   */
  const handleBackgroundColorChange = useCallback(
    (color: string) => {
      if (!viewport?.view) return;

      const colorDef = ColorDef.create(color);
      viewport.view.displayStyle.backgroundColor = colorDef;
      viewport.invalidateScene();
      setBackgroundColor(color);
    },
    [viewport]
  );

  /**
   * Toggle ACS triad
   */
  const handleACSToggle = useCallback(
    (enabled: boolean) => {
      if (!viewport?.view) return;

      viewport.viewFlags = viewport.viewFlags.with('acsTriad', enabled);
      viewport.invalidateScene();
      setAcsEnabled(enabled);
    },
    [viewport]
  );

  /**
   * Toggle Grid
   */
  const handleGridToggle = useCallback(
    (enabled: boolean) => {
      if (!viewport?.view) return;

      viewport.viewFlags = viewport.viewFlags.with('grid', enabled);
      viewport.invalidateScene();
      setGridEnabled(enabled);
    },
    [viewport]
  );

  /**
   * Set grid spacing
   */
  const handleGridSpacingChange = useCallback(
    (spacing: number) => {
      if (!viewport?.view) return;

      viewport.view.details.gridSpacing = { x: spacing, y: spacing };
      viewport.invalidateScene();
      setGridSpacing(spacing);
    },
    [viewport]
  );

  /**
   * Set grids per reference
   */
  const handleGridsPerRefChange = useCallback(
    (value: number) => {
      if (!viewport?.view) return;

      viewport.view.details.gridsPerRef = value;
      viewport.invalidateScene();
      setGridGridsPerRef(value);
    },
    [viewport]
  );

  /**
   * Set grid orientation
   */
  const handleGridOrientationChange = useCallback(
    (orientation: GridOrientationType) => {
      if (!viewport?.view) return;

      viewport.view.details.gridOrientation = orientation;
      viewport.invalidateScene();
      setGridOrientation(orientation);
    },
    [viewport]
  );

  /**
   * Change display style
   */
  const handleDisplayStyleChange = useCallback(
    async (styleId: Id64String) => {
      if (!viewport?.view || !styleId) return;

      try {
        const is3d = viewport.view.is3d();
        const sqlName = is3d ? DisplayStyle3dState.classFullName : DisplayStyle2dState.classFullName;
        const props = await viewport.iModel.elements.loadProps(styleId);

        if (props) {
          let style: DisplayStyleState;
          if (is3d) {
            style = new DisplayStyle3dState(props, viewport.iModel);
          } else {
            style = new DisplayStyle2dState(props, viewport.iModel);
          }
          await style.load();
          viewport.displayStyle = style;
          viewport.invalidateScene();
          setSelectedStyle(styleId);

          // Update local state to match new style
          setRenderMode(viewport.viewFlags.renderMode);
          const bgColor = style.backgroundColor;
          setBackgroundColor(bgColor.toHexString());
        }
      } catch (error) {
        console.error('Failed to change display style:', error);
      }
    },
    [viewport]
  );

  // Use theme-aware colors
  const panelStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '500px',
    borderRadius: 'var(--iui-border-radius)',
    minWidth: '260px',
    color: isDarkTheme ? '#ffffff' : '#000000',
    background: isDarkTheme ? '#1a1a1a' : '#ffffff',
    ...style,
  };

  const headerStyles: React.CSSProperties = {
    padding: '12px',
    borderBottom: `1px solid ${isDarkTheme ? '#333333' : '#e0e0e0'}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const titleStyles: React.CSSProperties = {
    fontWeight: 'bold',
    fontSize: '14px',
    color: isDarkTheme ? '#ffffff' : '#000000',
  };

  const contentStyles: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
  };

  const sectionLabelStyles: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 'bold',
    color: isDarkTheme ? '#aaaaaa' : '#666666',
    marginBottom: '6px',
  };

  const selectStyles: React.CSSProperties = {
    width: '100%',
    padding: '6px',
    borderRadius: '4px',
    border: `1px solid ${isDarkTheme ? '#444444' : '#cccccc'}`,
    fontSize: '13px',
    backgroundColor: isDarkTheme ? '#2a2a2a' : '#ffffff',
    color: isDarkTheme ? '#ffffff' : '#000000',
  };

  const optionLabelStyles = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: '6px',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: isSelected ? (isDarkTheme ? '#2a3f5f' : '#e6f0ff') : 'transparent',
    color: isDarkTheme ? '#ffffff' : '#000000',
    transition: 'background-color 0.2s',
  });

  const checkboxLabelStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 6px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: isDarkTheme ? '#ffffff' : '#000000',
    transition: 'background-color 0.2s',
  };

  const dividerStyles: React.CSSProperties = {
    height: '1px',
    backgroundColor: isDarkTheme ? '#333333' : '#e0e0e0',
  };

  const inputStyles: React.CSSProperties = {
    width: '100%',
    padding: '4px 6px',
    border: `1px solid ${isDarkTheme ? '#444444' : '#cccccc'}`,
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: isDarkTheme ? '#2a2a2a' : '#ffffff',
    color: isDarkTheme ? '#ffffff' : '#000000',
  };

  const gridSettingsStyles: React.CSSProperties = {
    marginLeft: '24px',
    marginTop: '8px',
    padding: '8px',
    backgroundColor: isDarkTheme ? '#252525' : '#f5f5f5',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  const subLabelStyles: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: isDarkTheme ? '#aaaaaa' : '#666666',
    marginBottom: '2px',
  };

  if (!viewport?.view) {
    return (
      <div
        className={className}
        style={{
          padding: '12px',
          minWidth: '200px',
          color: isDarkTheme ? '#aaaaaa' : '#666666',
          fontSize: '14px',
          ...style,
        }}
      >
        视图设置需要活动视图
      </div>
    );
  }

  return (
    <div className={className} style={panelStyles}>
      {/* Header */}
      <div style={headerStyles}>
        <span style={titleStyles}>视图设置 (View Settings)</span>
      </div>

      {/* Content */}
      <div style={contentStyles}>
        {isLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: isDarkTheme ? '#aaaaaa' : '#666666' }}>
            加载中...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Display Style Selector */}
            <div>
              <label style={sectionLabelStyles}>显示样式 (Display Style)</label>
              <select
                value={selectedStyle}
                onChange={(e) => handleDisplayStyleChange(e.target.value)}
                style={selectStyles}
              >
                <option value="">当前样式 (Current)</option>
                {displayStyles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Render Mode */}
            <div>
              <label style={sectionLabelStyles}>渲染模式 (Render Mode)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {RENDER_MODES.map((mode) => (
                  <label
                    key={mode.value}
                    style={optionLabelStyles(renderMode === mode.value)}
                  >
                    <input
                      type="radio"
                      name="renderMode"
                      checked={renderMode === mode.value}
                      onChange={() => handleRenderModeChange(mode.value)}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontSize: '13px' }}>{mode.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={dividerStyles} />

            {/* ACS and Grid Controls */}
            <div>
              <label style={sectionLabelStyles}>辅助显示 (Aids)</label>

              {/* ACS Triad */}
              <label
                style={checkboxLabelStyles}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isDarkTheme ? '#333333' : '#f0f0f0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={acsEnabled}
                  onChange={(e) => handleACSToggle(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontSize: '13px' }}>ACS 坐标系 (ACS Triad)</span>
              </label>

              {/* Grid Toggle */}
              <label
                style={checkboxLabelStyles}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isDarkTheme ? '#333333' : '#f0f0f0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={gridEnabled}
                  onChange={(e) => handleGridToggle(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontSize: '13px' }}>网格 (Grid)</span>
              </label>

              {/* Grid Settings - only shown when grid is enabled */}
              {gridEnabled && (
                <div style={gridSettingsStyles}>
                  {/* Grid Spacing */}
                  <div>
                    <label style={subLabelStyles}>间距 (Spacing)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={gridSpacing}
                      onChange={(e) => handleGridSpacingChange(parseFloat(e.target.value))}
                      style={inputStyles}
                    />
                  </div>

                  {/* Grids Per Ref */}
                  <div>
                    <label style={subLabelStyles}>每参考线格数 (Grids/Ref)</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={gridGridsPerRef}
                      onChange={(e) => handleGridsPerRefChange(parseInt(e.target.value, 10))}
                      style={inputStyles}
                    />
                  </div>

                  {/* Grid Orientation */}
                  <div>
                    <label style={subLabelStyles}>方向 (Orientation)</label>
                    <select
                      value={gridOrientation}
                      onChange={(e) => handleGridOrientationChange(parseInt(e.target.value, 10) as GridOrientationType)}
                      style={selectStyles}
                    >
                      {GRID_ORIENTATIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={dividerStyles} />

            {/* View Flags */}
            <div>
              <label style={sectionLabelStyles}>显示选项 (Display Options)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {VIEW_FLAGS.map((opt) => (
                  <label
                    key={opt.flag}
                    style={checkboxLabelStyles}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkTheme ? '#333333' : '#f0f0f0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={viewFlags[opt.flag] || false}
                      onChange={(e) => handleFlagToggle(opt.flag, e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontSize: '13px' }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={dividerStyles} />

            {/* Background Color */}
            <div>
              <label style={sectionLabelStyles}>背景颜色 (Background Color)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => handleBackgroundColorChange(e.target.value)}
                  style={{
                    width: '40px',
                    height: '32px',
                    border: `1px solid ${isDarkTheme ? '#444444' : '#cccccc'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: isDarkTheme ? '#aaaaaa' : '#666666',
                  }}
                >
                  {backgroundColor.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewSettingsPanel;
