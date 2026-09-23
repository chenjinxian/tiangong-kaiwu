/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  InputGroup,
  Label,
  Input,
  Text,
} from '@itwin/itwinui-react';
import type { ITwin } from '@itwin/itwins-client';
import { useUpdateITwinMutation } from '../hooks/useITwinsQuery.js';
import { logger } from '../../../shared/lib/logger.js';
import './Dialog.css';

interface EditITwinDialogProps {
  iTwin: ITwin | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * 编辑 iTwin 项目对话框
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditITwinDialog: React.FC<EditITwinDialogProps> = React.memo(({
  iTwin,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  const updateITwinMutation = useUpdateITwinMutation();

  // Pre-fill form when dialog opens
  useEffect(() => {
    if (isOpen && iTwin) {
      setDisplayName(iTwin.displayName || '');
      setErrors({});
      setSubmitError('');
    }
  }, [isOpen, iTwin]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!displayName.trim()) {
      newErrors.displayName = '请输入项目名称';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [displayName]);

  const handleClose = useCallback(() => {
    setErrors({});
    setSubmitError('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!validate() || !iTwin?.id) return;
    setSubmitError('');

    try {
      await updateITwinMutation.mutateAsync({
        iTwinId: iTwin.id,
        data: {
          displayName: displayName.trim(),
          status: iTwin.status,
        },
      });

      onSaved?.();
      handleClose();
    } catch (error) {
      logger.error('更新 iTwin 失败', error instanceof Error ? error : undefined);
      const message = error instanceof Error ? error.message : '更新失败，请重试';
      setSubmitError(message);
    }
  }, [displayName, validate, iTwin, updateITwinMutation, onSaved, handleClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !updateITwinMutation.isPending) {
      e.preventDefault();
      void handleSubmit();
    }
  }, [handleSubmit, updateITwinMutation.isPending]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="编辑项目"
      isDismissible
    >
      <Dialog.Content>
        {submitError && (
          <Text
            color="negative"
            className="dialog-error-banner"
          >
            {submitError}
          </Text>
        )}
        <InputGroup>
          <Label required>项目名称</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入项目名称"
            disabled={updateITwinMutation.isPending}
            autoFocus
            status={errors.displayName ? 'negative' : undefined}
          />
          {errors.displayName && (
            <span className="field-error">{errors.displayName}</span>
          )}
        </InputGroup>
      </Dialog.Content>

      <Dialog.ButtonBar>
        <Button styleType="default" onClick={handleClose} disabled={updateITwinMutation.isPending}>
          取消
        </Button>
        <Button
          styleType="high-visibility"
          onClick={handleSubmit}
          disabled={updateITwinMutation.isPending}
          loading={updateITwinMutation.isPending}
        >
          保存
        </Button>
      </Dialog.ButtonBar>
    </Dialog>
  );
});

// Display name for debugging
EditITwinDialog.displayName = 'EditITwinDialog';
