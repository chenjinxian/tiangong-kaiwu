/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { dialogService, type DialogRequest } from '../services/DialogService.js';
import { CategoryPickerDialog } from './CategoryPickerDialog.js';

/**
 * Dialog Provider - Renders dialogs requested by non-React code
 *
 * Place this component at the root of your app to enable tools to show dialogs.
 */
export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentDialog, setCurrentDialog] = useState<DialogRequest | null>(null);

  useEffect(() => {
    const unsubscribe = dialogService.subscribe(() => {
      setCurrentDialog(dialogService.getCurrentDialog());
    });

    return unsubscribe;
  }, []);

  const handleCategorySelect = (categoryId: string): void => {
    dialogService.closeDialog(categoryId);
  };

  const handleClose = (): void => {
    dialogService.cancelDialog();
  };

  return (
    <>
      {children}
      {currentDialog?.type === 'categoryPicker' && (
        <CategoryPickerDialog
          isOpen={true}
          onClose={handleClose}
          onSelect={handleCategorySelect}
        />
      )}
    </>
  );
};

export default DialogProvider;
