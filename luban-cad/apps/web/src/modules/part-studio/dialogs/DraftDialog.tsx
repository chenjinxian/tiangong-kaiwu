/**
 * DraftDialog（ADR-0021 AX-01 的 UI 面，2026-11-19）。
 *
 * 首切片输入模型：用户在视口选择面（或打开对话框前已选），对话框把所选面分为
 * 「拔模面」与「中性面」——中性面由同一组所选面下拉指定（Onshape 的中性面独立
 * 拾取 UX 待后续切片；本切片不伪造独立拾取按钮）。方向 X/Y/Z、角度（度）、
 * 添加台阶面开关；提交走标准 insertFeature(draft)/updateParams。
 *
 * 约束：所有面必须属于同一 body；中性面必填；角度 0<|angle|<89；面引用持久
 * 拓扑 id。失败由后端结构化错误透出，零变更。
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
import { FeaturePreviewOverlay } from '../canvas/FeaturePreviewOverlay.js';
import type {
  BodyInfo,
  DraftParams,
  FeatureOp,
  FeatureOpResult,
  FeaturePreviewGeometryDto,
  LubanTopologyId,
  PreviewResult,
} from '@luban-cad/shared';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import type { CanvasSelection } from '../types.js';
import { useDialogCommandHandler } from '../internal/dialog-commands.js';

export interface DraftDialogProps {
  featureName: string;
  featureId?: string;
  initialParams?: unknown;
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  previewOp?: (op: FeatureOp) => Promise<PreviewResult>;
  connection?: BriefcaseConnection | null;
  viewport?: ScreenViewport | null;
  bodies?: readonly BodyInfo[];
  initialFaces?: readonly CanvasSelection[];
  canEdit?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface SelectedFace {
  key: string;
  topologyId: LubanTopologyId;
  ownerBodyKey: string;
  label: string;
}

interface StoredDraftParams {
  bodyId?: string;
  faces?: LubanTopologyId[];
  neutralFace?: LubanTopologyId;
  pullDirection?: 'X' | 'Y' | 'Z';
  angleDeg?: number;
  addStep?: boolean;
}

function topologyKey(face: LubanTopologyId): string {
  return `${face.nodeId}:${face.entityId}`;
}

function readStored(value: unknown): StoredDraftParams {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  const face = (raw: unknown): LubanTopologyId | undefined => {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const f = raw as { nodeId?: unknown; entityId?: unknown };
    return typeof f.nodeId === 'number' && typeof f.entityId === 'number'
      ? { nodeId: f.nodeId, entityId: f.entityId }
      : undefined;
  };
  const direction = p.pullDirection;
  return {
    bodyId: typeof p.bodyId === 'string' ? p.bodyId : undefined,
    faces: Array.isArray(p.faces) ? p.faces.map(face).filter((f): f is LubanTopologyId => f !== undefined) : undefined,
    neutralFace: face(p.neutralFace),
    pullDirection: direction === 'X' || direction === 'Y' || direction === 'Z' ? direction : undefined,
    angleDeg: typeof p.angleDeg === 'number' ? p.angleDeg : undefined,
    addStep: typeof p.addStep === 'boolean' ? p.addStep : undefined,
  };
}

function faceFromSelection(entry: CanvasSelection): SelectedFace | undefined {
  if (entry.kind !== 'face' || entry.topologyId === undefined || entry.ownerBodyKey === undefined)
    return undefined;
  return {
    key: `${entry.ownerBodyKey}:${topologyKey(entry.topologyId)}`,
    topologyId: entry.topologyId,
    ownerBodyKey: entry.ownerBodyKey,
    label: entry.label ?? topologyKey(entry.topologyId),
  };
}

export function DraftDialog({
  featureName,
  featureId,
  initialParams,
  applyOp,
  previewOp,
  connection,
  viewport,
  bodies = [],
  initialFaces,
  canEdit = true,
  onConfirm,
  onCancel,
}: DraftDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selection } = useCanvasSelection();
  const stored = React.useMemo(() => readStored(initialParams), [initialParams]);
  const editMode = featureId !== undefined;

  const storedFaces = React.useMemo<SelectedFace[]>(() => {
    if (!editMode) return [];
    const out: SelectedFace[] = [];
    for (const topologyId of stored.faces ?? []) {
      out.push({ key: `stored:${topologyKey(topologyId)}`, topologyId, ownerBodyKey: '', label: topologyKey(topologyId) });
    }
    if (stored.neutralFace) {
      const key = topologyKey(stored.neutralFace);
      if (!out.some((f) => f.key === `stored:${key}`))
        out.push({ key: `stored:${key}`, topologyId: stored.neutralFace, ownerBodyKey: '', label: key });
    }
    return out;
  }, [editMode, stored.faces, stored.neutralFace]);

  const liveFaces = React.useMemo<SelectedFace[]>(
    () => selection.flatMap((entry) => {
      const face = faceFromSelection(entry);
      return face ? [face] : [];
    }),
    [selection],
  );
  const snapshotFaces = React.useMemo<SelectedFace[]>(
    () => (initialFaces ?? []).flatMap((entry) => {
      const face = faceFromSelection(entry);
      return face ? [face] : [];
    }),
    [initialFaces],
  );

  const allFaces = React.useMemo(() => {
    if (editMode) return storedFaces;
    const deduped = new Map<string, SelectedFace>();
    for (const face of [...snapshotFaces, ...liveFaces]) deduped.set(face.key, face);
    return Array.from(deduped.values());
  }, [editMode, storedFaces, snapshotFaces, liveFaces]);

  const [neutralKey, setNeutralKey] = React.useState<string | undefined>(() => {
    if (editMode && stored.neutralFace) return `stored:${topologyKey(stored.neutralFace)}`;
    return undefined;
  });
  const [direction, setDirection] = React.useState<'X' | 'Y' | 'Z'>(() => stored.pullDirection ?? 'Z');
  const [angle, setAngle] = React.useState(() => (stored.angleDeg !== undefined ? String(stored.angleDeg) : '15'));
  const [addStep, setAddStep] = React.useState(() => stored.addStep ?? true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [dynamicPreview, setDynamicPreview] = React.useState<FeaturePreviewGeometryDto | undefined>(undefined);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [previewHost, setPreviewHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setPreviewHost((rootRef.current?.closest('.part-studio-canvas') as HTMLElement | null) ?? null);
  }, []);

  const neutral = allFaces.find((face) => face.key === neutralKey);
  const targets = allFaces.filter((face) => face.key !== neutralKey);
  const ownerKeys = Array.from(new Set(allFaces.map((face) => face.ownerBodyKey).filter((key) => key !== '')));
  const bodyId = editMode ? stored.bodyId : ownerKeys.length === 1 ? ownerKeys[0] : undefined;
  const crossBody = !editMode && ownerKeys.length > 1;
  const angleNumber = Number(angle);
  const angleValid = angle.trim() !== '' && Number.isFinite(angleNumber)
    && Math.abs(angleNumber) > 1e-12 && Math.abs(angleNumber) < 89;
  const bodyLabel = bodyId === undefined
    ? undefined
    : bodies.find((body) => body.bodyKey === bodyId)?.name ?? bodyId;

  const submitDisabled = !canEdit || busy || applyOp === undefined
    || neutral === undefined || targets.length === 0 || bodyId === undefined
    || crossBody || !angleValid;

  const buildParams = React.useCallback((): DraftParams => {
    if (neutral === undefined || bodyId === undefined)
      throw new Error(t('partStudio.draftDialog.missingSelection'));
    return {
      bodyId,
      faces: targets.map((face) => face.topologyId),
      neutralFace: neutral.topologyId,
      pullDirection: direction,
      angleDeg: angleNumber,
      ...(addStep ? {} : { addStep: false }),
    };
  }, [neutral, bodyId, targets, direction, angleNumber, addStep, t]);

  const previewSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (previewOp === undefined || submitDisabled) {
      setDynamicPreview(undefined);
      return;
    }
    const seq = ++previewSeqRef.current;
    const timer = window.setTimeout(() => {
      let params: DraftParams;
      try {
        params = buildParams();
      } catch {
        return;
      }
      const op: FeatureOp = editMode
        ? { kind: 'updateParams', featureId: featureId!, params }
        : { kind: 'insertFeature', featureType: 'draft', params, targetBodyId: params.bodyId };
      void previewOp(op).then(
        (result) => {
          if (previewSeqRef.current !== seq) return;
          setDynamicPreview(result.ok ? result.preview : undefined);
        },
        () => {
          if (previewSeqRef.current === seq) setDynamicPreview(undefined);
        },
      );
    }, 200);
    return () => {
      window.clearTimeout(timer);
      if (previewSeqRef.current === seq) previewSeqRef.current += 1;
    };
  }, [previewOp, submitDisabled, editMode, featureId, buildParams]);

  const confirm = React.useCallback(async (): Promise<void> => {
    if (submitDisabled || applyOp === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      let params: DraftParams;
      try {
        params = buildParams();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      const op: FeatureOp = editMode
        ? { kind: 'updateParams', featureId: featureId!, params }
        : { kind: 'insertFeature', featureType: 'draft', params, targetBodyId: params.bodyId };
      const result = await applyOp(op);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(OutputMessagePriority.Success, t('partStudio.draftDialog.submitSuccess', { name: featureName })),
      );
      onConfirm?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [submitDisabled, applyOp, buildParams, editMode, featureId, t, featureName, onConfirm]);

  useDialogCommandHandler({ onConfirm: () => void confirm(), onCancel: () => onCancel?.(), confirmLabel: featureName });

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={false}
      aria-label={featureName}
      data-testid="part-studio-draft-dialog"
      data-feature="draft"
      className="part-studio-feature-dialog"
    >
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <DialogHeaderButtons
          disabled={submitDisabled}
          onConfirm={() => void confirm()}
          onCancel={() => onCancel?.()}
          confirmTestId="part-studio-draft-confirm"
          cancelTestId="part-studio-draft-cancel"
        />
      </header>
      <div className="part-studio-feature-dialog__body">
        {error !== undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-draft-error">{error}</p>
        )}

        <section className="part-studio-feature-dialog__entities" data-testid="part-studio-draft-faces">
          <div className={`part-studio-feature-dialog__profile-field${allFaces.length === 0 ? ' is-empty' : ' is-selected'}`}>
            <span className="part-studio-feature-dialog__query-label">{t('partStudio.draftDialog.facesLabel')}</span>
            {allFaces.length > 0 ? (
              <span className="part-studio-feature-dialog__chips">
                {targets.map((face) => (
                  <span key={face.key} className="part-studio-feature-dialog__profile-chip" title={bodyLabel}>
                    {face.label}
                  </span>
                ))}
              </span>
            ) : (
              <span className="part-studio-feature-dialog__profile-empty">{t('partStudio.draftDialog.facesEmpty')}</span>
            )}
          </div>
        </section>

        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="draft-neutral" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.draftDialog.neutralLabel')}
          </label>
          <select
            id="draft-neutral"
            data-testid="part-studio-draft-neutral"
            className="part-studio-feature-dialog__select"
            value={neutralKey ?? ''}
            disabled={!canEdit || busy}
            onChange={(event) => setNeutralKey(event.target.value === '' ? undefined : event.target.value)}
          >
            <option value="">{t('partStudio.draftDialog.neutralPlaceholder')}</option>
            {allFaces.map((face) => (
              <option key={face.key} value={face.key}>{face.label}</option>
            ))}
          </select>
        </section>

        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="draft-direction" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.draftDialog.direction')}
          </label>
          <select
            id="draft-direction"
            data-testid="part-studio-draft-direction"
            className="part-studio-feature-dialog__select"
            value={direction}
            disabled={!canEdit || busy}
            onChange={(event) => setDirection(event.target.value as 'X' | 'Y' | 'Z')}
          >
            <option value="X">X</option>
            <option value="Y">Y</option>
            <option value="Z">Z</option>
          </select>
        </section>

        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="draft-angle" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.draftDialog.angle')}
          </label>
          <input
            id="draft-angle"
            data-testid="part-studio-draft-angle"
            className="part-studio-feature-dialog__input"
            inputMode="decimal"
            value={angle}
            disabled={!canEdit || busy}
            onChange={(event) => setAngle(event.target.value)}
          />
          <span className="part-studio-feature-dialog__value-unit">deg</span>
        </section>

        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="draft-add-step" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.draftDialog.addStep')}
          </label>
          <input
            id="draft-add-step"
            data-testid="part-studio-draft-add-step"
            type="checkbox"
            checked={addStep}
            disabled={!canEdit || busy}
            onChange={(event) => setAddStep(event.target.checked)}
          />
        </section>

        {crossBody && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-draft-cross-body">
            {t('partStudio.draftDialog.crossBody')}
          </p>
        )}
        {!angleValid && angle.trim() !== '' && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-draft-angle-invalid">
            {t('partStudio.draftDialog.angleInvalid')}
          </p>
        )}
      </div>
      {previewHost !== null && dynamicPreview !== undefined && createPortal(
        <FeaturePreviewOverlay
          viewport={viewport ?? null}
          connection={connection ?? null}
          geometry={undefined}
          dynamicPreview={dynamicPreview}
          opacity={0.06}
          hideSource
          solid
        />,
        previewHost,
      )}
    </div>
  );
}
