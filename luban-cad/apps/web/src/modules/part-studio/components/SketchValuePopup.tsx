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

export function SketchValuePopup({ sketchSystem }: SketchValuePopupProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<Pending | undefined>(undefined);
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const activeSketchId = sketchSystem.activeSketch?.id;

  React.useEffect(() => {
    const offDimension = sketchToolEvents.on('dimensionCandidate', (candidate) => {
      setPending({ kind: 'dimension', candidate, value: '', anchor: candidate.anchor ?? DEFAULT_ANCHOR });
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

  // 草图切换/退出：候选不跨草图泄漏。
  React.useEffect(() => {
    setPending(undefined);
    setSubmitting(false);
  }, [activeSketchId]);

  React.useEffect(() => {
    if (!pending) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [pending?.kind]);

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
      setPending(undefined);
    } finally {
      setSubmitting(false);
    }
  }, [pending, sketchSystem, submitting, t]);

  const cancel = React.useCallback(() => {
    if (submitting) return;
    setPending(undefined);
  }, [submitting]);

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
      <input
        ref={inputRef}
        className="part-studio-sketch-value-popup__input"
        type="number"
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
      <button
        type="button"
        className="part-studio-sketch-value-popup__confirm"
        aria-label={t('partStudio.sketch.panel.confirm')}
        title={t('partStudio.sketch.panel.confirm')}
        disabled={submitting}
        data-testid="sketch-value-confirm"
        onClick={() => void confirm()}
      >
        ✓
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
        ×
      </button>
      {pending.error && (
        <span className="part-studio-sketch-value-popup__error" role="alert" data-testid="sketch-value-error">
          {pending.error}
        </span>
      )}
    </div>
  );
}
