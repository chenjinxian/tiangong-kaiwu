/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图值确认弹层（2026-11-03 Onshape live）：尺寸/偏移工具完成拾取后，在
 * **标注放置位置**弹出数字输入框（绿色 ✓ / 红色 ×），不再使用草图常驻面板。
 * 与 Onshape 的草图尺寸确认框同构：输入框就近放置、Enter 确认、Escape 取消。
 *
 * 事件桥仍走 sketchToolEvents（工具绝不直接提交，E-4 铁律）：本组件只收值，
 * 尺寸值 → 构造完整 {kind,id,refs,value} → useSketchSystem.applyUpdate 追加；
 * 偏移值 → 工具的 commit 回调（工具自建草稿/提交/退出）。
 *
 * W21（2026-11-16 live S1c）：候选带 `existingConstraintId`（点击已标注几何）
 * 时不再追加约束——预填 `existingValue`（显示单位）并在确认时走
 * `sketchSystem.applyConstraintValue(id, value)`（与双击内联编辑器同一路径）
 * 原地改值；拒收保留对话框与错误，取消不变，`dimensionPopupClosed` 契约不变。
 *
 * W22（2026-11-16 live）：角度候选（两条非平行线）输入/预填为**度**，确认时
 * 经 `parseConstraintEditorValue('angle', text)` 换算为契约弧度再提交；既有
 * angle 约束同样按度预填、按弧度调 `applyConstraintValue`（W21 遗留的单位
 * 换算缺口在本波关闭）。长度类仍原样提交毫米。
 *
 * 2026-11-16 W17b（live 对拍）：live 的放置弹层与双击编辑器是同一个
 * `dimension-dialog`。尺寸分支改用共享外壳 `SketchDimensionDialog`（209×47：
 * 拖拽条 + 禁用展开器 + 输入 + 禁用参数状态切换 + 按钮组；仅拖拽条可拖，
 * 方向键无选区时长 ±1 mm），可见对话框以放置点击为中心：left = anchor.x −
 * 104.5、top = anchor.y − 31（live outer card 中心 = 点击；保留旧 top ≥ 8px
 * 安全钳制）。初值 = 长度类 5 位小数 / 角度 7 位小数（去尾零）；单位后缀
 * mm / deg。偏移分支是产品扩展（live 无证据），保持原行为/旧外观，单列分支。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SketchConstraintDto, VariableDto } from '@luban-cad/shared';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { nextConstraintId } from '../tools/sketch/sketch-constraint-logic.js';
import {
  dimensionExpressionErrorI18nKey,
  evaluateDimensionInput,
  type DimensionExpressionError,
} from '../internal/sketch-dimension-expression.js';
import { expressionFailureMessage } from '../internal/expression-error-message.js';
import { formatDimensionPopupValue } from '../internal/sketch-dimension-value.js';
import type { VariableCreateRequest } from '../internal/variables.js';
import {
  sketchToolEvents,
  type SketchDimensionCandidate,
  type SketchOffsetCandidate,
  type SketchToolAnchor,
} from '../tools/sketch/sketch-tool-events.js';
import {
  DIMENSION_EDITOR_DIALOG_WIDTH,
  dimensionEditorDialogWidth,
  SketchDimensionDialog,
} from './SketchDimensionDialog.js';
import type { SketchDimensionDialogTestIds } from './SketchDimensionDialog.js';
import './SketchValuePopup.css';

export interface SketchValuePopupProps {
  sketchSystem: UseSketchSystem;
  /** 既有 Part Studio 变量（表达式预校验 + `#` 补全；缺省空表）。 */
  variables?: readonly VariableDto[];
  /**
   * ADR-0020 §2.6 D7（S3b）：未知 `#name` + Enter / 补全「新建变量…」→ 宿主
   * 打开内联创建面板；anchor 由本组件按可见值弹层右侧给出。
   */
  onCreateVariable?: (request: VariableCreateRequest) => void;
}

type Pending =
  | {
      kind: 'dimension';
      candidate: SketchDimensionCandidate;
      value: string;
      /** 打开时的初始格式化文本（方向键「未编辑」基线）。 */
      initialValue: string;
      /** 实测原始值（显示单位；未编辑时步进基线，角度为 °）。 */
      rawValue?: number;
      anchor: SketchToolAnchor;
      error?: string;
    }
  | { kind: 'offset'; candidate: SketchOffsetCandidate; value: string; anchor: SketchToolAnchor; error?: string };

const DEFAULT_ANCHOR: SketchToolAnchor = { x: 340, y: 180 };

/** 可见对话框半宽（live：以放置点击为中心 → left = anchor.x − 104.5）。 */
export const VALUE_POPUP_HALF_WIDTH = DIMENSION_EDITOR_DIALOG_WIDTH / 2;

/** 点击 → 可见对话框顶部（live outer card 中心 = 点击：top = anchor.y − 31）。 */
export const VALUE_POPUP_TOP_OFFSET = 31;

/** 顶部安全钳制（产品既有行为；live 放置边缘钳制未采，不做容器尺寸探测）。 */
export const VALUE_POPUP_MIN_TOP = 8;

/**
 * 放置弹层可见对话框位置（纯几何，2026-11-16 W17b live）：水平以放置点击
 * 为中心（209 宽 → −104.5px；ADR-0020 §2.6 D2 的 angle 159 宽 → −79.5px），
 * 垂直 = 点击 −31px；顶部保留旧 ≥8px 安全钳制。弹层绝对定位于视口容器
 *（与 anchor 同一坐标系），不新增容器尺寸钳制。
 */
export function centerValuePopupPosition(
  anchor: SketchToolAnchor,
  dialogWidth: number = DIMENSION_EDITOR_DIALOG_WIDTH,
): { left: number; top: number } {
  return {
    left: anchor.x - dialogWidth / 2,
    top: Math.max(VALUE_POPUP_MIN_TOP, anchor.y - VALUE_POPUP_TOP_OFFSET),
  };
}

/** 值弹层单位后缀：长度类 mm；角度 deg（live 输入值内单位 token）。 */
export function dimensionUnitSuffix(kind: string): 'mm' | 'deg' {
  return kind === 'angle' ? 'deg' : 'mm';
}

/** 尺寸分支与双击编辑器共用外壳，仅观测 testid 面沿用值弹层命名。 */
const VALUE_POPUP_DIALOG_TEST_IDS: SketchDimensionDialogTestIds = {
  dialog: 'sketch-value-popup',
  dragbar: 'sketch-value-dragbar',
  input: 'sketch-value-input',
  unit: 'sketch-value-unit',
  expander: 'sketch-value-expander',
  stateToggle: 'sketch-value-state-toggle',
  confirm: 'sketch-value-confirm',
  cancel: 'sketch-value-cancel',
  error: 'sketch-value-error',
};

export function SketchValuePopup({ sketchSystem, variables, onCreateVariable }: SketchValuePopupProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<Pending | undefined>(undefined);
  const [submitting, setSubmitting] = React.useState(false);
  /** 尺寸分支拖动后的可见对话框位置（容器坐标；null=锚点默认，每个候选复位）。 */
  const [dragPosition, setDragPosition] = React.useState<{ left: number; top: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const activeSketchId = sketchSystem.activeSketch?.id;
  // 候选事件在 useEffect([]) 内监听：活动草图/约束在事件时刻现场读取。
  const sketchSystemRef = React.useRef(sketchSystem);
  sketchSystemRef.current = sketchSystem;

  // 最新 pending 的镜像：closePending 零依赖读取，供草图切换 effect 判断
  // 「是否有 dimension 候选仍在等值」。
  const pendingRef = React.useRef<Pending | undefined>(undefined);
  React.useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  /**
   * 关闭值弹层（E1 链式标注第一步）：仅当关闭的候选是 dimension 时通知发
   * 候选的工具（W19 live：单尺寸工具收到 dimensionPopupClosed 后清空拾取、
   * 保持安装继续拾取；旧槽位工具退出。弹层打开期间工具保持安装并忽略画布
   * 拾取）。offset 候选由工具自持，不通知。
   * 错误路径（非法值/提交失败）不关闭、不通知，弹层保持打开。
   */
  const closePending = React.useCallback((): void => {
    const current = pendingRef.current;
    pendingRef.current = undefined;
    setPending(undefined);
    setSubmitting(false);
    setDragPosition(null);
    if (current?.kind === 'dimension') sketchToolEvents.emit('dimensionPopupClosed');
  }, []);

  React.useEffect(() => {
    const offDimension = sketchToolEvents.on('dimensionCandidate', (candidate) => {
      // W21：命中既有尺寸 → 预填约束值（显示单位；既有尺寸优先，实测值不参与）。
      // ADR-0020 S2 评审 P1：既有约束带 expression 时预填**表达式原文**，
      // 不改直接确认才不会丢设计意图（数值通道会在后端清除 expression）。
      const existingConstraint = candidate.existingConstraintId !== undefined
        ? sketchSystemRef.current.activeSketch?.constraints.find(
            (constraint) => constraint.id === candidate.existingConstraintId,
          )
        : undefined;
      const existingExpression = typeof existingConstraint?.expression === 'string'
        && existingConstraint.expression.trim() !== ''
        ? existingConstraint.expression
        : undefined;
      const existing = candidate.existingConstraintId !== undefined
        && candidate.existingValue !== undefined
        && Number.isFinite(candidate.existingValue)
        ? candidate.existingValue
        : undefined;
      const measured = existingExpression === undefined
        && existing === undefined
        && candidate.measuredValue !== undefined
        && Number.isFinite(candidate.measuredValue)
        ? candidate.measuredValue
        : undefined;
      const prefill = existing ?? measured;
      const initialValue = existingExpression
        ?? (prefill === undefined ? '' : formatDimensionPopupValue(candidate.kind, prefill));
      setPending({
        kind: 'dimension',
        candidate,
        value: initialValue,
        initialValue,
        rawValue: prefill,
        anchor: candidate.anchor ?? DEFAULT_ANCHOR,
      });
      setSubmitting(false);
      // 每个新候选都复位拖拽位移（live：新弹层回到锚点默认位置）。
      setDragPosition(null);
    });
    const offOffset = sketchToolEvents.on('offsetCandidate', (candidate) => {
      setPending({
        kind: 'offset',
        candidate,
        // 亚像素量距只做初值：保留 0.1 mm（0.0001 m）精度，避免长尾浮点噪声。
        value: String(Number(candidate.measuredDistance.toFixed(4))),
        anchor: candidate.anchor ?? DEFAULT_ANCHOR,
      });
      setSubmitting(false);
      setDragPosition(null);
    });
    return () => {
      offDimension();
      offOffset();
    };
  }, []);

  // 草图切换/退出：候选不跨草图泄漏；若关闭的是 dimension 候选，同步通知
  // 等待中的工具退出（没有候选打开时 closePending 不发射）。
  React.useEffect(() => {
    closePending();
  }, [activeSketchId, closePending]);

  // 每个新候选（含同种类连续候选）都重新聚焦并整段选中预填文本；输入过程中
  // pending.candidate 引用不变，不会抢焦点。
  const pendingCandidate = pending?.candidate;
  React.useEffect(() => {
    if (!pendingCandidate) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [pendingCandidate]);

  /**
   * 本地预校验错误文案（评审 P2；S5 本地化）：本地码 → zh/en i18n key；
   * shared 求值错误（unknownVariable/syntax/cycle/nonFinite）按结构化 detail
   * 走 `expressionFailureMessage`（不再直出中文 shared message）。
   */
  const dimensionErrorText = React.useCallback((error: DimensionExpressionError): string => {
    if (error.code === 'expression')
      return expressionFailureMessage(error, t);
    const key = dimensionExpressionErrorI18nKey(error);
    return key === undefined ? '' : t(key);
  }, [t]);

  const confirm = React.useCallback(async () => {
    const current = pending;
    if (!current || submitting) return;
    // W22 + ADR-0020 §2.6 D3：尺寸分支按**候选种类**解释输入——纯数字沿用
    // 既有口径（angle 度→弧度）；表达式由 shared 求值器预校验（有效 → value +
    // expression，invalid → 错误并保持打开）。
    let value: number | undefined;
    let expression: string | undefined;
    if (current.kind === 'dimension') {
      const evaluation = evaluateDimensionInput({
        kind: current.candidate.kind,
        text: current.value,
        variables,
      });
      if (!evaluation.ok) {
        setPending({ ...current, error: dimensionErrorText(evaluation.error) });
        return;
      }
      value = evaluation.value;
      expression = evaluation.expression;
      // 评审 P1 兜底：既有约束带 expression 且文本保持打开时原样（预填应已
      // 是表达式；此处防御候选/约束读取时序差），仍走 wholesale updateSketch。
      if (expression === undefined
        && current.value === current.initialValue
        && current.candidate.existingConstraintId !== undefined) {
        const existing = sketchSystem.activeSketch?.constraints.find(
          (constraint) => constraint.id === current.candidate.existingConstraintId,
        );
        const existingExpression = typeof existing?.expression === 'string'
          ? existing.expression.trim()
          : '';
        if (existingExpression !== '')
          expression = existingExpression;
      }
    } else {
      value = current.value.trim() === '' ? undefined : Number(current.value);
    }
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
      setPending({ ...current, error: t('partStudio.sketch.panel.errors.invalidDimension') });
      return;
    }
    setSubmitting(true);
    try {
      if (current.kind === 'dimension') {
        // W21（live S1c）：既有尺寸 → 原地改值（与双击内联编辑器同一通道）；
        // 不追加新约束，失败保留对话框并显示错误。
        // ADR-0020：表达式 → wholesale updateSketch（保留其它字段，仅替换该
        // 约束的 expression；value 旧值由后端权威覆盖，P0-05/P0-06）。
        const existingConstraintId = current.candidate.existingConstraintId;
        if (existingConstraintId !== undefined) {
          const sketch = sketchSystem.activeSketch;
          if (expression !== undefined) {
            const constraint = sketch?.constraints.find((candidate) => candidate.id === existingConstraintId);
            if (!sketch || !constraint) {
              setPending({ ...current, error: t('partStudio.sketch.panel.errors.updateFailed') });
              return;
            }
            const result = await sketchSystem.applyUpdate(
              sketch.entities,
              sketch.constraints.map((candidate) => candidate.id === existingConstraintId
                ? { ...candidate, expression }
                : candidate),
            );
            if (!result.ok) {
              setPending({
                ...current,
                error: result.error ?? t('partStudio.sketch.panel.errors.updateFailed'),
              });
              return;
            }
          } else {
            const result = await sketchSystem.applyConstraintValue(existingConstraintId, value);
            if (!result.ok) {
              setPending({
                ...current,
                error: result.error ?? t('partStudio.sketch.panel.errors.updateFailed'),
              });
              return;
            }
          }
        } else {
          const sketch = sketchSystem.activeSketch;
          if (!sketch) {
            setPending({ ...current, error: t('partStudio.sketch.panel.errors.updateFailed') });
            return;
          }
          const constraint: SketchConstraintDto = {
            kind: current.candidate.kind,
            id: nextConstraintId(sketch),
            refs: [...current.candidate.refs],
            value,
            ...(expression !== undefined ? { expression } : {}),
          };
          const result = await sketchSystem.applyUpdate(sketch.entities, [...sketch.constraints, constraint]);
          if (!result.ok) {
            setPending({
              ...current,
              error: result.error ?? t('partStudio.sketch.panel.errors.updateFailed'),
            });
            return;
          }
        }
      } else {
        const error = await current.candidate.commit(value);
        if (error) {
          setPending({ ...current, error });
          return;
        }
      }
      closePending();
    } finally {
      setSubmitting(false);
    }
  }, [closePending, dimensionErrorText, pending, sketchSystem, submitting, t, variables]);

  const cancel = React.useCallback(() => {
    if (submitting) return;
    closePending();
  }, [closePending, submitting]);

  if (!pending) return null;

  // ── 偏移分支（产品扩展；live 无证据）：保持既有行为与旧白卡外观 ──────────
  if (pending.kind === 'offset') {
    return (
      <div
        className="part-studio-sketch-value-popup"
        data-testid="sketch-value-popup"
        data-kind="offset"
        style={{ left: pending.anchor.x + 14, top: Math.max(8, pending.anchor.y - 18) }}
        role="dialog"
        aria-label={t('partStudio.sketch.panel.confirmOffsetTitle')}
      >
        <button
          type="button"
          className="part-studio-sketch-value-popup__expander"
          aria-label={t('partStudio.sketch.panel.expandExpression')}
          title={t('partStudio.featureDialog.notImplemented')}
          disabled
          data-testid="sketch-value-expander"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          ref={inputRef}
          className="part-studio-sketch-value-popup__input"
          // text + inputMode=decimal：数字键输入体验不变，但 select() 可整段选中
          // 预填值（type=number 在浏览器/jsdom 中不支持文本选择——Onshape live
          // 打开即全选）。解析/校验仍走 Number(text)。
          type="text"
          inputMode="decimal"
          value={pending.value}
          placeholder={t('partStudio.sketch.panel.dimensionPlaceholder')}
          aria-label={t('partStudio.sketch.panel.confirmOffsetTitle')}
          data-testid="sketch-value-input"
          onChange={(event) => setPending({ ...pending, value: event.target.value, error: undefined })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              void confirm();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              cancel();
            }
          }}
        />
        <button
          type="button"
          className="part-studio-sketch-value-popup__confirm"
          aria-label={t('partStudio.sketch.panel.confirm')}
          title={t('partStudio.sketch.panel.confirm')}
          disabled={submitting}
          data-testid="sketch-value-confirm"
          onClick={() => void confirm()}
        >
          <OnshapeIcon name="ok-button" size={14} />
        </button>
        <button
          type="button"
          className="part-studio-sketch-value-popup__cancel"
          aria-label={t('partStudio.sketch.panel.cancel')}
          title={t('partStudio.sketch.panel.cancel')}
          disabled={submitting}
          data-testid="sketch-value-cancel"
          onClick={cancel}
        >
          <OnshapeIcon name="cancel-button" size={14} />
        </button>
        {pending.error && (
          <span className="part-studio-sketch-value-popup__error" role="alert" data-testid="sketch-value-error">
            {pending.error}
          </span>
        )}
      </div>
    );
  }

  // ── 尺寸分支：live dimension-dialog（与双击编辑器同一外壳）──────────────
  const dimensionEvaluation = evaluateDimensionInput({
    kind: pending.candidate.kind,
    text: pending.value,
    variables,
  });
  // 评审 P3：空输入保留既有错误文案（不再因「打开即空」被抑制）；错误码经
  // i18n 映射，shared 求值错误走结构化 detail 本地化（S5）。
  const liveErrorMessage = dimensionEvaluation.ok
    ? undefined
    : dimensionErrorText(dimensionEvaluation.error);
  const dialogWidth = dimensionEditorDialogWidth(pending.candidate.kind);
  const anchorPosition = centerValuePopupPosition(pending.anchor, dialogWidth);
  /** 拖动位移每次渲染都按顶部 8px 安全钳制（不新增容器尺寸探测）。 */
  const visiblePosition = dragPosition
    ? { left: dragPosition.left, top: Math.max(VALUE_POPUP_MIN_TOP, dragPosition.top) }
    : anchorPosition;
  return (
    <SketchDimensionDialog
      testIds={VALUE_POPUP_DIALOG_TEST_IDS}
      kind={pending.candidate.kind}
      value={pending.value}
      initialValue={pending.initialValue}
      rawValue={pending.rawValue}
      unit={dimensionUnitSuffix(pending.candidate.kind)}
      error={pending.error !== undefined || !dimensionEvaluation.ok}
      invalid={!dimensionEvaluation.ok}
      errorMessage={pending.error ?? liveErrorMessage}
      variables={variables}
      onCreateVariable={onCreateVariable
        ? (request) => onCreateVariable({
            ...request,
            anchor: { x: visiblePosition.left + dialogWidth + 8, y: visiblePosition.top },
          })
        : undefined}
      busy={submitting}
      offset={visiblePosition}
      dragOrigin={visiblePosition}
      onDragPosition={setDragPosition}
      onValueChange={(value) => {
        setPending((current) => (current && current.kind === 'dimension'
          ? { ...current, value, error: undefined }
          : current));
      }}
      onConfirm={() => { void confirm(); }}
      onCancel={cancel}
      inputRef={inputRef}
      inputPlaceholder={t('partStudio.sketch.panel.dimensionPlaceholder')}
      inputAriaLabel={t('partStudio.sketch.panel.confirmDimensionTitle')}
      rootRole="dialog"
      rootAriaLabel={t('partStudio.sketch.panel.confirmDimensionTitle')}
      rootDataKind="dimension"
      zIndex={26}
    />
  );
}
