/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * HoleDialog（ADR-0006 切片 A/A2 UI）——按 2026-11-05 live Onshape 证据
 * （私有数据仓 ui-evidence/quickstart-copy-hole-dialog-20261105）实现：
 *  单位页签（公制/Inch）、孔类型页签（简单/沉头孔/倒角孔——后两者暂未实现，
 *  禁用以防假成功）、要放置孔的草图点/曲线顶点、合并范围、孔类型/尺寸、起始平面、
 *  终止条件。
 * v1.27（切片 A2）：孔位同时接受草图 point 与曲线顶点（线端点/弧端点/圆心）。
 * v1.28（切片 A3）：沉头孔（counterbore）开放；倒角孔仍禁用。
 * 钻尖角固定 180°（平底），螺纹/倒角孔明确禁用；提交仍走 FeatureService 的 hole op。
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
import type { BodyInfo, FeatureOp, FeatureOpResult, HoleVertexRef, PreviewResult } from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import { useWorkspaceRef } from '../../../common/workspace/use-workspace-ref.js';
import { FeaturePreviewOverlay } from '../canvas/FeaturePreviewOverlay.js';

const INCH_MM = 25.4;

export type HoleUnit = 'mm' | 'in';
export type HoleEndBound = 'blind' | 'throughAll' | 'upToNext';
export type HoleStyle = 'simple' | 'counterbore' | 'countersink';

interface HoleLocationOption {
  key: string;
  label: string;
  pointId?: number;
  vertex?: HoleVertexRef;
}

export interface HoleDialogSketchOption {
  id: string;
  label: string;
}

export interface HoleDialogProps {
  featureName: string;
  /** edit 模式：已落库 feature id（提交走 updateParams，否则 insertFeature）。 */
  featureId?: string;
  /** edit 模式：既有 hole 参数回显（HoleParams 落库形态，mm 数值）。 */
  initialParams?: unknown;
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /** 改参/插入预览（后端影子求值几何 → TileRpc 动态图形；失败静默无预览）。 */
  previewOp?: (op: FeatureOp) => Promise<PreviewResult>;
  connection?: BriefcaseConnection | null;
  viewport?: ScreenViewport | null;
  connectionKey?: string;
  sketches?: readonly HoleDialogSketchOption[];
  bodies?: readonly BodyInfo[];
  canEdit?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function readInitialParams(value: unknown): {
  sketchId?: string; pointIds?: number[]; vertexRefs?: HoleVertexRef[]; diameterMm?: number;
  holeStyle?: HoleStyle; counterboreDiameterMm?: number; counterboreDepthMm?: number;
  countersinkDiameterMm?: number; countersinkAngleDeg?: number;
  endBound?: HoleEndBound; depthMm?: number; tipAngleDeg?: number;
  direction?: 'forward' | 'backward';
} {
  if (typeof value !== 'object' || value === null) return {};
  const p = value as Record<string, unknown>;
  return {
    sketchId: typeof p.sketchId === 'string' ? p.sketchId : undefined,
    pointIds: Array.isArray(p.pointIds) && p.pointIds.every((x) => typeof x === 'number')
      ? p.pointIds as number[] : undefined,
    vertexRefs: Array.isArray(p.vertexRefs)
      ? (p.vertexRefs as HoleVertexRef[]).filter((r) =>
        typeof r === 'object' && r !== null && typeof r.entityId === 'number'
        && (r.part === 'start' || r.part === 'end' || r.part === 'center'))
      : undefined,
    diameterMm: typeof p.diameterMm === 'number' ? p.diameterMm : undefined,
    holeStyle: p.holeStyle === 'counterbore'
      ? 'counterbore'
      : p.holeStyle === 'countersink' ? 'countersink' : p.holeStyle === 'simple' ? 'simple' : undefined,
    counterboreDiameterMm: typeof p.counterboreDiameterMm === 'number' ? p.counterboreDiameterMm : undefined,
    counterboreDepthMm: typeof p.counterboreDepthMm === 'number' ? p.counterboreDepthMm : undefined,
    countersinkDiameterMm: typeof p.countersinkDiameterMm === 'number' ? p.countersinkDiameterMm : undefined,
    countersinkAngleDeg: typeof p.countersinkAngleDeg === 'number' ? p.countersinkAngleDeg : undefined,
    endBound: p.endBound === 'blind' || p.endBound === 'throughAll' || p.endBound === 'upToNext'
      ? p.endBound : undefined,
    depthMm: typeof p.depthMm === 'number' ? p.depthMm : undefined,
    tipAngleDeg: typeof p.tipAngleDeg === 'number' ? p.tipAngleDeg : undefined,
    direction: p.direction === 'backward' ? 'backward' : p.direction === 'forward' ? 'forward' : undefined,
  };
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : '';
}

export function HoleDialog({
  featureName, featureId, initialParams, applyOp, previewOp, connection, viewport,
  connectionKey, sketches = [], bodies = [], canEdit = true, onConfirm, onCancel,
}: HoleDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const partStudioId = useWorkspaceRef()?.modelId;
  const initial = React.useMemo(() => readInitialParams(initialParams), [initialParams]);
  const [sketchId, setSketchId] = React.useState<string>(() => initial.sketchId ?? sketches[0]?.id ?? '');
  const [options, setOptions] = React.useState<HoleLocationOption[] | undefined>(undefined);
  const [pointsError, setPointsError] = React.useState<string | undefined>(undefined);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [unit, setUnit] = React.useState<HoleUnit>('mm');
  const [diameter, setDiameter] = React.useState(() => numberText(initial.diameterMm ?? 5) || '5');
  const [holeStyle, setHoleStyle] = React.useState<HoleStyle>(() => initial.holeStyle ?? 'simple');
  const [counterboreDiameter, setCounterboreDiameter] = React.useState(
    () => numberText(initial.counterboreDiameterMm ?? (initial.diameterMm ?? 5) * 2) || '10',
  );
  const [counterboreDepth, setCounterboreDepth] = React.useState(
    () => numberText(initial.counterboreDepthMm ?? initial.diameterMm ?? 5) || '5',
  );
  const [countersinkDiameter, setCountersinkDiameter] = React.useState(
    () => numberText(initial.countersinkDiameterMm ?? (initial.diameterMm ?? 5) * 2) || '10',
  );
  // v1.50：新建默认 118°（Onshape live 证据）；编辑旧库缺省按平底 180 回显，避免
  // 老特征改参时静默改几何。
  const [tipAngleDeg, setTipAngleDeg] = React.useState<number>(
    () => initial.tipAngleDeg ?? (featureId !== undefined ? 180 : 118),
  );
  const [countersinkAngle, setCountersinkAngle] = React.useState(
    () => numberText(initial.countersinkAngleDeg ?? 90) || '90',
  );
  const [endBound, setEndBound] = React.useState<HoleEndBound>(() => initial.endBound ?? 'blind');
  // 反向（Onshape oppositeDirection；live 证据 dialog.html 的「反向」控件）：
  // 缺省正向；落库 backward 回显，正向不发键（旧载荷兼容）。
  const [direction, setDirection] = React.useState<'forward' | 'backward'>(
    () => initial.direction === 'backward' ? 'backward' : 'forward',
  );
  const [depth, setDepth] = React.useState(() => numberText(initial.depthMm ?? 10) || '10');
  const [targetBodyId, setTargetBodyId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const epochRef = React.useRef(0);
  const initialSelectionPending = React.useRef(
    featureId !== undefined && (initial.pointIds !== undefined || initial.vertexRefs !== undefined),
  );

  React.useEffect(() => {
    if (!sketchId || !connectionKey) {
      setOptions(undefined);
      setPointsError(undefined);
      setSelected(new Set());
      return;
    }
    const epoch = ++epochRef.current;
    setPointsError(undefined);
    const scopeArgs: [] | [string] = partStudioId === undefined ? [] : [partStudioId];
    LubanFeatureRpcInterface.getClient()
      .getSketch(connectionKey, sketchId, ...scopeArgs)
      .then((sketch) => {
        if (epochRef.current !== epoch) return;
        // Onshape「要放置孔的点」= 草图 point + 曲线顶点（线/弧端点、圆/弧中心）。
        const next: HoleLocationOption[] = [];
        let pointIndex = 0;
        for (const e of sketch?.entities ?? []) {
          if (e.kind === 'point') {
            pointIndex += 1;
            next.push({
              key: `p:${e.id}`,
              label: t('partStudio.holeDialog.pointLabel', { index: pointIndex }),
              pointId: e.id,
            });
          } else if (e.kind === 'line') {
            const name = t('partStudio.holeDialog.lineName', { id: e.id });
            next.push({ key: `${e.id}:start`, label: t('partStudio.holeDialog.vertexStart', { name }), vertex: { entityId: e.id, part: 'start' } });
            next.push({ key: `${e.id}:end`, label: t('partStudio.holeDialog.vertexEnd', { name }), vertex: { entityId: e.id, part: 'end' } });
          } else if (e.kind === 'arc') {
            const name = t('partStudio.holeDialog.arcName', { id: e.id });
            next.push({ key: `${e.id}:start`, label: t('partStudio.holeDialog.vertexStart', { name }), vertex: { entityId: e.id, part: 'start' } });
            next.push({ key: `${e.id}:end`, label: t('partStudio.holeDialog.vertexEnd', { name }), vertex: { entityId: e.id, part: 'end' } });
            next.push({ key: `${e.id}:center`, label: t('partStudio.holeDialog.vertexCenter', { name }), vertex: { entityId: e.id, part: 'center' } });
          } else if (e.kind === 'circle') {
            const name = t('partStudio.holeDialog.circleName', { id: e.id });
            next.push({ key: `${e.id}:center`, label: t('partStudio.holeDialog.vertexCenter', { name }), vertex: { entityId: e.id, part: 'center' } });
          } else {
            const name = t('partStudio.holeDialog.splineName', { id: e.id });
            next.push({ key: `${e.id}:start`, label: t('partStudio.holeDialog.vertexStart', { name }), vertex: { entityId: e.id, part: 'start' } });
            next.push({ key: `${e.id}:end`, label: t('partStudio.holeDialog.vertexEnd', { name }), vertex: { entityId: e.id, part: 'end' } });
          }
        }
        setOptions(next);
        // Onshape 不预选孔位；edit 模式仅回显落库的 pointIds/vertexRefs（一次）。
        if (initialSelectionPending.current) {
          const available = new Set(next.map((x) => x.key));
          const keys = [
            ...(initial.pointIds ?? []).map((id) => `p:${id}`),
            ...(initial.vertexRefs ?? []).map((r) => `${r.entityId}:${r.part}`),
          ];
          setSelected(new Set(keys.filter((key) => available.has(key))));
          initialSelectionPending.current = false;
        } else {
          setSelected(new Set());
        }
        if (next.length === 0) setPointsError(t('partStudio.holeDialog.noPoints'));
      })
      .catch((e: unknown) => {
        if (epochRef.current !== epoch) return;
        setOptions(undefined);
        setSelected(new Set());
        setPointsError(e instanceof Error ? e.message : String(e));
      });
  }, [sketchId, connectionKey, partStudioId, t]);

  // 单位切换保持物理尺寸（显示值按当前单位换算）。
  const switchUnit = (next: HoleUnit): void => {
    if (next === unit) return;
    const mm = unit === 'mm' ? Number(diameter) : Number(diameter) * INCH_MM;
    const mmDepth = unit === 'mm' ? Number(depth) : Number(depth) * INCH_MM;
    const mmCbore = unit === 'mm' ? Number(counterboreDiameter) : Number(counterboreDiameter) * INCH_MM;
    const mmCboreDepth = unit === 'mm' ? Number(counterboreDepth) : Number(counterboreDepth) * INCH_MM;
    const mmCsink = unit === 'mm' ? Number(countersinkDiameter) : Number(countersinkDiameter) * INCH_MM;
    setUnit(next);
    setDiameter(numberText(next === 'mm' ? mm : mm / INCH_MM));
    setDepth(numberText(next === 'mm' ? mmDepth : mmDepth / INCH_MM));
    setCounterboreDiameter(numberText(next === 'mm' ? mmCbore : mmCbore / INCH_MM));
    setCounterboreDepth(numberText(next === 'mm' ? mmCboreDepth : mmCboreDepth / INCH_MM));
    setCountersinkDiameter(numberText(next === 'mm' ? mmCsink : mmCsink / INCH_MM));
  };

  const diameterMm = unit === 'mm' ? Number(diameter) : Number(diameter) * INCH_MM;
  const depthMm = unit === 'mm' ? Number(depth) : Number(depth) * INCH_MM;
  const counterboreDiameterMm = unit === 'mm' ? Number(counterboreDiameter) : Number(counterboreDiameter) * INCH_MM;
  const counterboreDepthMm = unit === 'mm' ? Number(counterboreDepth) : Number(counterboreDepth) * INCH_MM;
  const countersinkDiameterMm = unit === 'mm' ? Number(countersinkDiameter) : Number(countersinkDiameter) * INCH_MM;
  const countersinkAngleDeg = Number(countersinkAngle); // 角度恒为 deg，不随长度单位换算
  const counterboreValid = holeStyle !== 'counterbore'
    || (Number.isFinite(counterboreDiameterMm) && counterboreDiameterMm > diameterMm
      && Number.isFinite(counterboreDepthMm) && counterboreDepthMm > 0);
  const countersinkValid = holeStyle !== 'countersink'
    || (Number.isFinite(countersinkDiameterMm) && countersinkDiameterMm > diameterMm
      && Number.isFinite(countersinkAngleDeg) && countersinkAngleDeg > 0 && countersinkAngleDeg < 180);
  const submitDisabled = !canEdit || busy || !applyOp || !sketchId || selected.size === 0
    || !Number.isFinite(diameterMm) || diameterMm <= 0
    || (endBound === 'blind' && (!Number.isFinite(depthMm) || depthMm <= 0))
    || !counterboreValid || !countersinkValid;

  const buildParams = React.useCallback((): Record<string, unknown> => {
    const selectedOptions = (options ?? []).filter((o) => selected.has(o.key));
    const pointIds = selectedOptions.flatMap((o) => (o.pointId === undefined ? [] : [o.pointId]));
    const vertexRefs = selectedOptions.flatMap((o) => (o.vertex === undefined ? [] : [o.vertex]));
    return {
      sketchId,
      ...(pointIds.length > 0 ? { pointIds } : {}),
      ...(vertexRefs.length > 0 ? { vertexRefs } : {}),
      ...(holeStyle === 'counterbore'
        ? { holeStyle, counterboreDiameterMm, counterboreDepthMm }
        : holeStyle === 'countersink'
          ? { holeStyle, countersinkDiameterMm, countersinkAngleDeg }
          : {}),
      diameterMm,
      endBound,
      ...(endBound === 'blind' ? { depthMm } : {}),
      tipAngleDeg,
      ...(direction === 'backward' ? { direction } : {}),
    };
  }, [options, selected, sketchId, holeStyle, counterboreDiameterMm, counterboreDepthMm,
    countersinkDiameterMm, countersinkAngleDeg, diameterMm, endBound, depthMm, tipAngleDeg, direction]);

  // 预览宿主/动态几何（2026-11-08：后端 hole 影子求值 → TileRpc；失败静默无预览）。
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [previewHost, setPreviewHost] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setPreviewHost((rootRef.current?.closest('.part-studio-canvas') as HTMLElement | null) ?? null);
  }, []);
  const [dynamicPreview, setDynamicPreview] = React.useState<PreviewResult['preview']>(undefined);
  const [transparency, setTransparency] = React.useState(0);
  const previewSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (previewOp === undefined || submitDisabled) {
      setDynamicPreview(undefined);
      return;
    }
    const seq = ++previewSeqRef.current;
    const timer = window.setTimeout(() => {
      const params = buildParams();
      const op: FeatureOp = featureId !== undefined
        ? { kind: 'updateParams', featureId, params }
        : {
            kind: 'insertFeature',
            featureType: 'hole',
            ...(targetBodyId !== '' ? { targetBodyId } : {}),
            params,
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
  }, [previewOp, submitDisabled, buildParams, featureId, targetBodyId]);
  const previewOpacity = 0.42 - (Math.max(0, Math.min(100, transparency)) / 100) * 0.36;

  const confirm = async (): Promise<void> => {
    if (submitDisabled || !applyOp) return;
    setBusy(true);
    setError(undefined);
    try {
      const params = buildParams();
      const result = await applyOp(featureId !== undefined
        ? { kind: 'updateParams', featureId, params }
        : {
          kind: 'insertFeature',
          featureType: 'hole',
          ...(targetBodyId !== '' ? { targetBodyId } : {}),
          params,
        });
      if (!result.ok) {
        setError(result.error ?? t('partStudio.holeDialog.submitFailed'));
        return;
      }
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          t('partStudio.holeDialog.submitSuccess', { name: featureName }),
        ),
      );
      onConfirm?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const [locationsOpen, setLocationsOpen] = React.useState(false);
  const selectedLabels = (options ?? []).filter((o) => selected.has(o.key)).map((o) => o.label);
  const activeBodies = bodies.filter((b) => b.active && b.authored !== false);
  const tabClass = (active: boolean, disabled = false): string => [
    'part-studio-feature-dialog__tab',
    active ? 'part-studio-feature-dialog__tab--active' : '',
    disabled ? 'part-studio-feature-dialog__tab--disabled' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={false}
      aria-label={featureName}
      data-testid="part-studio-hole-dialog"
      data-feature="hole"
      className="part-studio-feature-dialog"
    >
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <div className="part-studio-feature-dialog__header-actions">
          <button type="button" className="part-studio-feature-dialog__confirm" aria-label={t('partStudio.featureDialog.confirm')}
            disabled={submitDisabled} onClick={() => void confirm()}>✓</button>
          <button type="button" className="part-studio-feature-dialog__cancel" aria-label={t('partStudio.featureDialog.cancel')}
            onClick={() => onCancel?.()}>✗</button>
        </div>
      </header>
      <div className="part-studio-feature-dialog__body">
        {error && <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-hole-dialog-error">{error}</p>}
        <div role="tablist" aria-label={t('partStudio.holeDialog.units')} className="part-studio-feature-dialog__tablist">
          <button type="button" role="tab" aria-selected={unit === 'in'} className={tabClass(unit === 'in')} onClick={() => switchUnit('in')}>
            {t('partStudio.holeDialog.inch')}
          </button>
          <button type="button" role="tab" aria-selected={unit === 'mm'} className={tabClass(unit === 'mm')} onClick={() => switchUnit('mm')}>
            {t('partStudio.holeDialog.metric')}
          </button>
        </div>
        <div role="tablist" aria-label={t('partStudio.holeDialog.types')} className="part-studio-feature-dialog__tablist">
          <button type="button" role="tab" aria-selected={holeStyle === 'simple'} className={tabClass(holeStyle === 'simple')}
            onClick={() => setHoleStyle('simple')}>{t('partStudio.holeDialog.simple')}</button>
          <button type="button" role="tab" aria-selected={holeStyle === 'counterbore'} className={tabClass(holeStyle === 'counterbore')}
            onClick={() => setHoleStyle('counterbore')}>{t('partStudio.holeDialog.counterbore')}</button>
          <button type="button" role="tab" aria-selected={holeStyle === 'countersink'} className={tabClass(holeStyle === 'countersink')}
            onClick={() => setHoleStyle('countersink')}>{t('partStudio.holeDialog.countersink')}</button>
        </div>

        <section className="part-studio-feature-dialog__entities" data-testid="hole-locations-field">
          <div className="part-studio-feature-dialog__entities-header">
            <span className="part-studio-feature-dialog__entities-label">{t('partStudio.holeDialog.locations')}</span>
            {sketches.length > 1 && (
              <select id="hole-sketch" data-testid="hole-sketch-select" className="part-studio-feature-dialog__select part-studio-hole-dialog__sketch"
                value={sketchId} onChange={(e) => setSketchId(e.target.value)}>
                {sketches.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            )}
            {sketches.length === 1 && (
              <select id="hole-sketch" data-testid="hole-sketch-select" aria-label={t('partStudio.holeDialog.locations')}
                className="part-studio-hole-dialog__hidden-select" tabIndex={-1} value={sketchId}
                onChange={(e) => setSketchId(e.target.value)}>
                {sketches.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            )}
          </div>
          <button
            type="button"
            className="part-studio-feature-dialog__profile-field"
            aria-expanded={locationsOpen}
            onClick={() => setLocationsOpen((v) => !v)}
            data-testid="hole-locations-toggle"
          >
            {selectedLabels.length > 0
              ? selectedLabels.map((label, index) => (
                <span key={`${label}-${index}`} className="part-studio-feature-dialog__profile-chip">{label}</span>
              ))
              : <span className="part-studio-feature-dialog__profile-empty">{t('partStudio.holeDialog.locations')}</span>}
          </button>
          {pointsError && <span className="part-studio-feature-dialog__hint">{pointsError}</span>}
          {locationsOpen && options && options.length > 0 && (
            <div data-testid="hole-points" className="part-studio-hole-dialog__locations-list">
              {options.map((o) => (
                <label key={o.key} className="part-studio-hole-dialog__location-row">
                  <input type="checkbox" checked={selected.has(o.key)} onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(o.key); else next.delete(o.key);
                      return next;
                    });
                  }} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__merge-scope">
          <label htmlFor="hole-target" className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.mergeScope')}</label>
          <select id="hole-target" className="part-studio-feature-dialog__select" value={targetBodyId} onChange={(e) => setTargetBodyId(e.target.value)}>
            <option value="">{t('partStudio.holeDialog.autoTarget')}</option>
            {activeBodies.map((b) => (
              <option key={b.bodyKey} value={b.bodyKey}>{b.name ?? b.bodyKey}</option>
            ))}
          </select>
        </section>

        <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__type">
          <span className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.holeTypeLabel')}</span>
          <select className="part-studio-feature-dialog__select" disabled value="drill" aria-label={t('partStudio.holeDialog.holeTypeLabel')}>
            <option value="drill">{t('partStudio.holeDialog.holeTypeDrill')}</option>
          </select>
        </section>
        <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__size">
          <span className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.holeSizeLabel')}</span>
          <select className="part-studio-feature-dialog__select" disabled value="custom" aria-label={t('partStudio.holeDialog.holeSizeLabel')}>
            <option value="custom">{t('partStudio.holeDialog.holeSizeCustom', { value: diameter })}</option>
          </select>
        </section>
        <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__value-row">
          <label htmlFor="hole-diameter" className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.diameter')}</label>
          <input id="hole-diameter" data-testid="hole-diameter" className="part-studio-feature-dialog__input" inputMode="decimal"
            value={diameter} onChange={(e) => setDiameter(e.target.value)} />
          <span className="part-studio-hole-dialog__unit">{unit === 'mm' ? 'mm' : 'in'}</span>
        </section>
        {holeStyle === 'counterbore' && (
          <>
            <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__value-row">
              <label htmlFor="hole-cbore-diameter" className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.counterboreDiameter')}</label>
              <input id="hole-cbore-diameter" data-testid="hole-cbore-diameter" className="part-studio-feature-dialog__input" inputMode="decimal"
                value={counterboreDiameter} onChange={(e) => setCounterboreDiameter(e.target.value)} />
              <span className="part-studio-hole-dialog__unit">{unit === 'mm' ? 'mm' : 'in'}</span>
            </section>
            <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__value-row">
              <label htmlFor="hole-cbore-depth" className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.counterboreDepth')}</label>
              <input id="hole-cbore-depth" data-testid="hole-cbore-depth" className="part-studio-feature-dialog__input" inputMode="decimal"
                value={counterboreDepth} onChange={(e) => setCounterboreDepth(e.target.value)} />
              <span className="part-studio-hole-dialog__unit">{unit === 'mm' ? 'mm' : 'in'}</span>
            </section>
          </>
        )}
        {holeStyle === 'countersink' && (
          <>
            <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__value-row">
              <label htmlFor="hole-csink-diameter" className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.countersinkDiameter')}</label>
              <input id="hole-csink-diameter" data-testid="hole-csink-diameter" className="part-studio-feature-dialog__input" inputMode="decimal"
                value={countersinkDiameter} onChange={(e) => setCountersinkDiameter(e.target.value)} />
              <span className="part-studio-hole-dialog__unit">{unit === 'mm' ? 'mm' : 'in'}</span>
            </section>
            <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__value-row">
              <label htmlFor="hole-csink-angle" className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.countersinkAngle')}</label>
              <input id="hole-csink-angle" data-testid="hole-csink-angle" className="part-studio-feature-dialog__input" inputMode="decimal"
                value={countersinkAngle} onChange={(e) => setCountersinkAngle(e.target.value)} />
              <span className="part-studio-hole-dialog__unit">deg</span>
            </section>
          </>
        )}
        <section className="part-studio-feature-dialog__distance">
          <span className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.startPlane')}</span>
          <span className="part-studio-feature-dialog__static-value">{t('partStudio.holeDialog.startFromPart')}</span>
        </section>
        <section className="part-studio-feature-dialog__end-bound">
          <select id="hole-end" data-testid="hole-end-bound" className="part-studio-feature-dialog__select" value={endBound}
            onChange={(e) => setEndBound(e.target.value as HoleEndBound)} aria-label={t('partStudio.holeDialog.endBound')}>
            <option value="blind">{t('partStudio.holeDialog.blind')}</option>
            <option value="upToNext">{t('partStudio.holeDialog.upToNext')}</option>
            <option value="throughAll">{t('partStudio.holeDialog.throughAll')}</option>
          </select>
        </section>
        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="hole-direction" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.featureDialog.direction')}
          </label>
          <select
            id="hole-direction"
            data-testid="hole-direction"
            className="part-studio-feature-dialog__select"
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'forward' | 'backward')}
          >
            <option value="forward">{t('partStudio.featureDialog.directionOptions.forward')}</option>
            <option value="backward">{t('partStudio.featureDialog.directionOptions.backward')}</option>
          </select>
        </section>
        {endBound === 'blind' && (
          <section className="part-studio-feature-dialog__distance part-studio-hole-dialog__value-row">
            <label htmlFor="hole-depth" className="part-studio-feature-dialog__distance-label">{t('partStudio.holeDialog.depth')}</label>
            <input id="hole-depth" data-testid="hole-depth" className="part-studio-feature-dialog__input" inputMode="decimal"
              value={depth} onChange={(e) => setDepth(e.target.value)} />
            <span className="part-studio-hole-dialog__unit">{unit === 'mm' ? 'mm' : 'in'}</span>
          </section>
        )}
        <section className="part-studio-feature-dialog__distance">
          <label htmlFor="hole-tip-angle" className="part-studio-feature-dialog__distance-label">
            {t('partStudio.holeDialog.tipAngle')}
          </label>
          <select
            id="hole-tip-angle"
            data-testid="hole-tip-angle"
            className="part-studio-feature-dialog__select"
            value={String(tipAngleDeg)}
            onChange={(e) => setTipAngleDeg(Number(e.target.value))}
          >
            <option value="118">{t('partStudio.holeDialog.tipDrill')}</option>
            <option value="180">{t('partStudio.holeDialog.tipFlat')}</option>
          </select>
        </section>
      </div>
      <footer className="part-studio-feature-dialog__footer">
        <div className="part-studio-feature-dialog__transparency">
          <input
            type="range"
            min={0}
            max={100}
            value={transparency}
            disabled={dynamicPreview === undefined}
            onChange={(event) => setTransparency(Number(event.target.value))}
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
          opacity={previewOpacity}
          hideSource
          solid
        />,
        previewHost,
      )}
    </div>
  );
}
