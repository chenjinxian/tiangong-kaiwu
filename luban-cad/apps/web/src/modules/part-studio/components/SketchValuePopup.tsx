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
import type { SketchConstraintDto } from '@luban-cad/shared';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { nextConstraintId } from '../tools/sketch/sketch-constraint-logic.js';
import { formatDimensionPopupValue } from '../internal/sketch-dimension-value.js';
import {
  sketchToolEvents,
  type SketchDimensionCandidate,
  type SketchOffsetCandidate,
  type SketchToolAnchor,
} from '../tools/sketch/sketch-tool-events.js';
import { DIMENSION_EDITOR_DIALOG_WIDTH, SketchDimensionDialog } from './SketchDimensionDialog.js';
import type { SketchDimensionDialogTestIds } from './SketchDimensionDialog.js';
import './SketchValuePopup.css';

export interface SketchValuePopupProps {
  sketchSystem: UseSketchSystem;
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
 * 为中心（−104.5px），垂直 = 点击 −31px；顶部保留旧 ≥8px 安全钳制。
 * 弹层绝对定位于视口容器（与 anchor 同一坐标系），不新增容器尺寸钳制。
 */
export function centerValuePopupPosition(anchor: SketchToolAnchor): { left: number; top: number } {
  return {
    left: anchor.x - VALUE_POPUP_HALF_WIDTH,
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

export function SketchValuePopup({ sketchSystem }: SketchValuePopupProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<Pending | undefined>(undefined);
  const [submitting, setSubmitting] = React.useState(false);
  /** 尺寸分支拖动后的可见对话框位置（容器坐标；null=锚点默认，每个候选复位）。 */
  const [dragPosition, setDragPosition] = React.useState<{ left: number; top: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const activeSketchId = sketchSystem.activeSketch?.id;

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
      // Onshape live：尺寸弹层预填实测值并整段选中；几何不可测时保持空输入。
      const measured = candidate.measuredValue !== undefined && Number.isFinite(candidate.measuredValue)
        ? candidate.measuredValue
        : undefined;
      const initialValue = measured === undefined ? '' : formatDimensionPopupValue(candidate.kind, measured);
      setPending({
        kind: 'dimension',
        candidate,
        value: initialValue,
        initialValue,
        rawValue: measured,
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

  const confirm = React.useCallback(async () => {
    const current = pending;
    if (!current || submitting) return;
    const value = Number(current.value);
    if (current.value.trim() === '' || !Number.isFinite(value) || value <= 0) {
      setPending({ ...current, error: t('partStudio.sketch.panel.errors.invalidDimension') });
      return;
    }
    setSubmitting(true);
    try {
      if (current.kind === 'dimension') {
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
        };
        const result = await sketchSystem.applyUpdate(sketch.entities, [...sketch.constraints, constraint]);
        if (!result.ok) {
          setPending({
            ...current,
            error: result.error ?? t('partStudio.sketch.panel.errors.updateFailed'),
          });
          return;
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
  }, [closePending, pending, sketchSystem, submitting, t]);

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
  const anchorPosition = centerValuePopupPosition(pending.anchor);
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
      error={pending.error !== undefined}
      errorMessage={pending.error}
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
