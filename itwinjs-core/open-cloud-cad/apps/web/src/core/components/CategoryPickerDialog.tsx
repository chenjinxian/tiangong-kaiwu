/*-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  Button,
  Select,
  Label,
  Text,
} from '@itwin/itwinui-react';
import { IModelApp } from '@itwin/core-frontend';

interface Category {
  id: string;
  name: string;
  elementCount?: number;
}

interface CategoryPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
}

/**
 * Category Picker Dialog - Allows user to select a category for element selection
 */
export const CategoryPickerDialog: React.FC<CategoryPickerDialogProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadCategories();
    }
  }, [isOpen]);

  const loadCategories = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const viewport = IModelApp.viewManager.selectedView;
      if (!viewport) {
        setCategories([]);
        return;
      }

      const cats: Category[] = [];

      // Query all categories with element counts
      const query = `
        SELECT
          c.ECInstanceId as id,
          c.CodeValue as name,
          COUNT(e.ECInstanceId) as elementCount
        FROM bis.Category c
        LEFT JOIN bis.GeometricElement3d e ON e.Category.Id = c.ECInstanceId
        GROUP BY c.ECInstanceId, c.CodeValue
        ORDER BY elementCount DESC
      `;

      for await (const row of viewport.iModel.createQueryReader(query)) {
        cats.push({
          id: row[0] as string,
          name: (row[1] as string) || 'Unnamed',
          elementCount: (row[2] as number) || 0,
        });
      }

      setCategories(cats);

      // Select first category with elements by default
      const firstWithElements = cats.find(c => (c.elementCount ?? 0) > 0);
      if (firstWithElements) {
        setSelectedCategory(firstWithElements.id);
      } else if (cats.length > 0) {
        setSelectedCategory(cats[0].id);
      }
    } catch (err) {
      console.error('[CategoryPickerDialog] Failed to load categories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = (): void => {
    if (selectedCategory) {
      onSelect(selectedCategory);
    }
    onClose();
  };

  const options = categories.map((cat) => ({
    value: cat.id,
    label: `${cat.name} (${cat.elementCount ?? 0} 个元素)`,
  }));

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="选择类别"
      isDismissible
    >
      <Dialog.Content>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '300px' }}>
          <Text variant="small">
            选择一个类别来选择该类别下的所有元素。
          </Text>

          <div>
            <Label htmlFor="category-select">类别</Label>
            <Select
              id="category-select"
              options={options}
              value={selectedCategory}
              onChange={(value) => setSelectedCategory(value as string)}
              disabled={isLoading || categories.length === 0}
              placeholder={isLoading ? '加载中...' : '选择类别'}
            />
          </div>

          {categories.length === 0 && !isLoading && (
            <Text variant="small" style={{ color: 'var(--iui-color-text-muted)' }}>
              没有找到类别
            </Text>
          )}
        </div>
      </Dialog.Content>
      <Dialog.ButtonBar>
        <Button styleType="default" onClick={onClose}>
          取消
        </Button>
        <Button
          styleType="high-visibility"
          onClick={handleConfirm}
          disabled={!selectedCategory}
        >
          选择
        </Button>
      </Dialog.ButtonBar>
    </Dialog>
  );
};

export default CategoryPickerDialog;
