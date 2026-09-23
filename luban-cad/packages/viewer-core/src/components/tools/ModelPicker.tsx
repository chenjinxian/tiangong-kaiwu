/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Model Picker Component
 *
 * Allows users to show/hide models in the viewport.
 * Only applicable for 3D views.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { IModelApp, Viewport, SpatialViewState } from '@itwin/core-frontend';
import { Id64String } from '@itwin/core-bentley';

export interface ModelInfo {
  id: Id64String;
  name: string;
  isVisible: boolean;
}

export interface ModelPickerProps {
  className?: string;
  style?: React.CSSProperties;
  viewport?: Viewport;
}

/**
 * Model Picker Component
 *
 * Displays a list of models with checkboxes to toggle visibility.
 */
export const ModelPicker: React.FC<ModelPickerProps> = ({
  className,
  style,
  viewport: propsViewport,
}) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
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

  // Populate models list
  useEffect(() => {
    if (!viewport?.view || !(viewport.view instanceof SpatialViewState)) {
      setIsLoading(false);
      return;
    }

    const populateModels = async () => {
      setIsLoading(true);
      try {
        const spatialView = viewport.view as SpatialViewState;
        const modelSelector = spatialView.modelSelector;
        const modelIds: Id64String[] = [];

        // Get all models from selector
        modelSelector.models.forEach((id) => {
          modelIds.push(id);
        });

        // Query model names
        const modelInfo: ModelInfo[] = [];
        for (const id of modelIds) {
          try {
            const props = await viewport.iModel.elements.loadProps(id);
            const isVisible = modelSelector.models.has(id);
            modelInfo.push({
              id,
              name: props?.code?.value || `Model ${id}`,
              isVisible,
            });
          } catch {
            // Skip models that can't be loaded
          }
        }

        // Sort by name
        modelInfo.sort((a, b) => a.name.localeCompare(b.name));
        setModels(modelInfo);
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void populateModels();
  }, [viewport]);

  /**
   * Toggle model visibility
   */
  const toggleModel = useCallback((modelId: Id64String, isVisible: boolean) => {
    if (!viewport?.view || !(viewport.view instanceof SpatialViewState)) return;

    const spatialView = viewport.view as SpatialViewState;
    const modelSelector = spatialView.modelSelector;

    if (isVisible) {
      modelSelector.addModels(modelId);
    } else {
      modelSelector.dropModels(modelId);
    }

    viewport.invalidateScene();

    // Update local state
    setModels((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, isVisible } : m))
    );
  }, [viewport]);

  /**
   * Show all models
   */
  const showAll = useCallback(() => {
    if (!viewport?.view || !(viewport.view instanceof SpatialViewState)) return;

    const spatialView = viewport.view as SpatialViewState;
    const modelSelector = spatialView.modelSelector;
    models.forEach((model) => {
      modelSelector.addModels(model.id);
    });

    viewport.invalidateScene();
    setModels((prev) => prev.map((m) => ({ ...m, isVisible: true })));
  }, [viewport, models]);

  /**
   * Hide all models
   */
  const hideAll = useCallback(() => {
    if (!viewport?.view || !(viewport.view instanceof SpatialViewState)) return;

    const spatialView = viewport.view as SpatialViewState;
    const modelSelector = spatialView.modelSelector;
    models.forEach((model) => {
      modelSelector.dropModels(model.id);
    });

    viewport.invalidateScene();
    setModels((prev) => prev.map((m) => ({ ...m, isVisible: false })));
  }, [viewport, models]);

  // Check if 3D view
  if (!viewport?.view || !(viewport.view instanceof SpatialViewState)) {
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
        <div style={{ color: '#666', fontSize: '14px' }}>
          模型选择器仅在3D视图中可用
        </div>
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
        minWidth: '220px',
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
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>模型 (Models)</span>
        <span style={{ fontSize: '12px', color: '#666' }}>
          {models.filter((m) => m.isVisible).length}/{models.length}
        </span>
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
          onClick={showAll}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          全选
        </button>
        <button
          onClick={hideAll}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          全不选
        </button>
      </div>

      {/* Model List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            加载中...
          </div>
        ) : models.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            无可用模型
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {models.map((model) => (
              <label
                key={model.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 102, 204, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={model.isVisible}
                  onChange={(e) => toggleModel(model.id, e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={model.name}
                >
                  {model.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelPicker;
