/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ShellDialog（T3 参数化抽壳；AIRR docs/superpowers/specs/2026-11-06-shell-ui-airr.md）。
 *
 * 证据：Onshape 官方帮助页 cad.onshape.com/help/Content/PartStudio/shell.htm
 *（私有仓 ui-evidence/shell-help-20261106；字段顺序 Faces to shell → Hollow →
 * thickness → direction → confirm）。
 *
 * 首切片：移除面 + 壁厚 + 方向（内/外）。
 * - 面来自唯一选择权威 `store.canvas.selection`（打开对话框前选中；打开后实时跟随）。
 * - `ShellParams.faces` 命中面用 `distances:0`（内核 0=穿孔移除），其余面用
 *   `defaultDistance=壁厚`；方向=距离符号（负=内缩，正=外扩）。
 * - Hollow（零移除面）当前 shared 契约禁止（faces min 1），不渲染假控件。
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

export interface ShellDialogProps {
  featureName: string;
  /** edit 模式：落库 feature id（提交 updateParams）。 */
  featureId?: string;
  /** edit 模式：既有 shell 参数（ShellParams 落库形态，mm）。 */
  initialParams?: unknown;
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  previewOp?: (op: FeatureOp) => Promise<PreviewResult>;
  connection?: BriefcaseConnection | null;
  viewport?: ScreenViewport | null;
  bodies?: readonly BodyInfo[];
  /** 打开对话框时的预选面快照（对话框打开会清空画布选择——路由时捕获）。 */
  initialFaces?: readonly CanvasSelection[];
  canEdit?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

type ShellDirection = 'inward' | 'outward';

interface SelectedFace {
  key: string;
  topologyId: LubanTopologyId;
  ownerBodyKey: string;
  label: string;
}

interface StoredShellParams {
  defaultDistance?: number;
  faces?: LubanTopologyId[];
  distances?: number | number[];
}

function readStored(value: unknown): StoredShellParams {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  return {
    defaultDistance: typeof p.defaultDistance === 'number' ? p.defaultDistance : undefined,
    faces: Array.isArray(p.faces)
      ? (p.faces as unknown[]).flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const face = entry as { nodeId?: unknown; entityId?: unknown };
        return typeof face.nodeId === 'number' && typeof face.entityId === 'number'
          ? [{ nodeId: face.nodeId, entityId: face.entityId }]
          : [];
      })
      : undefined,
    distances: typeof p.distances === 'number' || Array.isArray(p.distances)
      ? p.distances as number | number[]
      : undefined,
  };
}

function topologyKey(face: LubanTopologyId): string {
  return `${face.nodeId}:${face.entityId}`;
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : '';
}

export function ShellDialog({
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
}: ShellDialogProps): React.JSX.Element {
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
  // 预选面快照（路由时捕获；对话框打开后选择工具暂停并清空选择）+ 打开后
  // 仍存活的选择面（防御性合并，按 owner/topology 去重）。
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

  const initialThickness = Math.abs(stored.defaultDistance ?? 2) || 2;
  const [thickness, setThickness] = React.useState(() => numberText(initialThickness) || '2');
  const [direction, setDirection] = React.useState<ShellDirection>(
    () => (stored.defaultDistance ?? -1) < 0 ? 'inward' : 'outward',
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [dynamicPreview, setDynamicPreview] = React.useState<FeaturePreviewGeometryDto | undefined>(undefined);

  const activeBodies = bodies.filter((body) => body.active !== false && body.authored !== false);
  const ownerKeys = Array.from(new Set(faces.map((face) => face.ownerBodyKey).filter((key) => key !== '')));
  const ownerBodyKey = ownerKeys.length === 1 ? ownerKeys[0] : undefined;
  const ownerBody = ownerBodyKey === undefined ? undefined : activeBodies.find((body) => body.bodyKey === ownerBodyKey);
  const ownerLabel = ownerBody?.name && ownerBody.name.trim() !== ''
    ? ownerBody.name
    : ownerBodyKey;

  const parsedThickness = Number(thickness);
  const thicknessValid = thickness.trim() !== '' && Number.isFinite(parsedThickness) && parsedThickness > 0;
  const crossBody = !editMode && ownerKeys.length > 1;
  const missingOwner = !editMode && faces.length > 0 && ownerKeys.length === 0;
  const submitDisabled = !canEdit || busy || applyOp === undefined || faces.length === 0
    || !thicknessValid || crossBody || missingOwner;

  const signedDistance = direction === 'inward' ? -parsedThickness : parsedThickness;
  const buildParams = React.useCallback((): FeatureParams => {
    if (editMode) {
      const base = (typeof initialParams === 'object' && initialParams !== null)
        ? initialParams as Record<string, unknown>
        : {};
      return {
        ...base,
        defaultDistance: signedDistance,
        distances: 0,
        faces: faces.map((face) => face.topologyId),
      } as unknown as FeatureParams;
    }
    return {
      defaultDistance: signedDistance,
      faces: faces.map((face) => face.topologyId),
      distances: 0,
    } as unknown as FeatureParams;
  }, [editMode, initialParams, signedDistance, faces]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [previewHost, setPreviewHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setPreviewHost((rootRef.current?.closest('.part-studio-canvas') as HTMLElement | null) ?? null);
  }, []);

  // 后端影子求值预览（150ms debounce + 序列号；失败静默不出预览，不阻塞提交）。
  const previewSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (previewOp === undefined || submitDisabled || faces.length === 0 || !thicknessValid) {
      setDynamicPreview(undefined);
      return;
    }
    const seq = ++previewSeqRef.current;
    const timer = window.setTimeout(() => {
      const op: FeatureOp = editMode
        ? { kind: 'updateParams', featureId: featureId!, params: buildParams() }
        : {
          kind: 'insertFeature',
          featureType: 'shell',
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
  }, [previewOp, submitDisabled, faces.length, thicknessValid, editMode, featureId, buildParams, ownerBodyKey]);

  const confirm = React.useCallback(async (): Promise<void> => {
    if (submitDisabled || applyOp === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const op: FeatureOp = editMode
        ? { kind: 'updateParams', featureId: featureId!, params: buildParams() }
        : {
          kind: 'insertFeature',
          featureType: 'shell',
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
          t('partStudio.shellDialog.submitSuccess', { name: featureName }),
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
      data-testid="part-studio-shell-dialog"
      data-feature="shell"
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
            data-testid="part-studio-shell-confirm"
          >✓</button>
          <button
            type="button"
            className="part-studio-feature-dialog__cancel"
            aria-label={t('partStudio.featureDialog.cancel')}
            onClick={() => onCancel?.()}
            data-testid="part-studio-shell-cancel"
          >✗</button>
        </div>
      </header>
      <div className="part-studio-feature-dialog__body">
        {error !== undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-shell-error">
            {error}
          </p>
        )}
        <section className="part-studio-feature-dialog__entities" data-testid="part-studio-shell-faces">
          <div className="part-studio-feature-dialog__entities-header">
            <span className="part-studio-feature-dialog__entities-label">
              {t('partStudio.shellDialog.facesLabel')}
            </span>
          </div>
          <div className="part-studio-feature-dialog__profile-field">
            {faces.length > 0
              ? faces.map((face) => (
                <span key={face.key} className="part-studio-feature-dialog__profile-chip">{face.label}</span>
              ))
              : <span className="part-studio-feature-dialog__profile-empty">
                {t('partStudio.shellDialog.facesEmpty')}
              </span>}
          </div>
        </section>

        {crossBody && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-shell-cross-body">
            {t('partStudio.shellDialog.crossBody')}
          </p>
        )}
        {missingOwner && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-shell-owner-missing">
            {t('partStudio.shellDialog.ownerMissing')}
          </p>
        )}
        {(ownerBodyKey !== undefined || editMode) && (
          <section className="part-studio-feature-dialog__distance">
            <span className="part-studio-feature-dialog__distance-label">
              {t('partStudio.shellDialog.targetBody')}
            </span>
            <span className="part-studio-feature-dialog__static-value">
              {ownerLabel ?? t('partStudio.shellDialog.editTarget')}
            </span>
          </section>
        )}

        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="shell-thickness" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.shellDialog.thickness')}
          </label>
          <input
            id="shell-thickness"
            data-testid="part-studio-shell-thickness"
            className="part-studio-feature-dialog__input"
            inputMode="decimal"
            value={thickness}
            disabled={!canEdit || busy}
            onChange={(event) => setThickness(event.target.value)}
          />
          <span className="part-studio-feature-dialog__static-value">mm</span>
        </section>

        <section className="part-studio-feature-dialog__end-bound">
          <select
            id="shell-direction"
            data-testid="part-studio-shell-direction"
            className="part-studio-feature-dialog__select"
            value={direction}
            disabled={!canEdit || busy}
            aria-label={t('partStudio.shellDialog.direction')}
            onChange={(event) => setDirection(event.target.value as ShellDirection)}
          >
            <option value="inward">{t('partStudio.shellDialog.inward')}</option>
            <option value="outward">{t('partStudio.shellDialog.outward')}</option>
          </select>
        </section>

        <p role="note" className="part-studio-feature-dialog__hint">
          {t('partStudio.shellDialog.hollowUnavailable')}
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
