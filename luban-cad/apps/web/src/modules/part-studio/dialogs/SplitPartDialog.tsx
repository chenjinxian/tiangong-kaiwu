/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SplitPartDialog（ADR-0012 单侧世界平面切分的 UI 面，2026-11-09）。
 *
 * 证据（私有仓 ui-evidence/feature-dialogs-20261108/onshape/split.{json,png}）：
 * 分割类型「零件/面」、要分割的零件/曲面/曲线、用于分割的图元、保留工具、
 * 修剪到面边界、保留两侧。
 *
 * 首切片只渲染后端契约（shared 1.39）精确支持的单侧世界平面形态：
 * - 分割类型固定「零件」（面分割未支持）；
 * - 目标实体插入单选（N≤1 自动）、编辑只读；
 * - 分割工具 = 世界平面 XY/YZ/XZ + 偏移；保留正/负侧；
 * - 「保留工具」「修剪到面边界」「保留两侧」为未支持项（假控件不渲染，静态提示）；
 *   双侧需要多体输出（ADR-0015），不冒充。
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  type BriefcaseConnection,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { useTranslation } from 'react-i18next';
import { DialogHeaderButtons } from './DialogHeaderButtons.js';
import type {
  BodyInfo,
  FeatureOp,
  FeatureOpResult,
  FeatureParams,
  PreviewResult,
  SplitPartParams,
} from '@luban-cad/shared';
import { FeaturePreviewOverlay } from '../canvas/FeaturePreviewOverlay.js';
import { useDialogCommandHandler } from '../internal/dialog-commands.js';

export interface SplitPartDialogProps {
  featureName: string;
  featureId?: string;
  initialParams?: unknown;
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  previewOp?: (op: FeatureOp) => Promise<PreviewResult>;
  connection?: BriefcaseConnection | null;
  viewport?: ScreenViewport | null;
  bodies?: readonly BodyInfo[];
  canEdit?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

type SplitPlane = 'XY' | 'YZ' | 'XZ';
type KeepSide = 'positive' | 'negative';

interface StoredSplitPart {
  plane?: SplitPlane;
  offsetMm?: number;
  keepSide?: KeepSide;
}

function readStored(value: unknown): StoredSplitPart {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  return {
    plane: p.plane === 'XY' || p.plane === 'YZ' || p.plane === 'XZ' ? p.plane : undefined,
    offsetMm: typeof p.offsetMm === 'number' && Number.isFinite(p.offsetMm) ? p.offsetMm : undefined,
    keepSide: p.keepSide === 'positive' || p.keepSide === 'negative' ? p.keepSide : undefined,
  };
}

function numberText(value: number | undefined, fallback = '0'): string {
  return value !== undefined && Number.isFinite(value) ? String(Number(value.toFixed(4))) : fallback;
}

export function SplitPartDialog({
  featureName,
  featureId,
  initialParams,
  applyOp,
  previewOp,
  connection,
  viewport,
  bodies = [],
  canEdit = true,
  onConfirm,
  onCancel,
}: SplitPartDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const stored = React.useMemo(() => readStored(initialParams), [initialParams]);
  const editMode = featureId !== undefined;
  const activeBodies = React.useMemo(
    () => bodies.filter((body) => body.active !== false && body.authored !== false),
    [bodies],
  );
  const [plane, setPlane] = React.useState<SplitPlane>(stored.plane ?? 'XY');
  const [offset, setOffset] = React.useState(() => numberText(stored.offsetMm));
  const [keepSide, setKeepSide] = React.useState<KeepSide>(stored.keepSide ?? 'positive');
  const [targetBodyKey, setTargetBodyKey] = React.useState<string | undefined>(() => (
    activeBodies.length === 1 ? activeBodies[0]!.bodyKey : undefined
  ));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [previewHost, setPreviewHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setPreviewHost((rootRef.current?.closest('.part-studio-canvas') as HTMLElement | null) ?? null);
  }, []);
  const [dynamicPreview, setDynamicPreview] = React.useState<PreviewResult['preview']>(undefined);

  const offsetNumber = Number(offset);
  const offsetValid = offset.trim() !== '' && Number.isFinite(offsetNumber);
  const targetBody = activeBodies.find((body) => body.bodyKey === targetBodyKey);
  const noBodies = !editMode && activeBodies.length === 0;
  const targetMissing = !editMode && activeBodies.length > 0 && targetBody === undefined;
  const submitDisabled = busy || !canEdit || applyOp === undefined || noBodies
    || targetMissing || !offsetValid;

  const buildParams = React.useCallback((): SplitPartParams => ({
    plane,
    offsetMm: offsetNumber,
    keepSide,
  }), [plane, offsetNumber, keepSide]);

  const previewSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (previewOp === undefined || submitDisabled) {
      setDynamicPreview(undefined);
      return;
    }
    const seq = ++previewSeqRef.current;
    const timer = window.setTimeout(() => {
      const params = buildParams();
      const op: FeatureOp = editMode && featureId !== undefined
        ? { kind: 'updateParams', featureId, params: params as FeatureParams }
        : {
          kind: 'insertFeature',
          featureType: 'splitPart',
          params: params as FeatureParams,
          ...(targetBodyKey !== undefined ? { targetBodyId: targetBodyKey } : {}),
        };
      void previewOp(op).then(
        (result) => {
          if (previewSeqRef.current !== seq) return;
          setDynamicPreview(result.ok ? result.preview : undefined);
        },
        () => {
          if (previewSeqRef.current === seq) setDynamicPreview(undefined);
        },
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
      if (previewSeqRef.current === seq) previewSeqRef.current += 1;
    };
  }, [previewOp, submitDisabled, editMode, featureId, buildParams, targetBodyKey]);

  const confirm = React.useCallback(async (): Promise<void> => {
    if (submitDisabled || applyOp === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const params = buildParams();
      const op: FeatureOp = editMode && featureId !== undefined
        ? { kind: 'updateParams', featureId, params: params as FeatureParams }
        : {
          kind: 'insertFeature',
          featureType: 'splitPart',
          params: params as FeatureParams,
          ...(targetBodyKey !== undefined ? { targetBodyId: targetBodyKey } : {}),
        };
      const result = await applyOp(op);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t('partStudio.splitPartDialog.submitSuccess', { name: featureName }),
        ),
      );
      onConfirm?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [submitDisabled, applyOp, buildParams, editMode, featureId, targetBodyKey, t, featureName, onConfirm]);

  // 2026-11-13：画布右键菜单前置「确认 / 取消」→ 与本对话框 ✓/✗ 同源命令。
  useDialogCommandHandler({ onConfirm: () => void confirm(), onCancel: () => onCancel?.() });

  const targetLabel = targetBody?.name && targetBody.name.trim() !== ''
    ? `${targetBody.name} (${targetBody.bodyKey})`
    : targetBody?.bodyKey;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={false}
      aria-label={featureName}
      data-testid="part-studio-split-part-dialog"
      data-feature="splitPart"
      className="part-studio-feature-dialog"
    >
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <DialogHeaderButtons disabled={submitDisabled} onConfirm={() => void confirm()} onCancel={() => onCancel?.()} confirmTestId="part-studio-split-part-confirm" cancelTestId="part-studio-split-part-cancel" />
      </header>
      <div className="part-studio-feature-dialog__body">
        {error !== undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-split-part-error">
            {error}
          </p>
        )}
        <section className="part-studio-feature-dialog__distance" data-field="split-type">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.splitPartDialog.splitType')}
          </span>
          <span className="part-studio-feature-dialog__static-value">
            {t('partStudio.splitPartDialog.splitTypePart')}
          </span>
        </section>
        <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-split-part-type-hint">
          {t('partStudio.splitPartDialog.faceUnsupported')}
        </p>
        <section className="part-studio-feature-dialog__distance" data-field="split-target">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-split-part-target">
            {t('partStudio.splitPartDialog.targets')}
          </label>
          {editMode ? (
            <span className="part-studio-feature-dialog__static-value" data-testid="part-studio-split-part-target-fixed">
              {t('partStudio.splitPartDialog.targetFixed')}
            </span>
          ) : noBodies ? (
            <span className="part-studio-feature-dialog__static-value" data-testid="part-studio-split-part-no-bodies">
              {t('partStudio.splitPartDialog.noBodies')}
            </span>
          ) : activeBodies.length === 1 ? (
            <span className="part-studio-feature-dialog__static-value" data-testid="part-studio-split-part-target">
              {targetLabel}
            </span>
          ) : (
            <select
              id="part-studio-split-part-target"
              aria-label={t('partStudio.splitPartDialog.targets')}
              className="part-studio-feature-dialog__select"
              value={targetBodyKey ?? ''}
              disabled={busy || !canEdit}
              onChange={(event) => setTargetBodyKey(event.target.value === '' ? undefined : event.target.value)}
              data-testid="part-studio-split-part-target"
            >
              <option value="">{t('partStudio.splitPartDialog.targetPlaceholder')}</option>
              {activeBodies.map((body) => (
                <option key={body.bodyKey} value={body.bodyKey}>
                  {body.name && body.name.trim() !== '' ? `${body.name} (${body.bodyKey})` : body.bodyKey}
                </option>
              ))}
            </select>
          )}
        </section>
        {!editMode && activeBodies.length > 1 && targetBody === undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-split-part-target-missing">
            {t('partStudio.splitPartDialog.targetMissing')}
          </p>
        )}
        {noBodies && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-split-part-needs-body">
            {t('partStudio.splitPartDialog.needsBody')}
          </p>
        )}
        <section className="part-studio-feature-dialog__distance" data-field="split-tool">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.splitPartDialog.tool')}
          </span>
          <span className="part-studio-feature-dialog__static-value">
            {t('partStudio.splitPartDialog.toolWorldPlane')}
          </span>
        </section>
        <section className="part-studio-feature-dialog__distance" data-field="split-plane">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-split-part-plane">
            {t('partStudio.splitPartDialog.plane')}
          </label>
          <select
            id="part-studio-split-part-plane"
            aria-label={t('partStudio.splitPartDialog.plane')}
            className="part-studio-feature-dialog__select"
            value={plane}
            disabled={busy || !canEdit}
            onChange={(event) => setPlane(event.target.value as SplitPlane)}
            data-testid="part-studio-split-part-plane"
          >
            <option value="XY">{t('partStudio.featureDialog.mirrorPlaneOptions.XY')}</option>
            <option value="YZ">{t('partStudio.featureDialog.mirrorPlaneOptions.YZ')}</option>
            <option value="XZ">{t('partStudio.featureDialog.mirrorPlaneOptions.XZ')}</option>
          </select>
        </section>
        <section className="part-studio-feature-dialog__distance" data-field="split-offset">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-split-part-offset">
            {t('partStudio.splitPartDialog.offset')}
          </label>
          <input
            id="part-studio-split-part-offset"
            aria-label={t('partStudio.splitPartDialog.offset')}
            className="part-studio-feature-dialog__input"
            inputMode="decimal"
            value={offset}
            disabled={busy || !canEdit}
            onChange={(event) => setOffset(event.target.value)}
            data-testid="part-studio-split-part-offset"
          />
        </section>
        <section className="part-studio-feature-dialog__distance" data-field="split-keep-side">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-split-part-keep-side">
            {t('partStudio.splitPartDialog.keepSide')}
          </label>
          <select
            id="part-studio-split-part-keep-side"
            aria-label={t('partStudio.splitPartDialog.keepSide')}
            className="part-studio-feature-dialog__select"
            value={keepSide}
            disabled={busy || !canEdit}
            onChange={(event) => setKeepSide(event.target.value as KeepSide)}
            data-testid="part-studio-split-part-keep-side"
          >
            <option value="positive">{t('partStudio.splitPartDialog.keepPositive')}</option>
            <option value="negative">{t('partStudio.splitPartDialog.keepNegative')}</option>
          </select>
        </section>
        <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-split-part-plane-hint">
          {t('partStudio.splitPartDialog.planeHint')}
        </p>
        <section className="part-studio-feature-dialog__distance" data-field="split-keep-tools">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.splitPartDialog.keepTools')}
          </span>
          <span className="part-studio-feature-dialog__static-value">
            {t('partStudio.splitPartDialog.keepToolsUnsupported')}
          </span>
        </section>
        <section className="part-studio-feature-dialog__distance" data-field="split-use-trimmed">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.splitPartDialog.useTrimmed')}
          </span>
          <span className="part-studio-feature-dialog__static-value">
            {t('partStudio.splitPartDialog.useTrimmedUnsupported')}
          </span>
        </section>
        <section className="part-studio-feature-dialog__distance" data-field="split-keep-both">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.splitPartDialog.keepBothSides')}
          </span>
          <span className="part-studio-feature-dialog__static-value" data-testid="part-studio-split-part-both-unsupported">
            {t('partStudio.splitPartDialog.keepBothSidesUnsupported')}
          </span>
        </section>
      </div>
      {previewHost !== null && dynamicPreview !== undefined && createPortal(
        <FeaturePreviewOverlay
          viewport={viewport ?? null}
          connection={connection ?? null}
          geometry={undefined}
          dynamicPreview={dynamicPreview}
          opacity={0.25}
        />,
        previewHost,
      )}
    </div>
  );
}
