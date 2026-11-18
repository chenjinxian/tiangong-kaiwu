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
 * 首切片：移除面 + 抽壳厚度 + 方向（内/外）。
 * - 面来自唯一选择权威 `store.canvas.selection`（打开对话框前选中；打开后实时跟随）。
 * - `ShellParams.faces` 命中面用 `distances:0`（内核 0=穿孔移除），其余面用
 *   `defaultDistance=抽壳厚度`；方向=距离符号（负=内缩，正=外扩）。
 * - 2026-11-15 live 对齐（dialog-audit group-c §2）：首行 disabled「挖空」（零移除面
 *   shared 契约禁止，faces min 1）；「要移除的面」单字段两态 + 逐面 × 本地过滤
 *   （不改契约）；抽壳厚度行右对齐 mm + 禁用计算器 + 方向箭头；目标实体行改 title。
 * - 载荷/默认值/校验/预览语义不变。
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
  FeaturePreviewGeometryDto,
  LubanTopologyId,
  PreviewResult,
  VariableDto,
} from '@luban-cad/shared';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import type { CanvasSelection } from '../types.js';
import { FeaturePreviewOverlay } from '../canvas/FeaturePreviewOverlay.js';
import { useDialogCommandHandler } from '../internal/dialog-commands.js';
import {
  formatExpressionFieldValue,
  readStoredExpression,
} from '../internal/feature-expression-field.js';
import type { VariableCreateRequest } from '../internal/variables.js';
import {
  ExpressionNumberField,
  useExpressionField,
} from '../components/ExpressionNumberField.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

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
  /** ADR-0020 S4c：Part Studio 变量表（Session 单点持有，PartStudioCanvas 透传）。 */
  variables?: readonly VariableDto[];
  variablesLoading?: boolean;
  variablesError?: string;
  variablesReady?: boolean;
  onCreateVariable?: (request: VariableCreateRequest) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

type ShellDirection = 'inward' | 'outward';
/** 表达式在场时的派生方向：求值符号即方向（0=穿孔，独立显示，不伪造成向内）。 */
type ShellDerivedDirection = ShellDirection | 'through';

interface SelectedFace {
  key: string;
  topologyId: LubanTopologyId;
  ownerBodyKey: string;
  label: string;
}

interface StoredShellParams {
  defaultDistance?: number;
  defaultDistanceExpression?: string;
  faces?: LubanTopologyId[];
  distances?: number | number[];
}

function readStored(value: unknown): StoredShellParams {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  return {
    defaultDistance: typeof p.defaultDistance === 'number' ? p.defaultDistance : undefined,
    defaultDistanceExpression: readStoredExpression(value, 'defaultDistanceExpression'),
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
  variables,
  variablesLoading = false,
  variablesError,
  variablesReady = true,
  onCreateVariable,
  onConfirm,
  onCancel,
}: ShellDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selection } = useCanvasSelection();
  const variablesDialogActive = usePartStudioStore((s) => s.variablesDialog.active);
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
  const allFaces = React.useMemo(() => {
    if (editMode) return storedFaces;
    const deduped = new Map<string, SelectedFace>();
    for (const face of [...snapshotFaces, ...liveFaces]) deduped.set(face.key, face);
    return Array.from(deduped.values());
  }, [editMode, storedFaces, snapshotFaces, liveFaces]);
  // live 对齐：面 chip 的 × 仅本地过滤提交集合（不改 shared 契约）。
  const [removedFaceKeys, setRemovedFaceKeys] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const faces = React.useMemo(
    () => allFaces.filter((face) => !removedFaceKeys.has(face.key)),
    [allFaces, removedFaceKeys],
  );
  const removeFace = React.useCallback((key: string): void => {
    setRemovedFaceKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const initialThickness = Math.abs(stored.defaultDistance ?? 2) || 2;
  const [thickness, setThickness] = React.useState(() => numberText(initialThickness) || '2');
  const [direction, setDirection] = React.useState<ShellDirection>(
    () => (stored.defaultDistance ?? -1) < 0 ? 'inward' : 'outward',
  );
  // ADR-0020 S4c：抽壳厚度表达式 = **有符号距离**（负=内缩、0=穿孔）。表达式
  // 在场时方向下拉派生只读（求值符号即方向）；改方向须先清除表达式。
  const thicknessExpression = useExpressionField(stored.defaultDistanceExpression);
  const thicknessExpressionActive = thicknessExpression.expression !== undefined;
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
  // 目标实体可见行已按 live 删除；owner 名仍经字段 title 可查（诚实错误 alert 保留）。
  const facesFieldTitle = ownerBodyKey !== undefined
    ? `${t('partStudio.shellDialog.targetBody')}: ${ownerLabel ?? ownerBodyKey}`
    : editMode
      ? `${t('partStudio.shellDialog.targetBody')}: ${t('partStudio.shellDialog.editTarget')}`
      : undefined;

  const parsedThickness = Number(thickness);
  const thicknessValid = thicknessExpressionActive
    ? thicknessExpression.evaluation?.ok === true
    : (thickness.trim() !== '' && Number.isFinite(parsedThickness) && parsedThickness > 0);
  // 求值符号即方向（0=穿孔，独立显示，绝不把“内缩”UI 提交成外扩距离）。
  const expressionSignedDistance = thicknessExpression.evaluation?.ok
    ? thicknessExpression.evaluation.value
    : undefined;
  const derivedDirection: ShellDerivedDirection | undefined = expressionSignedDistance === undefined
    ? undefined
    : expressionSignedDistance < 0 ? 'inward' : expressionSignedDistance > 0 ? 'outward' : 'through';
  // P3（review）：无效表达式不得显示 `through`/「穿孔」假方向；保留最近一次
  // 有效派生方向（若有），否则数据态 `unknown` + 中性「方向」标签。
  const lastValidDerivedDirectionRef = React.useRef<ShellDerivedDirection | undefined>(undefined);
  React.useEffect(() => {
    if (derivedDirection !== undefined)
      lastValidDerivedDirectionRef.current = derivedDirection;
  }, [derivedDirection]);
  const expressionDirection = derivedDirection ?? lastValidDerivedDirectionRef.current;
  const expressionDirectionInvalid = thicknessExpressionActive
    && thicknessExpression.evaluation !== undefined
    && !thicknessExpression.evaluation.ok;
  const crossBody = !editMode && ownerKeys.length > 1;
  const missingOwner = !editMode && faces.length > 0 && ownerKeys.length === 0;
  const submitDisabled = !canEdit || busy || applyOp === undefined || faces.length === 0
    || !thicknessValid || thicknessExpression.invalid || crossBody || missingOwner;

  const signedDistance = thicknessExpressionActive
    ? (expressionSignedDistance ?? Number.NaN)
    : direction === 'inward' ? -parsedThickness : parsedThickness;
  const expressionSource = thicknessExpressionActive && thicknessExpression.evaluation?.ok
    ? thicknessExpression.evaluation.expression
    : undefined;
  const buildParams = React.useCallback((): FeatureParams => {
    if (editMode) {
      const base = (typeof initialParams === 'object' && initialParams !== null)
        ? initialParams as Record<string, unknown>
        : {};
      const params = {
        ...base,
        defaultDistance: signedDistance,
        distances: 0,
        faces: faces.map((face) => face.topologyId),
      } as unknown as Record<string, unknown>;
      // 表达式设计意图：未触碰保留；纯数值/清除即删除旧键（不得静默残留）。
      if (expressionSource !== undefined) params.defaultDistanceExpression = expressionSource;
      else delete params.defaultDistanceExpression;
      return params as unknown as FeatureParams;
    }
    return {
      defaultDistance: signedDistance,
      ...(expressionSource !== undefined ? { defaultDistanceExpression: expressionSource } : {}),
      faces: faces.map((face) => face.topologyId),
      distances: 0,
    } as unknown as FeatureParams;
  }, [editMode, initialParams, signedDistance, faces, expressionSource]);

  /** 清除表达式 → 回数值态（方向恢复可交互；数值取 |求值|、方向取求值符号）。 */
  const clearThicknessExpression = React.useCallback((): void => {
    const value = expressionSignedDistance;
    thicknessExpression.setExpression(undefined);
    if (value !== undefined) {
      setThickness(formatExpressionFieldValue('signedLength', Math.abs(value)));
      setDirection(value < 0 ? 'inward' : 'outward');
    }
  }, [expressionSignedDistance, thicknessExpression]);

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
  useDialogCommandHandler({ onConfirm: () => void confirm(), onCancel: () => onCancel?.(), confirmLabel: featureName });

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
        <DialogHeaderButtons disabled={submitDisabled} onConfirm={() => void confirm()} onCancel={() => onCancel?.()} confirmTestId="part-studio-shell-confirm" cancelTestId="part-studio-shell-cancel" />
      </header>
      <div className="part-studio-feature-dialog__body">
        {error !== undefined && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-shell-error">
            {error}
          </p>
        )}
        {/* live 首行：挖空（未勾选）。零移除面通道 shared 契约未支持（faces min 1）
            → 诚实禁用 + title，不伪造可点。 */}
        <label className="part-studio-feature-dialog__checkbox part-studio-shell-dialog__hollow">
          <input
            type="checkbox"
            data-testid="part-studio-shell-hollow"
            disabled
            title={t('partStudio.featureDialog.notImplemented')}
          />
          <span>{t('partStudio.shellDialog.hollow')}</span>
        </label>

        <section className="part-studio-feature-dialog__entities" data-testid="part-studio-shell-faces">
          <div
            className={`part-studio-feature-dialog__profile-field part-studio-shell-dialog__faces-field${faces.length === 0 ? ' is-empty' : ' is-selected'}`}
            data-testid="part-studio-shell-faces-field"
            title={facesFieldTitle}
          >
            <span className="part-studio-feature-dialog__query-label">
              {t('partStudio.shellDialog.facesLabel')}
            </span>
            {faces.length > 0
              ? (
                <span className="part-studio-feature-dialog__chips">
                  {faces.map((face) => (
                    <span key={face.key} className="part-studio-shell-dialog__face-chip">
                      <span className="part-studio-feature-dialog__profile-chip">{face.label}</span>
                      <button
                        type="button"
                        className="part-studio-shell-dialog__chip-remove"
                        data-testid="part-studio-shell-face-remove"
                        aria-label={`${t('partStudio.shellDialog.removeFace')}: ${face.label}`}
                        onClick={() => removeFace(face.key)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </span>
              )
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
        {/* live 数值行：抽壳厚度 + 右对齐 mm + 禁用计算器 + 方向箭头（替换旧
            方向下拉；defaultDistance 符号映射不变：向内=负）。 */}
        <section
          className={`part-studio-feature-dialog__distance part-studio-shell-dialog__thickness-row${thicknessExpressionActive ? ' part-studio-shell-dialog__thickness-row--expression' : ''}`}
        >
          <ExpressionNumberField
            id="shell-thickness"
            label={t('partStudio.shellDialog.thickness')}
            numberText={thickness}
            setNumberText={setThickness}
            expression={thicknessExpression.expression}
            setExpression={thicknessExpression.setExpression}
            kind="signedLength"
            unitLabel="mm"
            applicable
            disabled={!canEdit || busy}
            variables={variables}
            variablesLoading={variablesLoading}
            variablesError={variablesError}
            variablesReady={variablesReady}
            onCreateVariable={onCreateVariable}
            variablesDialogActive={variablesDialogActive}
            storedExpression={stored.defaultDistanceExpression}
            storedExpressionUntouchedValue={stored.defaultDistance}
            onValidity={thicknessExpression.onValidity}
            onEnter={() => void confirm()}
            inputTestId="part-studio-shell-thickness"
            expressionLabel={t('partStudio.shellDialog.thicknessExpressionLabel')}
          />
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
          {thicknessExpressionActive && (
            <button
              type="button"
              className="part-studio-shell-dialog__expression-clear"
              data-testid="part-studio-shell-expression-clear"
              aria-label={t('partStudio.featureDialog.expressionClear')}
              title={t('partStudio.featureDialog.expressionClear')}
              disabled={!canEdit || busy}
              onClick={clearThicknessExpression}
            >
              ×
            </button>
          )}
          <button
            type="button"
            id="shell-direction"
            data-testid="part-studio-shell-direction"
            className="part-studio-shell-dialog__direction"
            data-direction={thicknessExpressionActive ? (expressionDirection ?? 'unknown') : direction}
            data-expression-derived={thicknessExpressionActive ? 'true' : 'false'}
            data-expression-invalid={expressionDirectionInvalid ? 'true' : 'false'}
            aria-label={thicknessExpressionActive
              ? (expressionDirection === undefined || expressionDirectionInvalid
                ? t('partStudio.shellDialog.direction')
                : expressionDirection === 'through'
                  ? t('partStudio.shellDialog.through')
                  : expressionDirection === 'inward'
                    ? t('partStudio.shellDialog.inward')
                    : t('partStudio.shellDialog.outward'))
              : direction === 'inward'
                ? t('partStudio.shellDialog.inward')
                : t('partStudio.shellDialog.outward')}
            aria-pressed={thicknessExpressionActive
              ? expressionDirection === 'outward'
              : direction === 'outward'}
            title={thicknessExpressionActive
              ? t('partStudio.featureDialog.expressionClear')
              : direction === 'inward'
                ? t('partStudio.shellDialog.inward')
                : t('partStudio.shellDialog.outward')}
            disabled={!canEdit || busy || thicknessExpressionActive}
            onClick={() => setDirection((prev) => (prev === 'inward' ? 'outward' : 'inward'))}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M2.5 8h10M9.5 5l3 3-3 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </section>
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
