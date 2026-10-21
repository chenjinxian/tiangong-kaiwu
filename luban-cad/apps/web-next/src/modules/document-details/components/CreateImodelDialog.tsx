/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CreateImodelDialog（Task 6）：新建 iModel 对话框——名称（必填）+
 * 描述（可选）→ ImodelsClient.create(iTwinId, { name, description })。
 * 成功失效 ['documents','imodels'] 前缀（网格 + hero 计数自动刷新）
 * 并回调父组件关闭；失败内联呈现错误并保持对话框在场承接重试
 * （与 CreateDocumentDialog / RenameDocumentDialog 同口径）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, LabeledInput, Text } from '@itwin/itwinui-react';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';

export interface CreateImodelDialogProps {
  iTwinId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateImodelDialog({
  iTwinId,
  isOpen,
  onClose,
  onCreated,
}: CreateImodelDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [nameError, setNameError] = React.useState('');
  const [submitError, setSubmitError] = React.useState('');

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      new ImodelsClient().create(iTwinId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'imodels'] });
    },
  });

  const reset = React.useCallback(() => {
    setName('');
    setDescription('');
    setNameError('');
    setSubmitError('');
  }, []);

  const handleClose = React.useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = React.useCallback(async () => {
    if (!name.trim()) {
      setNameError(t('documents.detail.create.nameRequired'));
      return;
    }
    setNameError('');
    setSubmitError('');
    const trimmedDescription = description.trim();
    const input = { name: name.trim(), ...(trimmedDescription ? { description: trimmedDescription } : {}) };
    try {
      await createMutation.mutateAsync(input);
      onCreated();
      handleClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('documents.detail.create.failed'));
    }
  }, [name, description, createMutation, onCreated, handleClose, t]);

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} portal isDismissible>
      <Dialog.Backdrop />
      <Dialog.Main
        styleType="default"
        title={t('documents.detail.create.title')}
        className="document-details-dialog"
      >
        <Dialog.TitleBar titleText={t('documents.detail.create.title')} />
        <Dialog.Content>
          {submitError && (
            <Text color="negative" className="document-details-dialog__error">
              {submitError}
            </Text>
          )}
          <LabeledInput
            required
            label={t('documents.detail.create.nameLabel')}
            placeholder={t('documents.detail.create.namePlaceholder')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError('');
            }}
            status={nameError ? 'negative' : undefined}
            message={nameError}
            disabled={createMutation.isPending}
            autoFocus
          />
          <LabeledInput
            label={t('documents.detail.create.descriptionLabel')}
            placeholder={t('documents.detail.create.descriptionPlaceholder')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={createMutation.isPending}
          />
        </Dialog.Content>
        <Dialog.ButtonBar>
          <Button styleType="default" onClick={handleClose} disabled={createMutation.isPending}>
            {t('documents.create.cancel')}
          </Button>
          <Button
            styleType="high-visibility"
            onClick={() => void handleSubmit()}
            disabled={createMutation.isPending}
            loading={createMutation.isPending}
          >
            {t('documents.create.submit')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
