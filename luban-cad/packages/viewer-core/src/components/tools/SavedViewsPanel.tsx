/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Saved Views Panel Component
 *
 * Allows users to save and recall custom views with:
 * - Camera position and orientation
 * - View flags and display settings
 * - Selected elements
 * - Feature overrides
 */

import React, { useCallback, useEffect, useState } from 'react';
import { IModelApp, Viewport, ViewState } from '@itwin/core-frontend';
import { ViewFlags } from '@itwin/core-common';

export interface SavedView {
  id: string;
  name: string;
  timestamp: number;
  viewState: string; // Serialized ViewState
  selectedElements?: string[];
}

export interface SavedViewsPanelProps {
  className?: string;
  style?: React.CSSProperties;
  viewport?: Viewport;
  storageKey?: string; // Local storage key prefix
}

/**
 * Saved Views Panel Component
 *
 * Provides CRUD operations for saved views.
 */
export const SavedViewsPanel: React.FC<SavedViewsPanelProps> = ({
  className,
  style,
  viewport: propsViewport,
  storageKey = 'openCloudCAD.savedViews',
}) => {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [newViewName, setNewViewName] = useState('');
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport | undefined>(propsViewport);

  // Get viewport from props or IModelApp
  useEffect(() => {
    if (propsViewport) {
      setViewport(propsViewport);
    } else {
      setViewport(IModelApp.viewManager?.selectedView);
    }
  }, [propsViewport]);

  // Load saved views from localStorage
  useEffect(() => {
    if (!viewport?.iModel) return;

    const iModelId = viewport.iModel.key || 'default';
    const key = `${storageKey}.${iModelId}`;

    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const views = JSON.parse(stored) as SavedView[];
        setSavedViews(views);
      }
    } catch (error) {
      console.error('Failed to load saved views:', error);
    }
  }, [viewport, storageKey]);

  /**
   * Save views to localStorage
   */
  const persistViews = useCallback(
    (views: SavedView[]) => {
      if (!viewport?.iModel) return;

      const iModelId = viewport.iModel.key || 'default';
      const key = `${storageKey}.${iModelId}`;

      try {
        localStorage.setItem(key, JSON.stringify(views));
      } catch (error) {
        console.error('Failed to save views:', error);
      }
    },
    [viewport, storageKey]
  );

  /**
   * Create a new saved view
   */
  const saveView = useCallback(() => {
    if (!viewport?.view || !newViewName.trim()) return;

    const view = viewport.view;

    // Serialize view state
    const viewState = JSON.stringify({
      origin: view.getOrigin(),
      extents: view.getExtents(),
      rotation: view.getRotation(),
      viewFlags: view.viewFlags.toJSON(),
      displayStyle: view.displayStyle.id,
    });

    // Get selected elements
    const selectedElements = Array.from(viewport.iModel.selectionSet.elements);

    const newView: SavedView = {
      id: `view_${Date.now()}`,
      name: newViewName.trim(),
      timestamp: Date.now(),
      viewState,
      selectedElements: selectedElements.length > 0 ? selectedElements : undefined,
    };

    const updatedViews = [...savedViews, newView];
    setSavedViews(updatedViews);
    persistViews(updatedViews);
    setNewViewName('');
  }, [viewport, newViewName, savedViews, persistViews]);

  /**
   * Recall a saved view
   */
  const recallView = useCallback(
    async (savedView: SavedView) => {
      if (!viewport?.view) return;

      try {
        const viewData = JSON.parse(savedView.viewState);

        // Apply view settings
        if (viewData.origin) {
          viewport.view.setOrigin(viewData.origin);
        }
        if (viewData.extents) {
          viewport.view.setExtents(viewData.extents);
        }
        if (viewData.rotation) {
          viewport.view.setRotation(viewData.rotation);
        }

        // Apply view flags
        if (viewData.viewFlags) {
          viewport.viewFlags = ViewFlags.fromJSON(viewData.viewFlags);
        }

        viewport.synchWithView({});

        // Restore selected elements
        if (savedView.selectedElements) {
          viewport.iModel.selectionSet.emptyAll();
          for (const id of savedView.selectedElements) {
            viewport.iModel.selectionSet.add(id);
          }
        }

        setSelectedViewId(savedView.id);
      } catch (error) {
        console.error('Failed to recall view:', error);
      }
    },
    [viewport]
  );

  /**
   * Update an existing saved view
   */
  const updateView = useCallback(
    (viewId: string) => {
      if (!viewport?.view) return;

      const view = viewport.view;

      // Serialize view state
      const viewState = JSON.stringify({
        origin: view.getOrigin(),
        extents: view.getExtents(),
        rotation: view.getRotation(),
        viewFlags: view.viewFlags.toJSON(),
        displayStyle: view.displayStyle.id,
      });

      const selectedElements = Array.from(viewport.iModel.selectionSet.elements);

      const updatedViews = savedViews.map((v) =>
        v.id === viewId
          ? {
              ...v,
              viewState,
              selectedElements: selectedElements.length > 0 ? selectedElements : undefined,
              timestamp: Date.now(),
            }
          : v
      );

      setSavedViews(updatedViews);
      persistViews(updatedViews);
    },
    [viewport, savedViews, persistViews]
  );

  /**
   * Delete a saved view
   */
  const deleteView = useCallback(
    (viewId: string) => {
      const updatedViews = savedViews.filter((v) => v.id !== viewId);
      setSavedViews(updatedViews);
      persistViews(updatedViews);

      if (selectedViewId === viewId) {
        setSelectedViewId(null);
      }
    },
    [savedViews, selectedViewId, persistViews]
  );

  /**
   * Format timestamp
   */
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
        <div style={{ color: '#666', fontSize: '14px' }}>保存视图需要活动视图</div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '450px',
        backgroundColor: 'rgba(240, 240, 240, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        minWidth: '280px',
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
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>保存视图 (Saved Views)</span>
        <span style={{ fontSize: '12px', color: '#666' }}>{savedViews.length}</span>
      </div>

      {/* Create New View */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #eee',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            placeholder="输入视图名称..."
            onKeyPress={(e) => {
              if (e.key === 'Enter') saveView();
            }}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '13px',
            }}
          />
          <button
            onClick={saveView}
            disabled={!newViewName.trim()}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: newViewName.trim() ? '#0066cc' : '#ccc',
              color: '#fff',
              cursor: newViewName.trim() ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            保存
          </button>
        </div>
      </div>

      {/* Saved Views List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {savedViews.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
            <div style={{ fontSize: '13px' }}>还没有保存的视图</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>调整视图后点击保存</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {savedViews.map((view) => (
              <div
                key={view.id}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: selectedViewId === view.id ? 'rgba(0, 102, 204, 0.1)' : '#fff',
                  border: `1px solid ${selectedViewId === view.id ? '#0066cc' : '#e0e0e0'}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 'bold',
                      fontSize: '14px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                    title={view.name}
                  >
                    {view.name}
                  </span>
                  <button
                    onClick={() => recallView(view)}
                    title="恢复视图"
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: '#0066cc',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      marginLeft: '8px',
                    }}
                  >
                    恢复
                  </button>
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    color: '#999',
                    marginBottom: '8px',
                  }}
                >
                  {formatTime(view.timestamp)}
                  {view.selectedElements && ` • ${view.selectedElements.length} 选中`}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => updateView(view.id)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      backgroundColor: '#f5f5f5',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    更新
                  </button>
                  <button
                    onClick={() => deleteView(view.id)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      backgroundColor: '#fff0f0',
                      color: '#c00',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedViewsPanel;
