/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import {
  Button,
  Dialog,
  InputGroup,
  Label,
  Input,
  Text,
} from '@itwin/itwinui-react';
import { ITwinSubClass, useITwinMutations } from '../hooks/useITwinsQuery.js';
import { logger } from '../../../shared/lib/logger.js';
import './Dialog.css';

interface CreateITwinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * 创建 iTwin 项目对话框
 * Uses iTwinUI components for consistent design
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CreateITwinDialog: React.FC<CreateITwinDialogProps> = React.memo(({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  const createITwinMutation = useITwinMutations();

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!displayName.trim()) {
      newErrors.displayName = '请输入项目名称';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [displayName]);

  const handleClose = useCallback(() => {
    setDisplayName('');
    setProjectNumber('');
    setErrors({});
    setSubmitError('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitError('');

    try {
      await createITwinMutation.mutateAsync({
        displayName: displayName.trim(),
        subClass: ITwinSubClass.Project,
      });

      onCreated?.();
      handleClose();
    } catch (error) {
      logger.error('创建 iTwin 失败', error instanceof Error ? error : undefined);
      const message = error instanceof Error ? error.message : '创建失败，请重试';
      setSubmitError(message);
    }
  }, [displayName, validate, createITwinMutation, onCreated, handleClose]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      portal
      isDismissible
    >
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title="创建 iTwin 项目" className="create-dialog">
        <Dialog.TitleBar title="创建 iTwin 项目" />
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
              placeholder="输入项目名称"
              disabled={createITwinMutation.isPending}
              autoFocus
              status={errors.displayName ? 'negative' : undefined}
            />
            {errors.displayName && (
            <span className="field-error">{errors.displayName}</span>
          )}
          </InputGroup>

          <InputGroup>
            <Label>项目编号</Label>
            <Input
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              placeholder="输入项目编号（可选）"
              disabled={createITwinMutation.isPending}
            />
          </InputGroup>
        </Dialog.Content>

        <Dialog.ButtonBar>
          <Button styleType="default" onClick={handleClose} disabled={createITwinMutation.isPending}>
            取消
          </Button>
          <Button
            styleType="high-visibility"
            onClick={handleSubmit}
            disabled={createITwinMutation.isPending}
            loading={createITwinMutation.isPending}
          >
            创建
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
});

// Display name for debugging
CreateITwinDialog.displayName = 'CreateITwinDialog';
