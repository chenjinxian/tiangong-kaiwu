/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Create iModel 工作流（RW4-P3-T3-3 itwin-ui Stepper 化）。
 *
 * 逻辑保留（RW2 起 baselinefile 预签名两段上传）：
 *   validating → creating（POST /imodels，带 baselineFile.size 时走 createWithBaseline）
 *   → initializing（模拟等待）→ uploading（POST /imodels/:id/baselinefile/upload 取
 *   预签名 uploadUrl → PUT 直传 /azurite 代理）→ completing（POST /imodels/:id/baselinefile）
 *   → completed / error（abort + 重试）。
 * UI：itwin-ui Dialog + Stepper + ProgressLinear + Alert/Input/Textarea；
 * e2e 契约锚点：`.dialog-container`（hasText 创建 iModel）/ placeholder 输入模型名称 / 创建按钮。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  SvgAdd,
  SvgCheckmark,
  SvgChevronRight,
  SvgClose,
  SvgCloudUpload,
  SvgRefresh,
  SvgStatusError,
} from '@itwin/itwinui-icons-react';
import {
  Alert,
  Button,
  Dialog,
  IconButton,
  Input,
  InputGroup,
  Label,
  ProgressLinear,
  Stepper,
  Text,
  Textarea,
} from '@itwin/itwinui-react';
import {
  useCreateIModelMutation,
  useCreateIModelWithBaselineMutation,
} from '../hooks/useIModelsQuery.js';
import { getStoredAuth } from '../../../features/auth/services/auth/client.js';
import { logger } from '../../../shared/lib/logger.js';
import './CreateIModelWorkflow.css';

interface CreateIModelWorkflowProps {
  iTwinId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (iModelId: string) => void;
}

type Step =
  | 'form'
  | 'validating'
  | 'creating'
  | 'initializing'
  | 'uploading'
  | 'completing'
  | 'completed'
  | 'error';

type ProcessingStep = Exclude<Step, 'form' | 'error' | 'completed'>;

interface StepInfo {
  progressMin: number;
  progressMax: number;
}

const STEP_INFO: Record<ProcessingStep, StepInfo> = {
  validating: { progressMin: 0, progressMax: 10 },
  creating: { progressMin: 10, progressMax: 30 },
  initializing: { progressMin: 30, progressMax: 50 },
  uploading: { progressMin: 50, progressMax: 80 },
  completing: { progressMin: 80, progressMax: 95 },
};

const STEP_KEYS = Object.keys(STEP_INFO) as ProcessingStep[];

// eslint-disable-next-line @typescript-eslint/naming-convention
export const CreateIModelWorkflow: React.FC<CreateIModelWorkflowProps> = ({
  iTwinId,
  isOpen,
  onClose,
  onCreated,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation('documents');
  const [step, setStep] = useState<Step>('form');
  const [displayProgress, setDisplayProgress] = useState(0);
  const [actualProgress, setActualProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorStep, setErrorStep] = useState<Step | null>(null);
  const [createdIModelId, setCreatedIModelId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [nameError, setNameError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const createIModel = useCreateIModelMutation();
  const createIModelWithBaseline = useCreateIModelWithBaselineMutation();
  const isLoading = createIModel.isPending || createIModelWithBaseline.isPending;

  const stepLabel = useCallback(
    (key: ProcessingStep) => t(`createIModel.steps.${key}.label`),
    [t],
  );
  const stepDescription = useCallback(
    (key: ProcessingStep) => t(`createIModel.steps.${key}.description`),
    [t],
  );

  // Smooth progress animation
  useEffect(() => {
    if (displayProgress === actualProgress) return;

    const diff = actualProgress - displayProgress;
    const progressStep = diff > 0 ? Math.max(0.5, diff * 0.1) : Math.min(-0.5, diff * 0.1);

    const timer = setTimeout(() => {
      if (Math.abs(diff) < 1) {
        setDisplayProgress(actualProgress);
      } else {
        setDisplayProgress((prev) => prev + progressStep);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [displayProgress, actualProgress]);

  // Update progress based on step
  const updateStepProgress = useCallback((currentStep: ProcessingStep) => {
    const info = STEP_INFO[currentStep];
    setActualProgress(info.progressMin);

    // Animate to max progress for this step
    setTimeout(() => {
      setActualProgress(info.progressMax);
    }, 100);
  }, []);

  // Reset error states when dialog opens
  useEffect(() => {
    if (isOpen) {
      setNameError('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const reset = () => {
    setStep('form');
    setDisplayProgress(0);
    setActualProgress(0);
    setError(null);
    setErrorStep(null);
    setCreatedIModelId(null);
    setIsCancelling(false);
    setName('');
    setDescription('');
    setBaselineFile(null);
    setNameError('');
    abortControllerRef.current = null;
  };

  const canClose = step === 'form' || step === 'completed' || step === 'error';

  const handleClose = () => {
    // Allow close only in form, completed, or error states
    if (!canClose) {
      return;
    }
    reset();
    onClose();
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      setNameError(t('createIModel.validation.nameRequired'));
      return false;
    }
    if (name.trim().length < 2) {
      setNameError(t('createIModel.validation.nameTooShort'));
      return false;
    }
    setNameError('');
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.endsWith('.bim')) {
        setError(t('createIModel.validation.invalidFileType'));
        return;
      }
      // Validate file size (100MB max)
      if (file.size > 100 * 1024 * 1024) {
        setError(t('createIModel.validation.fileTooLarge'));
        return;
      }
      setBaselineFile(file);
      setError(null);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsCancelling(true);
    setTimeout(() => {
      setStep('form');
      setIsCancelling(false);
      setDisplayProgress(0);
      setActualProgress(0);
    }, 500);
  };

  /**
   * Convert Azurite URL to proxy URL to avoid CORS issues
   * Original: http://localhost:10000/devstoreaccount1/...
   * Proxy:    /azurite/devstoreaccount1/...
   */
  const convertToProxyUrl = (azuriteUrl: string): string => {
    try {
      const url = new URL(azuriteUrl);
      // Only convert localhost:10000 URLs
      if (url.hostname === 'localhost' && url.port === '10000') {
        return `/azurite${url.pathname}${url.search}`;
      }
      return azuriteUrl;
    } catch {
      return azuriteUrl;
    }
  };

  const uploadBaselineFile = async (uploadUrl: string, file: File, signal: AbortSignal): Promise<void> => {
    // Use proxy URL to avoid CORS
    const proxyUrl = convertToProxyUrl(uploadUrl);
    logger.debug('[uploadBaselineFile] Converting URL', { uploadUrl, proxyUrl });
    logger.debug('[uploadBaselineFile] File info', { size: file.size, type: file.type });

    // Azure Blob requires x-ms-blob-type header for PUT operations
    const response = await fetch(proxyUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        // Don't set Content-Type - let browser set it or Azure will infer from blob type
      },
      signal,
    });

    logger.debug('[uploadBaselineFile] Response status', { status: response.status });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error('[uploadBaselineFile] Error response', { errorText });
      throw new Error(t('createIModel.errors.uploadFailed', {
        status: response.status,
        statusText: response.statusText,
      }));
    }
  };

  const handleCreateIModel = async () => {
    // Clear previous errors before validation
    setError(null);
    if (!validate()) return;

    // Create new abort controller for this operation
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      // Step 1: Validating
      setStep('validating');
      updateStepProgress('validating');
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (signal.aborted) return;

      // Step 2: Creating
      setStep('creating');
      updateStepProgress('creating');

      let iModel;

      if (baselineFile) {
        iModel = await createIModelWithBaseline.mutateAsync({
          iTwinId,
          name: name.trim(),
          description: description.trim() || undefined,
          fileSize: baselineFile.size,
        });

        const iModelId = iModel.id;

        if (signal.aborted) return;

        // Step 3: Initializing (simulated progress)
        setStep('initializing');
        updateStepProgress('initializing');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (signal.aborted) return;

        // Step 4: Uploading
        setStep('uploading');
        updateStepProgress('uploading');

        const { tokens } = getStoredAuth();
        if (!tokens) {
          throw new Error(t('createIModel.errors.notAuthenticated'));
        }

        const uploadResponse = await fetch(
          `${import.meta.env.VITE_IMODELHUB_URL || ''}/imodels/${iModelId}/baselinefile/upload`,
          {
            method: 'POST',
            headers: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              'Authorization': `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: baselineFile.name,
              fileSize: baselineFile.size,
            }),
            signal,
          }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text().catch(() => 'Unknown error');
          logger.error('[CreateIModelWorkflow] Upload URL failed', { status: uploadResponse.status, errorText });
          throw new Error(t('createIModel.errors.uploadUrlFailed', { status: uploadResponse.status }));
        }

        const { uploadUrl } = await uploadResponse.json();

        if (signal.aborted) return;

        await uploadBaselineFile(uploadUrl, baselineFile, signal);

        if (signal.aborted) return;

        // Step 5: Completing
        setStep('completing');
        updateStepProgress('completing');

        const completeResponse = await fetch(
          `${import.meta.env.VITE_IMODELHUB_URL || ''}/imodels/${iModelId}/baselinefile`,
          {
            method: 'POST',
            headers: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              'Authorization': `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileSize: baselineFile.size,
              briefcaseId: crypto.randomUUID(),
              fileName: baselineFile.name,
            }),
            signal,
          }
        );

        if (!completeResponse.ok) {
          const errorText = await completeResponse.text().catch(() => 'Unknown error');
          logger.error('[CreateIModelWorkflow] Complete upload failed', { status: completeResponse.status, errorText });
          throw new Error(t('createIModel.errors.completeUploadFailed', { status: completeResponse.status }));
        }

        if (signal.aborted) return;

        // Skip waiting for modeling-server processing - show success immediately
        // The iModel will be in 'notInitialized' state until webhook-agent finishes processing
      } else {
        iModel = await createIModel.mutateAsync({
          iTwinId,
          name: name.trim(),
          description: description.trim() || undefined,
        });
      }

      if (signal.aborted) return;

      const newIModelId = iModel.id;
      setCreatedIModelId(newIModelId);
      setActualProgress(100);
      setStep('completed');

      // Notify parent
      onCreated?.(newIModelId);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        logger.info('iModel creation cancelled');
        return;
      }
      logger.error('iModel creation failed', err instanceof Error ? err : undefined);
      let errorMessage = err instanceof Error ? err.message : t('createIModel.errors.createFailed');

      // Handle authentication errors
      if (errorMessage.toLowerCase().includes('not authenticated') ||
          errorMessage.toLowerCase().includes('unauthorized') ||
          errorMessage.includes('未认证') ||
          errorMessage.includes('请登录')) {
        errorMessage = t('createIModel.errors.sessionExpired');
        // Redirect to login after showing error
        setTimeout(() => {
          navigate('/login', { state: { from: window.location.pathname } });
        }, 2000);
      }

      logger.error('[CreateIModelWorkflow] Error', err instanceof Error ? err : { errorMessage });
      setError(errorMessage);
      setErrorStep(step);
      setStep('error');
    }
  };

  const handleRetry = () => {
    // Retry from the step that failed
    if (errorStep && errorStep !== 'form') {
      setStep(errorStep);
      setError(null);
      void handleCreateIModel();
    } else {
      setStep('form');
      setError(null);
    }
  };

  const handleOpenIModel = () => {
    if (createdIModelId) {
      navigate(`/documents/${iTwinId}/${createdIModelId}`);
    }
  };

  const handleCreateAnother = () => {
    // Keep the dialog open but reset to form
    setStep('form');
    setDisplayProgress(0);
    setActualProgress(0);
    setError(null);
    setErrorStep(null);
    setCreatedIModelId(null);
    setName('');
    setDescription('');
    setBaselineFile(null);
  };

  const isProcessing = step !== 'form' && step !== 'completed' && step !== 'error';
  const currentStepIndex = isProcessing ? STEP_KEYS.indexOf(step) : STEP_KEYS.length;
  const currentStepInfo = isProcessing ? stepDescription(step) : '';
  const title = step === 'completed'
    ? t('createIModel.successTitle')
    : step === 'error'
      ? t('createIModel.errorTitle')
      : t('createIModel.title');

  const stepperSteps = STEP_KEYS.map((key) => ({
    name: stepLabel(key),
    description: stepDescription(key),
  }));

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} portal isDismissible={canClose}>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={title} className="dialog-container">
        <Dialog.TitleBar
          titleText={title}
          isDismissible={canClose}
          onClose={canClose ? handleClose : undefined}
        />

        {/* 表单 */}
        {step === 'form' && (
          <>
            <Dialog.Content>
              <div className="cw-form">
                <InputGroup>
                  <Label required htmlFor="model-name">
                    {t('createIModel.form.nameLabel')}
                  </Label>
                  <Input
                    id="model-name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameError('');
                      setError(null);
                    }}
                    placeholder={t('createIModel.form.namePlaceholder')}
                    disabled={isLoading}
                    status={nameError ? 'negative' : undefined}
                    autoFocus
                  />
                  {nameError && (
                    <Text variant="small" className="cw-field-error">{nameError}</Text>
                  )}
                  <Text variant="small" className="cw-hint">
                    {t('createIModel.form.nameHint')}
                  </Text>
                </InputGroup>

                <InputGroup>
                  <Label htmlFor="model-description">
                    {t('createIModel.form.descriptionLabel')}
                  </Label>
                  <Textarea
                    id="model-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('createIModel.form.descriptionPlaceholder')}
                    disabled={isLoading}
                    rows={3}
                  />
                </InputGroup>

                <div className="cw-file-field">
                  <Label>{t('createIModel.form.baselineLabel')}</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".bim"
                    onChange={handleFileSelect}
                    disabled={isLoading}
                    style={{ display: 'none' }}
                  />
                  <div className="cw-file-row">
                    <Button
                      type="button"
                      styleType="default"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading}
                    >
                      {t('createIModel.form.selectFile')}
                    </Button>
                    {baselineFile ? (
                      <span className="cw-file-name">
                        <SvgCheckmark />
                        {baselineFile.name}
                        <IconButton
                          size="small"
                          styleType="borderless"
                          label={t('createIModel.form.removeFile')}
                          onClick={() => setBaselineFile(null)}
                        >
                          <SvgClose />
                        </IconButton>
                      </span>
                    ) : (
                      <Text variant="small" className="cw-hint">
                        {t('createIModel.form.noFile')}
                      </Text>
                    )}
                  </div>
                  <Text variant="small" className="cw-hint">
                    {t('createIModel.form.baselineHint')}
                  </Text>
                </div>

                {error && <Alert type="negative">{error}</Alert>}
              </div>
            </Dialog.Content>

            <Dialog.ButtonBar>
              <Button styleType="default" onClick={handleClose} disabled={isLoading}>
                {t('createIModel.form.cancel')}
              </Button>
              <Button
                styleType="high-visibility"
                onClick={() => void handleCreateIModel()}
                disabled={isLoading || !name.trim()}
                loading={isLoading}
              >
                {t('createIModel.form.submit')}
              </Button>
            </Dialog.ButtonBar>
          </>
        )}

        {/* 处理中（itwin-ui Stepper 编排） */}
        {isProcessing && (
          <Dialog.Content>
            <div className="cw-progress">
              <Stepper currentStep={currentStepIndex} steps={stepperSteps} />
              <ProgressLinear
                value={Math.round(displayProgress)}
                labels={[currentStepInfo, `${Math.round(displayProgress)}%`]}
              />
              <div className="cw-processing">
                <SvgCloudUpload className="cw-processing-icon" />
                <Text variant="subheading" as="h3">
                  {stepLabel(step)}
                </Text>
                <Text variant="small" className="cw-hint">{currentStepInfo}</Text>
              </div>
              <Button
                type="button"
                styleType="default"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling
                  ? t('createIModel.processing.cancelling')
                  : t('createIModel.processing.cancel')}
              </Button>
            </div>
          </Dialog.Content>
        )}

        {/* 成功 */}
        {step === 'completed' && (
          <Dialog.Content>
            <div className="cw-result">
              <SvgCheckmark className="cw-result-icon cw-result-icon--success" />
              <Text variant="headline" as="h3">{t('createIModel.success.title')}</Text>
              <Text>
                {baselineFile
                  ? t('createIModel.success.baselinePending', { name })
                  : t('createIModel.success.ready', { name })}
              </Text>
              <div className="cw-result-actions">
                <Button
                  styleType="high-visibility"
                  endIcon={<SvgChevronRight />}
                  onClick={handleOpenIModel}
                  disabled={!!baselineFile}
                  title={baselineFile ? t('createIModel.success.baselinePendingTitle') : ''}
                >
                  {t('createIModel.success.open')}
                </Button>
                <Button
                  styleType="default"
                  startIcon={<SvgAdd />}
                  onClick={handleCreateAnother}
                >
                  {t('createIModel.success.createAnother')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        )}

        {/* 失败 */}
        {step === 'error' && (
          <Dialog.Content>
            <div className="cw-result">
              <SvgStatusError className="cw-result-icon cw-result-icon--error" />
              <Text variant="headline" as="h3">{t('createIModel.errorTitle')}</Text>
              <Text>{error}</Text>
              <div className="cw-result-actions">
                <Button
                  styleType="high-visibility"
                  startIcon={<SvgRefresh />}
                  onClick={handleRetry}
                >
                  {t('createIModel.retry')}
                </Button>
                <Button styleType="default" onClick={() => setStep('form')}>
                  {t('createIModel.backToForm')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        )}
      </Dialog.Main>
    </Dialog>
  );
};

// Display name for debugging
CreateIModelWorkflow.displayName = 'CreateIModelWorkflow';

export default CreateIModelWorkflow;
