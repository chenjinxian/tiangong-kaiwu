/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * RenameDocumentDialog（Task 5）：重命名文档对话框（行操作「重命名」入口）——
 * 名称必填 → ItwinsClient.update(id, {displayName})（官方 updateiTwin 增量语义）。
 * 成功 invalidate 列表并回调父组件。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, LabeledInput, Text } from '@itwin/itwinui-react';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import type { DocumentSummary } from '../types.js';

export interface RenameDocumentDialogProps {
  doc: DocumentSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onRenamed: () => void;
}

export function RenameDocumentDialog({
  doc,
  isOpen,
  onClose,
  onRenamed,
}: RenameDocumentDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [nameError, setNameError] = React.useState('');
  const [submitError, setSubmitError] = React.useState('');

  // 打开目标切换时同步初始值（key 由父组件以 doc.id 钉住，此处兜底 setState 同步）。
  React.useEffect(() => {
    setName(doc?.name ?? '');
    setNameError('');
    setSubmitError('');
  }, [doc]);

  const renameMutation = useMutation({
    mutationFn: (input: { id: string; displayName: string }) =>
      new ItwinsClient().update(input.id, { displayName: input.displayName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSubmit = React.useCallback(async () => {
    if (!doc) return;
    if (!name.trim()) {
      setNameError(t('documents.rename.nameRequired'));
      return;
    }
    setNameError('');
    setSubmitError('');
    try {
      await renameMutation.mutateAsync({ id: doc.id, displayName: name.trim() });
      onRenamed();
      handleClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('documents.rename.failed'));
    }
  }, [doc, name, renameMutation, onRenamed, handleClose, t]);

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} portal isDismissible>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={t('documents.rename.title')} className="documents-dialog">
        <Dialog.TitleBar titleText={t('documents.rename.title')} />
        <Dialog.Content>
          {submitError && (
            <Text color="negative" className="documents-dialog__error">
              {submitError}
            </Text>
          )}
          <LabeledInput
            required
            label={t('documents.rename.nameLabel')}
            placeholder={t('documents.rename.namePlaceholder')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError('');
            }}
            status={nameError ? 'negative' : undefined}
            message={nameError}
            disabled={renameMutation.isPending}
            autoFocus
          />
        </Dialog.Content>
        <Dialog.ButtonBar>
          <Button styleType="default" onClick={handleClose} disabled={renameMutation.isPending}>
            {t('documents.rename.cancel')}
          </Button>
          <Button
            styleType="high-visibility"
            onClick={() => void handleSubmit()}
            disabled={renameMutation.isPending}
            loading={renameMutation.isPending}
          >
            {t('documents.rename.submit')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
