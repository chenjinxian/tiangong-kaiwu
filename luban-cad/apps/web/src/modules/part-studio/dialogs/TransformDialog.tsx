/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * TransformDialog（ADR-0010 的 UI 面，2026-11-09）。
 *
 * 证据（私有仓 ui-evidence/feature-dialogs-20261108/onshape/transform*.{json,png}）：
 * 变换类型菜单含「按 XYZ 平动 / 旋转 / 缩放」；XYZ 平动的 dx/dy/dz、旋转的
 * 「轴 + 角度」、缩放的「均匀缩放 + 缩放 + 点」与「复制零件」。
 *
 * 后端契约已支持的模式：
 * - 按 XYZ 平动（translation）；
 * - 世界 X/Y/Z 轴旋转（rotation；任意轴只读保留，不改写）；
 * - 均匀缩放（scale；固定点/非均匀缩放不在本 UI 编辑，保留落库值只读）；
 * - 复制零件（copy）。
 * live 模式菜单 7 项全部按序渲染；「按直线/距离平动」「按配合连接器变换」
 * 「原位复制」无后端通道，诚实禁用并标注未实现；默认按 XYZ 平动。
 * 多分量 transform（平移+旋转+缩放同存）不在本对话框改参（禁用并提示重建）。
 * 2026-11-15：按 dialog-audit group-d §1 对齐 live 行皮肤（目标 query field 两态、
 * 无标签模式行、X/Y/Z 轴值行、均匀缩放/固定点行、底栏滑杆+?）；载荷不变。
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
  TransformParams,
} from '@luban-cad/shared';
import { FeaturePreviewOverlay } from '../canvas/FeaturePreviewOverlay.js';
import { useDialogCommandHandler } from '../internal/dialog-commands.js';

export interface TransformDialogProps {
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

type TransformMode = 'translate' | 'rotate' | 'scale';
type WorldAxis = 'X' | 'Y' | 'Z';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface StoredRotation {
  axisOrigin?: Vec3;
  axisDirection: Vec3;
  angleDeg: number;
}

interface StoredTransform {
  translation?: Vec3;
  rotation?: StoredRotation;
  scale?: number;
  scaleAxes?: Vec3;
  scaleOrigin?: Vec3;
  copy?: boolean;
  componentCount: number;
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

function readStored(value: unknown): StoredTransform {
  if (typeof value !== 'object' || value === null) return { componentCount: 0 };
  const p = value as Record<string, unknown>;
  const rotationRaw = typeof p.rotation === 'object' && p.rotation !== null
    ? p.rotation as Record<string, unknown>
    : undefined;
  const rotationDirection = finiteVec(rotationRaw?.axisDirection);
  const rotationAngle = typeof rotationRaw?.angleDeg === 'number' ? rotationRaw.angleDeg : undefined;
  const rotation = rotationDirection !== undefined && rotationAngle !== undefined
    ? {
      axisOrigin: finiteVec(rotationRaw?.axisOrigin),
      axisDirection: rotationDirection,
      angleDeg: rotationAngle,
    }
    : undefined;
  const scale = typeof p.scale === 'number' && Number.isFinite(p.scale) ? p.scale : undefined;
  const scaleAxes = finiteVec(p.scaleAxes);
  const translation = finiteVec(p.translation);
  return {
    translation,
    rotation,
    scale,
    scaleAxes,
    scaleOrigin: finiteVec(p.scaleOrigin),
    copy: p.copy === true,
    componentCount: (translation !== undefined ? 1 : 0)
      + (rotation !== undefined ? 1 : 0)
      + (scale !== undefined || scaleAxes !== undefined ? 1 : 0),
  };
}

function numberText(value: number | undefined, fallback = '0'): string {
  return value !== undefined && Number.isFinite(value) ? String(Number(value.toFixed(4))) : fallback;
}

function worldAxisOf(direction: Vec3): WorldAxis | undefined {
  const n = Math.hypot(direction.x, direction.y, direction.z);
  if (!(n > 1e-9)) return undefined;
  const unit = { x: direction.x / n, y: direction.y / n, z: direction.z / n };
  if (Math.abs(unit.x - 1) < 1e-9 && Math.abs(unit.y) < 1e-9 && Math.abs(unit.z) < 1e-9) return 'X';
  if (Math.abs(unit.x + 1) < 1e-9 && Math.abs(unit.y) < 1e-9 && Math.abs(unit.z) < 1e-9) return 'X';
  if (Math.abs(unit.y - 1) < 1e-9 && Math.abs(unit.x) < 1e-9 && Math.abs(unit.z) < 1e-9) return 'Y';
  if (Math.abs(unit.y + 1) < 1e-9 && Math.abs(unit.x) < 1e-9 && Math.abs(unit.z) < 1e-9) return 'Y';
  if (Math.abs(unit.z - 1) < 1e-9 && Math.abs(unit.x) < 1e-9 && Math.abs(unit.y) < 1e-9) return 'Z';
  if (Math.abs(unit.z + 1) < 1e-9 && Math.abs(unit.x) < 1e-9 && Math.abs(unit.y) < 1e-9) return 'Z';
  return undefined;
}

const AXIS_DIRECTIONS: Record<WorldAxis, Vec3> = {
  X: { x: 1, y: 0, z: 0 },
  Y: { x: 0, y: 1, z: 0 },
  Z: { x: 0, y: 0, z: 1 },
};

const vecText = (v: Vec3): string =>
  `(${Number(v.x.toFixed(4))}, ${Number(v.y.toFixed(4))}, ${Number(v.z.toFixed(4))})`;

export function TransformDialog({
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
}: TransformDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const stored = React.useMemo(() => readStored(initialParams), [initialParams]);
  const editMode = featureId !== undefined;
  const activeBodies = React.useMemo(
    () => bodies.filter((body) => body.active !== false && body.authored !== false),
    [bodies],
  );
  const storedAxis = stored.rotation !== undefined ? worldAxisOf(stored.rotation.axisDirection) : undefined;
  const customAxis = stored.rotation !== undefined && storedAxis === undefined
    ? stored.rotation.axisDirection
    : undefined;

  const [mode, setMode] = React.useState<TransformMode>(() => (
    stored.rotation !== undefined ? 'rotate'
      : (stored.scale !== undefined || stored.scaleAxes !== undefined) ? 'scale'
        : 'translate'
  ));
  const [dx, setDx] = React.useState(() => numberText(stored.translation?.x));
  const [dy, setDy] = React.useState(() => numberText(stored.translation?.y));
  const [dz, setDz] = React.useState(() => numberText(stored.translation?.z));
  const [axis, setAxis] = React.useState<WorldAxis | 'custom'>(() => storedAxis ?? (customAxis !== undefined ? 'custom' : 'Z'));
  const [angle, setAngle] = React.useState(() => numberText(stored.rotation?.angleDeg, '30'));
  const [scale, setScale] = React.useState(() => numberText(stored.scale, '1'));
  const [uniform, setUniform] = React.useState(() => stored.scaleAxes === undefined);
  const [copy, setCopy] = React.useState(stored.copy === true);
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

  const combined = stored.componentCount > 1;
  const nonUniform = stored.scaleAxes !== undefined;
  const dxNumber = Number(dx);
  const dyNumber = Number(dy);
  const dzNumber = Number(dz);
  const translationFinite = [dxNumber, dyNumber, dzNumber].every((n) => Number.isFinite(n));
  const translationNoop = translationFinite
    && Math.hypot(dxNumber, dyNumber, dzNumber) <= 1e-12;
  const angleNumber = Number(angle);
  const angleValid = angle.trim() !== '' && Number.isFinite(angleNumber) && Math.abs(angleNumber) > 1e-12;
  const scaleNumber = Number(scale);
  const scaleValid = scale.trim() !== '' && Number.isFinite(scaleNumber)
    && scaleNumber > 0 && Math.abs(scaleNumber - 1) > 1e-12;
  const axisDirection = axis === 'custom'
    ? customAxis
    : AXIS_DIRECTIONS[axis];
  const axisValid = axisDirection !== undefined
    && Math.hypot(axisDirection.x, axisDirection.y, axisDirection.z) > 1e-9;
  const targetBody = activeBodies.find((body) => body.bodyKey === targetBodyKey);
  const targetMissing = !editMode && activeBodies.length > 0 && targetBody === undefined;
  const noBodies = !editMode && activeBodies.length === 0;
  const modeValid = mode === 'translate'
    ? translationFinite && !translationNoop
    : mode === 'rotate'
      ? angleValid && axisValid
      : scaleValid && !nonUniform && uniform;
  const submitDisabled = busy || !canEdit || applyOp === undefined || combined
    || noBodies || targetMissing || (editMode ? false : activeBodies.length > 1 && targetBodyKey === undefined)
    || !modeValid;

  const buildParams = React.useCallback((): TransformParams | undefined => {
    let base: TransformParams;
    if (mode === 'translate') {
      base = { translation: { x: dxNumber, y: dyNumber, z: dzNumber } };
    } else if (mode === 'rotate') {
      if (axisDirection === undefined) return undefined;
      base = {
        rotation: {
          ...(stored.rotation?.axisOrigin !== undefined
            ? { axisOrigin: stored.rotation.axisOrigin }
            : {}),
          axisDirection,
          angleDeg: angleNumber,
        },
      };
    } else {
      base = {
        scale: scaleNumber,
        ...(stored.scaleOrigin !== undefined ? { scaleOrigin: stored.scaleOrigin } : {}),
      };
    }
    if (copy) base.copy = true;
    return base;
  }, [mode, dxNumber, dyNumber, dzNumber, axisDirection, stored.rotation, stored.scaleOrigin,
    angleNumber, scaleNumber, copy]);

  const previewSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (previewOp === undefined || submitDisabled) {
      setDynamicPreview(undefined);
      return;
    }
    const seq = ++previewSeqRef.current;
    const timer = window.setTimeout(() => {
      const params = buildParams();
      if (params === undefined) return;
      const op: FeatureOp = editMode && featureId !== undefined
        ? { kind: 'updateParams', featureId, params: params as FeatureParams }
        : {
          kind: 'insertFeature',
          featureType: 'transform',
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
    const params = buildParams();
    if (params === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const op: FeatureOp = editMode && featureId !== undefined
        ? { kind: 'updateParams', featureId, params: params as FeatureParams }
        : {
          kind: 'insertFeature',
          featureType: 'transform',
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
          t('partStudio.transformDialog.submitSuccess', { name: featureName }),
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
  const targetSelected = editMode || targetBody !== undefined;
  const notImplementedTitle = t('partStudio.featureDialog.notImplemented');
  const translateRows: Array<{
    axis: 'x' | 'y' | 'z';
    label: 'X' | 'Y' | 'Z';
    value: string;
    setValue: React.Dispatch<React.SetStateAction<string>>;
    testId: string;
  }> = [
    { axis: 'x', label: 'X', value: dx, setValue: setDx, testId: 'part-studio-transform-dx' },
    { axis: 'y', label: 'Y', value: dy, setValue: setDy, testId: 'part-studio-transform-dy' },
    { axis: 'z', label: 'Z', value: dz, setValue: setDz, testId: 'part-studio-transform-dz' },
  ];

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={false}
      aria-label={featureName}
      data-testid="part-studio-transform-dialog"
      data-feature="transform"
      className="part-studio-feature-dialog"
    >
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <DialogHeaderButtons disabled={submitDisabled} onConfirm={() => void confirm()} onCancel={() => onCancel?.()} confirmTestId="part-studio-transform-confirm" cancelTestId="part-studio-transform-cancel" />
      </header>
      <div className="part-studio-feature-dialog__body">
        {error !== undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-transform-error">
            {error}
          </p>
        )}
        {combined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-transform-combined">
            {t('partStudio.transformDialog.combinedHint')}
          </p>
        )}
        <section className="part-studio-transform-dialog__query-row" data-field="transform-target">
          <div
            className={`part-studio-feature-dialog__profile-field part-studio-transform-dialog__query-field${targetSelected ? ' is-selected' : ' is-empty'}`}
            data-testid="part-studio-transform-target-field"
            aria-label={t('partStudio.transformDialog.targetBody')}
          >
            <span className="part-studio-feature-dialog__query-label part-studio-transform-dialog__query-label">
              {t('partStudio.transformDialog.targetBody')}
            </span>
            {editMode ? (
              <span className="part-studio-transform-dialog__target-chip" data-testid="part-studio-transform-target-fixed">
                {t('partStudio.transformDialog.targetFixed')}
              </span>
            ) : noBodies ? (
              <span className="part-studio-transform-dialog__target-chip" data-testid="part-studio-transform-no-bodies">
                {t('partStudio.transformDialog.noBodies')}
              </span>
            ) : activeBodies.length > 1 ? (
              <select
                id="part-studio-transform-target"
                aria-label={t('partStudio.transformDialog.targetBody')}
                className="part-studio-transform-dialog__target-select"
                value={targetBodyKey ?? ''}
                disabled={busy || !canEdit}
                onChange={(event) => setTargetBodyKey(event.target.value === '' ? undefined : event.target.value)}
                data-testid="part-studio-transform-target"
              >
                <option value="">{t('partStudio.transformDialog.targetPlaceholder')}</option>
                {activeBodies.map((body) => (
                  <option key={body.bodyKey} value={body.bodyKey}>
                    {body.name && body.name.trim() !== '' ? `${body.name} (${body.bodyKey})` : body.bodyKey}
                  </option>
                ))}
              </select>
            ) : targetBody !== undefined ? (
              <span className="part-studio-transform-dialog__target-chip" data-testid="part-studio-transform-target">
                {targetLabel}
              </span>
            ) : null}
          </div>
        </section>
        {!editMode && activeBodies.length > 1 && targetBody === undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-transform-target-missing">
            {t('partStudio.transformDialog.targetMissing')}
          </p>
        )}
        {noBodies && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-transform-needs-body">
            {t('partStudio.transformDialog.needsBody')}
          </p>
        )}
        {/* live 模式行为无标签整行下拉（14px 值、透明底、下划线）；7 项按 live 顺序
            全部渲染，无后端通道的 4 项禁用并标注未实现（不静默省略）。 */}
        <div className="part-studio-feature-dialog__mode-row part-studio-transform-dialog__mode-row" data-field="transform-mode">
          <select
            id="part-studio-transform-mode"
            aria-label={t('partStudio.transformDialog.mode')}
            className="part-studio-transform-dialog__mode-select"
            value={mode}
            disabled={busy || !canEdit || combined}
            onChange={(event) => setMode(event.target.value as TransformMode)}
            data-testid="part-studio-transform-mode"
          >
            <option value="line" disabled title={notImplementedTitle}>
              {t('partStudio.transformDialog.modes.line')}
            </option>
            <option value="distance" disabled title={notImplementedTitle}>
              {t('partStudio.transformDialog.modes.distance')}
            </option>
            <option value="translate">{t('partStudio.transformDialog.modes.translate')}</option>
            <option value="mate" disabled title={notImplementedTitle}>
              {t('partStudio.transformDialog.modes.mate')}
            </option>
            <option value="rotate">{t('partStudio.transformDialog.modes.rotate')}</option>
            <option value="inPlace" disabled title={notImplementedTitle}>
              {t('partStudio.transformDialog.modes.inPlace')}
            </option>
            <option value="scale">{t('partStudio.transformDialog.modes.scale')}</option>
          </select>
        </div>
        <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-mode-hint">
          {t('partStudio.transformDialog.modeChannelHint')}
        </p>
        {mode === 'translate' && (
          <>
            {translateRows.map((row) => (
              <section
                key={row.axis}
                className="part-studio-transform-dialog__value-row"
                data-field={`transform-d${row.axis}`}
              >
                <label
                  className="part-studio-transform-dialog__value-label"
                  htmlFor={`part-studio-transform-d${row.axis}`}
                >
                  <span
                    className="part-studio-transform-dialog__axis-glyph"
                    data-axis={row.axis}
                    aria-hidden="true"
                  />
                  <span>{row.label}</span>
                </label>
                <input
                  id={`part-studio-transform-d${row.axis}`}
                  aria-label={t('partStudio.transformDialog.translateValueAria', { axis: row.label })}
                  className="part-studio-feature-dialog__input part-studio-transform-dialog__value-input"
                  inputMode="decimal"
                  value={row.value}
                  disabled={busy || !canEdit || combined}
                  onChange={(event) => row.setValue(event.target.value)}
                  data-testid={row.testId}
                />
                <span className="part-studio-feature-dialog__value-unit">mm</span>
                <button
                  type="button"
                  className="part-studio-feature-dialog__calculator"
                  aria-label={t('partStudio.featureDialog.calculatorLabel')}
                  disabled
                  title={notImplementedTitle}
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
            ))}
            {translationNoop && (
              <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-transform-noop">
                {t('partStudio.transformDialog.translateNoop')}
              </p>
            )}
          </>
        )}
        {mode === 'rotate' && (
          <>
            <section className="part-studio-feature-dialog__distance" data-field="transform-axis">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-axis">
                {t('partStudio.transformDialog.axis')}
              </label>
              <select
                id="part-studio-transform-axis"
                aria-label={t('partStudio.transformDialog.axis')}
                className="part-studio-feature-dialog__select"
                value={axis}
                disabled={busy || !canEdit || combined}
                onChange={(event) => setAxis(event.target.value as WorldAxis | 'custom')}
                data-testid="part-studio-transform-axis"
              >
                <option value="X">X</option>
                <option value="Y">Y</option>
                <option value="Z">Z</option>
                {customAxis !== undefined && (
                  <option value="custom">{t('partStudio.transformDialog.customAxis')}</option>
                )}
              </select>
            </section>
            {customAxis !== undefined && axis === 'custom' && (
              <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-custom-axis">
                {t('partStudio.transformDialog.customAxisHint', { direction: vecText(customAxis) })}
              </p>
            )}
            {stored.rotation?.axisOrigin !== undefined && (
              <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-axis-origin">
                {t('partStudio.transformDialog.axisOriginHint', {
                  origin: vecText(stored.rotation.axisOrigin),
                })}
              </p>
            )}
            {/* 审计 B3（2026-11-16）：角度数值行统一值行惯用法（° + 禁用计算器）。 */}
            <section className="part-studio-transform-dialog__value-row" data-field="transform-angle">
              <label className="part-studio-transform-dialog__value-label" htmlFor="part-studio-transform-angle">
                {t('partStudio.transformDialog.angle')}
              </label>
              <input
                id="part-studio-transform-angle"
                aria-label={t('partStudio.transformDialog.angle')}
                className="part-studio-feature-dialog__input part-studio-transform-dialog__value-input"
                inputMode="decimal"
                value={angle}
                disabled={busy || !canEdit || combined}
                onChange={(event) => setAngle(event.target.value)}
                data-testid="part-studio-transform-angle"
              />
              <span className="part-studio-feature-dialog__value-unit">°</span>
              <button
                type="button"
                className="part-studio-feature-dialog__calculator"
                aria-label={t('partStudio.featureDialog.calculatorLabel')}
                disabled
                title={notImplementedTitle}
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
            <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-rotate-hint">
              {t('partStudio.transformDialog.rotateHint')}
            </p>
          </>
        )}
        {mode === 'scale' && (
          <>
            {/* live：均匀缩放复选（默认勾选）；落库非均匀缩放只读保留（禁用）。 */}
            <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-transform-uniform">
              <input
                type="checkbox"
                checked={uniform}
                disabled={busy || !canEdit || combined || nonUniform}
                onChange={(event) => setUniform(event.target.checked)}
              />
              <span>{t('partStudio.transformDialog.uniformScale')}</span>
            </label>
            {/* 审计 B3（2026-11-16）：缩放到数值行统一值行惯用法——无单位后缀
                （scale 无量纲），仍带禁用计算器。 */}
            <section className="part-studio-transform-dialog__value-row" data-field="transform-scale">
              <label className="part-studio-transform-dialog__value-label" htmlFor="part-studio-transform-scale">
                {t('partStudio.transformDialog.scale')}
              </label>
              <input
                id="part-studio-transform-scale"
                aria-label={t('partStudio.transformDialog.scale')}
                className="part-studio-feature-dialog__input part-studio-transform-dialog__value-input"
                inputMode="decimal"
                value={scale}
                disabled={busy || !canEdit || combined || nonUniform}
                onChange={(event) => setScale(event.target.value)}
                data-testid="part-studio-transform-scale"
              />
              <button
                type="button"
                className="part-studio-feature-dialog__calculator"
                aria-label={t('partStudio.featureDialog.calculatorLabel')}
                disabled
                title={notImplementedTitle}
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
            {/* live 固定点 query 行；无拾取通道，只读显示已存固定点。 */}
            <div className="part-studio-transform-dialog__point-row" data-testid="part-studio-transform-scale-point">
              <div
                className="part-studio-transform-dialog__point-field"
                title={notImplementedTitle}
              >
                <span className="part-studio-transform-dialog__point-label">
                  {t('partStudio.transformDialog.scalePoint')}
                </span>
                {stored.scaleOrigin !== undefined && (
                  <span className="part-studio-transform-dialog__point-value">
                    {vecText(stored.scaleOrigin)}
                  </span>
                )}
              </div>
              <span className="part-studio-transform-dialog__clock" aria-hidden="true">
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </span>
            </div>
            {!uniform && !nonUniform && (
              <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-uniform-hint">
                {t('partStudio.transformDialog.uniformOnlyHint')}
              </p>
            )}
            {nonUniform && (
              <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-transform-nonuniform">
                {t('partStudio.transformDialog.nonUniformHint')}
              </p>
            )}
            {stored.scaleOrigin !== undefined && (
              <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-scale-origin">
                {t('partStudio.transformDialog.scaleOriginHint', {
                  origin: vecText(stored.scaleOrigin),
                })}
              </p>
            )}
            <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-scale-hint">
              {t('partStudio.transformDialog.scaleHint')}
            </p>
          </>
        )}
        <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-transform-copy">
          <input
            type="checkbox"
            checked={copy}
            disabled={busy || !canEdit || combined}
            onChange={(event) => setCopy(event.target.checked)}
          />
          <span>{t('partStudio.transformDialog.copy')}</span>
        </label>
        {copy && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-transform-copy-hint"
          >
            {t('partStudio.transformDialog.copyMergeHint')}
          </p>
        )}
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
