/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * MoveFaceDialog（ADR-0014 切片 1/2 的 UI 面）。
 *
 * 证据（2026-11-08 live，私有仓 ui-evidence/feature-dialogs-20261108/onshape/
 * move-face.{json,png}）：字段顺序 要移动的面 → 偏移 → 终止类型（给定深度）→
 * 距离 → 重新应用圆角。
 *
 * 首切片只做「偏移/给定深度」：faces 来自唯一选择权威 store.canvas.selection
 * （路由快照 + 打开后存活选择），distanceMm 正=外扩/负=内缩；`重新应用圆角`
 * 产品未支持 → 禁用并提示。逐面距离（distancesMm，shared 1.46）不在本对话框
 * 编辑，edit 时只读回显并禁提交。
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
  FeaturePreviewGeometryDto,
  LubanTopologyId,
  PreviewResult,
} from '@luban-cad/shared';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import type { CanvasSelection } from '../types.js';
import { FeaturePreviewOverlay } from '../canvas/FeaturePreviewOverlay.js';
import { useDialogCommandHandler } from '../internal/dialog-commands.js';

export interface MoveFaceDialogProps {
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

type MoveDirection = 'outward' | 'inward';

interface SelectedFace {
  key: string;
  topologyId: LubanTopologyId;
  ownerBodyKey: string;
  label: string;
}

interface StoredMoveFaceParams {
  faces?: LubanTopologyId[];
  distanceMm?: number;
  distancesMm?: number[];
}

function readStored(value: unknown): StoredMoveFaceParams {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  return {
    faces: Array.isArray(p.faces)
      ? (p.faces as unknown[]).flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const face = entry as { nodeId?: unknown; entityId?: unknown };
        return typeof face.nodeId === 'number' && typeof face.entityId === 'number'
          ? [{ nodeId: face.nodeId, entityId: face.entityId }]
          : [];
      })
      : undefined,
    distanceMm: typeof p.distanceMm === 'number' ? p.distanceMm : undefined,
    distancesMm: Array.isArray(p.distancesMm)
      ? (p.distancesMm as unknown[]).filter((n): n is number => typeof n === 'number')
      : undefined,
  };
}

function topologyKey(face: LubanTopologyId): string {
  return `${face.nodeId}:${face.entityId}`;
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : '';
}

export function MoveFaceDialog({
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
}: MoveFaceDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selection } = useCanvasSelection();
  const stored = React.useMemo(() => readStored(initialParams), [initialParams]);
  const editMode = featureId !== undefined;

  const liveFaces = React.useMemo<SelectedFace[]>(
    () => selection.flatMap((entry) => {
      if (entry.kind !== 'face' || entry.topologyId === undefined || entry.ownerBodyKey === undefined)
        return [];
      return [{
        key: `${entry.ownerBodyKey}:${topologyKey(entry.topologyId)}`,
        topologyId: entry.topologyId,
        ownerBodyKey: entry.ownerBodyKey,
        label: entry.label ?? `${entry.ownerBodyKey} ${topologyKey(entry.topologyId)}`,
      }];
    }),
    [selection],
  );
  const storedFaces = editMode
    ? (stored.faces ?? []).map((topologyId, index): SelectedFace => ({
      key: `stored:${topologyKey(topologyId)}`,
      topologyId,
      ownerBodyKey: '',
      label: `${index + 1}: ${topologyKey(topologyId)}`,
    }))
    : [];
  const snapshotFaces = React.useMemo<SelectedFace[]>(
    () => (initialFaces ?? []).flatMap((entry) => {
      if (entry.kind !== 'face' || entry.topologyId === undefined || entry.ownerBodyKey === undefined)
        return [];
      return [{
        key: `${entry.ownerBodyKey}:${topologyKey(entry.topologyId)}`,
        topologyId: entry.topologyId,
        ownerBodyKey: entry.ownerBodyKey,
        label: entry.label ?? `${entry.ownerBodyKey} ${topologyKey(entry.topologyId)}`,
      }];
    }),
    [initialFaces],
  );
  const faces = React.useMemo(() => {
    if (editMode) return storedFaces;
    const deduped = new Map<string, SelectedFace>();
    for (const face of [...snapshotFaces, ...liveFaces]) deduped.set(face.key, face);
    return Array.from(deduped.values());
  }, [editMode, storedFaces, snapshotFaces, liveFaces]);

  const [distance, setDistance] = React.useState(
    () => numberText(Math.abs(stored.distanceMm ?? 5)) || '5',
  );
  const [direction, setDirection] = React.useState<MoveDirection>(
    () => (stored.distanceMm ?? 1) < 0 ? 'inward' : 'outward',
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [dynamicPreview, setDynamicPreview] = React.useState<FeaturePreviewGeometryDto | undefined>(undefined);

  const activeBodies = bodies.filter((body) => body.active !== false && body.authored !== false);
  const ownerKeys = Array.from(new Set(faces.map((face) => face.ownerBodyKey).filter((key) => key !== '')));
  const ownerBodyKey = ownerKeys.length === 1 ? ownerKeys[0] : undefined;
  const ownerBody = ownerBodyKey === undefined ? undefined : activeBodies.find((body) => body.bodyKey === ownerBodyKey);
  const ownerLabel = ownerBody?.name && ownerBody.name.trim() !== '' ? ownerBody.name : ownerBodyKey;

  const parsedDistance = Number(distance);
  const distanceValid = distance.trim() !== '' && Number.isFinite(parsedDistance) && parsedDistance > 0;
  const crossBody = !editMode && ownerKeys.length > 1;
  const missingOwner = !editMode && faces.length > 0 && ownerKeys.length === 0;
  const perFaceReadOnly = editMode && stored.distancesMm !== undefined && stored.distancesMm.length > 0;
  const submitDisabled = !canEdit || busy || applyOp === undefined || faces.length === 0
    || !distanceValid || crossBody || missingOwner || perFaceReadOnly;

  const signedDistance = direction === 'inward' ? -parsedDistance : parsedDistance;
  const buildParams = React.useCallback((): FeatureParams => {
    const base = editMode && typeof initialParams === 'object' && initialParams !== null
      ? { ...(initialParams as Record<string, unknown>) }
      : {};
    // 逐面距离改单距离形态时移除旧键，避免后端「恰一」守卫拒收。
    delete base.distancesMm;
    return {
      ...base,
      faces: faces.map((face) => face.topologyId),
      distanceMm: signedDistance,
    } as unknown as FeatureParams;
  }, [editMode, initialParams, signedDistance, faces]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [previewHost, setPreviewHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setPreviewHost((rootRef.current?.closest('.part-studio-canvas') as HTMLElement | null) ?? null);
  }, []);

  const previewSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (previewOp === undefined || submitDisabled || faces.length === 0 || !distanceValid) {
      setDynamicPreview(undefined);
      return;
    }
    const seq = ++previewSeqRef.current;
    const timer = window.setTimeout(() => {
      const op: FeatureOp = editMode
        ? { kind: 'updateParams', featureId: featureId!, params: buildParams() }
        : {
          kind: 'insertFeature',
          featureType: 'moveFace',
          params: buildParams(),
          ...(ownerBodyKey !== undefined ? { targetBodyId: ownerBodyKey } : {}),
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
    }, 150);
    return () => {
      window.clearTimeout(timer);
      if (previewSeqRef.current === seq) previewSeqRef.current += 1;
    };
  }, [previewOp, submitDisabled, faces.length, distanceValid, editMode, featureId, buildParams, ownerBodyKey]);

  const confirm = React.useCallback(async (): Promise<void> => {
    if (submitDisabled || applyOp === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const op: FeatureOp = editMode
        ? { kind: 'updateParams', featureId: featureId!, params: buildParams() }
        : {
          kind: 'insertFeature',
          featureType: 'moveFace',
          params: buildParams(),
          ...(ownerBodyKey !== undefined ? { targetBodyId: ownerBodyKey } : {}),
        };
      const result = await applyOp(op);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t('partStudio.moveFaceDialog.submitSuccess', { name: featureName }),
        ),
      );
      onConfirm?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [submitDisabled, applyOp, editMode, featureId, buildParams, ownerBodyKey, t, featureName, onConfirm]);

  // 2026-11-13：画布右键菜单前置「确认 / 取消」→ 与本对话框 ✓/✗ 同源命令。
  useDialogCommandHandler({ onConfirm: () => void confirm(), onCancel: () => onCancel?.() });

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={false}
      aria-label={featureName}
      data-testid="part-studio-move-face-dialog"
      data-feature="moveFace"
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
            data-testid="part-studio-move-face-confirm"
          >✓</button>
          <button
            type="button"
            className="part-studio-feature-dialog__cancel"
            aria-label={t('partStudio.featureDialog.cancel')}
            onClick={() => onCancel?.()}
            data-testid="part-studio-move-face-cancel"
          >✗</button>
        </div>
      </header>
      <div className="part-studio-feature-dialog__body">
        {error !== undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-move-face-error">
            {error}
          </p>
        )}
        <section className="part-studio-feature-dialog__entities" data-testid="part-studio-move-face-faces">
          <div className="part-studio-feature-dialog__entities-header">
            <span className="part-studio-feature-dialog__entities-label">
              {t('partStudio.moveFaceDialog.facesLabel')}
            </span>
          </div>
          <div className="part-studio-feature-dialog__profile-field">
            {faces.length > 0
              ? faces.map((face) => (
                <span key={face.key} className="part-studio-feature-dialog__profile-chip">{face.label}</span>
              ))
              : <span className="part-studio-feature-dialog__profile-empty">
                {t('partStudio.moveFaceDialog.facesEmpty')}
              </span>}
          </div>
        </section>

        {crossBody && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-move-face-cross-body">
            {t('partStudio.moveFaceDialog.crossBody')}
          </p>
        )}
        {missingOwner && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-move-face-owner-missing">
            {t('partStudio.moveFaceDialog.ownerMissing')}
          </p>
        )}
        {perFaceReadOnly && (
          <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-move-face-per-face-readonly">
            {t('partStudio.moveFaceDialog.perFaceReadOnly')}
          </p>
        )}
        {(ownerBodyKey !== undefined || editMode) && (
          <section className="part-studio-feature-dialog__distance">
            <span className="part-studio-feature-dialog__distance-label">
              {t('partStudio.moveFaceDialog.targetBody')}
            </span>
            <span className="part-studio-feature-dialog__static-value">
              {ownerLabel ?? t('partStudio.moveFaceDialog.editTarget')}
            </span>
          </section>
        )}

        <section className="part-studio-feature-dialog__distance">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.moveFaceDialog.moveType')}
          </span>
          <span className="part-studio-feature-dialog__static-value">
            {t('partStudio.moveFaceDialog.moveTypeOffset')}
          </span>
        </section>

        <section className="part-studio-feature-dialog__distance">
          <span className="part-studio-feature-dialog__distance-label">
            {t('partStudio.moveFaceDialog.termination')}
          </span>
          <span className="part-studio-feature-dialog__static-value">
            {t('partStudio.moveFaceDialog.givenDepth')}
          </span>
        </section>

        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="move-face-distance" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.moveFaceDialog.distance')}
          </label>
          <input
            id="move-face-distance"
            data-testid="part-studio-move-face-distance"
            className="part-studio-feature-dialog__input"
            inputMode="decimal"
            value={distance}
            disabled={!canEdit || busy || perFaceReadOnly}
            onChange={(event) => setDistance(event.target.value)}
          />
          <span className="part-studio-feature-dialog__static-value">mm</span>
        </section>

        <section className="part-studio-feature-dialog__end-bound">
          <select
            id="move-face-direction"
            data-testid="part-studio-move-face-direction"
            className="part-studio-feature-dialog__select"
            value={direction}
            disabled={!canEdit || busy || perFaceReadOnly}
            aria-label={t('partStudio.moveFaceDialog.direction')}
            onChange={(event) => setDirection(event.target.value as MoveDirection)}
          >
            <option value="outward">{t('partStudio.moveFaceDialog.outward')}</option>
            <option value="inward">{t('partStudio.moveFaceDialog.inward')}</option>
          </select>
        </section>

        <p role="note" className="part-studio-feature-dialog__hint">
          {t('partStudio.moveFaceDialog.distanceHint')}
        </p>

        <section className="part-studio-feature-dialog__distance">
          <label className="part-studio-feature-dialog__distance-label">
            <input type="checkbox" disabled aria-label={t('partStudio.moveFaceDialog.reFillet')} />{' '}
            {t('partStudio.moveFaceDialog.reFillet')}
          </label>
        </section>
        <p role="note" className="part-studio-feature-dialog__hint" data-testid="part-studio-move-face-refillet-hint">
          {t('partStudio.moveFaceDialog.reFilletUnavailable')}
        </p>
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
          opacity={0.06}
          hideSource
          solid
        />,
        previewHost,
      )}
    </div>
  );
}
