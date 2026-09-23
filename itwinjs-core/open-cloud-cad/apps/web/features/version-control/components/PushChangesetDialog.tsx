/*-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { Button, Dialog, Input } from '@itwin/itwinui-react';
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
      title="推送变更 (Push Changeset)"
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        <div className="tool-parameter">
          <label htmlFor="changeset-description">
            变更描述 (Description)
            <span className="unit">必填</span>
          </label>
          <Input
            id="changeset-description"
            type="text"
            value={description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
            placeholder="例如：修复底座尺寸、添加圆角特征"
          />
        </div>
      </div>

      <div className="tool-dialog-actions">
        <Button onClick={handleClose} styleType="default">
          取消
        </Button>
        <Button
          onClick={handleConfirm}
          styleType="high-visibility"
          disabled={!description.trim()}
        >
          推送
        </Button>
      </div>
    </Dialog>
  );
};

export default PushChangesetDialog;
