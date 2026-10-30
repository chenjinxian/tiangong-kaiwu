/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CreateDocumentDialog（Task 5）：新建文档对话框——名称（必填）+ 编号（可选）
 * → ItwinsClient.create。创建载荷只发官方 `subClass:'Project'`，不发送
 * `class`——由 hub 从 subClass 派生 class（Project → Endeavor，ADR-0001
 * P0 服务端派生规则）。滚动升级兼容：pre-P0 hub 的白名单会静默剥离未知
 * `subClass` 并自行缺省 `class:'Project'`，新 web 不炸；新 hub 则派生
 * `Endeavor/Project`。编号透传 hub（白名单未知字段时由服务端静默剥离）。
 * 成功 invalidate 列表并回调父组件。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ITwinSubClass } from '@itwin/itwins-client';
import { Button, Dialog, LabeledInput, Text } from '@itwin/itwinui-react';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import type { CreateItwinInput } from '@clients/itwins/types.js';

export interface CreateDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateDocumentDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateDocumentDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [number, setNumber] = React.useState('');
  const [nameError, setNameError] = React.useState('');
  const [submitError, setSubmitError] = React.useState('');

  const createMutation = useMutation({
    mutationFn: (input: CreateItwinInput) => new ItwinsClient().create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const reset = React.useCallback(() => {
    setName('');
    setNumber('');
    setNameError('');
    setSubmitError('');
  }, []);

  const handleClose = React.useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = React.useCallback(async () => {
    if (!name.trim()) {
      setNameError(t('documents.create.nameRequired'));
      return;
    }
    setNameError('');
    setSubmitError('');
    // 官方类型是 TS 字符串枚举（非字面量联合），载荷须取枚举成员；
    // 运行期值即 'Project'。class 由 hub 从 subClass 派生（Project →
    // Endeavor）——客户端不再发送 class，保证对 pre-P0 hub 的滚动升级兼容。
    const input: CreateItwinInput = {
      displayName: name.trim(),
      subClass: ITwinSubClass.Project,
    };
    const trimmedNumber = number.trim();
    if (trimmedNumber) {
      input.number = trimmedNumber;
    }
    try {
      await createMutation.mutateAsync(input);
      onCreated();
      handleClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('documents.create.failed'));
    }
  }, [name, number, createMutation, onCreated, handleClose, t]);

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} portal isDismissible>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={t('documents.create.title')} className="documents-dialog">
        <Dialog.TitleBar titleText={t('documents.create.title')} />
        <Dialog.Content>
          {submitError && (
            <Text color="negative" className="documents-dialog__error">
              {submitError}
            </Text>
          )}
          <LabeledInput
            required
            label={t('documents.create.nameLabel')}
            placeholder={t('documents.create.namePlaceholder')}
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
            label={t('documents.create.numberLabel')}
            placeholder={t('documents.create.numberPlaceholder')}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
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
