/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

interface StepInfo {
  label: string;
  description: string;
  progressMin: number;
  progressMax: number;
}

const STEP_INFO: Record<Exclude<Step, 'form' | 'error' | 'completed'>, StepInfo> = {
  validating: { label: '验证中', description: '正在验证输入数据...', progressMin: 0, progressMax: 10 },
  creating: { label: '创建中', description: '正在创建 iModel...', progressMin: 10, progressMax: 30 },
  initializing: { label: '初始化中', description: '正在初始化 iModel...', progressMin: 30, progressMax: 50 },
  uploading: { label: '上传中', description: '正在上传 baseline 文件...', progressMin: 50, progressMax: 80 },
  completing: { label: '完成中', description: '正在完成创建...', progressMin: 80, progressMax: 95 },
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const CreateIModelWorkflow: React.FC<CreateIModelWorkflowProps> = ({
  iTwinId,
  isOpen,
  onClose,
  onCreated,
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('form');
  const [displayProgress, setDisplayProgress] = useState(0);
  const [actualProgress, setActualProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorStep, setErrorStep] = useState<Step | null>(null);
  const [createdIModelId, setCreatedIModelId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [nameError, setNameError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const createIModel = useCreateIModelMutation();
  const createIModelWithBaseline = useCreateIModelWithBaselineMutation();
  const isLoading = createIModel.isPending || createIModelWithBaseline.isPending;

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
  const updateStepProgress = useCallback((currentStep: Exclude<Step, 'form' | 'error' | 'completed'>) => {
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
    setDisplayName('');
    setDescription('');
    setBaselineFile(null);
    setNameError('');
    abortControllerRef.current = null;
  };

  const handleClose = () => {
    // Allow close only in form, completed, or error states
    if (step !== 'form' && step !== 'completed' && step !== 'error') {
      return;
    }
    reset();
    onClose();
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      setNameError('请输入模型名称');
      return false;
    }
    if (name.trim().length < 2) {
      setNameError('模型名称至少2个字符');
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
        setError('请选择 .bim 文件');
        return;
      }
      // Validate file size (100MB max)
      if (file.size > 100 * 1024 * 1024) {
        setError('文件大小不能超过 100MB');
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
      throw new Error(`上传文件失败: ${response.status} ${response.statusText}`);
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
          throw new Error('未登录');
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
          throw new Error(`获取上传地址失败: ${uploadResponse.status}`);
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
          throw new Error(`完成上传失败: ${completeResponse.status}`);
        }

        if (signal.aborted) return;

        // Skip waiting for backend processing - show success immediately
        // The iModel will be in 'notInitialized' state until web-agent finishes processing
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
      let errorMessage = err instanceof Error ? err.message : '创建失败';

      // Handle authentication errors
      if (errorMessage.toLowerCase().includes('not authenticated') ||
          errorMessage.toLowerCase().includes('unauthorized') ||
          errorMessage.includes('未认证') ||
          errorMessage.includes('请登录')) {
        errorMessage = '登录已过期，请重新登录';
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
      navigate(`/workspace/${iTwinId}/${createdIModelId}`);
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
    setDisplayName('');
    setDescription('');
    setBaselineFile(null);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && (step === 'form' || step === 'error' || step === 'completed')) {
      handleClose();
    }
  };

  const getCurrentStepInfo = (): StepInfo | null => {
    if (step === 'form' || step === 'error' || step === 'completed') return null;
    return STEP_INFO[step];
  };

  const stepInfo = getCurrentStepInfo();
  const isProcessing = step !== 'form' && step !== 'completed' && step !== 'error';

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className={`dialog-container ${isProcessing ? 'processing' : ''}`}>
        {/* Header */}
        <div className="dialog-header">
          <h2 className="dialog-title">
            {step === 'completed' ? '创建成功' : step === 'error' ? '创建失败' : '创建 iModel'}
          </h2>
          {(step === 'form' || step === 'completed' || step === 'error') && (
            <button className="dialog-close-btn" onClick={handleClose} aria-label="关闭">
              <SvgClose />
            </button>
          )}
        </div>

        {/* Form Step */}
        {step === 'form' && (
          <>
            <div className="dialog-body">
              <div className={`form-group ${nameError ? 'has-error' : ''}`}>
                <label className="form-label form-label-required" htmlFor="model-name">
                  模型名称
                </label>
                <input
                  id="model-name"
                  type="text"
                  className={`form-input ${nameError ? 'input-error' : ''}`}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError('');
                    setError(null);
                  }}
                  placeholder="输入模型名称"
                  disabled={isLoading}
                  autoFocus
                />
                {nameError && <span className="field-error">{nameError}</span>}
                <p className="form-hint">用于标识模型，建议使用英文、数字和连字符</p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="model-displayName">
                  显示名称
                </label>
                <input
                  id="model-displayName"
                  type="text"
                  className="form-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="可选，用于界面展示"
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="model-description">
                  描述
                </label>
                <textarea
                  id="model-description"
                  className="form-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="模型描述..."
                  disabled={isLoading}
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Baseline 文件 (可选)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".bim"
                  onChange={handleFileSelect}
                  disabled={isLoading}
                  style={{ display: 'none' }}
                />
                <div className="file-input-wrapper">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                  >
                    选择文件
                  </button>
                  <span className="file-name">
                    {baselineFile ? (
                      <span className="file-selected">
                        <SvgCheckmark />
                        {baselineFile.name}
                        <button
                          type="button"
                          className="file-remove"
                          onClick={() => setBaselineFile(null)}
                        >
                          <SvgClose />
                        </button>
                      </span>
                    ) : (
                      '未选择文件'
                    )}
                  </span>
                </div>
                <p className="form-hint">选择 .bim 文件作为 iModel 的 baseline，创建后可立即编辑</p>
              </div>

              {error && <div className="form-error">{error}</div>}
            </div>

            <div className="dialog-footer">
              <button type="button" className="btn-secondary" onClick={handleClose} disabled={isLoading}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateIModel}
                disabled={isLoading || !name.trim()}
              >
                {isLoading && <span className="spinner-icon" />}
                创建
              </button>
            </div>
          </>
        )}

        {/* Processing Steps */}
        {isProcessing && (
          <div className="workflow-progress-container">
            {/* Step indicators */}
            <div className="step-indicators">
              {Object.entries(STEP_INFO).map(([key, info], index) => {
                const stepKey = key as keyof typeof STEP_INFO;
                const isActive = step === stepKey;
                const isCompleted =
                  Object.keys(STEP_INFO).indexOf(step) > Object.keys(STEP_INFO).indexOf(key);

                return (
                  <div key={key} className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                    <div className="step-number">
                      {isCompleted ? <SvgCheckmark /> : index + 1}
                    </div>
                    <span className="step-label">{info.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="progress-wrapper">
              <div className="progress-bar-large">
                <div className="progress-fill-large" style={{ width: `${displayProgress}%` }} />
              </div>
              <div className="progress-info">
                <span className="progress-percentage">{Math.round(displayProgress)}%</span>
                <span className="progress-description">{stepInfo?.description}</span>
              </div>
            </div>

            {/* Current step animation */}
            <div className="step-animation">
              <div className="step-icon">
                <SvgCloudUpload />
              </div>
              <div className="step-details">
                <h3 className="step-title">{stepInfo?.label}</h3>
                <p className="step-description">{stepInfo?.description}</p>
              </div>
            </div>

            {/* Cancel button */}
            {!isCancelling && (
              <button type="button" className="btn-cancel" onClick={handleCancel}>
                取消创建
              </button>
            )}
            {isCancelling && <div className="cancelling-text">正在取消...</div>}
          </div>
        )}

        {/* Completed Step */}
        {step === 'completed' && (
          <div className="success-state-enhanced">
            <div className="success-animation">
              <div className="success-circle">
                <SvgCheckmark />
              </div>
            </div>
            <h3 className="success-title">iModel 创建成功！</h3>
            <p className="success-description">
              {baselineFile
                ? `您的 iModel "${displayName || name}" 已创建，baseline 文件正在后台处理中，请稍后再打开`
                : `您的 iModel "${displayName || name}" 已成功创建并准备就绪`}
            </p>
            <div className="success-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenIModel}
                disabled={!!baselineFile}
                title={baselineFile ? 'Baseline 文件正在处理中，请稍后再试' : ''}
              >
                打开 iModel
                <SvgChevronRight />
              </button>
              <button type="button" className="btn-secondary" onClick={handleCreateAnother}>
                <SvgAdd />
                创建另一个
              </button>
            </div>
          </div>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <div className="error-state-enhanced">
            <div className="error-animation">
              <div className="error-circle"><SvgStatusError /></div>
            </div>
            <h3 className="error-title">创建失败</h3>
            <p className="error-description">{error}</p>
            <div className="error-actions">
              <button type="button" className="btn-primary" onClick={handleRetry}>
                <SvgRefresh />
                重试
              </button>
              <button type="button" className="btn-secondary" onClick={() => setStep('form')}>
                返回修改
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Display name for debugging
CreateIModelWorkflow.displayName = 'CreateIModelWorkflow';

export default CreateIModelWorkflow;
