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
import { useCopyIModelMutation } from '../hooks/useIModelsQuery.js';
import { useITwinsQuery } from '../../itwin/hooks/useITwinsQuery.js';
import type { IModel } from '../hooks/useIModelsQuery.js';
import '../../itwin/components/Dialog.css';

interface CopyIModelDialogProps {
  iModel: IModel | null;
  currentITwinId: string;
  isOpen: boolean;
  onClose: () => void;
  onCopied?: () => void;
}

/**
 * Copy iModel dialog
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CopyIModelDialog: React.FC<CopyIModelDialogProps> = ({
  iModel,
  currentITwinId,
  isOpen,
  onClose,
  onCopied,
}) => {
  const [name, setName] = useState('');
  const [targetITwinId, setTargetITwinId] = useState(currentITwinId);
  const [error, setError] = useState<string | null>(null);
  const copyMutation = useCopyIModelMutation();
  const { data: iTwins = [] } = useITwinsQuery();

  useEffect(() => {
    if (iModel && isOpen) {
      setName(`${iModel.displayName || iModel.name || 'iModel'} 的副本`);
      setTargetITwinId(currentITwinId);
      setError(null);
    }
  }, [iModel, isOpen, currentITwinId]);

  const handleSubmit = async () => {
    if (!iModel?.id || !name.trim() || !targetITwinId) return;

    try {
      await copyMutation.mutateAsync({
        sourceIModelId: iModel.id,
        sourceITwinId: currentITwinId,
        targetITwinId,
        newName: name.trim(),
      });
      onCopied?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败');
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
      <Dialog.Main styleType="default" title="复制 iModel" className="create-dialog">
        <Dialog.TitleBar title="复制 iModel" />
        <Dialog.Content>
          <div className="form-group">
            <Label htmlFor="copy-name" required>新名称</Label>
            <Input
              id="copy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入新 iModel 的名称"
              disabled={copyMutation.isPending}
              autoFocus
            />
          </div>

          <div className="form-group">
            <Label htmlFor="target-project" required>目标项目</Label>
            <select
              id="target-project"
              value={targetITwinId}
              onChange={(e) => setTargetITwinId(e.target.value)}
              disabled={copyMutation.isPending}
              className="form-select"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--iui-border-radius)',
                border: '1px solid var(--iui-color-border)',
                background: 'var(--iui-color-background)',
              }}
            >
              {iTwins.map((iTwin) => (
                <option key={iTwin.id} value={iTwin.id}>
                  {iTwin.displayName}
                </option>
              ))}
            </select>
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
            disabled={copyMutation.isPending}
          >
            取消
          </Button>
          <Button
            styleType="high-visibility"
            onClick={handleSubmit}
            disabled={copyMutation.isPending || !name.trim() || !targetITwinId}
            loading={copyMutation.isPending}
          >
            复制
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
};
