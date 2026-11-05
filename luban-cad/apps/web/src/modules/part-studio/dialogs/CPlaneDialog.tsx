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
import type { CPlaneParams, FeatureOp, FeatureOpResult } from '@luban-cad/shared';
import { CPLANE_REFERENCES, isCPlaneReference } from '../internal/cplane.js';
import type { CPlaneReference } from '../internal/cplane.js';

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
  return {
    reference: isCPlaneReference(p.reference) ? p.reference : undefined,
    offsetMm: typeof p.offsetMm === 'number' && Number.isFinite(p.offsetMm) ? p.offsetMm : undefined,
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
  const [flipNormal, setFlipNormal] = React.useState(initial.flipNormal === true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const offsetMm = Number(offset);
  const offsetValid = !offsetEnabled || (offset.trim() !== '' && Number.isFinite(offsetMm));
  const submitDisabled = !canEdit || busy || !applyOp || reference === undefined || !offsetValid;

  const confirm = async (): Promise<void> => {
    if (submitDisabled || reference === undefined || !applyOp) return;
    setBusy(true);
    setError(undefined);
    try {
      const params: CPlaneParams = {
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
        <div className="part-studio-feature-dialog__header-actions">
          <button
            type="button"
            className="part-studio-feature-dialog__confirm"
            aria-label={t('partStudio.featureDialog.confirm')}
            disabled={submitDisabled}
            onClick={() => void confirm()}
          >
            ✓
          </button>
          <button
            type="button"
            className="part-studio-feature-dialog__cancel"
            aria-label={t('partStudio.featureDialog.cancel')}
            onClick={() => onCancel?.()}
          >
            ✗
          </button>
        </div>
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

        {offsetEnabled && (
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
