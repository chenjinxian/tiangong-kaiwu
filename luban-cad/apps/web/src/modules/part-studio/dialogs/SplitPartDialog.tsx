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
 * - 分割类型页签「零件」活动、「面」诚实禁用（title=notImplemented）；
 * - 目标实体单字段两态 query field（空 26px 蓝 / 选中 42px 白 + chip + ×），
 *   插入单选（N≤1 自动）、编辑只读；
 * - 分割工具 = 世界平面 XY/YZ/XZ + 偏移；保留正/负侧；平面/偏移/保留侧
 *   收进明确标注的产品通道分组（不伪装成 live 图元拾取器）；
 * - 「保留工具」「修剪到面边界」「保留两侧」为未支持项（disabled 未勾选
 *   checkbox + title）；双侧需要多体输出（ADR-0015），不冒充。
 *
 * 2026-11-15 live 对齐（dialog-audit group-c §4）：真实 tablist、目标/工具
 * query field、三行改 disabled checkbox、补底栏；载荷/校验/多体选择逻辑不变。
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
  useDialogCommandHandler({ onConfirm: () => void confirm(), onCancel: () => onCancel?.(), confirmLabel: featureName });

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
        {/* live：零件/面真实页签；面分割无后端通道 → disabled + title，
            诚实提示保留在可访问树内（测试锚不变）。 */}
        <div
          role="tablist"
          aria-label={t('partStudio.splitPartDialog.splitType')}
          className="part-studio-feature-dialog__tablist part-studio-split-part-dialog__tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected
            className="part-studio-feature-dialog__tab part-studio-feature-dialog__tab--active"
          >
            {t('partStudio.splitPartDialog.splitTypePart')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            disabled
            title={t('partStudio.featureDialog.notImplemented')}
            aria-describedby="part-studio-split-part-type-hint"
            className="part-studio-feature-dialog__tab part-studio-feature-dialog__tab--disabled"
          >
            {t('partStudio.splitPartDialog.splitTypeFace')}
            <span
              id="part-studio-split-part-type-hint"
              data-testid="part-studio-split-part-type-hint"
              className="part-studio-split-part-dialog__sr-hint"
            >
              {t('partStudio.splitPartDialog.faceUnsupported')}
            </span>
          </button>
        </div>

        {/* 目标实体：单字段两态 query field（空 26px 蓝 / 选中 42px 白 + chip）。 */}
        <section className="part-studio-feature-dialog__entities" data-field="split-target">
          <div
            className={`part-studio-feature-dialog__profile-field part-studio-split-part-dialog__target-field${editMode || targetBody !== undefined ? ' is-selected' : ' is-empty'}`}
            data-testid="part-studio-split-part-target-field"
          >
            <span className="part-studio-feature-dialog__query-label">
              {t('partStudio.splitPartDialog.targets')}
            </span>
            {editMode ? (
              <span className="part-studio-feature-dialog__chips">
                <span className="part-studio-split-part-dialog__target-chip">
                  <span
                    className="part-studio-feature-dialog__profile-chip"
                    data-testid="part-studio-split-part-target-fixed"
                  >
                    {t('partStudio.splitPartDialog.targetFixed')}
                  </span>
                  <button
                    type="button"
                    className="part-studio-split-part-dialog__chip-remove"
                    aria-label={t('partStudio.splitPartDialog.removeTarget')}
                    title={t('partStudio.featureDialog.notImplemented')}
                    disabled
                  >
                    ×
                  </button>
                </span>
              </span>
            ) : targetBody !== undefined ? (
              <span className="part-studio-feature-dialog__chips">
                <span className="part-studio-split-part-dialog__target-chip">
                  <span className="part-studio-feature-dialog__profile-chip" data-testid="part-studio-split-part-target">
                    {targetLabel}
                  </span>
                  <button
                    type="button"
                    className="part-studio-split-part-dialog__chip-remove"
                    data-testid="part-studio-split-part-target-remove"
                    aria-label={`${t('partStudio.splitPartDialog.removeTarget')}: ${targetLabel ?? ''}`}
                    disabled={busy || !canEdit}
                    onClick={() => setTargetBodyKey(undefined)}
                  >
                    ×
                  </button>
                </span>
              </span>
            ) : noBodies ? (
              <span
                className="part-studio-feature-dialog__profile-empty"
                data-testid="part-studio-split-part-no-bodies"
              >
                {t('partStudio.splitPartDialog.noBodies')}
              </span>
            ) : (
              <select
                id="part-studio-split-part-target"
                aria-label={t('partStudio.splitPartDialog.targets')}
                className="part-studio-split-part-dialog__target-select"
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
          </div>
        </section>
        {targetMissing && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-split-part-target-missing">
            {t('partStudio.splitPartDialog.targetMissing')}
          </p>
        )}
        {noBodies && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-split-part-needs-body">
            {t('partStudio.splitPartDialog.needsBody')}
          </p>
        )}

        {/* 用于分割的图元：唯一可用工具=世界平面；实体/面/曲线拾取无通道 →
            字段本体只读 + title 诚实说明。C7（2026-11-16）：字段右外置装饰时钟
            （与镜像平面 query field 同 idiom，aria-hidden、无行为）。 */}
        <section className="part-studio-feature-dialog__entities" data-field="split-tool">
          <div className="part-studio-split-part-dialog__tool-row">
            <div
              className="part-studio-feature-dialog__profile-field part-studio-split-part-dialog__tool-field is-selected"
              data-testid="part-studio-split-part-tool-field"
              title={t('partStudio.splitPartDialog.toolPickUnsupported')}
            >
              <span className="part-studio-feature-dialog__query-label">
                {t('partStudio.splitPartDialog.tool')}
              </span>
              <span className="part-studio-feature-dialog__chips">
                <span className="part-studio-feature-dialog__profile-chip" data-testid="part-studio-split-part-tool">
                  {t('partStudio.splitPartDialog.toolWorldPlane', { plane })}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="part-studio-feature-dialog__axis-clock"
              data-testid="part-studio-split-part-tool-clock"
              aria-hidden="true"
              disabled
              tabIndex={-1}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" />
                <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </section>

        {/* live 无平面/偏移/保留侧控件；产品通道（shared 1.39）单独成组，
            不冒充 live 图元拾取器。 */}
        <section className="part-studio-split-part-dialog__world-plane" data-field="split-world-plane">
          <h3 className="part-studio-split-part-dialog__group-title">
            {t('partStudio.splitPartDialog.worldPlaneGroup')}
          </h3>
          <p className="part-studio-split-part-dialog__group-hint">
            {t('partStudio.splitPartDialog.worldPlaneGroupHint')}
          </p>
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
            {/* 审计 C3（2026-11-16）：偏移数值行补禁用计算器（与主数值行同壳）。 */}
            <button
              type="button"
              className="part-studio-feature-dialog__calculator"
              aria-label={t('partStudio.featureDialog.calculatorLabel')}
              disabled
              title={t('partStudio.featureDialog.notImplemented')}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" fill="none" stroke="currentColor" />
                <rect x="4.5" y="3.5" width="7" height="3" fill="none" stroke="currentColor" />
                <circle cx="5.4" cy="9.4" r="0.8" fill="currentColor" />
                <circle cx="8" cy="9.4" r="0.8" fill="currentColor" />
                <circle cx="10.6" cy="9.4" r="0.8" fill="currentColor" />
                <circle cx="5.4" cy="12" r="0.8" fill="currentColor" />
                <circle cx="8" cy="12" r="0.8" fill="currentColor" />
                <circle cx="10.6" cy="12" r="0.8" fill="currentColor" />
              </svg>
            </button>
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
          <p role="note" className="part-studio-split-part-dialog__group-hint" data-testid="part-studio-split-part-plane-hint">
            {t('partStudio.splitPartDialog.planeHint')}
          </p>
        </section>

        {/* live：三行复选框全部禁用且未勾选（保留两侧不得显示已勾选）。 */}
        <label
          className="part-studio-feature-dialog__checkbox part-studio-split-part-dialog__option"
          title={t('partStudio.splitPartDialog.keepToolsUnsupported')}
        >
          <input
            type="checkbox"
            data-testid="part-studio-split-part-keep-tools"
            aria-label={t('partStudio.splitPartDialog.keepTools')}
            disabled
          />
          <span>{t('partStudio.splitPartDialog.keepTools')}</span>
        </label>
        <label
          className="part-studio-feature-dialog__checkbox part-studio-split-part-dialog__option"
          title={t('partStudio.splitPartDialog.useTrimmedUnsupported')}
        >
          <input
            type="checkbox"
            data-testid="part-studio-split-part-use-trimmed"
            aria-label={t('partStudio.splitPartDialog.useTrimmed')}
            disabled
          />
          <span>{t('partStudio.splitPartDialog.useTrimmed')}</span>
        </label>
        <label
          className="part-studio-feature-dialog__checkbox part-studio-split-part-dialog__option"
          title={t('partStudio.splitPartDialog.keepBothSidesUnsupported')}
        >
          <input
            type="checkbox"
            data-testid="part-studio-split-part-keep-both"
            aria-label={t('partStudio.splitPartDialog.keepBothSides')}
            disabled
          />
          <span data-testid="part-studio-split-part-both-unsupported">
            {t('partStudio.splitPartDialog.keepBothSides')}
            <span className="part-studio-split-part-dialog__sr-hint">
              {t('partStudio.splitPartDialog.keepBothSidesUnsupported')}
            </span>
          </span>
        </label>
      </div>
      <footer className="part-studio-feature-dialog__footer">
        <div className="part-studio-feature-dialog__transparency">
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            disabled
            aria-label={t('partStudio.featureDialog.transparencyLabel')}
            className="part-studio-feature-dialog__transparency-slider"
          />
        </div>
        <button type="button" className="part-studio-feature-dialog__help" aria-label={t('partStudio.featureDialog.help')}>?</button>
      </footer>
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
