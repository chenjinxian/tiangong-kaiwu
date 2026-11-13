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
 * 首切片只渲染已有字段证据且后端契约已支持的模式：
 * - 按 XYZ 平动（translation）；
 * - 世界 X/Y/Z 轴旋转（rotation；任意轴只读保留，不改写）；
 * - 均匀缩放（scale；固定点/非均匀缩放不在本 UI 编辑，保留落库值只读）；
 * - 复制零件（copy）。
 * 「按直线/距离平动」「按配合连接器变换」「原位复制」无字段证据，不渲染假控件；
 * 多分量 transform（平移+旋转+缩放同存）不在本对话框改参（禁用并提示重建）。
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
  const [angle, setAngle] = React.useState(() => numberText(stored.rotation?.angleDeg, '90'));
  const [scale, setScale] = React.useState(() => numberText(stored.scale, '2'));
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
      : scaleValid && !nonUniform;
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
      data-testid="part-studio-transform-dialog"
      data-feature="transform"
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
            data-testid="part-studio-transform-confirm"
          >✓</button>
          <button
            type="button"
            className="part-studio-feature-dialog__cancel"
            aria-label={t('partStudio.featureDialog.cancel')}
            onClick={() => onCancel?.()}
            data-testid="part-studio-transform-cancel"
          >✗</button>
        </div>
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
        <section className="part-studio-feature-dialog__distance" data-field="transform-target">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-target">
            {t('partStudio.transformDialog.targetBody')}
          </label>
          {editMode ? (
            <span className="part-studio-feature-dialog__static-value" data-testid="part-studio-transform-target-fixed">
              {t('partStudio.transformDialog.targetFixed')}
            </span>
          ) : noBodies ? (
            <span className="part-studio-feature-dialog__static-value" data-testid="part-studio-transform-no-bodies">
              {t('partStudio.transformDialog.noBodies')}
            </span>
          ) : activeBodies.length === 1 ? (
            <span className="part-studio-feature-dialog__static-value" data-testid="part-studio-transform-target">
              {targetLabel}
            </span>
          ) : (
            <select
              id="part-studio-transform-target"
              aria-label={t('partStudio.transformDialog.targetBody')}
              className="part-studio-feature-dialog__select"
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
          )}
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
        <section className="part-studio-feature-dialog__distance" data-field="transform-mode">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-mode">
            {t('partStudio.transformDialog.mode')}
          </label>
          <select
            id="part-studio-transform-mode"
            aria-label={t('partStudio.transformDialog.mode')}
            className="part-studio-feature-dialog__select"
            value={mode}
            disabled={busy || !canEdit || combined}
            onChange={(event) => setMode(event.target.value as TransformMode)}
            data-testid="part-studio-transform-mode"
          >
            <option value="translate">{t('partStudio.transformDialog.modes.translate')}</option>
            <option value="rotate">{t('partStudio.transformDialog.modes.rotate')}</option>
            <option value="scale">{t('partStudio.transformDialog.modes.scale')}</option>
          </select>
        </section>
        {mode === 'translate' && (
          <>
            <section className="part-studio-feature-dialog__distance" data-field="transform-dx">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-dx">
                {t('partStudio.transformDialog.dx')}
              </label>
              <input
                id="part-studio-transform-dx"
                aria-label={t('partStudio.transformDialog.dx')}
                className="part-studio-feature-dialog__input"
                inputMode="decimal"
                value={dx}
                disabled={busy || !canEdit || combined}
                onChange={(event) => setDx(event.target.value)}
                data-testid="part-studio-transform-dx"
              />
            </section>
            <section className="part-studio-feature-dialog__distance" data-field="transform-dy">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-dy">
                {t('partStudio.transformDialog.dy')}
              </label>
              <input
                id="part-studio-transform-dy"
                aria-label={t('partStudio.transformDialog.dy')}
                className="part-studio-feature-dialog__input"
                inputMode="decimal"
                value={dy}
                disabled={busy || !canEdit || combined}
                onChange={(event) => setDy(event.target.value)}
                data-testid="part-studio-transform-dy"
              />
            </section>
            <section className="part-studio-feature-dialog__distance" data-field="transform-dz">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-dz">
                {t('partStudio.transformDialog.dz')}
              </label>
              <input
                id="part-studio-transform-dz"
                aria-label={t('partStudio.transformDialog.dz')}
                className="part-studio-feature-dialog__input"
                inputMode="decimal"
                value={dz}
                disabled={busy || !canEdit || combined}
                onChange={(event) => setDz(event.target.value)}
                data-testid="part-studio-transform-dz"
              />
            </section>
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
            <section className="part-studio-feature-dialog__distance" data-field="transform-angle">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-angle">
                {t('partStudio.transformDialog.angle')}
              </label>
              <input
                id="part-studio-transform-angle"
                aria-label={t('partStudio.transformDialog.angle')}
                className="part-studio-feature-dialog__input"
                inputMode="decimal"
                value={angle}
                disabled={busy || !canEdit || combined}
                onChange={(event) => setAngle(event.target.value)}
                data-testid="part-studio-transform-angle"
              />
            </section>
            <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-transform-rotate-hint">
              {t('partStudio.transformDialog.rotateHint')}
            </p>
          </>
        )}
        {mode === 'scale' && (
          <>
            <section className="part-studio-feature-dialog__distance" data-field="transform-scale">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-transform-scale">
                {t('partStudio.transformDialog.scale')}
              </label>
              <input
                id="part-studio-transform-scale"
                aria-label={t('partStudio.transformDialog.scale')}
                className="part-studio-feature-dialog__input"
                inputMode="decimal"
                value={scale}
                disabled={busy || !canEdit || combined || nonUniform}
                onChange={(event) => setScale(event.target.value)}
                data-testid="part-studio-transform-scale"
              />
            </section>
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
