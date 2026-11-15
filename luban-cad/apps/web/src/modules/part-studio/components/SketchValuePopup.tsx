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
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SketchConstraintDto } from '@luban-cad/shared';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { nextConstraintId } from '../tools/sketch/sketch-constraint-logic.js';
import {
  sketchToolEvents,
  type SketchDimensionCandidate,
  type SketchOffsetCandidate,
  type SketchToolAnchor,
} from '../tools/sketch/sketch-tool-events.js';
import './SketchValuePopup.css';

export interface SketchValuePopupProps {
  sketchSystem: UseSketchSystem;
}

type Pending =
  | { kind: 'dimension'; candidate: SketchDimensionCandidate; value: string; anchor: SketchToolAnchor; error?: string }
  | { kind: 'offset'; candidate: SketchOffsetCandidate; value: string; anchor: SketchToolAnchor; error?: string };

const DEFAULT_ANCHOR: SketchToolAnchor = { x: 340, y: 180 };

/**
 * 实测值预填文本：4 位小数去尾零（与偏移初值同口径；Onshape live 弹层为
 * 6 dp 显示，但画布标注 4 dp——这里保持产品既有精度）。
 */
function formatMeasuredValue(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** 值弹层单位后缀：产品固定 mm；角度候选（预留通道）显示 °。 */
export function dimensionUnitSuffix(kind: string): 'mm' | '°' {
  return kind === 'angle' ? '°' : 'mm';
}

export function SketchValuePopup({ sketchSystem }: SketchValuePopupProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<Pending | undefined>(undefined);
  const [submitting, setSubmitting] = React.useState(false);
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
   * 候选的工具（工具收到 dimensionPopupClosed 才 exitTool；弹层打开期间
   * 工具保持安装并忽略画布拾取）。offset 候选由工具自持，不通知。
   * 错误路径（非法值/提交失败）不关闭、不通知，弹层保持打开。
   */
  const closePending = React.useCallback((): void => {
    const current = pendingRef.current;
    pendingRef.current = undefined;
    setPending(undefined);
    setSubmitting(false);
    if (current?.kind === 'dimension') sketchToolEvents.emit('dimensionPopupClosed');
  }, []);

  React.useEffect(() => {
    const offDimension = sketchToolEvents.on('dimensionCandidate', (candidate) => {
      setPending({
        kind: 'dimension',
        candidate,
        // Onshape live：尺寸弹层预填实测值并整段选中；几何不可测时保持空输入。
        value: candidate.measuredValue !== undefined && Number.isFinite(candidate.measuredValue)
          ? formatMeasuredValue(candidate.measuredValue)
          : '',
        anchor: candidate.anchor ?? DEFAULT_ANCHOR,
      });
      setSubmitting(false);
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

  return (
    <div
      className="part-studio-sketch-value-popup"
      data-testid="sketch-value-popup"
      data-kind={pending.kind}
      style={{ left: pending.anchor.x + 14, top: Math.max(8, pending.anchor.y - 18) }}
      role="dialog"
      aria-label={
        pending.kind === 'dimension'
          ? t('partStudio.sketch.panel.confirmDimensionTitle')
          : t('partStudio.sketch.panel.confirmOffsetTitle')
      }
    >
      {/* live 2026-11-15：输入框左侧 20×20 展开箭头（该尺寸非表达式时禁用，
          灰 #d7d7d7）。产品无表达式通道 → 诚实禁用。 */}
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
        aria-label={
          pending.kind === 'dimension'
            ? t('partStudio.sketch.panel.confirmDimensionTitle')
            : t('partStudio.sketch.panel.confirmOffsetTitle')
        }
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
      {pending.kind === 'dimension' && (
        <span className="part-studio-sketch-value-popup__unit" data-testid="sketch-value-unit" aria-hidden="true">
          {dimensionUnitSuffix(pending.candidate.kind)}
        </span>
      )}
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
