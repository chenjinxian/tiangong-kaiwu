/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CreateImodelDialog（Task 6 / P2.3）：新建 iModel（B 项目中的「文档」）——
 * 名称（必填）+ 描述（可选）→ ImodelsClient.create(iTwinId, { name, description })。
 *
 * P2.3 初始化等待（B 文档创建硬约束）：
 * - hub 的 iModel 创建是异步的（POST 返回 notInitialized，baseline 由
 *   webhook-agent 生成后 state 才变 initialized）。创建成功后必须轮询
 *   `GET /imodels/:id` 至 initialized，**只有 initialized 才回调 onCreated
 *   进入编辑器**；
 * - initializationFailed / missingFiles 立即呈现失败 + 重试；超过轮询上限
 *   呈现超时 + 重试；
 * - 失败时不删除文档（不静默抹掉用户刚创建的文档），关闭后仍保留；
 * - 关闭/卸载时 abort 轮询（不再有后台请求）。
 *
 * 成功失效 ['documents','imodels'] 前缀（网格 + hero 计数自动刷新）。
 * 403（hub imodels_manage 守卫）映射为专属文案
 * `documents.detail.create.forbidden`（终审 I3）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, LabeledInput, ProgressRadial, Text } from '@itwin/itwinui-react';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { ApiClientError } from '@clients/http/ApiClientError.js';
import { waitForImodelInitialized } from '../hooks/useImodels.js';
import type { ImodelSummary } from '../types.js';

export interface CreateImodelDialogProps {
  iTwinId: string;
  isOpen: boolean;
  onClose: () => void;
  /** 仅 initialized 后回调（父组件负责刷新列表并进入编辑器）。 */
  onCreated: (imodel: ImodelSummary) => void;
}

type FailureReason = 'initializationFailed' | 'missingFiles' | 'timeout' | 'error';

type SubmitPhase =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'waiting'; imodelId: string }
  | { kind: 'failed'; imodelId: string; reason: FailureReason; message?: string };

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
  const [phase, setPhase] = React.useState<SubmitPhase>({ kind: 'idle' });

  // 轮询代次 + 中止：关闭/重试/卸载都会让上一次等待的结果作废。
  const attemptRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      new ImodelsClient().create(iTwinId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'imodels'] });
    },
  });

  const cancelPendingWait = React.useCallback(() => {
    attemptRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = React.useCallback(() => {
    cancelPendingWait();
    setName('');
    setDescription('');
    setNameError('');
    setSubmitError('');
    setPhase({ kind: 'idle' });
  }, [cancelPendingWait]);

  /** 轮询至 initialized（可重试：失败态点击重试走同一入口）。 */
  const waitForInitialized = React.useCallback(
    async (imodelId: string) => {
      cancelPendingWait();
      const attempt = attemptRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ kind: 'waiting', imodelId });

      const result = await waitForImodelInitialized(imodelId, { signal: controller.signal });
      if (attempt !== attemptRef.current || controller.signal.aborted) return;

      if (result.status === 'initialized') {
        void queryClient.invalidateQueries({ queryKey: ['documents', 'imodels'] });
        onCreated(result.imodel);
        reset();
        onClose();
        return;
      }
      if (result.status === 'failed') {
        setPhase({
          kind: 'failed',
          imodelId,
          reason: result.imodel.state === 'missingFiles' ? 'missingFiles' : 'initializationFailed',
        });
        return;
      }
      if (result.status === 'timeout') {
        setPhase({ kind: 'failed', imodelId, reason: 'timeout' });
        return;
      }
      if (result.status === 'error') {
        setPhase({
          kind: 'failed',
          imodelId,
          reason: 'error',
          message: result.error instanceof Error ? result.error.message : undefined,
        });
      }
    },
    [cancelPendingWait, onClose, onCreated, queryClient, reset],
  );

  const handleClose = React.useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  React.useEffect(() => {
    // 卸载兜底：终止仍在进行的轮询。
    return () => cancelPendingWait();
  }, [cancelPendingWait]);

  const handleSubmit = React.useCallback(async () => {
    if (phase.kind === 'creating' || phase.kind === 'waiting') return;
    if (!name.trim()) {
      setNameError(t('documents.detail.create.nameRequired'));
      return;
    }
    setNameError('');
    setSubmitError('');
    const trimmedDescription = description.trim();
    const input = { name: name.trim(), ...(trimmedDescription ? { description: trimmedDescription } : {}) };
    setPhase({ kind: 'creating' });
    try {
      const created = await createMutation.mutateAsync(input);
      await waitForInitialized(created.id);
    } catch (error) {
      setPhase({ kind: 'idle' });
      // 403（hub imodels_manage 守卫拒绝）映射为专属 i18n 文案——服务端原始
      // message 是英文权限串，不是用户可读的拒绝理由（终审 I3 兜底；正常路径
      // 已由详情页权限门挡在入口）。
      if (error instanceof ApiClientError && error.status === 403) {
        setSubmitError(t('documents.detail.create.forbidden'));
        return;
      }
      setSubmitError(error instanceof Error ? error.message : t('documents.detail.create.failed'));
    }
  }, [phase.kind, name, description, createMutation, waitForInitialized, t]);

  const busy = phase.kind === 'creating' || phase.kind === 'waiting';
  const failed = phase.kind === 'failed';

  const failureText = React.useMemo(() => {
    if (phase.kind !== 'failed') return '';
    switch (phase.reason) {
      case 'initializationFailed':
        return t('documents.detail.create.initializationFailed');
      case 'missingFiles':
        return t('documents.detail.create.missingFiles');
      case 'timeout':
        return t('documents.detail.create.timeout');
      case 'error':
        return phase.message || t('documents.detail.create.statusQueryFailed');
    }
  }, [phase, t]);

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
          {failed && (
            <>
              <Text color="negative" className="document-details-dialog__error">
                {failureText}
              </Text>
              <Text variant="small" className="document-details-dialog__hint">
                {t('documents.detail.create.retryHint')}
              </Text>
            </>
          )}
          {phase.kind === 'waiting' && (
            <div className="document-details-init-waiting">
              <ProgressRadial size="small" indeterminate />
              <Text>{t('documents.detail.create.initializing')}</Text>
            </div>
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
            disabled={busy || failed}
            autoFocus
          />
          <LabeledInput
            label={t('documents.detail.create.descriptionLabel')}
            placeholder={t('documents.detail.create.descriptionPlaceholder')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy || failed}
          />
        </Dialog.Content>
        <Dialog.ButtonBar>
          {failed ? (
            <>
              <Button styleType="default" onClick={handleClose}>
                {t('documents.detail.create.close')}
              </Button>
              <Button
                styleType="high-visibility"
                onClick={() => void waitForInitialized(phase.imodelId)}
              >
                {t('documents.detail.create.retry')}
              </Button>
            </>
          ) : (
            <>
              {/* 等待初始化期间允许关闭（abort 轮询；文档保留，可稍后从列表打开）。 */}
              <Button styleType="default" onClick={handleClose} disabled={phase.kind === 'creating'}>
                {t('documents.create.cancel')}
              </Button>
              <Button
                styleType="high-visibility"
                onClick={() => void handleSubmit()}
                disabled={busy}
                loading={busy}
              >
                {t('documents.create.submit')}
              </Button>
            </>
          )}
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
