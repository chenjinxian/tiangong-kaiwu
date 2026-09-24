/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  Input,
  Label,
  Text,
} from '@itwin/itwinui-react';
import { useRenameIModelMutation } from '../hooks/useIModelsQuery.js';
import type { IModel } from '../hooks/useIModelsQuery.js';
import '../../itwin/components/Dialog.css';

interface RenameIModelDialogProps {
  iModel: IModel | null;
  isOpen: boolean;
  onClose: () => void;
  onRenamed?: () => void;
  iTwinId: string;
}

/**
 * Rename iModel dialog
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const RenameIModelDialog: React.FC<RenameIModelDialogProps> = ({
  iModel,
  isOpen,
  onClose,
  onRenamed,
  iTwinId,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const renameMutation = useRenameIModelMutation();

  useEffect(() => {
    if (iModel && isOpen) {
      setName(iModel.displayName || iModel.name || '');
      setDescription((iModel as { description?: string }).description || '');
      setError(null);
    }
  }, [iModel, isOpen]);

  const handleSubmit = async () => {
    if (!iModel?.id || !name.trim()) return;

    try {
      await renameMutation.mutateAsync({
        iModelId: iModel.id,
        iTwinId,
        newName: name.trim(),
        newDescription: description.trim() || undefined,
      });
      onRenamed?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败');
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      portal
      isDismissible
    >
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title="重命名 iModel" className="create-dialog">
        <Dialog.TitleBar title="重命名 iModel" />
        <Dialog.Content>
          <div className="form-group">
            <Label htmlFor="imodel-name" required>名称</Label>
            <Input
              id="imodel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入 iModel 名称"
              disabled={renameMutation.isPending}
              autoFocus
            />
          </div>

          <div className="form-group">
            <Label htmlFor="imodel-description">描述</Label>
            <Input
              id="imodel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入描述（可选）"
              disabled={renameMutation.isPending}
            />
          </div>

          {error && (
            <Text variant="small" style={{ color: 'var(--iui-color-text-negative)' }}>
              {error}
            </Text>
          )}
        </Dialog.Content>

        <Dialog.ButtonBar>
          <Button
            styleType="default"
            onClick={handleClose}
            disabled={renameMutation.isPending}
          >
            取消
          </Button>
          <Button
            styleType="high-visibility"
            onClick={handleSubmit}
            disabled={renameMutation.isPending || !name.trim()}
            loading={renameMutation.isPending}
          >
            保存
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
};
