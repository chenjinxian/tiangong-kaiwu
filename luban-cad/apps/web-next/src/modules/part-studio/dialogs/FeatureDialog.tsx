/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureDialog（M3 Task 6；M4 Task 6 提交接线）：特征编辑非模态内联面板
 * （对齐 os-31）——
 * - 非模态：role=dialog + aria-modal=false + 无 backdrop 遮罩，画布区左上角
 *   内联定位（PartStudioCanvas 宿主）；对话框打开期间画布可持续拾取、
 *   视图可旋转缩放（os-31 采集对齐）；
 * - 顶置 ✓确认/✗取消（标题行首，绿✓/红✗）；
 * - 布尔作用域双页签：结果类型（实体|曲面|薄壁）× 布尔作用域（新建|加入|
 *   移除|相交），role=tablist + aria-selected；
 * - 芯片式实体选择框：初始实体（props 注入）渲染 chips + ×移除；快速拾取
 *   经 useCanvasSelection 把 store.canvas.selection 回流成 chips（按 id
 *   去重）——T5 选择驱动 hooks 的 T6 消费面（progress.md T5↔T6 一致）；
 * - 距离 + 折叠段：距离（M4-T6 新增——insertFeature extrude 的唯一可编辑
 *   量，默认 10）/方向（默认展开，正向/反向下拉）/起始偏移/对称（勾选）/
 *   拔模，aria-expanded 开合语义；
 * - 底部：回滚滑杆（range，默认=上限；🟠 诚实降级——后端 OpLog 仅线性链，
 *   UI 先行）+ 成品按钮（=✓ 确认出口）+ ? 帮助（展开文案）。
 *
 * 提交接线（M4-T6 拉伸闭环）：mode='new' 且 applyOp 在场时，✓/成品 →
 * `applyOp({ kind: 'insertFeature', featureType, params: { profile: [],
 * distance } })`（shared opDsl 语义「空 profile=拉伸基体」）；成功 → toast
 *（IModelApp.notifications 标准通道，与保存错误面同管道）+ onConfirm（宿主
 * closeDialog——组件不自销，受控口径）；失败 → 就地 Alert（六态 error），
 * 对话框不关闭；提交中禁重入（两出口禁用）。非法距离校验先行（不发起 op）。
 * applyOp 未接线（壳期/纯展示）时确认回退纯 onConfirm（M3 语义保持）；
 * mode='edit' 且 applyOp 在场（宿主已接提交面）时 ✓/成品 禁用 + 提示行
 *「该特征类型的参数编辑即将推出」（T6 评审 M-1：updateParams 归特征对话框
 * 增强 backlog，消除「假成功」观感）。租约警示（T6 评审 I-2）：leaseOk=false
 * 时可视警示「提交将等待租约」，不硬禁用（保留陈旧租约 35s 自愈路）。
 * viewOnly 门（T6 评审 I-1 防御纵深）：store.viewOnly 置位时确认不可达
 *（宿主已整体收口写面对话框，此门兜底竞态帧）。方向/对称/拔模随载荷回传
 * 但本版不进 op（shared ExtrudeParams 仅 profile/distance/sketchId——映射
 * 归特征对话框增强单裁，见 useFeatureSystem 头注延后项）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { SvgCheckmark, SvgClose } from '@itwin/itwinui-icons-react';
import type { FeatureOp, FeatureOpResult, LubanFeatureType } from '@luban-cad/shared';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import './FeatureDialog.css';

/** 结果类型页签（os-31：实体|曲面|薄壁）。 */
export type FeatureResultType = 'solid' | 'surface' | 'thinWall';

/** 布尔作用域页签（os-31：新建|加入|移除|相交）。 */
export type FeatureBooleanScope = 'new' | 'add' | 'remove' | 'intersect';

/** 方向（折叠段「方向」下拉值域）。 */
export type FeatureDirection = 'forward' | 'backward';

/** 实体芯片（面和草图区域的寻址单位）。 */
export interface FeatureDialogEntity {
  id: string;
  label: string;
}

/** 确认载荷：面板全量本地态的一次性回传（变异层接线口）。 */
export interface FeatureDialogResult {
  resultType: FeatureResultType;
  booleanScope: FeatureBooleanScope;
  entities: readonly FeatureDialogEntity[];
  direction: FeatureDirection;
  startOffset: string;
  symmetric: boolean;
  draft: string;
  rollback: number;
}

export interface FeatureDialogProps {
  /** 特征名（标题=对话框可访问名，os-31「Extrude 1」；new 模式=类型标签）。 */
  featureName: string;
  /**
   * 提交模式（M4-T6）：'new'=创建（applyOp 在场即走 insertFeature 直提交）；
   * 'edit'=既有特征（本版不提交，updateParams 归特征对话框增强 backlog）。
   * 缺省 'edit'（纯展示壳期语义）。
   */
  mode?: 'new' | 'edit';
  /** 特征类型（mode='new' 时 insertFeature 的 featureType）。 */
  featureType?: LubanFeatureType;
  /** op 提交面（Session useFeatureSystem.applyOp 直通；缺省=纯回调壳期语义）。 */
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /**
   * 写租约在持（Session useFeatureSystem.leaseOk 直通；T6 评审 I-2）——
   * false 且提交面在场时给可视警示「提交将等待租约」，**不硬禁用**（保留
   * applyOp 陈旧租约 35s 自愈路）；缺省（未接线/壳期）不警示。
   */
  leaseOk?: boolean;
  /** 初始实体 chips（RPC 接线前由宿主注入；缺省空集）。 */
  entities?: readonly FeatureDialogEntity[];
  /** 回滚滑杆上限（默认 100；后端 OpLog 线性链接线后由宿主注入特征数）。 */
  rollbackMax?: number;
  /** ✓/成品 确认出口（回传全量载荷；提交成功后由宿主 closeDialog）。 */
  onConfirm?: (result: FeatureDialogResult) => void;
  /** ✗ 取消出口。 */
  onCancel?: () => void;
}

/** 结果类型页签序（os-31）。 */
const RESULT_TYPES: readonly FeatureResultType[] = ['solid', 'surface', 'thinWall'];

/** 布尔作用域页签序（os-31）。 */
const BOOLEAN_SCOPES: readonly FeatureBooleanScope[] = ['new', 'add', 'remove', 'intersect'];

/** 折叠段定义（方向默认展开——主参数段；余者折叠）。 */
interface CollapsibleSection {
  id: 'direction' | 'startOffset' | 'symmetric' | 'draft';
  defaultExpanded: boolean;
}

const SECTIONS: readonly CollapsibleSection[] = [
  { id: 'direction', defaultExpanded: true },
  { id: 'startOffset', defaultExpanded: false },
  { id: 'symmetric', defaultExpanded: false },
  { id: 'draft', defaultExpanded: false },
];

/**
 * 特征编辑对话框（非模态内联面板）。宿主经 onConfirm/onCancel 收合——
 * 组件不自销（受控口径，与 CapabilityDialog 一致）；宿主挂
 * `key={mode==='edit' ? featureId : 'new-'+featureType}`（M3-T6 台账①：
 * 本地态跨特征复用残留的根治）。
 */
export function FeatureDialog({
  featureName,
  mode = 'edit',
  featureType,
  applyOp,
  leaseOk,
  entities,
  rollbackMax = 100,
  onConfirm,
  onCancel,
}: FeatureDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selection } = useCanvasSelection();
  // 仅查看门（T6 评审 I-1 防御纵深）：viewOnly 置位时宿主已整体收口写面
  // 对话框（PartStudioCanvas effect closeDialog），此门兜底竞态帧下的提交。
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);

  const [resultType, setResultType] = React.useState<FeatureResultType>('solid');
  const [booleanScope, setBooleanScope] = React.useState<FeatureBooleanScope>('new');
  const [chips, setChips] = React.useState<FeatureDialogEntity[]>([...(entities ?? [])]);
  const [distance, setDistance] = React.useState('10');
  const [direction, setDirection] = React.useState<FeatureDirection>('forward');
  const [startOffset, setStartOffset] = React.useState('');
  const [symmetric, setSymmetric] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [rollback, setRollback] = React.useState(rollbackMax);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<CollapsibleSection['id'], boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, s.defaultExpanded])) as Record<
      CollapsibleSection['id'],
      boolean
    >,
  );
  // 提交态（M4-T6）：提交中禁重入；错误就地 Alert（六态 error，对话框不关）。
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  // 卸载守卫：pending 期间宿主关闭（✗）后的迟到回包不得再 setState。
  const aliveRef = React.useRef(true);
  React.useEffect(() => () => {
    aliveRef.current = false;
  }, []);
  // edit 模式且宿主已接提交面（T6 评审 M-1）：updateParams 本版不接线（特征
  // 对话框增强 backlog），✓/成品 禁用 + 提示行，消除「点确认即关面板无事发生」
  // 的假成功观感；applyOp 未接线（壳期/纯展示）保持 M3 纯回调语义。
  const editStandalone = mode === 'edit' && applyOp !== undefined;

  // 快速拾取：画布选择集 → chips（按 id 去重；label 缺省回退 id）。
  const handleFastPick = React.useCallback(() => {
    if (selection.length === 0) return;
    setChips((prev) => {
      const known = new Set(prev.map((chip) => chip.id));
      const incoming = selection
        .filter((item) => !known.has(item.id))
        .map((item) => ({ id: item.id, label: item.label ?? item.id }));
      return incoming.length > 0 ? [...prev, ...incoming] : prev;
    });
  }, [selection]);

  const handleRemoveChip = React.useCallback((id: string) => {
    setChips((prev) => prev.filter((chip) => chip.id !== id));
  }, []);

  const buildResult = React.useCallback((): FeatureDialogResult => ({
    resultType,
    booleanScope,
    entities: chips,
    direction,
    startOffset,
    symmetric,
    draft,
    rollback,
  }), [resultType, booleanScope, chips, direction, startOffset, symmetric, draft, rollback]);

  /**
   * 确认出口：new + applyOp 在场 → insertFeature 直提交（拉伸闭环）；否则
   * 纯 onConfirm 回传（壳期/edit 模式语义）。成功 → toast + onConfirm（宿主
   * closeDialog）；失败/校验不过 → 就地 Alert，对话框不关闭。
   */
  const handleConfirm = React.useCallback(() => {
    if (submitting || viewOnly) return; // 禁重入 + 仅查看门（I-1 防御纵深）
    if (editStandalone) return; // M-1：edit 本版不提交（✓ 已禁用，此为防御兜底）
    if (!(mode === 'new' && applyOp && featureType)) {
      onConfirm?.(buildResult());
      return;
    }
    const parsed = Number(distance);
    if (distance.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setError(t('partStudio.featureDialog.distanceInvalid'));
      return;
    }
    setError(undefined);
    setSubmitting(true);
    void (async () => {
      let result: FeatureOpResult;
      try {
        result = await applyOp({
          kind: 'insertFeature',
          featureType,
          // 空 profile = 拉伸基体（shared opDsl 语义；拾取寻址归特征对话框增强 backlog）。
          params: { profile: [], distance: parsed },
        });
      } catch (err) {
        // rpc-over-ipc 异常（连接断开等）——与拒收同面呈现，不静默。
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (!aliveRef.current) return;
      setSubmitting(false);
      if (result.ok) {
        // 成功 toast（notifications 标准通道）+ onConfirm（宿主 closeDialog）。
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Success,
            t('partStudio.featureDialog.submitSuccess', { name: featureName }),
          ),
        );
        onConfirm?.(buildResult());
      } else {
        setError(result.error);
      }
    })();
  }, [submitting, viewOnly, editStandalone, mode, applyOp, featureType, distance, t, onConfirm, buildResult, featureName]);

  const toggleSection = React.useCallback((id: CollapsibleSection['id']) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={featureName}
      aria-busy={submitting || undefined}
      className="part-studio-feature-dialog"
      data-testid="part-studio-feature-dialog"
    >
      {/* 顶置标题行：特征名 + ✓确认/✗取消（os-31）。 */}
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <div className="part-studio-feature-dialog__header-actions">
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.confirm')}
            className="part-studio-feature-dialog__confirm"
            disabled={submitting || editStandalone}
            onClick={handleConfirm}
          >
            <SvgCheckmark />
          </button>
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.cancel')}
            className="part-studio-feature-dialog__cancel"
            onClick={() => onCancel?.()}
          >
            <SvgClose />
          </button>
        </div>
      </header>

      {/* 布尔作用域双页签（os-31）。 */}
      <div className="part-studio-feature-dialog__tabs">
        <div
          role="tablist"
          aria-label={t('partStudio.featureDialog.resultTypeTabs')}
          className="part-studio-feature-dialog__tablist"
        >
          {RESULT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={resultType === type}
              className={[
                'part-studio-feature-dialog__tab',
                resultType === type ? 'part-studio-feature-dialog__tab--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setResultType(type)}
            >
              {t(`partStudio.featureDialog.resultTypes.${type}`)}
            </button>
          ))}
        </div>
        <div
          role="tablist"
          aria-label={t('partStudio.featureDialog.booleanScopeTabs')}
          className="part-studio-feature-dialog__tablist"
        >
          {BOOLEAN_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={booleanScope === scope}
              className={[
                'part-studio-feature-dialog__tab',
                booleanScope === scope ? 'part-studio-feature-dialog__tab--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setBooleanScope(scope)}
            >
              {t(`partStudio.featureDialog.booleanScopes.${scope}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="part-studio-feature-dialog__body">
        {/* 提交错误就地 Alert（六态 error；失败不关闭可改参重试）。 */}
        {error && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-feature-dialog-error">
            {error}
          </p>
        )}

        {/* 租约警示（T6 评审 I-2）：活租约被他人持有时可视提示，不硬禁用——
            applyOp 内置陈旧租约 35s 有限重试自愈路，禁用即堵死。 */}
        {applyOp !== undefined && mode === 'new' && leaseOk === false && (
          <p
            role="note"
            className="part-studio-feature-dialog__lease-warning"
            data-testid="part-studio-feature-dialog-lease-warning"
          >
            {t('partStudio.featureDialog.leaseBusy')}
          </p>
        )}

        {/* edit 模式提示行（T6 评审 M-1）：参数编辑即将推出（✓ 已禁用）。 */}
        {editStandalone && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-edit-hint"
          >
            {t('partStudio.featureDialog.editHint')}
          </p>
        )}

        {/* 距离（M4-T6：insertFeature extrude 的唯一可编辑量；常驻不折叠）。 */}
        <section className="part-studio-feature-dialog__distance">
          <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-distance">
            {t('partStudio.featureDialog.distanceLabel')}
          </label>
          <input
            id="part-studio-feature-dialog-distance"
            type="text"
            inputMode="decimal"
            aria-label={t('partStudio.featureDialog.distanceLabel')}
            className="part-studio-feature-dialog__input"
            value={distance}
            disabled={submitting}
            onChange={(event) => setDistance(event.target.value)}
          />
        </section>

        {/* 芯片式实体选择框（os-31）+ 快速拾取。 */}
        <section className="part-studio-feature-dialog__entities">
          <div className="part-studio-feature-dialog__entities-header">
            <span className="part-studio-feature-dialog__entities-label">
              {t('partStudio.featureDialog.entitiesLabel')}
            </span>
            <button
              type="button"
              className="part-studio-feature-dialog__fast-pick"
              onClick={handleFastPick}
            >
              {t('partStudio.featureDialog.fastPick')}
            </button>
          </div>
          <ul className="part-studio-feature-dialog__chips">
            {chips.map((chip) => (
              <li key={chip.id} className="part-studio-feature-dialog__chip">
                <span className="part-studio-feature-dialog__chip-label">{chip.label}</span>
                <button
                  type="button"
                  aria-label={t('partStudio.featureDialog.removeEntity', { label: chip.label })}
                  className="part-studio-feature-dialog__chip-remove"
                  onClick={() => handleRemoveChip(chip.id)}
                >
                  <SvgClose />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 折叠段：方向/起始偏移/对称/拔模（os-31）。 */}
        <div className="part-studio-feature-dialog__sections">
          {SECTIONS.map((section) => {
            const isOpen = expanded[section.id];
            const label = t(`partStudio.featureDialog.sections.${section.id}`);
            return (
              <section key={section.id} className="part-studio-feature-dialog__section">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="part-studio-feature-dialog__section-toggle"
                  onClick={() => toggleSection(section.id)}
                >
                  <span>{label}</span>
                </button>
                {isOpen && (
                  <div className="part-studio-feature-dialog__section-body">
                    {section.id === 'direction' && (
                      <select
                        aria-label={label}
                        className="part-studio-feature-dialog__select"
                        value={direction}
                        onChange={(event) => setDirection(event.target.value as FeatureDirection)}
                      >
                        <option value="forward">
                          {t('partStudio.featureDialog.directionOptions.forward')}
                        </option>
                        <option value="backward">
                          {t('partStudio.featureDialog.directionOptions.backward')}
                        </option>
                      </select>
                    )}
                    {section.id === 'startOffset' && (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={label}
                        className="part-studio-feature-dialog__input"
                        value={startOffset}
                        onChange={(event) => setStartOffset(event.target.value)}
                      />
                    )}
                    {section.id === 'symmetric' && (
                      <label className="part-studio-feature-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={symmetric}
                          onChange={(event) => setSymmetric(event.target.checked)}
                        />
                        <span>{label}</span>
                      </label>
                    )}
                    {section.id === 'draft' && (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={label}
                        className="part-studio-feature-dialog__input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* 底部：回滚滑杆 + 成品 + ?（os-31）。 */}
      <footer className="part-studio-feature-dialog__footer">
        <div className="part-studio-feature-dialog__rollback">
          <span className="part-studio-feature-dialog__rollback-label">
            {t('partStudio.featureDialog.rollbackLabel')}
          </span>
          <input
            type="range"
            aria-label={t('partStudio.featureDialog.rollbackLabel')}
            className="part-studio-feature-dialog__rollback-slider"
            min={0}
            max={rollbackMax}
            value={rollback}
            onChange={(event) => setRollback(Number(event.target.value))}
          />
        </div>
        <div className="part-studio-feature-dialog__footer-actions">
          <button
            type="button"
            className="part-studio-feature-dialog__finish"
            disabled={submitting || editStandalone}
            onClick={handleConfirm}
          >
            {t('partStudio.featureDialog.finish')}
          </button>
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.help')}
            aria-expanded={helpOpen}
            className="part-studio-feature-dialog__help"
            onClick={() => setHelpOpen((prev) => !prev)}
          >
            ?
          </button>
        </div>
      </footer>
      {helpOpen && (
        <p role="note" className="part-studio-feature-dialog__help-text">
          {t('partStudio.featureDialog.helpText')}
        </p>
      )}
    </div>
  );
}
