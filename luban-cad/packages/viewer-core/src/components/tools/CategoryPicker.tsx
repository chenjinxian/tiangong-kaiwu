/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Category Picker Component
 *
 * Allows users to show/hide categories in the viewport.
 * Applicable for both 2D and 3D views.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { IModelApp, Viewport } from '@itwin/core-frontend';
import { Id64String } from '@itwin/core-bentley';

export interface CategoryInfo {
  id: Id64String;
  name: string;
  code: string;
  isVisible: boolean;
}

export interface CategoryPickerProps {
  className?: string;
  style?: React.CSSProperties;
  viewport?: Viewport;
}

/**
 * Category Picker Component
 *
 * Displays a list of categories with checkboxes to toggle visibility.
 */
export const CategoryPicker: React.FC<CategoryPickerProps> = ({
  className,
  style,
  viewport: propsViewport,
}) => {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
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

  // Populate categories list
  useEffect(() => {
    if (!viewport?.view) {
      setIsLoading(false);
      return;
    }

    const populateCategories = async () => {
      setIsLoading(true);
      try {
        const categorySelector = viewport.view.categorySelector;
        const categoryIds: Id64String[] = [];

        // Get all categories from selector
        categorySelector.categories.forEach((id) => {
          categoryIds.push(id);
        });

        // Query category names
        const categoryInfo: CategoryInfo[] = [];
        for (const id of categoryIds) {
          try {
            const props = await viewport.iModel.elements.loadProps(id);
            const isVisible = categorySelector.categories.has(id);
            categoryInfo.push({
              id,
              name: props?.userLabel || props?.code?.value || `Category ${id}`,
              code: props?.code?.value || '',
              isVisible,
            });
          } catch {
            // Skip categories that can't be loaded
          }
        }

        // Sort by name
        categoryInfo.sort((a, b) => a.name.localeCompare(b.name));
        setCategories(categoryInfo);
      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void populateCategories();
  }, [viewport]);

  /**
   * Toggle category visibility
   */
  const toggleCategory = useCallback((categoryId: Id64String, isVisible: boolean) => {
    if (!viewport?.view) return;

    const categorySelector = viewport.view.categorySelector;

    if (isVisible) {
      categorySelector.addCategories(categoryId);
    } else {
      categorySelector.dropCategories(categoryId);
    }

    viewport.invalidateScene();

    // Update local state
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, isVisible } : c))
    );
  }, [viewport]);

  /**
   * Show all categories
   */
  const showAll = useCallback(() => {
    if (!viewport?.view) return;

    const categorySelector = viewport.view.categorySelector;
    categories.forEach((category) => {
      categorySelector.addCategories(category.id);
    });

    viewport.invalidateScene();
    setCategories((prev) => prev.map((c) => ({ ...c, isVisible: true })));
  }, [viewport, categories]);

  /**
   * Hide all categories
   */
  const hideAll = useCallback(() => {
    if (!viewport?.view) return;

    const categorySelector = viewport.view.categorySelector;
    categories.forEach((category) => {
      categorySelector.dropCategories(category.id);
    });

    viewport.invalidateScene();
    setCategories((prev) => prev.map((c) => ({ ...c, isVisible: false })));
  }, [viewport, categories]);

  // Check if view is available
  if (!viewport?.view) {
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
          类别选择器需要活动视图
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
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>类别 (Categories)</span>
        <span style={{ fontSize: '12px', color: '#666' }}>
          {categories.filter((c) => c.isVisible).length}/{categories.length}
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

      {/* Category List */}
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
        ) : categories.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            无可用类别
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {categories.map((category) => (
              <label
                key={category.id}
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
                  checked={category.isVisible}
                  onChange={(e) => toggleCategory(category.id, e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={`${category.name} (${category.code})`}
                >
                  {category.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryPicker;
