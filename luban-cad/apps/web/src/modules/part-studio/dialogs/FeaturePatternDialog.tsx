/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeaturePatternDialog（ADR-0007 切片 8：featurePattern 编辑 UI）。
 *
 * 证据：`ui-evidence/feature-dialogs-20261108/onshape/linear-pattern.{json,png}`
 * 的字段（阵列类型/方向/距离/实例数/居中）。featurePattern 由回放/转换器创建，
 * 树双击编辑走本对话框；**源特征与轴是结构引用**（updateParams 不改），只读
 * 展示并禁用，允许编辑 kind/count/spacing?/angle?；linear 可切换「居中」——
 * 勾选后实例数输入切为**每侧 N（含原件）**，载荷 `count = 2N−1` + `centered:true`
 *（与 body pattern 对话框同语义，ADR-0007 切片 6/7）；圆周不支持居中。
 * 切片 11：已有 `secondDirection` 的阵列可编辑第二方向 count/spacing/centered，
 * 第二方向轴仍是结构引用只读；取消勾选「第二个方向」从载荷移除该键（可撤销）。
 * 切片 12：多源阵列（`sourceFeatureIds`，shared 1.59）回显全部源特征 chips，
 * 提交时按落库形状保留单源/多源键，不把多源误判为「源缺失」；
 * 不渲染方向/面选择器等无产品能力的假控件。
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  type BriefcaseConnection,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { useTranslation } from 'react-i18next';
import type { FeatureOp, FeatureOpResult, PreviewResult } from '@luban-cad/shared';
import { FeaturePreviewOverlay } from '../canvas/FeaturePreviewOverlay.js';

export interface FeaturePatternDialogProps {
  featureName: string;
  /** 编辑模式特征 id（本对话框只支持 updateParams）。 */
  featureId?: string;
  initialParams?: unknown;
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /** 改参预览（后端影子求值几何 → TileRpc 动态图形；失败静默无预览）。 */
  previewOp?: (op: FeatureOp) => Promise<PreviewResult>;
  connection?: BriefcaseConnection | null;
  viewport?: ScreenViewport | null;
  canEdit?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface StoredSecondDirection {
  count?: number;
  spacing?: number;
  centered?: boolean;
  axis?: { origin: Vec3; direction: Vec3 };
}

interface StoredFeaturePatternParams {
  sourceFeatureId?: string;
  sourceFeatureIds?: string[];
  kind?: 'linear' | 'circular';
  count?: number;
  spacing?: number;
  angle?: number;
  centered?: boolean;
  axis?: { origin: Vec3; direction: Vec3 };
  secondDirection?: StoredSecondDirection;
}

function finiteVec(value: unknown): Vec3 | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  return typeof v.x === 'number' && Number.isFinite(v.x)
    && typeof v.y === 'number' && Number.isFinite(v.y)
    && typeof v.z === 'number' && Number.isFinite(v.z)
    ? { x: v.x, y: v.y, z: v.z }
    : undefined;
}

function readAxis(value: unknown): { origin: Vec3; direction: Vec3 } | undefined {
  const axisRaw = typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
  const origin = finiteVec(axisRaw?.origin);
  const direction = finiteVec(axisRaw?.direction);
  return origin && direction ? { origin, direction } : undefined;
}

function readStored(value: unknown): StoredFeaturePatternParams {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  const secondRaw = typeof p.secondDirection === 'object' && p.secondDirection !== null
    ? p.secondDirection as Record<string, unknown>
    : undefined;
  const sourceFeatureIds = Array.isArray(p.sourceFeatureIds)
    ? p.sourceFeatureIds.filter((id): id is string => typeof id === 'string')
    : undefined;
  return {
    sourceFeatureId: typeof p.sourceFeatureId === 'string' ? p.sourceFeatureId : undefined,
    sourceFeatureIds: sourceFeatureIds !== undefined && sourceFeatureIds.length > 0 ? sourceFeatureIds : undefined,
    kind: p.kind === 'linear' || p.kind === 'circular' ? p.kind : undefined,
    count: typeof p.count === 'number' ? p.count : undefined,
    spacing: typeof p.spacing === 'number' ? p.spacing : undefined,
    angle: typeof p.angle === 'number' ? p.angle : undefined,
    centered: p.centered === true,
    axis: readAxis(p.axis),
    secondDirection: secondRaw === undefined ? undefined : {
      count: typeof secondRaw.count === 'number' ? secondRaw.count : undefined,
      spacing: typeof secondRaw.spacing === 'number' ? secondRaw.spacing : undefined,
      centered: secondRaw.centered === true,
      axis: readAxis(secondRaw.axis),
    },
  };
}

const vecText = (v: Vec3): string =>
  `(${Number(v.x.toFixed(4))}, ${Number(v.y.toFixed(4))}, ${Number(v.z.toFixed(4))})`;

export function FeaturePatternDialog({
  featureName,
  featureId,
  initialParams,
  applyOp,
  previewOp,
  connection,
  viewport,
  canEdit = true,
  onConfirm,
  onCancel,
}: FeaturePatternDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const stored = React.useMemo(() => readStored(initialParams), [initialParams]);
  const editMode = featureId !== undefined;
  const [kind, setKind] = React.useState<'linear' | 'circular'>(stored.kind ?? 'linear');
  const [centered, setCentered] = React.useState(stored.centered === true);
  // 居中时输入语义 = 每侧实例数（含原件）；回显 N=(count+1)/2（脏偶数按四舍五入，
  // 交范围校验拒收，不静默修正落库值）。
  const [count, setCount] = React.useState(() => {
    if (stored.count === undefined) return '3';
    return String(stored.centered ? Math.round((stored.count + 1) / 2) : stored.count);
  });
  const [spacing, setSpacing] = React.useState(() => (stored.spacing !== undefined ? String(stored.spacing) : '10'));
  const [angle, setAngle] = React.useState(() => (stored.angle !== undefined ? String(stored.angle) : '360'));
  const [secondEnabled, setSecondEnabled] = React.useState(stored.secondDirection !== undefined);
  const [secondCentered, setSecondCentered] = React.useState(stored.secondDirection?.centered === true);
  const [secondCount, setSecondCount] = React.useState(() => {
    const storedSecond = stored.secondDirection;
    if (storedSecond?.count === undefined) return '2';
    return String(storedSecond.centered === true
      ? Math.round((storedSecond.count + 1) / 2)
      : storedSecond.count);
  });
  const [secondSpacing, setSecondSpacing] = React.useState(() =>
    (stored.secondDirection?.spacing !== undefined ? String(stored.secondDirection.spacing) : '10'));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  // 改参预览宿主（与 MoveFaceDialog 同口径：门户挂到 .part-studio-canvas）。
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [previewHost, setPreviewHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setPreviewHost((rootRef.current?.closest('.part-studio-canvas') as HTMLElement | null) ?? null);
  }, []);
  const [dynamicPreview, setDynamicPreview] = React.useState<PreviewResult['preview']>(undefined);

  const sourceIds = React.useMemo(() => stored.sourceFeatureIds
    ?? (stored.sourceFeatureId !== undefined ? [stored.sourceFeatureId] : []), [stored]);
  const multiSource = stored.sourceFeatureIds !== undefined;
  const axis = stored.axis;
  const axisValid = axis !== undefined
    && Math.hypot(axis.direction.x, axis.direction.y, axis.direction.z) > 1e-9;
  const centeredActive = centered && kind === 'linear';
  const countNumber = Number(count);
  const effectiveCount = centeredActive ? countNumber * 2 - 1 : countNumber;
  const spacingNumber = Number(spacing);
  const angleNumber = Number(angle);
  const countValid = centeredActive
    ? Number.isInteger(countNumber) && countNumber >= 2 && countNumber <= 500
    : Number.isInteger(countNumber) && countNumber >= 2 && countNumber <= 1000;
  const spacingValid = Number.isFinite(spacingNumber) && spacingNumber > 0;
  const angleValid = Number.isFinite(angleNumber) && angleNumber > 0 && angleNumber <= 360;
  // 切片 11：第二方向只在 linear 下可见；轴是结构引用（编辑中不改）。
  const secondAxis = stored.secondDirection?.axis;
  const secondAxisValid = secondAxis !== undefined
    && Math.hypot(secondAxis.direction.x, secondAxis.direction.y, secondAxis.direction.z) > 1e-9;
  const secondSectionVisible = kind === 'linear' && secondEnabled && stored.secondDirection !== undefined;
  const secondCenteredActive = secondSectionVisible && secondCentered;
  const secondCountNumber = Number(secondCount);
  const effectiveSecondCount = secondCenteredActive ? secondCountNumber * 2 - 1 : secondCountNumber;
  const secondSpacingNumber = Number(secondSpacing);
  const secondCountValid = secondCenteredActive
    ? Number.isInteger(secondCountNumber) && secondCountNumber >= 2 && secondCountNumber <= 500
    : Number.isInteger(secondCountNumber) && secondCountNumber >= 2 && secondCountNumber <= 1000;
  const secondSpacingValid = Number.isFinite(secondSpacingNumber) && secondSpacingNumber > 0;
  const totalCount = effectiveCount * effectiveSecondCount;
  const totalOverLimit = secondSectionVisible && countValid && secondCountValid
    && Number.isFinite(totalCount) && totalCount > 1000;
  const sourceMissing = sourceIds.length === 0;
  const submitDisabled = busy || !canEdit || !editMode || sourceMissing || !axisValid
    || !countValid || (kind === 'linear' ? !spacingValid : !angleValid)
    || (secondSectionVisible
      && (!secondAxisValid || !secondCountValid || !secondSpacingValid || totalOverLimit));

  const buildParams = React.useCallback((): Record<string, unknown> | undefined => {
    const storedAxis = stored.axis;
    if (sourceIds.length === 0 || storedAxis === undefined) return undefined;
    return {
      ...(stored.sourceFeatureIds !== undefined
        ? { sourceFeatureIds: stored.sourceFeatureIds }
        : { sourceFeatureId: stored.sourceFeatureId }),
      kind,
      count: effectiveCount,
      ...(kind === 'linear' ? { spacing: spacingNumber } : { angle: angleNumber }),
      axis: storedAxis,
      ...(centeredActive ? { centered: true } : {}),
      // 取消勾选 = 从载荷移除第二方向（updateParams 整体替换参数；可撤销）。
      ...(secondSectionVisible && secondAxis !== undefined ? {
        secondDirection: {
          count: effectiveSecondCount,
          spacing: secondSpacingNumber,
          axis: secondAxis,
          ...(secondCenteredActive ? { centered: true } : {}),
        },
      } : {}),
    };
  }, [stored, sourceIds, kind, centeredActive, effectiveCount, spacingNumber, angleNumber,
    secondSectionVisible, secondAxis, effectiveSecondCount, secondSpacingNumber, secondCenteredActive]);

  // 改参预览（2026-11-08）：后端 featurePattern 影子求值回传结果 entryArray，
  // 前端经 TileRpc 动态图形显示；参数非法/无预览时静默清空（不渲染假 overlay）。
  const previewSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (previewOp === undefined || submitDisabled || !editMode || featureId === undefined) {
      setDynamicPreview(undefined);
      return;
    }
    const seq = ++previewSeqRef.current;
    const timer = window.setTimeout(() => {
      const params = buildParams();
      if (params === undefined) return;
      void previewOp({ kind: 'updateParams', featureId, params }).then(
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
  }, [previewOp, submitDisabled, editMode, featureId, buildParams]);

  const confirm = React.useCallback(async (): Promise<void> => {
    if (submitDisabled || applyOp === undefined || featureId === undefined) return;
    const params = buildParams();
    if (params === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await applyOp({ kind: 'updateParams', featureId, params });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t('partStudio.featurePatternDialog.submitSuccess', { name: featureName }),
        ),
      );
      onConfirm?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [submitDisabled, applyOp, featureId, buildParams, t, featureName, onConfirm]);

  const countLabel = t(centeredActive
    ? 'partStudio.featureDialog.patternCountLabelCentered'
    : 'partStudio.featureDialog.patternCountLabel');
  const secondCountLabel = t(secondCenteredActive
    ? 'partStudio.featurePatternDialog.secondCountLabelCentered'
    : 'partStudio.featurePatternDialog.secondCountLabel');

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={false}
      aria-label={featureName}
      data-testid="part-studio-feature-pattern-dialog"
      data-feature="featurePattern"
      className="part-studio-feature-dialog"
    >
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <div className="part-studio-feature-dialog__header-actions">
          <button
            type="button"
            className="part-studio-feature-dialog__confirm"
            aria-label={t('partStudio.featureDialog.confirm')}
            disabled={submitDisabled}
            onClick={() => void confirm()}
            data-testid="part-studio-feature-pattern-confirm"
          >✓</button>
          <button
            type="button"
            className="part-studio-feature-dialog__cancel"
            aria-label={t('partStudio.featureDialog.cancel')}
            onClick={() => onCancel?.()}
            data-testid="part-studio-feature-pattern-cancel"
          >✗</button>
        </div>
      </header>
      <div className="part-studio-feature-dialog__body">
        {error !== undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-feature-pattern-error">
            {error}
          </p>
        )}
        <section className="part-studio-feature-dialog__distance" data-field="feature-pattern-source">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.featurePatternDialog.sourceLabel')}
          </span>
          {sourceMissing ? (
            <span
              className="part-studio-feature-dialog__profile-chip"
              data-testid="part-studio-feature-pattern-source"
            >
              {t('partStudio.featurePatternDialog.sourceMissing')}
            </span>
          ) : multiSource ? (
            <span
              className="part-studio-feature-dialog__profile-field"
              data-testid="part-studio-feature-pattern-source"
              data-multi="true"
            >
              {sourceIds.map((id, index) => (
                <span
                  key={`${id}-${index}`}
                  className="part-studio-feature-dialog__profile-chip"
                  data-testid={`part-studio-feature-pattern-source-${index}`}
                >{id}</span>
              ))}
            </span>
          ) : (
            <span
              className="part-studio-feature-dialog__profile-chip"
              data-testid="part-studio-feature-pattern-source"
            >{sourceIds[0]}</span>
          )}
        </section>
        <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-feature-pattern-locked-hint">
          {t('partStudio.featurePatternDialog.sourceLockedHint')}
        </p>
        {multiSource && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-pattern-multi-source-hint"
          >
            {t('partStudio.featurePatternDialog.multiSourceHint')}
          </p>
        )}
        <section className="part-studio-feature-dialog__distance" data-field="feature-pattern-kind">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-pattern-kind">
            {t('partStudio.featureDialog.patternKindLabel')}
          </label>
          <select
            id="part-studio-feature-pattern-kind"
            aria-label={t('partStudio.featureDialog.patternKindLabel')}
            className="part-studio-feature-dialog__select"
            value={kind}
            disabled={busy || !canEdit}
            onChange={(event) => {
              const next = event.target.value as 'linear' | 'circular';
              setKind(next);
              if (next === 'circular') {
                setCentered(false);
                // 第二方向仅 linear 合法；切圆周时可见地取消（轴保留在状态里，
                // 切回 linear 可重新勾选；提交载荷不含 secondDirection）。
                setSecondEnabled(false);
                setSecondCentered(false);
              }
            }}
          >
            <option value="linear">{t('partStudio.featureDialog.patternModeOptions.linear')}</option>
            <option value="circular">{t('partStudio.featureDialog.patternModeOptions.circular')}</option>
          </select>
        </section>
        <section className="part-studio-feature-dialog__distance" data-field="feature-pattern-count">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-pattern-count">
            {countLabel}
          </label>
          <input
            id="part-studio-feature-pattern-count"
            type="text"
            inputMode="numeric"
            aria-label={countLabel}
            className="part-studio-feature-dialog__input"
            value={count}
            disabled={busy || !canEdit}
            onChange={(event) => setCount(event.target.value)}
            data-testid="part-studio-feature-pattern-count"
          />
        </section>
        <label
          className="part-studio-feature-dialog__checkbox"
          data-testid="part-studio-feature-pattern-centered"
        >
          <input
            type="checkbox"
            checked={centeredActive}
            disabled={busy || !canEdit || kind === 'circular'}
            onChange={(event) => setCentered(event.target.checked)}
          />
          <span>{t('partStudio.featureDialog.centerLabel')}</span>
        </label>
        {centeredActive && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-pattern-centered-hint"
          >
            {t('partStudio.featureDialog.patternCenteredHint')}
          </p>
        )}
        {kind === 'linear' ? (
          <section className="part-studio-feature-dialog__distance" data-field="feature-pattern-spacing">
            <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-pattern-spacing">
              {t('partStudio.featureDialog.patternSpacingLabel')}
            </label>
            <input
              id="part-studio-feature-pattern-spacing"
              type="text"
              inputMode="decimal"
              aria-label={t('partStudio.featureDialog.patternSpacingLabel')}
              className="part-studio-feature-dialog__input"
              value={spacing}
              disabled={busy || !canEdit}
              onChange={(event) => setSpacing(event.target.value)}
              data-testid="part-studio-feature-pattern-spacing"
            />
          </section>
        ) : (
          <section className="part-studio-feature-dialog__angle" data-field="feature-pattern-angle">
            <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-pattern-angle">
              {t('partStudio.featureDialog.patternAngleLabel')}
            </label>
            <input
              id="part-studio-feature-pattern-angle"
              type="text"
              inputMode="decimal"
              aria-label={t('partStudio.featureDialog.patternAngleLabel')}
              className="part-studio-feature-dialog__input"
              value={angle}
              disabled={busy || !canEdit}
              onChange={(event) => setAngle(event.target.value)}
              data-testid="part-studio-feature-pattern-angle"
            />
          </section>
        )}
        <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-feature-pattern-axis">
          {axis === undefined || !axisValid
            ? t('partStudio.featurePatternDialog.axisMissing')
            : t('partStudio.featurePatternDialog.axisReadonly', {
              origin: vecText(axis.origin),
              direction: vecText(axis.direction),
            })}
        </p>
        {stored.secondDirection !== undefined && (
          <section className="part-studio-feature-dialog__distance" data-field="feature-pattern-second-direction">
            <label
              className="part-studio-feature-dialog__checkbox"
              data-testid="part-studio-feature-pattern-second-enabled"
            >
              <input
                type="checkbox"
                checked={secondEnabled && kind === 'linear'}
                disabled={busy || !canEdit || kind === 'circular'}
                onChange={(event) => setSecondEnabled(event.target.checked)}
              />
              <span>{t('partStudio.featureDialog.secondDirectionLabel')}</span>
            </label>
            {secondSectionVisible && (
              <>
                {!secondAxisValid && (
                  <p
                    role="alert"
                    className="part-studio-feature-dialog__alert"
                    data-testid="part-studio-feature-pattern-second-axis-missing"
                  >
                    {t('partStudio.featurePatternDialog.secondAxisMissing')}
                  </p>
                )}
                <section className="part-studio-feature-dialog__distance" data-field="feature-pattern-second-count">
                  <label
                    className="part-studio-feature-dialog__distance-label"
                    htmlFor="part-studio-feature-pattern-second-count"
                  >
                    {secondCountLabel}
                  </label>
                  <input
                    id="part-studio-feature-pattern-second-count"
                    type="text"
                    inputMode="numeric"
                    aria-label={secondCountLabel}
                    className="part-studio-feature-dialog__input"
                    value={secondCount}
                    disabled={busy || !canEdit}
                    onChange={(event) => setSecondCount(event.target.value)}
                    data-testid="part-studio-feature-pattern-second-count"
                  />
                </section>
                <label
                  className="part-studio-feature-dialog__checkbox"
                  data-testid="part-studio-feature-pattern-second-centered"
                >
                  <input
                    type="checkbox"
                    aria-label={t('partStudio.featurePatternDialog.secondCenteredLabel')}
                    checked={secondCenteredActive}
                    disabled={busy || !canEdit}
                    onChange={(event) => setSecondCentered(event.target.checked)}
                  />
                  <span>{t('partStudio.featureDialog.centerLabel')}</span>
                </label>
                <section className="part-studio-feature-dialog__distance" data-field="feature-pattern-second-spacing">
                  <label
                    className="part-studio-feature-dialog__distance-label"
                    htmlFor="part-studio-feature-pattern-second-spacing"
                  >
                    {t('partStudio.featurePatternDialog.secondSpacingLabel')}
                  </label>
                  <input
                    id="part-studio-feature-pattern-second-spacing"
                    type="text"
                    inputMode="decimal"
                    aria-label={t('partStudio.featurePatternDialog.secondSpacingLabel')}
                    className="part-studio-feature-dialog__input"
                    value={secondSpacing}
                    disabled={busy || !canEdit}
                    onChange={(event) => setSecondSpacing(event.target.value)}
                    data-testid="part-studio-feature-pattern-second-spacing"
                  />
                </section>
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-pattern-second-direction-hint"
                >
                  {t('partStudio.featurePatternDialog.secondDirectionHint')}
                </p>
                {secondAxis !== undefined && secondAxisValid && (
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-pattern-second-axis"
                  >
                    {t('partStudio.featurePatternDialog.secondAxisReadonly', {
                      origin: vecText(secondAxis.origin),
                      direction: vecText(secondAxis.direction),
                    })}
                  </p>
                )}
                {!secondCountValid && (
                  <p
                    role="alert"
                    className="part-studio-feature-dialog__alert"
                    data-testid="part-studio-feature-pattern-second-count-invalid"
                  >
                    {t(secondCenteredActive
                      ? 'partStudio.featurePatternDialog.secondCountCenteredInvalid'
                      : 'partStudio.featurePatternDialog.secondCountInvalid')}
                  </p>
                )}
                {!secondSpacingValid && (
                  <p
                    role="alert"
                    className="part-studio-feature-dialog__alert"
                    data-testid="part-studio-feature-pattern-second-spacing-invalid"
                  >
                    {t('partStudio.featurePatternDialog.secondSpacingInvalid')}
                  </p>
                )}
                {totalOverLimit && (
                  <p
                    role="alert"
                    className="part-studio-feature-dialog__alert"
                    data-testid="part-studio-feature-pattern-total-invalid"
                  >
                    {t('partStudio.featurePatternDialog.totalInstancesInvalid')}
                  </p>
                )}
              </>
            )}
          </section>
        )}
        {!countValid && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-feature-pattern-count-invalid">
            {t(centeredActive
              ? 'partStudio.featurePatternDialog.countCenteredInvalid'
              : 'partStudio.featureDialog.patternCountInvalid')}
          </p>
        )}
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
