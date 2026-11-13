/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CPlaneDialog（ADR-0006 切片 B1，shared 1.29）——按 2026-11-05 live Onshape 证据
 * （onshape-parity-data/ui-evidence/cplane-dialog-20261105）实现 Plane 对话框：
 *   图元（参考基准面芯片 + ×）、偏移（复选）、偏移距离、反转法线（复选）。
 * live 的「偏移」下拉多模式/表达式入口/「成品」按钮未采集，本切片不做；不静默伪造。
 *
 * 提交走 FeatureService 的 cPlane 特征（insertFeature / updateParams）；平面三向量不在后端
 * 计算——前端 internal/cplane.ts 在草图插入时派生快照（含 sourceFeatureId）。
 */
import * as React from 'react';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { useTranslation } from 'react-i18next';
import { DialogHeaderButtons } from './DialogHeaderButtons.js';
import type { CPlaneParams, FeatureOp, FeatureOpResult } from '@luban-cad/shared';
import { CPLANE_REFERENCES, isCPlaneReference } from '../internal/cplane.js';
import type { CPlaneReference } from '../internal/cplane.js';
import { useDialogCommandHandler } from '../internal/dialog-commands.js';

export interface CPlaneDialogProps {
  featureName: string;
  /** edit 模式：已落库 feature id（提交走 updateParams，否则 insertFeature）。 */
  featureId?: string;
  /** edit 模式：既有 cPlane 参数回显。 */
  initialParams?: unknown;
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  canEdit?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function readInitialParams(value: unknown): Partial<CPlaneParams> {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  const origin = typeof p.origin === 'object' && p.origin !== null
    ? p.origin as Record<string, unknown>
    : undefined;
  const finiteOrigin = origin !== undefined
    && typeof origin.x === 'number' && Number.isFinite(origin.x)
    && typeof origin.y === 'number' && Number.isFinite(origin.y)
    && typeof origin.z === 'number' && Number.isFinite(origin.z)
    ? { x: origin.x, y: origin.y, z: origin.z }
    : undefined;
  return {
    reference: isCPlaneReference(p.reference) ? p.reference : undefined,
    offsetMm: typeof p.offsetMm === 'number' && Number.isFinite(p.offsetMm) ? p.offsetMm : undefined,
    origin: finiteOrigin,
    flipNormal: p.flipNormal === true,
  };
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : '';
}

export function CPlaneDialog({
  featureName, featureId, initialParams, applyOp, canEdit = true, onConfirm, onCancel,
}: CPlaneDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const initial = React.useMemo(() => readInitialParams(initialParams), [initialParams]);
  const [reference, setReference] = React.useState<CPlaneReference | undefined>(() => initial.reference);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [offsetEnabled, setOffsetEnabled] = React.useState(initial.offsetMm !== undefined);
  const [offset, setOffset] = React.useState(() => numberText(initial.offsetMm ?? 0));
  // v1.31：平面点（世界参考法线 + 世界原点）；旧 offset 形态默认 reference 模式。
  const [planeMode, setPlaneMode] = React.useState<'reference' | 'point'>(
    initial.origin !== undefined ? 'point' : 'reference',
  );
  const [originX, setOriginX] = React.useState(() => numberText(initial.origin?.x ?? 0));
  const [originY, setOriginY] = React.useState(() => numberText(initial.origin?.y ?? 0));
  const [originZ, setOriginZ] = React.useState(() => numberText(initial.origin?.z ?? 0));
  const [flipNormal, setFlipNormal] = React.useState(initial.flipNormal === true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const offsetMm = Number(offset);
  const offsetValid = planeMode !== 'reference' || !offsetEnabled
    || (offset.trim() !== '' && Number.isFinite(offsetMm));
  const originNumbers = [Number(originX), Number(originY), Number(originZ)];
  const originValid = planeMode !== 'point'
    || ([originX, originY, originZ].every((text) => text.trim() !== '') && originNumbers.every(Number.isFinite));
  const submitDisabled = !canEdit || busy || !applyOp || reference === undefined
    || !offsetValid || !originValid;

  const confirm = async (): Promise<void> => {
    if (submitDisabled || reference === undefined || !applyOp) return;
    setBusy(true);
    setError(undefined);
    try {
      const params: CPlaneParams = planeMode === 'point'
        ? {
            reference,
            origin: { x: originNumbers[0]!, y: originNumbers[1]!, z: originNumbers[2]! },
            ...(flipNormal ? { flipNormal: true } : {}),
          }
        : {
            reference,
            ...(offsetEnabled ? { offsetMm } : {}),
            ...(flipNormal ? { flipNormal: true } : {}),
          };
      const result = await applyOp(featureId !== undefined
        ? { kind: 'updateParams', featureId, params }
        : { kind: 'insertFeature', featureType: 'cPlane', params });
      if (!result.ok) {
        setError(result.error ?? t('partStudio.cPlaneDialog.submitFailed'));
        return;
      }
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t(featureId !== undefined ? 'partStudio.cPlaneDialog.updateSuccess' : 'partStudio.cPlaneDialog.submitSuccess', { name: featureName }),
        ),
      );
      onConfirm?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // 2026-11-13：画布右键菜单前置「确认 / 取消」→ 与本对话框 ✓/✗ 同源命令。
  useDialogCommandHandler({ onConfirm: () => void confirm(), onCancel: () => onCancel?.() });

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label={featureName}
      aria-busy={busy || undefined}
      data-testid="part-studio-cplane-dialog"
      data-feature="cplane"
      className="part-studio-feature-dialog"
    >
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <DialogHeaderButtons disabled={submitDisabled} onConfirm={() => void confirm()} onCancel={() => onCancel?.()} />
      </header>
      <div className="part-studio-feature-dialog__body">
        {error && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-cplane-dialog-error">
            {error}
          </p>
        )}
        {!canEdit && (
          <p className="part-studio-feature-dialog__hint" data-testid="part-studio-cplane-readonly-hint">
            {t('partStudio.cPlaneDialog.readonlyHint')}
          </p>
        )}

        {/* v1.31：平面点模式（Onshape「平面点」的 B2a 子集：世界参考法线 + 世界原点）。 */}
        <section className="part-studio-feature-dialog__distance part-studio-cplane__mode">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="cplane-mode">
            {t('partStudio.cPlaneDialog.mode')}
          </label>
          <select
            id="cplane-mode"
            data-testid="cplane-mode"
            aria-label={t('partStudio.cPlaneDialog.mode')}
            className="part-studio-feature-dialog__select"
            value={planeMode}
            disabled={!canEdit}
            onChange={(event) => setPlaneMode(event.target.value === 'point' ? 'point' : 'reference')}
          >
            <option value="reference">{t('partStudio.cPlaneDialog.modeReference')}</option>
            <option value="point">{t('partStudio.cPlaneDialog.modePoint')}</option>
          </select>
        </section>

        {/* Onshape live：图元是浅蓝实体字段；偏移是整行下拉；偏移距离是数值行。 */}
        <section className="part-studio-feature-dialog__entities">
          <div className="part-studio-feature-dialog__entities-header">
            <span id="cplane-reference-label" className="part-studio-feature-dialog__entities-label">
              {t('partStudio.cPlaneDialog.reference')}
            </span>
            <button
              type="button"
              aria-labelledby="cplane-reference-label"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              data-testid="cplane-reference-chip"
              disabled={!canEdit}
              className="part-studio-feature-dialog__profile-field part-studio-cplane__reference-field"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className={reference === undefined ? 'part-studio-feature-dialog__profile-empty' : undefined}>
                {reference === undefined
                  ? t('partStudio.cPlaneDialog.referencePlaceholder')
                  : t(`partStudio.cPlaneDialog.planes.${reference}`)}
              </span>
            </button>
          </div>
          {reference !== undefined && canEdit && (
            <button
              type="button"
              aria-label={t('partStudio.cPlaneDialog.clearReference')}
              data-testid="cplane-reference-clear"
              className="part-studio-feature-dialog__chip-remove"
              onClick={() => {
                setReference(undefined);
                setMenuOpen(false);
              }}
            >
              ×
            </button>
          )}
          {menuOpen && canEdit && (
            <ul
              role="listbox"
              aria-label={t('partStudio.cPlaneDialog.reference')}
              data-testid="cplane-reference-menu"
              className="part-studio-cplane__menu"
            >
              {CPLANE_REFERENCES.map((candidate) => (
                <li key={candidate} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={candidate === reference}
                    data-testid={`cplane-reference-${candidate}`}
                    className="part-studio-cplane__menu-option"
                    onClick={() => {
                      setReference(candidate);
                      setMenuOpen(false);
                    }}
                  >
                    {t(`partStudio.cPlaneDialog.planes.${candidate}`)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {planeMode === 'reference' && (
          <section className="part-studio-feature-dialog__distance part-studio-cplane__mode">
            <label className="part-studio-feature-dialog__distance-label" htmlFor="cplane-offset-mode">
              {t('partStudio.cPlaneDialog.offset')}
            </label>
            <select
              id="cplane-offset-mode"
              data-testid="cplane-offset"
              aria-label={t('partStudio.cPlaneDialog.offset')}
              className="part-studio-feature-dialog__select"
              value={offsetEnabled ? 'offset' : 'none'}
              disabled={!canEdit}
              onChange={(event) => setOffsetEnabled(event.target.value === 'offset')}
            >
              <option value="none">{t('partStudio.cPlaneDialog.offsetNone')}</option>
              <option value="offset">{t('partStudio.cPlaneDialog.offset')}</option>
            </select>
          </section>
        )}

        {planeMode === 'reference' && offsetEnabled && (
          <section className="part-studio-feature-dialog__distance">
            <label className="part-studio-feature-dialog__distance-label" htmlFor="cplane-offset-distance">
              {t('partStudio.cPlaneDialog.offsetDistance')}
            </label>
            <input
              id="cplane-offset-distance"
              data-testid="cplane-offset-distance"
              aria-label={t('partStudio.cPlaneDialog.offsetDistance')}
              className="part-studio-feature-dialog__input"
              inputMode="decimal"
              value={offset}
              disabled={!canEdit}
              onChange={(event) => setOffset(event.target.value)}
            />
          </section>
        )}

        {planeMode === 'point' && (
          <React.Fragment>
            {(['x', 'y', 'z'] as const).map((axis) => {
              const value = axis === 'x' ? originX : axis === 'y' ? originY : originZ;
              const setValue = axis === 'x' ? setOriginX : axis === 'y' ? setOriginY : setOriginZ;
              return (
                <section key={axis} className="part-studio-feature-dialog__distance">
                  <label className="part-studio-feature-dialog__distance-label" htmlFor={`cplane-origin-${axis}`}>
                    {t('partStudio.cPlaneDialog.origin')} {axis.toUpperCase()}
                  </label>
                  <input
                    id={`cplane-origin-${axis}`}
                    data-testid={`cplane-origin-${axis}`}
                    aria-label={`${t('partStudio.cPlaneDialog.origin')} ${axis.toUpperCase()}`}
                    className="part-studio-feature-dialog__input"
                    inputMode="decimal"
                    value={value}
                    disabled={!canEdit}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </section>
              );
            })}
          </React.Fragment>
        )}

        <label className="part-studio-feature-dialog__checkbox">
          <input
            type="checkbox"
            data-testid="cplane-flip-normal"
            checked={flipNormal}
            disabled={!canEdit}
            onChange={(event) => setFlipNormal(event.target.checked)}
          />
          {t('partStudio.cPlaneDialog.flipNormal')}
        </label>
      </div>
      <footer className="part-studio-feature-dialog__footer">
        <div className="part-studio-feature-dialog__transparency">
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            aria-label={t('partStudio.featureDialog.transparencyLabel')}
            className="part-studio-feature-dialog__transparency-slider"
          />
        </div>
        <button type="button" className="part-studio-feature-dialog__help" aria-label={t('partStudio.featureDialog.help')}>?</button>
      </footer>
    </div>
  );
}
