/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sketch Panel（M3-b T4.7）——真数据源 + DOF/矛盾清单。
 *
 * - 数据源：useSketchSystem.activeSketch（getSketch 服务端现场求解——Design Note 10；
 *   面板零本地 mock 实体状态，一切写操作经 applyUpdate 整体覆写提交，E-1 裁决）。
 * - 三清单：元素=实体（#id 摘要+解算坐标，级联删除）；约束=kind+refs+矛盾/失败红标
 *   （solve.failedConstraintIds/conflictingRank 命中，E-6：面板清单即状态显示）；
 *   尺寸=distance/radius 值可编辑（点击值 → 内联输入 → Enter/blur → applyUpdate）。
 * - 头部：DOF 徽标（恰定=positive / 欠约束=informational / 矛盾·失败=negative /
 *   redundant 附加 warning 冗余徽标）+「新建草图」（空实体起步）+ 草图切换器。
 * - 值确认桥（E-4）：订阅 sketchToolEvents.dimensionCandidate——工具满槽发候选，
 *   面板收值（>0 校验）→ 构造 {kind, id: maxId+1, refs, value} 追加提交；
 *   取消=丢弃候选；提交被拒 → 拒收文本原样 toast，表单保持可改值/取消。
 * - 退出：startDefaultTool + closeSketch + onExit（关闭活动草图读面）。
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  IconButton,
  Input,
  Select,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgCheckmark,
  SvgChevronLeft,
  SvgDelete,
} from '@itwin/itwinui-icons-react';
import { IModelApp } from '@itwin/core-frontend';
import type {
  SketchConstraintDto,
  SketchEntityDto,
  SketchSolveStateDto,
} from '@luban-cad/shared';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { runSketchCreateTool, type SketchCreateKind } from '../tools/SketchCreateTool.js';
import {
  nextConstraintId,
  runSketchAddConstraintTool,
  type SketchConstraintKind,
} from '../tools/SketchAddConstraintTool.js';
import {
  runSketchAddDimensionTool,
  type SketchDimensionCandidate,
  type SketchDimensionKind,
  sketchToolEvents,
} from '../tools/SketchAddDimensionTool.js';
import './SketchPanel.css';

type SketchToast = (message: string, type: 'success' | 'error' | 'info') => void;

export interface SketchPanelProps {
  isActive: boolean;
  onExit: () => void;
  /** Task 3 草图数据 hook（activeSketch 读面 + applyUpdate/createSketch 提交管道） */
  sketchSystem: UseSketchSystem;
  /** 面板 toast 通道（FeaturePanel 同款签名） */
  onToast: SketchToast;
}

/**
 * 实体级联删除（v1 简化裁决，Task-4 拓扑）：
 * - 拥有关系：line 拥有端点 p1/p2；circle 拥有圆心 center（绘制工具每线独立端点，
 *   相邻线角点经 coincident 焊接约束联结）。
 * - 删除 E → ① E 的拥有子实体级联删除（删线带走端点/删圆带走圆心）；
 *   ② 引用已删实体的 line/circle 级联删除（点没了其上的线/圆无法存活，含 fixpoint
 *   传递：线因端点被删而死 → 线的另一端点随之而死）；
 *   ③ 任何 refs 命中已删实体 id 的约束一并删除——coincident 焊接因此单边删除即
 *   清除焊接约束，而焊接另一侧的点/线属他人所有，存活。
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

/** 实体清单标签：点 `#id (x, y)` / 线 `#id (#p1→#p2)` / 圆 `#id (r=…)`（解算坐标） */
function entityLabel(e: SketchEntityDto): string {
  switch (e.kind) {
    case 'point':
      return `#${e.id} (${e.x?.toFixed(2) ?? '?'}, ${e.y?.toFixed(2) ?? '?'})`;
    case 'line':
      return `#${e.id} (#${e.p1}→#${e.p2})`;
    case 'circle':
      return `#${e.id} (r=${e.radius?.toFixed(2) ?? '?'})`;
  }
}

const ENTITY_KIND_LABEL: Record<SketchEntityDto['kind'], string> = {
  point: '点',
  line: '线',
  circle: '圆',
};

const CONSTRAINT_BUTTONS: Array<{ kind: SketchConstraintKind; label: string }> = [
  { kind: 'horizontal', label: '水平' },
  { kind: 'vertical', label: '竖直' },
  { kind: 'parallel', label: '平行' },
  { kind: 'perpendicular', label: '垂直' },
  { kind: 'coincident', label: '重合' },
  { kind: 'equal', label: '相等' },
];

const DIMENSION_BUTTONS: Array<{ kind: SketchDimensionKind; label: string }> = [
  { kind: 'distance', label: '距离尺寸' },
  { kind: 'radius', label: '半径尺寸' },
];

const CREATE_BUTTONS: Array<{ kind: SketchCreateKind; label: string }> = [
  { kind: 'line', label: '直线' },
  { kind: 'rectangle', label: '矩形' },
  { kind: 'circle', label: '圆' },
];

/** DOF 徽标（求解三态：恰定=positive / 欠约束=informational / 矛盾·失败=negative） */
// eslint-disable-next-line @typescript-eslint/naming-convention
const SolveBadge: React.FC<{ solve: SketchSolveStateDto }> = ({ solve }) => {
  if (solve.status === 'ok' && solve.dof === 0) {
    return <Badge backgroundColor="positive">自由度: 0</Badge>;
  }
  if (solve.status === 'underconstrained') {
    return <Badge backgroundColor="informational">{`欠约束 (${solve.dof})`}</Badge>;
  }
  if (solve.status === 'conflicting') {
    return <Badge backgroundColor="negative">矛盾</Badge>;
  }
  return <Badge backgroundColor="negative">失败</Badge>;
};

interface PendingDimension extends SketchDimensionCandidate {
  value: string;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const SketchPanel: React.FC<SketchPanelProps> = ({ isActive, onExit, sketchSystem, onToast }) => {
  const [activeTab, setActiveTab] = useState<'elements' | 'constraints' | 'dimensions'>('elements');
  /** 尺寸值编辑态（现有 distance/radius 约束的 value 内联改） */
  const [editingDimensionId, setEditingDimensionId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  /** dimensionCandidate 值确认桥表单（工具满槽 → 面板收值提交） */
  const [pendingDimension, setPendingDimension] = useState<PendingDimension | undefined>(undefined);
  /** 编辑提交在途守卫：Enter+blur 双触发只提交一次 */
  const [editSubmitting, setEditSubmitting] = useState(false);

  const { activeSketch, sketches } = sketchSystem;

  // 值确认桥订阅：仅活动期挂载，卸载/退出即退订（候选不泄漏、不 setState 幽灵更新）
  useEffect(() => {
    if (!isActive) return;
    const unsubscribe = sketchToolEvents.on('dimensionCandidate', (candidate) => {
      setPendingDimension({ ...candidate, value: '' });
      setActiveTab('dimensions');
    });
    return unsubscribe;
  }, [isActive]);

  // 草图切换（openSketch 切换器 / activeSketch?.id 变化）时清空尺寸编辑态——
  // 旧草图的 pendingDimension refs / editingDimensionId 挂到新草图会指错实体（M3-b T8 Minor 1）
  const activeSketchId = activeSketch?.id;
  useEffect(() => {
    setPendingDimension(undefined);
    setEditingDimensionId(null);
  }, [activeSketchId]);

  const handleExitSketch = useCallback(() => {
    void IModelApp.toolAdmin.startDefaultTool();
    sketchSystem.closeSketch();
    setPendingDimension(undefined);
    setEditingDimensionId(null);
    onExit();
  }, [sketchSystem, onExit]);

  const handleCreateSketch = useCallback(async () => {
    const result = await sketchSystem.createSketch([], []);
    if (!result.ok) {
      onToast(result.error ?? '新建草图失败', 'error');
    }
  }, [sketchSystem, onToast]);

  const handleDeleteEntity = useCallback(
    async (entityId: number) => {
      const sketch = sketchSystem.activeSketch;
      if (!sketch) return;
      const next = computeCascadeDelete(sketch.entities, sketch.constraints, entityId);
      const result = await sketchSystem.applyUpdate(next.entities, next.constraints);
      if (!result.ok) {
        onToast(result.error ?? '草图更新失败', 'error');
      }
    },
    [sketchSystem, onToast],
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
        onToast(result.error ?? '草图更新失败', 'error');
      }
    },
    [sketchSystem, onToast],
  );

  const submitDimensionEdit = useCallback(
    async (constraintId: number) => {
      const sketch = sketchSystem.activeSketch;
      if (!sketch || editSubmitting) return;
      const value = Number(editValue);
      if (!Number.isFinite(value) || value <= 0) {
        onToast('尺寸值必须为正数', 'error');
        return;
      }
      setEditSubmitting(true);
      try {
        const nextConstraints = sketch.constraints.map((c) =>
          c.id === constraintId && (c.kind === 'distance' || c.kind === 'radius') ? { ...c, value } : c,
        );
        const result = await sketchSystem.applyUpdate(sketch.entities, nextConstraints);
        if (!result.ok) {
          onToast(result.error ?? '草图更新失败', 'error');
          return;
        }
        setEditingDimensionId(null);
      } finally {
        setEditSubmitting(false);
      }
    },
    [sketchSystem, editValue, editSubmitting, onToast],
  );

  const confirmPendingDimension = useCallback(async () => {
    const sketch = sketchSystem.activeSketch;
    const pending = pendingDimension;
    if (!sketch || !pending) return;
    const value = Number(pending.value);
    if (!Number.isFinite(value) || value <= 0) {
      onToast('尺寸值必须为正数', 'error');
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
      // 拒收文本（含 dof/冲突 id）原样透出；表单保持——可改值再提交或取消
      onToast(result.error ?? '草图更新失败', 'error');
      return;
    }
    setPendingDimension(undefined);
  }, [pendingDimension, sketchSystem, onToast]);

  if (!isActive) return null;

  const failedIds = new Set([
    ...(activeSketch?.solve.failedConstraintIds ?? []),
    ...(activeSketch?.solve.conflictingRank ?? []),
  ]);
  const dimensionConstraints =
    activeSketch?.constraints.filter((c) => c.kind === 'distance' || c.kind === 'radius') ?? [];

  return (
    <div className="sketch-panel">
      {/* Header：返回/标题/DOF 徽标/冗余徽标 + 草图切换器 + 新建 + 完成 */}
      <div className="sketch-panel-header">
        <div className="sketch-header-left">
          <IconButton
            size="small"
            styleType="borderless"
            onClick={handleExitSketch}
            label="退出草图"
          >
            <SvgChevronLeft />
          </IconButton>
          <Text variant="title">草图编辑</Text>
          {activeSketch && (
            <>
              <SolveBadge solve={activeSketch.solve} />
              {activeSketch.solve.redundant && <Badge backgroundColor="warning">冗余</Badge>}
            </>
          )}
        </div>
        <Button
          size="small"
          styleType="high-visibility"
          startIcon={<SvgCheckmark />}
          onClick={handleExitSketch}
        >
          完成
        </Button>
      </div>

      <div className="sketch-panel-subheader">
        {sketches.length > 1 ? (
          <Select
            native
            size="small"
            className="sketch-switcher"
            value={activeSketch?.id ?? ''}
            options={sketches.map((s) => ({ value: s.id, label: s.id }))}
            onChange={(value) => {
              void sketchSystem.openSketch(value);
            }}
          />
        ) : (
          activeSketch && (
            <Text variant="small" className="sketch-id">
              草图: {activeSketch.id}
            </Text>
          )
        )}
        <Button size="small" onClick={() => void handleCreateSketch()}>
          新建草图
        </Button>
      </div>

      <Divider />

      {/* Tabs */}
      <div className="sketch-tabs">
        <button
          className={`sketch-tab ${activeTab === 'elements' ? 'active' : ''}`}
          onClick={() => setActiveTab('elements')}
        >
          元素
        </button>
        <button
          className={`sketch-tab ${activeTab === 'constraints' ? 'active' : ''}`}
          onClick={() => setActiveTab('constraints')}
        >
          约束
        </button>
        <button
          className={`sketch-tab ${activeTab === 'dimensions' ? 'active' : ''}`}
          onClick={() => setActiveTab('dimensions')}
        >
          尺寸
        </button>
      </div>

      {/* Content */}
      <div className="sketch-panel-content">
        {sketchSystem.loading && <Text variant="small">加载中...</Text>}
        {sketchSystem.error && (
          <Text variant="small" className="sketch-error">
            {sketchSystem.error}
          </Text>
        )}
        {!activeSketch && !sketchSystem.loading && (
          <div className="empty-state">
            <Text variant="small" className="empty-text">
              尚未打开草图
            </Text>
            <Text variant="small" className="empty-hint">
              点击「新建草图」创建空白草图
            </Text>
          </div>
        )}

        {activeSketch && activeTab === 'elements' && (
          <div className="sketch-elements">
            <div className="tool-button-row">
              {CREATE_BUTTONS.map((b) => (
                <Button
                  key={b.kind}
                  size="small"
                  onClick={() => void runSketchCreateTool(b.kind, { sketchSystem, onToast })}
                >
                  {b.label}
                </Button>
              ))}
            </div>
            <Divider />
            {activeSketch.entities.length === 0 ? (
              <div className="empty-state">
                <Text variant="small" className="empty-text">
                  暂无实体
                </Text>
                <Text variant="small" className="empty-hint">
                  使用绘制工具创建线/矩形/圆
                </Text>
              </div>
            ) : (
              <div className="element-list">
                {activeSketch.entities.map((entity) => (
                  <div key={entity.id} className="element-item">
                    <span className="element-kind">{ENTITY_KIND_LABEL[entity.kind]}</span>
                    <Text variant="body" className="element-name">
                      {entityLabel(entity)}
                    </Text>
                    <IconButton
                      size="small"
                      styleType="borderless"
                      label="删除"
                      className="sketch-row-delete"
                      onClick={() => void handleDeleteEntity(entity.id)}
                    >
                      <SvgDelete />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSketch && activeTab === 'constraints' && (
          <div className="sketch-constraints">
            <div className="tool-button-row">
              {CONSTRAINT_BUTTONS.map((b) => (
                <Button
                  key={b.kind}
                  size="small"
                  onClick={() => void runSketchAddConstraintTool(b.kind, { sketchSystem, onToast })}
                >
                  {b.label}
                </Button>
              ))}
            </div>
            <Divider />
            <Text variant="small" className="section-title">
              约束清单 ({activeSketch.constraints.length})
            </Text>
            {activeSketch.constraints.length === 0 ? (
              <Text variant="small" className="empty-hint">
                暂无约束
              </Text>
            ) : (
              <div className="constraint-list">
                {activeSketch.constraints.map((c) => (
                  <div
                    key={c.id}
                    className={`constraint-item ${failedIds.has(c.id) ? 'conflict' : ''}`}
                  >
                    <Text variant="small" className="constraint-summary">
                      {`#${c.id} ${c.kind} [${c.refs.join(',')}]`}
                    </Text>
                    <IconButton
                      size="small"
                      styleType="borderless"
                      label="删除"
                      className="sketch-row-delete"
                      onClick={() => void handleDeleteConstraint(c.id)}
                    >
                      <SvgDelete />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSketch && activeTab === 'dimensions' && (
          <div className="sketch-dimensions">
            <div className="tool-button-row">
              {DIMENSION_BUTTONS.map((b) => (
                <Button
                  key={b.kind}
                  size="small"
                  onClick={() => void runSketchAddDimensionTool(b.kind, { sketchSystem, onToast })}
                >
                  {b.label}
                </Button>
              ))}
            </div>

            {pendingDimension && (
              <div className="dimension-candidate-form">
                <Text variant="small" className="section-title">
                  确认尺寸值
                </Text>
                <Input
                  size="small"
                  type="number"
                  value={pendingDimension.value}
                  placeholder="输入尺寸值（>0）"
                  onChange={(e) =>
                    setPendingDimension({ ...pendingDimension, value: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void confirmPendingDimension();
                  }}
                />
                <div className="dimension-candidate-actions">
                  <Button size="small" styleType="high-visibility" onClick={() => void confirmPendingDimension()}>
                    确认
                  </Button>
                  <Button size="small" onClick={() => setPendingDimension(undefined)}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            <Divider />

            <Text variant="small" className="section-title">
              现有尺寸 ({dimensionConstraints.length})
            </Text>
            {dimensionConstraints.length === 0 ? (
              <Text variant="small" className="empty-hint">
                暂无尺寸标注
              </Text>
            ) : (
              <div className="dimension-list-existing">
                {dimensionConstraints.map((c) => (
                  <div key={c.id} className="dimension-item">
                    <span className="dimension-type">
                      {c.kind === 'distance' ? '距离' : '半径'}
                    </span>
                    {editingDimensionId === c.id ? (
                      <Input
                        size="small"
                        type="number"
                        className="dimension-value-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submitDimensionEdit(c.id);
                        }}
                        onBlur={() => void submitDimensionEdit(c.id)}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className="dimension-value"
                        title="点击修改尺寸值"
                        onClick={() => {
                          setEditingDimensionId(c.id);
                          setEditValue(c.value !== undefined ? String(c.value) : '');
                        }}
                      >
                        {c.value?.toFixed(2) ?? '?'}
                      </button>
                    )}
                    <IconButton
                      size="small"
                      styleType="borderless"
                      label="删除"
                      className="sketch-row-delete"
                      onClick={() => void handleDeleteConstraint(c.id)}
                    >
                      <SvgDelete />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
