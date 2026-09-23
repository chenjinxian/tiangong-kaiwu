/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  Label,
  Text,
  Alert,
} from '@itwin/itwinui-react';
import { useMoveIModelMutation } from '../hooks/useIModelsQuery.js';
import { useITwinsQuery } from '../../itwin/hooks/useITwinsQuery.js';
import type { IModel } from '../hooks/useIModelsQuery.js';
import '../../itwin/components/Dialog.css';

interface MoveIModelDialogProps {
  iModel: IModel | null;
  sourceITwinId: string;
  isOpen: boolean;
  onClose: () => void;
  onMoved?: () => void;
}

/**
 * Move iModel dialog
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MoveIModelDialog: React.FC<MoveIModelDialogProps> = ({
  iModel,
  sourceITwinId,
  isOpen,
  onClose,
  onMoved,
}) => {
  const [targetITwinId, setTargetITwinId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const moveMutation = useMoveIModelMutation();
  const { data: iTwins = [] } = useITwinsQuery();

  // Filter out current project from the list
  const availableITwins = iTwins.filter((iTwin) => iTwin.id !== sourceITwinId);

  useEffect(() => {
    if (isOpen) {
      setTargetITwinId(availableITwins[0]?.id || '');
      setError(null);
    }
  }, [isOpen, availableITwins]);

  const handleSubmit = async () => {
    if (!iModel?.id || !targetITwinId) return;

    try {
      await moveMutation.mutateAsync({
        iModelId: iModel.id,
        sourceITwinId,
        targetITwinId,
      });
      onMoved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '移动失败');
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
      <Dialog.Main styleType="default" title="移动 iModel" className="create-dialog">
        <Dialog.TitleBar title="移动 iModel" />
        <Dialog.Content>
          <Alert type="warning" className="move-warning">
            移动后，原项目中的成员将无法访问此 iModel，除非他们也是目标项目的成员。
          </Alert>

          <div className="form-group">
            <Text variant="body">
              将 <strong>{iModel?.displayName || iModel?.name || '此 iModel'}</strong> 移动到：
            </Text>
          </div>

          <div className="form-group">
            <Label htmlFor="target-project" required>目标项目</Label>
            <select
              id="target-project"
              value={targetITwinId}
              onChange={(e) => setTargetITwinId(e.target.value)}
              disabled={moveMutation.isPending || availableITwins.length === 0}
              className="form-select"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--iui-border-radius)',
                border: '1px solid var(--iui-color-border)',
                background: 'var(--iui-color-background)',
              }}
            >
              {availableITwins.length === 0 ? (
                <option value="">没有其他可用项目</option>
              ) : (
                availableITwins.map((iTwin) => (
                  <option key={iTwin.id} value={iTwin.id}>
                    {iTwin.displayName}
                  </option>
                ))
              )}
            </select>
          </div>

          {targetITwinId && (
            <div className="form-group">
              <Text variant="small" style={{ color: 'var(--iui-color-text-muted)' }}>
                移动后，您将被重定向到项目列表页面。
              </Text>
            </div>
          )}

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
            disabled={moveMutation.isPending}
          >
            取消
          </Button>
          <Button
            styleType="high-visibility"
            onClick={handleSubmit}
            disabled={moveMutation.isPending || !targetITwinId || availableITwins.length === 0}
            loading={moveMutation.isPending}
          >
            移动
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
};
