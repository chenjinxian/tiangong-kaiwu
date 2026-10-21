/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureDialog（M3 Task 6）：特征编辑非模态内联面板（对齐 os-31）——
 * - 非模态：role=dialog + aria-modal=false + 无 backdrop 遮罩，画布区左上角
 *   内联定位（PartStudioCanvas 宿主）；对话框打开期间画布可持续拾取、
 *   视图可旋转缩放（os-31 采集对齐）；
 * - 顶置 ✓确认/✗取消（标题行首，绿✓/红✗）；
 * - 布尔作用域双页签：结果类型（实体|曲面|薄壁）× 布尔作用域（新建|加入|
 *   移除|相交），role=tablist + aria-selected；
 * - 芯片式实体选择框：初始实体（props 注入）渲染 chips + ×移除；快速拾取
 *   经 useCanvasSelection 把 store.canvas.selection 回流成 chips（按 id
 *   去重）——T5 选择驱动 hooks 的 T6 消费面（progress.md T5↔T6 一致）；
 * - 折叠段：方向（默认展开，正向/反向下拉）/起始偏移/对称（勾选）/拔模，
 *   aria-expanded 开合语义；
 * - 底部：回滚滑杆（range，默认=上限；🟠 诚实降级——后端 OpLog 仅线性链，
 *   UI 先行）+ 成品按钮（=✓ 确认出口）+ ? 帮助（展开文案）。
 *
 * 纯展示 + 本地态：不写 store（会话态外置是宿主职责）；确认回传全量
 * FeatureDialogResult 给宿主（RPC 变异层接线口，壳期 console.warn）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SvgCheckmark, SvgClose } from '@itwin/itwinui-icons-react';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
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
  /** 特征名（标题=对话框可访问名，os-31「Extrude 1」）。 */
  featureName: string;
  /** 初始实体 chips（RPC 接线前由宿主注入；缺省空集）。 */
  entities?: readonly FeatureDialogEntity[];
  /** 回滚滑杆上限（默认 100；后端 OpLog 线性链接线后由宿主注入特征数）。 */
  rollbackMax?: number;
  /** ✓/成品 确认出口（回传全量载荷）。 */
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
 * 组件不自销（受控口径，与 CapabilityDialog 一致）。
 */
export function FeatureDialog({
  featureName,
  entities,
  rollbackMax = 100,
  onConfirm,
  onCancel,
}: FeatureDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selection } = useCanvasSelection();

  const [resultType, setResultType] = React.useState<FeatureResultType>('solid');
  const [booleanScope, setBooleanScope] = React.useState<FeatureBooleanScope>('new');
  const [chips, setChips] = React.useState<FeatureDialogEntity[]>([...(entities ?? [])]);
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

  const handleConfirm = React.useCallback(() => {
    onConfirm?.(buildResult());
  }, [onConfirm, buildResult]);

  const toggleSection = React.useCallback((id: CollapsibleSection['id']) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={featureName}
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
