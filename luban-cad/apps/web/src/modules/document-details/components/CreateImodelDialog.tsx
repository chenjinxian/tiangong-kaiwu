/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CreateImodelDialog（Task 6 / P2.3）：新建 iModel（B 项目中的「文档」）——
 * 名称（必填）+ 描述（可选）→ `ImodelsClient.createPending`（hub `POST /imodels`
 * 不等待）+ 自建初始化轮询。
 *
 * P2.3 fix round 1（F3/F4）：
 * - **不使用官方 `createEmpty`**：它在内部最多等待 5 分钟，失败时抛错且错误
 *   不带 iModel id，导致重试只能重复建文档。`createPending` 立即返回 id，
 *   再由 `waitForImodelInitialized`（60s cap）轮询 `GET /imodels/:id`；
 * - 只有 initialized 才 `onCreated` 进入编辑器；失败/缺文件/超时保持文档、
 *   呈现「再次检查/重试」且绝不重复 POST、绝不删除；
 * - runId/abort guard：POST 或轮询期间关闭对话框（Escape/backdrop/取消）后，
 *   迟到的结果既不导航也不回写幽灵状态；但 POST 成功后的列表失效仍执行
 *   （文档确实已创建，列表必须刷新）。
 *
 * 403（hub imodels_manage 守卫）映射为专属文案
 * `documents.detail.create.forbidden`（终审 I3）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
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

  // runId 代次 + abort：关闭/重试/卸载让在途 POST 与轮询结果全部作废。
  const runRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const cancelPendingWait = React.useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const resetFields = React.useCallback(() => {
    setName('');
    setDescription('');
    setNameError('');
    setSubmitError('');
    setPhase({ kind: 'idle' });
  }, []);

  const handleClose = React.useCallback(() => {
    cancelPendingWait();
    resetFields();
    onClose();
  }, [cancelPendingWait, resetFields, onClose]);

  React.useEffect(() => {
    // 卸载兜底：终止仍在进行的轮询。
    return () => cancelPendingWait();
  }, [cancelPendingWait]);

  /** 轮询同一 id 至 initialized（失败态「再次检查」走同一入口，不再 POST）。 */
  const pollExisting = React.useCallback(
    async (imodelId: string, run: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ kind: 'waiting', imodelId });

      const result = await waitForImodelInitialized(imodelId, { signal: controller.signal });
      if (run !== runRef.current || controller.signal.aborted) return;

      if (result.status === 'initialized') {
        void queryClient.invalidateQueries({ queryKey: ['documents', 'imodels'] });
        cancelPendingWait();
        resetFields();
        onCreated(result.imodel);
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
    [cancelPendingWait, onClose, onCreated, queryClient, resetFields],
  );

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
    const run = runRef.current + 1;
    runRef.current = run;
    setPhase({ kind: 'creating' });
    try {
      const created = await new ImodelsClient().createPending(iTwinId, input);
      // 文档已建库：无论对话框是否已关闭，列表都必须刷新（F4）。
      void queryClient.invalidateQueries({ queryKey: ['documents', 'imodels'] });
      if (run !== runRef.current) return;
      await pollExisting(created.id, run);
    } catch (error) {
      if (run !== runRef.current) return; // 已关闭/已被新一轮取代：不写幽灵状态
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
  }, [phase.kind, name, description, iTwinId, queryClient, pollExisting, t]);

  const handleRetry = React.useCallback(() => {
    if (phase.kind !== 'failed') return;
    const run = runRef.current + 1;
    runRef.current = run;
    void pollExisting(phase.imodelId, run);
  }, [phase, pollExisting]);

  const busy = phase.kind === 'creating' || phase.kind === 'waiting';
  const failed = phase.kind === 'failed';
  const terminalFailure =
    failed && (phase.reason === 'initializationFailed' || phase.reason === 'missingFiles');

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
                {terminalFailure
                  ? t('documents.detail.create.terminalRetryHint')
                  : t('documents.detail.create.retryHint')}
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
              <Button styleType="high-visibility" onClick={handleRetry}>
                {terminalFailure
                  ? t('documents.detail.create.checkAgain')
                  : t('documents.detail.create.retry')}
              </Button>
            </>
          ) : (
            <>
              {/* 创建/等待期间允许关闭：runId/abort 保证迟到的结果不导航、不写状态。 */}
              <Button styleType="default" onClick={handleClose}>
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
