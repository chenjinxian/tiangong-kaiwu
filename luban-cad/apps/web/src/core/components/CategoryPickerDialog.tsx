/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  Label,
  Select,
  Text,
} from '@itwin/itwinui-react';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';

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
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component requires PascalCase
export const CategoryPickerDialog: React.FC<CategoryPickerDialogProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation('editor');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      void loadCategories();
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
    } catch {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(OutputMessagePriority.Error, t('categoryPicker.loadFailed'))
      );
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
    label: t('categoryPicker.option', { name: cat.name, count: cat.elementCount ?? 0 }),
  }));

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('categoryPicker.title')}
      isDismissible
    >
      <Dialog.Content>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '300px' }}>
          <Text variant="small">
            {t('categoryPicker.instruction')}
          </Text>

          <div>
            <Label htmlFor="category-select">{t('categoryPicker.category')}</Label>
            <Select
              id="category-select"
              options={options}
              value={selectedCategory}
              onChange={(value) => setSelectedCategory(value)}
              disabled={isLoading || categories.length === 0}
              placeholder={isLoading ? t('categoryPicker.loading') : t('categoryPicker.selectCategory')}
            />
          </div>

          {categories.length === 0 && !isLoading && (
            <Text variant="small" style={{ color: 'var(--iui-color-text-muted)' }}>
              {t('categoryPicker.none')}
            </Text>
          )}
        </div>
      </Dialog.Content>
      <Dialog.ButtonBar>
        <Button styleType="default" onClick={onClose}>
          {t('categoryPicker.cancel')}
        </Button>
        <Button
          styleType="high-visibility"
          onClick={handleConfirm}
          disabled={!selectedCategory}
        >
          {t('categoryPicker.select')}
        </Button>
      </Dialog.ButtonBar>
    </Dialog>
  );
};

export default CategoryPickerDialog;
