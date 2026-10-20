/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Input, Text } from '@itwin/itwinui-react';
import '../../../features/modeling/components/ToolDialog.css';

export interface PushChangesetDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when dialog is closed */
  onClose: () => void;
  /** Called when user confirms with a non-empty description */
  onConfirm: (description: string) => void;
}

/**
 * Dialog for entering a changeset description before pushing.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const PushChangesetDialog: React.FC<PushChangesetDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation('editor');
  const [description, setDescription] = useState('');

  const handleConfirm = useCallback(() => {
    const trimmed = description.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setDescription('');
    onClose();
  }, [description, onConfirm, onClose]);

  const handleClose = useCallback(() => {
    setDescription('');
    onClose();
  }, [onClose]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      aria-label={t('pushChangeset.title')}
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        <Text variant="headline" as="h3" className="tool-dialog-title">
          {t('pushChangeset.title')}
        </Text>
        <div className="tool-parameter">
          <label htmlFor="changeset-description">
            {t('pushChangeset.descriptionLabel')}
            <span className="unit">{t('pushChangeset.required')}</span>
          </label>
          <Input
            id="changeset-description"
            type="text"
            value={description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
            placeholder={t('pushChangeset.descriptionPlaceholder')}
          />
        </div>
      </div>

      <div className="tool-dialog-actions">
        <Button onClick={handleClose} styleType="default">
          {t('pushChangeset.cancel')}
        </Button>
        <Button
          onClick={handleConfirm}
          styleType="high-visibility"
          disabled={!description.trim()}
        >
          {t('pushChangeset.confirm')}
        </Button>
      </div>
    </Dialog>
  );
};

export default PushChangesetDialog;
