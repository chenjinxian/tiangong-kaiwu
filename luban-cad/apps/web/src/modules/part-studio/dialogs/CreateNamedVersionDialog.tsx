/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CreateNamedVersionDialog（B-model P0 Task 5）：创建 Named Version 对话框——
 * 顶栏「保存版本」入口（PushChangesetDialog 退居 dock「推送」专用）：
 * - 版本名称必填（空/纯空白确认钮禁用，trim 口径）；描述可选；
 * - onConfirm 为 **Promise 通道**（宿主接 useNamedVersionActions.createNamedVersion
 *   ——有未保存变更时先 pushChanges 再命名）：成功走 IModelApp.notifications
 *   成功 toast（标准管道）+ onClose 收合；失败就地错误行（含原因），对话框不
 *   收合、输入保留可重试；
 * - 提交中防重入：确认钮禁用 + 标签切「保存中…」；取消直收合不提交。
 * - 语义诚实（hub 现状 2026-10-30）：Named Version 仅元数据命名，不生成
 *   checkpoint/缩略图——成功文案只说「版本已保存」，不宣称可离线打开的快照。
 * 受控口径（组件不自销）：开合由宿主 isOpen 驱动。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { Button, Dialog, Input, Text } from '@itwin/itwinui-react';
import type { NamedVersionDraft } from '../hooks/useNamedVersionActions.js';
import './CreateNamedVersionDialog.css';

export interface CreateNamedVersionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (draft: NamedVersionDraft) => Promise<void>;
}

export function CreateNamedVersionDialog({
  isOpen,
  onClose,
  onConfirm,
}: CreateNamedVersionDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  // 开合切换时复位本地态（重开即净面，宿主可复用同实例）。
  // 重开（false→true）清陈旧错误：提交在途时宿主可强制收合（T7-② 断连 effect
  // 直接翻 isOpen），随后 promise 的 catch 才落 setSubmitError——若不清，下次
  // 打开会显示「保存失败」而本次根本未发起提交。
  React.useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setSubmitError('');
      setIsSubmitting(false);
    } else {
      setSubmitError('');
    }
  }, [isOpen]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  const handleConfirm = React.useCallback(async (): Promise<void> => {
    if (!trimmedName || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await onConfirm({
        name: trimmedName,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t('partStudio.namedVersion.success'),
        ),
      );
      onClose();
    } catch (error) {
      setSubmitError(
        t('partStudio.namedVersion.failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [trimmedName, trimmedDescription, isSubmitting, onConfirm, onClose, t]);

  // 提交中禁收合（Escape/背板/X 全关）：onConfirm（pushChanges + createNamedVersion）
  // 在途时关闭会让操作无声继续、成功 toast 在「取消」后出现；T7-② 断连强制收合
  // 的陈旧错误则由上面的重开清面兜底。注意成功路径另行直调 onClose（此时
  // isSubmitting 仍为 true，不能走本守卫）。
  const handleClose = React.useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      portal
      isDismissible={!isSubmitting}
      setFocus
    >
      <Dialog.Backdrop />
      <Dialog.Main
        styleType="default"
        title={t('partStudio.namedVersion.title')}
        aria-label={t('partStudio.namedVersion.title')}
      >
        <Dialog.TitleBar titleText={t('partStudio.namedVersion.title')} />
        <Dialog.Content>
          <div className="part-studio-version-dialog__body">
            <label htmlFor="part-studio-version-name">
              {t('partStudio.namedVersion.nameLabel')}
              <span className="part-studio-version-dialog__required">
                {t('partStudio.namedVersion.required')}
              </span>
            </label>
            <Input
              id="part-studio-version-name"
              value={name}
              disabled={isSubmitting}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('partStudio.namedVersion.namePlaceholder')}
              data-testid="part-studio-version-name-input"
            />
            <label htmlFor="part-studio-version-description">
              {t('partStudio.namedVersion.descriptionLabel')}
            </label>
            <Input
              id="part-studio-version-description"
              value={description}
              disabled={isSubmitting}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('partStudio.namedVersion.descriptionPlaceholder')}
              data-testid="part-studio-version-description-input"
            />
            {submitError && <Text color="negative">{submitError}</Text>}
          </div>
        </Dialog.Content>
        <Dialog.ButtonBar>
          <Button styleType="default" onClick={handleClose} disabled={isSubmitting}>
            {t('partStudio.namedVersion.cancel')}
          </Button>
          <Button
            styleType="high-visibility"
            disabled={!trimmedName || isSubmitting}
            aria-busy={isSubmitting}
            onClick={() => void handleConfirm()}
          >
            {isSubmitting
              ? t('partStudio.namedVersion.saving')
              : t('partStudio.namedVersion.confirm')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
