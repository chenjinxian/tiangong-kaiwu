/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PushChangesetDialog（web-next M4 Task 7）：推送对话框——本地变更打包为
 * changeset 推送到 iModel hub 前的描述录入面（旧应用
 * features/version-control/components/PushChangesetDialog.tsx 形态移植，模态
 * iTwinUI Dialog 壳改走 web-next 既有 Dialog.Backdrop/Main 契约）：
 * - 描述必填：空/纯空白确认钮禁用（trim 口径，不发起推送）；
 * - onConfirm 为 **Promise 通道**（宿主接 `connection.pushChanges(description)`）
 *   ——成功：IModelApp.notifications 成功 toast（标准管道，与 FeatureDialog
 *   提交 toast 同款）+ 复位 + onClose 收合；失败：就地错误行（消息含原因），
 *   对话框不收合、输入保留可重试（六态 error）；
 * - 提交中防重入：确认钮禁用 + 标签切「推送中…」；取消直收合不提交。
 * 受控口径（组件不自销）：开合由宿主 isOpen 驱动——顶栏「保存版本」钮与
 * dock「推送」钮共享同一实例（Session 宿主持有）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { Button, Dialog, Input, Text } from '@itwin/itwinui-react';
import './PushChangesetDialog.css';

export interface PushChangesetDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when dialog is closed */
  onClose: () => void;
  /** 确认出口（Promise 通道：宿主接 connection.pushChanges；reject 即就地失败）。 */
  onConfirm: (description: string) => Promise<void>;
}

export function PushChangesetDialog({
  isOpen,
  onClose,
  onConfirm,
}: PushChangesetDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  // 开合切换时复位本地态（重开即净面，宿主可复用同实例）。
  React.useEffect(() => {
    if (!isOpen) {
      setDescription('');
      setSubmitError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const trimmed = description.trim();

  const handleConfirm = React.useCallback(async (): Promise<void> => {
    const value = description.trim();
    if (!value || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await onConfirm(value);
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t('partStudio.pushChangeset.success'),
        ),
      );
      onClose();
    } catch (error) {
      setSubmitError(
        t('partStudio.pushChangeset.pushFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [description, isSubmitting, onConfirm, onClose, t]);

  const handleClose = React.useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  // setFocus（review-8 I-1 P2 补齐）：打开即焦点入对话框——Escape 关闭挂
  // 对话框元素 onKeyDown，焦点不在其内则击键永不可达。
  return (
    <Dialog isOpen={isOpen} onClose={handleClose} portal isDismissible setFocus>
      <Dialog.Backdrop />
      <Dialog.Main
        styleType="default"
        title={t('partStudio.pushChangeset.title')}
        aria-label={t('partStudio.pushChangeset.title')}
      >
        <Dialog.TitleBar titleText={t('partStudio.pushChangeset.title')} />
        <Dialog.Content>
          <div className="part-studio-push-dialog__body">
            <label htmlFor="part-studio-changeset-description">
              {t('partStudio.pushChangeset.descriptionLabel')}
              <span className="part-studio-push-dialog__required">
                {t('partStudio.pushChangeset.required')}
              </span>
            </label>
            <Input
              id="part-studio-changeset-description"
              type="text"
              value={description}
              disabled={isSubmitting}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              placeholder={t('partStudio.pushChangeset.descriptionPlaceholder')}
              data-testid="part-studio-push-description-input"
            />
            {submitError && (
              <Text color="negative" data-testid="part-studio-push-error">
                {submitError}
              </Text>
            )}
          </div>
        </Dialog.Content>
        <Dialog.ButtonBar>
          <Button styleType="default" onClick={handleClose} disabled={isSubmitting}>
            {t('partStudio.pushChangeset.cancel')}
          </Button>
          <Button
            styleType="high-visibility"
            disabled={!trimmed || isSubmitting}
            aria-busy={isSubmitting}
            onClick={() => void handleConfirm()}
            data-testid="part-studio-push-confirm-button"
          >
            {isSubmitting ? t('partStudio.pushChangeset.pushing') : t('partStudio.pushChangeset.confirm')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
