/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * SketchPanel（M6-b T5）：草图模式面板——真数据源 + DOF 徽标 + 三清单 +
 * 尺寸内联编辑 + 级联删除 + dimensionCandidate 值确认桥。
 *
 * 语义骨架移植自退役仓 apps/web/features/sketch/components/SketchPanel.tsx
 * （M3-b T4.7，溯源注记）。与 M3-b 的差异（诚实登记）：
 * - 挂载位换芯：M3-b 面板替换左侧特征树（EditorSidePanel 二选一）；web
 *   挂 **PartStudioCanvas 画布左上覆盖层**（sketch.isActive 驱动条件渲染，
 *   非模态不遮画布——与栅格/约束覆盖层、FeatureDialog/SketchDialog 同宿主
 *   同姿态）。裁决依据：PartStudioCanvas 已是草图模式覆盖层宿主（零布局
 *   跳动的 absolute 叠加先例 M5-T2）；右停靠（PartStudioDock）语义是工具
 *   设置/版本历史/显示设置三页签且缺省收起，内嵌需新增页签+开合态耦合；
 *   左栏树保持在场（特征树↔草图联动：树红显活动草图行）。
 * - 身份源换位：M3-b 的 openSketch/closeSketch/createSketch/sketches 摘要表
 *   不随迁（web 活动身份=store 草图切片，新建走 SketchDialog 的
 *   insertSketch 直通）——退出=exitSketch 复位 + startDefaultTool 停活动
 *   工具；草图切换器/新建按钮以「活动草图 id 静态标签」替代。
 * - 尺寸值编辑换 op：M3-b 走 applyUpdate 整体覆写改 value；web 走
 *   **updateSketchConstraint op**（applyConstraintValue——后端改值重解算并
 *   重写草图 params+几何流，EDE 传播由 op 自带）；editSubmitting 守卫防
 *   Enter+blur 双提交（M3-b 同款）。
 * - toast 通道换芯：onToast 回调 → IModelApp.notifications.outputMessage
 *   （呈现桥 ViewerNotifications → iTwinUI toaster，工具链同管道）。
 *
 * 原样保留（M3-b 裁决）：
 * - 数据源：useSketchSystem.activeSketch（getSketch 服务端现场求解）——面板
 *   零本地 mock 实体状态，一切写操作经 applyUpdate/applyConstraintValue
 *   提交（E-1）；拒收文本（含 dof/冲突 id）原样 toast。
 * - DOF 徽标四态：恰定=positive / 欠约束（含 ok+dof>0 的信息态）=
 *   informational 含 dof 数 / 矛盾·失败=negative；redundant 附加 warning。
 * - 三清单：实体（#id 摘要+解算坐标，级联删除）/ 约束（kind+refs+矛盾红标：
 *   solve.failedConstraintIds/conflictingRank 命中，E-6）/ 尺寸（distance/
 *   radius 过滤，值内联编辑）。
 * - 值确认桥（E-4 铁律的另一半）：订阅 sketchToolEvents.dimensionCandidate
 *   ——工具满槽发候选，面板收值（>0 校验）→ 构造 {kind, id:maxId+1, refs,
 *   value} 追加提交；取消=丢弃候选；提交被拒 → 拒收文本原样透出，表单保持。
 * - 级联删除 v1 简化（Task-4 拓扑）：line 拥有端点 / circle 拥有圆心；删
 *   实体 → 拥有子实体级联 + 引用已删实体的实体级联（fixpoint 传递）+ refs
 *   命中已删 id 的约束级联。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SvgDelete } from '@itwin/itwinui-icons-react';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type {
  SketchConstraintDto,
  SketchEntityDto,
  SketchSolveStateDto,
} from '@luban-cad/shared';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { nextConstraintId } from '../tools/sketch/sketch-constraint-logic.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';
import type { SketchDimensionCandidate } from '../tools/sketch/sketch-tool-events.js';
import './SketchPanel.css';

export interface SketchPanelProps {
  /** 草图系统（Session useSketchSystem 直通——activeSketch 读面 + 写面管道）。 */
  sketchSystem: UseSketchSystem;
}

/** 错误面（工具链同管道：outputMessage → 呈现桥 → iTwinUI toaster）。 */
function notifyError(message: string): void {
  IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, message));
}

/**
 * 实体级联删除（v1 简化裁决，M3-b Task-4 拓扑）：
 * - 拥有关系：line 拥有端点 p1/p2；circle 拥有圆心 center（绘制工具每线独立
 *   端点，相邻线角点经 coincident 焊接约束联结）。
 * - 删除 E → ① E 的拥有子实体级联删除（删线带走端点/删圆带走圆心）；
 *   ② 引用已删实体的 line/circle 级联删除（点没了其上的线/圆无法存活，含
 *   fixpoint 传递：线因端点被删而死 → 线的另一端点随之而死）；
 *   ③ 任何 refs 命中已删实体 id 的约束一并删除——coincident 焊接因此单边
 *   删除即清除焊接约束，而焊接另一侧的点/线属他人所有，存活。
 */
export function computeCascadeDelete(
  entities: SketchEntityDto[],
  constraints: SketchConstraintDto[],
  rootId: number,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const removed = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of entities) {
      if (removed.has(e.id)) {
        const owned = e.kind === 'line' ? [e.p1, e.p2] : e.kind === 'circle' ? [e.center] : [];
        for (const id of owned) {
          if (!removed.has(id)) {
            removed.add(id);
            changed = true;
          }
        }
      } else {
        const refs = e.kind === 'line' ? [e.p1, e.p2] : e.kind === 'circle' ? [e.center] : [];
        if (refs.some((r) => removed.has(r))) {
          removed.add(e.id);
          changed = true;
        }
      }
    }
  }
  return {
    entities: entities.filter((e) => !removed.has(e.id)),
    constraints: constraints.filter((c) => !c.refs.some((r) => removed.has(r))),
  };
}

/** 实体清单标签：点 `#id (x, y)` / 线 `#id (#p1→#p2)` / 圆·弧 `#id (r=…)`（解算值）。 */
function entityLabel(e: SketchEntityDto): string {
  switch (e.kind) {
    case 'point':
      return `#${e.id} (${e.x?.toFixed(2) ?? '?'}, ${e.y?.toFixed(2) ?? '?'})`;
    case 'line':
      return `#${e.id} (#${e.p1}→#${e.p2})`;
    case 'circle':
    case 'arc':
      return `#${e.id} (r=${e.radius?.toFixed(2) ?? '?'})`;
  }
}

type SolveBadgeTone = 'positive' | 'informational' | 'negative';

/** DOF 徽标四态（ok=恰定 positive / 欠约束=informational 含 dof / 矛盾·失败=negative）。 */
function solveBadgeState(solve: SketchSolveStateDto, label: (key: string, params?: Record<string, unknown>) => string): { tone: SolveBadgeTone; text: string } {
  if (solve.status === 'ok' && solve.dof === 0) {
    return { tone: 'positive', text: label('partStudio.sketch.panel.solve.dofZero') };
  }
  // ok+dof>0 与 underconstrained 同为信息态（求解成功但欠约束——M3-b 把该
  // 组合误落 failed 红标，web 按 dof 诚实呈现）。
  if (solve.status === 'ok' || solve.status === 'underconstrained') {
    return { tone: 'informational', text: label('partStudio.sketch.panel.solve.underconstrained', { dof: solve.dof }) };
  }
  if (solve.status === 'conflicting') {
    return { tone: 'negative', text: label('partStudio.sketch.panel.solve.conflicting') };
  }
  return { tone: 'negative', text: label('partStudio.sketch.panel.solve.failed') };
}

interface PendingDimension extends SketchDimensionCandidate {
  value: string;
}

type PanelTab = 'elements' | 'constraints' | 'dimensions';

/** 草图模式面板（挂载位/差异裁决见文件头）。 */
export function SketchPanel({ sketchSystem }: SketchPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const exitSketch = usePartStudioStore((s) => s.exitSketch);
  // 活动身份（store 草图切片）：id 标签 + 切换时清空尺寸编辑态（旧草图的
  // pendingDimension refs / editingDimensionId 挂到新草图会指错实体——M3-b T8 Minor 1）。
  const activeSketchId = usePartStudioStore((s) => s.sketch.activeSketchId);

  const [activeTab, setActiveTab] = useState<PanelTab>('elements');
  /** 尺寸值编辑态（现有 distance/radius 约束的 value 内联改）。 */
  const [editingDimensionId, setEditingDimensionId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  /** 编辑提交在途守卫：Enter+blur 双触发只提交一次。 */
  const [editSubmitting, setEditSubmitting] = useState(false);
  /** dimensionCandidate 值确认桥表单（工具满槽 → 面板收值提交）。 */
  const [pendingDimension, setPendingDimension] = useState<PendingDimension | undefined>(undefined);

  const { activeSketch } = sketchSystem;

  // 值确认桥订阅：挂载期常驻（面板只在草图模式挂载），卸载即退订（候选不
  // 泄漏、不 setState 幽灵更新）。
  useEffect(() => {
    return sketchToolEvents.on('dimensionCandidate', (candidate) => {
      setPendingDimension({ ...candidate, value: '' });
      setActiveTab('dimensions');
    });
  }, []);

  // 草图切换/退出时清空尺寸编辑态。
  useEffect(() => {
    setPendingDimension(undefined);
    setEditingDimensionId(null);
  }, [activeSketchId]);

  const label = t as (key: string, params?: Record<string, unknown>) => string;

  const handleExit = useCallback(() => {
    // 停活动草图工具（回到缺省工具）+ 复位草图模式（ribbon 还原/覆盖层收）。
    void IModelApp.toolAdmin.startDefaultTool();
    exitSketch();
  }, [exitSketch]);

  const handleDeleteEntity = useCallback(
    async (entityId: number) => {
      const sketch = sketchSystem.activeSketch;
      if (!sketch) return;
      const next = computeCascadeDelete(sketch.entities, sketch.constraints, entityId);
      const result = await sketchSystem.applyUpdate(next.entities, next.constraints);
      if (!result.ok) {
        notifyError(result.error ?? t('partStudio.sketch.panel.errors.updateFailed'));
      }
    },
    [sketchSystem, t],
  );

  const handleDeleteConstraint = useCallback(
    async (constraintId: number) => {
      const sketch = sketchSystem.activeSketch;
      if (!sketch) return;
      const result = await sketchSystem.applyUpdate(
        sketch.entities,
        sketch.constraints.filter((c) => c.id !== constraintId),
      );
      if (!result.ok) {
        notifyError(result.error ?? t('partStudio.sketch.panel.errors.updateFailed'));
      }
    },
    [sketchSystem, t],
  );

  /** 尺寸值内联提交（updateSketchConstraint op——改值重解算，见文件头换芯注）。 */
  const submitDimensionEdit = useCallback(
    async (constraintId: number) => {
      if (editSubmitting) return; // Enter+blur 双触发只提交一次
      const value = Number(editValue);
      if (!Number.isFinite(value) || value <= 0) {
        notifyError(t('partStudio.sketch.panel.errors.invalidDimension'));
        return;
      }
      setEditSubmitting(true);
      try {
        const result = await sketchSystem.applyConstraintValue(constraintId, value);
        if (!result.ok) {
          notifyError(result.error ?? t('partStudio.sketch.panel.errors.updateFailed'));
          return;
        }
        setEditingDimensionId(null);
      } finally {
        setEditSubmitting(false);
      }
    },
    [sketchSystem, editValue, editSubmitting, t],
  );

  /** 候选尺寸确认（E-4 铁律另一半：面板收值 → 构造完整约束 → applyUpdate 追加）。 */
  const confirmPendingDimension = useCallback(async () => {
    const sketch = sketchSystem.activeSketch;
    const pending = pendingDimension;
    if (!sketch || !pending) return;
    const value = Number(pending.value);
    if (!Number.isFinite(value) || value <= 0) {
      notifyError(t('partStudio.sketch.panel.errors.invalidDimension'));
      return;
    }
    const newConstraint: SketchConstraintDto = {
      kind: pending.kind,
      id: nextConstraintId(sketch),
      refs: [...pending.refs],
      value,
    };
    const result = await sketchSystem.applyUpdate(sketch.entities, [...sketch.constraints, newConstraint]);
    if (!result.ok) {
      // 拒收文本（含 dof/冲突 id）原样透出；表单保持——可改值再提交或取消。
      notifyError(result.error ?? t('partStudio.sketch.panel.errors.updateFailed'));
      return;
    }
    setPendingDimension(undefined);
  }, [pendingDimension, sketchSystem, t]);

  const failedIds = new Set([
    ...(activeSketch?.solve.failedConstraintIds ?? []),
    ...(activeSketch?.solve.conflictingRank ?? []),
  ]);
  const dimensionConstraints =
    activeSketch?.constraints.filter((c) => c.kind === 'distance' || c.kind === 'radius') ?? [];
  const badge = activeSketch ? solveBadgeState(activeSketch.solve, label) : undefined;

  return (
    <div className="part-studio-sketch-panel" data-testid="sketch-panel" role="complementary" aria-label={t('partStudio.sketch.panel.title')}>
      {/* Header：返回 + 标题 + DOF 徽标/冗余徽标 + 完成 */}
      <div className="part-studio-sketch-panel__header">
        <button
          type="button"
          className="part-studio-sketch-panel__exit"
          data-testid="sketch-panel-exit"
          aria-label={t('partStudio.sketch.panel.exit')}
          title={t('partStudio.sketch.panel.exit')}
          onClick={handleExit}
        >
          ‹
        </button>
        <span className="part-studio-sketch-panel__title">{t('partStudio.sketch.panel.title')}</span>
        {badge && (
          <span
            className="part-studio-sketch-panel__badge"
            data-tone={badge.tone}
            data-testid="sketch-panel-dof-badge"
          >
            {badge.text}
          </span>
        )}
        {activeSketch?.solve.redundant && (
          <span className="part-studio-sketch-panel__badge" data-tone="warning" data-testid="sketch-panel-redundant-badge">
            {t('partStudio.sketch.panel.solve.redundant')}
          </span>
        )}
        <button type="button" className="part-studio-sketch-panel__finish" onClick={handleExit}>
          {t('partStudio.sketch.panel.finish')}
        </button>
      </div>

      <div className="part-studio-sketch-panel__subheader">
        {activeSketch ? (
          <span className="part-studio-sketch-panel__sketch-id" data-testid="sketch-panel-sketch-id">
            {t('partStudio.sketch.panel.sketchId', { id: activeSketch.id })}
          </span>
        ) : (
          <span className="part-studio-sketch-panel__sketch-id">{t('partStudio.sketch.panel.sketchId', { id: activeSketchId ?? '?' })}</span>
        )}
      </div>

      {/* Tabs（三清单：实体/约束/尺寸） */}
      <div className="part-studio-sketch-panel__tabs" role="tablist">
        {(['elements', 'constraints', 'dimensions'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`part-studio-sketch-panel__tab ${activeTab === tab ? 'part-studio-sketch-panel__tab--active' : ''}`}
            data-testid={`sketch-panel-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`partStudio.sketch.panel.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div className="part-studio-sketch-panel__content">
        {sketchSystem.loading && <p className="part-studio-sketch-panel__hint">{t('partStudio.sketch.panel.loading')}</p>}
        {sketchSystem.error && (
          <p role="alert" className="part-studio-sketch-panel__error">
            {sketchSystem.error}
          </p>
        )}
        {!activeSketch && !sketchSystem.loading && (
          <div className="part-studio-sketch-panel__empty" data-testid="sketch-panel-empty">
            <p>{t('partStudio.sketch.panel.empty.notOpen')}</p>
            <p className="part-studio-sketch-panel__hint">{t('partStudio.sketch.panel.empty.notOpenHint')}</p>
          </div>
        )}

        {/* 实体清单（级联删除） */}
        {activeSketch && activeTab === 'elements' && (
          <div data-testid="sketch-panel-entities">
            {activeSketch.entities.length === 0 ? (
              <div className="part-studio-sketch-panel__empty">
                <p>{t('partStudio.sketch.panel.empty.noEntities')}</p>
                <p className="part-studio-sketch-panel__hint">{t('partStudio.sketch.panel.empty.noEntitiesHint')}</p>
              </div>
            ) : (
              activeSketch.entities.map((entity) => (
                <div key={entity.id} className="part-studio-sketch-panel__row" data-testid={`sketch-panel-entity-${entity.id}`}>
                  <span className="part-studio-sketch-panel__kind">
                    {t(`partStudio.sketch.vocabulary.entityKinds.${entity.kind}`)}
                  </span>
                  <span className="part-studio-sketch-panel__summary">{entityLabel(entity)}</span>
                  <button
                    type="button"
                    className="part-studio-sketch-panel__row-delete"
                    aria-label={t('partStudio.sketch.panel.delete')}
                    title={t('partStudio.sketch.panel.delete')}
                    data-testid={`sketch-panel-delete-entity-${entity.id}`}
                    onClick={() => void handleDeleteEntity(entity.id)}
                  >
                    <SvgDelete />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* 约束清单（矛盾/失败红标） */}
        {activeSketch && activeTab === 'constraints' && (
          <div data-testid="sketch-panel-constraints">
            <p className="part-studio-sketch-panel__section-title">
              {t('partStudio.sketch.panel.constraintList', { count: activeSketch.constraints.length })}
            </p>
            {activeSketch.constraints.length === 0 ? (
              <p className="part-studio-sketch-panel__hint">{t('partStudio.sketch.panel.empty.noConstraints')}</p>
            ) : (
              activeSketch.constraints.map((c) => (
                <div
                  key={c.id}
                  className={`part-studio-sketch-panel__row ${failedIds.has(c.id) ? 'part-studio-sketch-panel__row--conflict' : ''}`}
                  data-testid={`sketch-panel-constraint-${c.id}`}
                >
                  <span className="part-studio-sketch-panel__summary">
                    {`#${c.id} ${label(`partStudio.sketch.vocabulary.constraintKinds.${c.kind}`)} [${c.refs.join(',')}]`}
                  </span>
                  <button
                    type="button"
                    className="part-studio-sketch-panel__row-delete"
                    aria-label={t('partStudio.sketch.panel.delete')}
                    title={t('partStudio.sketch.panel.delete')}
                    data-testid={`sketch-panel-delete-constraint-${c.id}`}
                    onClick={() => void handleDeleteConstraint(c.id)}
                  >
                    <SvgDelete />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* 尺寸清单（候选值确认 + 现有尺寸内联编辑） */}
        {activeSketch && activeTab === 'dimensions' && (
          <div data-testid="sketch-panel-dimensions">
            {pendingDimension && (
              <div className="part-studio-sketch-panel__candidate" data-testid="sketch-panel-candidate-form">
                <p className="part-studio-sketch-panel__section-title">
                  {t('partStudio.sketch.panel.confirmDimensionTitle')}
                </p>
                <input
                  className="part-studio-sketch-panel__input"
                  type="number"
                  value={pendingDimension.value}
                  placeholder={t('partStudio.sketch.panel.dimensionPlaceholder')}
                  aria-label={t('partStudio.sketch.panel.confirmDimensionTitle')}
                  autoFocus
                  data-testid="sketch-panel-candidate-input"
                  onChange={(e) => setPendingDimension({ ...pendingDimension, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void confirmPendingDimension();
                  }}
                />
                <div className="part-studio-sketch-panel__candidate-actions">
                  <button
                    type="button"
                    className="part-studio-sketch-panel__confirm"
                    data-testid="sketch-panel-candidate-confirm"
                    onClick={() => void confirmPendingDimension()}
                  >
                    {t('partStudio.sketch.panel.confirm')}
                  </button>
                  <button
                    type="button"
                    className="part-studio-sketch-panel__cancel"
                    data-testid="sketch-panel-candidate-cancel"
                    onClick={() => setPendingDimension(undefined)}
                  >
                    {t('partStudio.sketch.panel.cancel')}
                  </button>
                </div>
              </div>
            )}

            <p className="part-studio-sketch-panel__section-title">
              {t('partStudio.sketch.panel.existingDimensions', { count: dimensionConstraints.length })}
            </p>
            {dimensionConstraints.length === 0 ? (
              <p className="part-studio-sketch-panel__hint">{t('partStudio.sketch.panel.empty.noDimensions')}</p>
            ) : (
              dimensionConstraints.map((c) => (
                <div key={c.id} className="part-studio-sketch-panel__row" data-testid={`sketch-panel-dimension-${c.id}`}>
                  <span className="part-studio-sketch-panel__kind">
                    {t(c.kind === 'distance'
                      ? 'partStudio.sketch.vocabulary.dimensionKinds.distance'
                      : 'partStudio.sketch.vocabulary.dimensionKinds.radius')}
                  </span>
                  {editingDimensionId === c.id ? (
                    <input
                      className="part-studio-sketch-panel__input"
                      type="number"
                      value={editValue}
                      aria-label={t('partStudio.sketch.panel.editDimensionTitle')}
                      autoFocus
                      data-testid="sketch-panel-dimension-input"
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitDimensionEdit(c.id);
                      }}
                      onBlur={() => void submitDimensionEdit(c.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="part-studio-sketch-panel__dimension-value"
                      title={t('partStudio.sketch.panel.editDimensionTitle')}
                      data-testid={`sketch-panel-dimension-value-${c.id}`}
                      onClick={() => {
                        setEditingDimensionId(c.id);
                        setEditValue(c.value !== undefined ? String(c.value) : '');
                      }}
                    >
                      {c.value?.toFixed(2) ?? '?'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="part-studio-sketch-panel__row-delete"
                    aria-label={t('partStudio.sketch.panel.delete')}
                    title={t('partStudio.sketch.panel.delete')}
                    data-testid={`sketch-panel-delete-constraint-${c.id}`}
                    onClick={() => void handleDeleteConstraint(c.id)}
                  >
                    <SvgDelete />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
