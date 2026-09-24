/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * View Switcher Component
 *
 * Allows users to switch between different view definitions in the iModel.
 * Shows both 2D and 3D views.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { IModelApp, Viewport, ViewState } from '@itwin/core-frontend';
import { Id64String } from '@itwin/core-bentley';

export interface ViewDefinition {
  id: Id64String;
  name: string;
  classFullName: string;
  isPrivate: boolean;
  viewType: '2d' | '3d' | 'sheet' | 'drawing' | 'unknown';
}

export interface ViewSwitcherProps {
  className?: string;
  style?: React.CSSProperties;
  viewport?: Viewport;
  onViewChanged?: (view: ViewState) => void;
}

/**
 * View Switcher Component
 *
 * Displays a list of view definitions and allows switching between them.
 */
export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({
  className,
  style,
  viewport: propsViewport,
  onViewChanged,
}) => {
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [currentViewId, setCurrentViewId] = useState<Id64String>('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewport, setViewport] = useState<Viewport | undefined>(propsViewport);

  // Get viewport from props or IModelApp
  useEffect(() => {
    if (propsViewport) {
      setViewport(propsViewport);
    } else {
      setViewport(IModelApp.viewManager?.selectedView);
    }
  }, [propsViewport]);

  // Populate views list
  useEffect(() => {
    if (!viewport?.iModel) {
      setIsLoading(false);
      return;
    }

    const populateViews = async () => {
      setIsLoading(true);
      try {
        const iModel = viewport.iModel;

        // Query public views first
        let viewSpecs = await iModel.views.getViewList({ wantPrivate: false });
        const allViews: ViewDefinition[] = [];

        for (const spec of viewSpecs) {
          allViews.push({
            id: spec.id,
            name: spec.name || `View ${spec.id}`,
            classFullName: spec.class,
            isPrivate: false,
            viewType: getViewType(spec.class),
          });
        }

        // Query private views
        viewSpecs = await iModel.views.getViewList({ wantPrivate: true });
        for (const spec of viewSpecs) {
          // Skip if already added
          if (!allViews.find((v) => v.id === spec.id)) {
            allViews.push({
              id: spec.id,
              name: spec.name || `View ${spec.id}`,
              classFullName: spec.class,
              isPrivate: true,
              viewType: getViewType(spec.class),
            });
          }
        }

        // Sort: public first, then by name
        allViews.sort((a, b) => {
          if (a.isPrivate !== b.isPrivate) {
            return a.isPrivate ? 1 : -1;
          }
          return a.name.localeCompare(b.name);
        });

        setViews(allViews);

        // Set current view
        if (viewport.view?.id) {
          setCurrentViewId(viewport.view.id);
        }
      } catch (error) {
        console.error('Failed to load views:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void populateViews();
  }, [viewport]);

  /**
   * Get view type from class name
   */
  const getViewType = (className: string): ViewDefinition['viewType'] => {
    if (className.includes('SpatialView')) return '3d';
    if (className.includes('ViewDefinition2d')) return '2d';
    if (className.includes('SheetView')) return 'sheet';
    if (className.includes('DrawingView')) return 'drawing';
    return 'unknown';
  };

  /**
   * Switch to a different view
   */
  const switchView = useCallback(
    async (viewId: Id64String) => {
      if (!viewport?.iModel || viewId === currentViewId) return;

      try {
        const newView = await viewport.iModel.views.load(viewId);
        if (newView) {
          viewport.changeView(newView.clone());
          setCurrentViewId(viewId);
          onViewChanged?.(newView);
        }
      } catch (error) {
        console.error('Failed to switch view:', error);
      }
    },
    [viewport, currentViewId, onViewChanged]
  );

  /**
   * Get icon for view type
   */
  const getViewTypeIcon = (type: ViewDefinition['viewType']) => {
    switch (type) {
      case '3d':
        return '🧊';
      case '2d':
        return '📄';
      case 'sheet':
        return '📋';
      case 'drawing':
        return '✏️';
      default:
        return '📐';
    }
  };

  /**
   * Get label for view type
   */
  const getViewTypeLabel = (type: ViewDefinition['viewType']) => {
    switch (type) {
      case '3d':
        return '3D';
      case '2d':
        return '2D';
      case 'sheet':
        return 'Sheet';
      case 'drawing':
        return 'Drawing';
      default:
        return 'Unknown';
    }
  };

  if (!viewport?.iModel) {
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
        <div style={{ color: '#666', fontSize: '14px' }}>视图切换需要活动视图</div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '400px',
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
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>视图切换 (Views)</span>
        <span style={{ fontSize: '12px', color: '#666' }}>{views.length}</span>
      </div>

      {/* View List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>加载中...</div>
        ) : views.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>无可用视图</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {views.map((view) => (
              <button
                key={view.id}
                onClick={() => switchView(view.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: currentViewId === view.id ? 'rgba(0, 102, 204, 0.15)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (currentViewId !== view.id) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentViewId !== view.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '16px', marginRight: '8px' }}>{getViewTypeIcon(view.viewType)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: currentViewId === view.id ? 'bold' : 'normal',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={view.name}
                  >
                    {view.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999' }}>
                    {getViewTypeLabel(view.viewType)}
                    {view.isPrivate && ' • Private'}
                  </div>
                </div>
                {currentViewId === view.id && (
                  <span style={{ fontSize: '12px', color: '#0066cc', marginLeft: '8px' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewSwitcher;
