/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图工具标注提示覆盖层（2026-11-02 Onshape live）：光标旁显示阶段提示与
 * 实时尺寸（线长/角度、矩形宽高、圆/弧半径）。数据来自 sketch-tool-feedback
 * 总线——仅本组件随光标重渲染，画布/树/面板零联动。
 *
 * 纯视觉层：pointer-events:none，不参与拾取；aria-hidden（屏幕阅读器另有
 * ToolAssistance 通道）。
 */
import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getSketchToolFeedback,
  subscribeSketchToolFeedback,
} from '../tools/sketch/sketch-tool-feedback.js';
import './SketchToolFeedbackOverlay.css';

/** 光标右/下偏移；靠近画布右/下边缘时翻转到另一侧。 */
const CURSOR_OFFSET = 18;

export function SketchToolFeedbackOverlay(): React.JSX.Element | null {
  const feedback = useSyncExternalStore(
    subscribeSketchToolFeedback,
    getSketchToolFeedback,
    getSketchToolFeedback,
  );
  const { t } = useTranslation();
  if (!feedback?.cursor) return null;

  const { x, y } = feedback.cursor;
  const flipX = x > window.innerWidth - 280;
  const flipY = y > window.innerHeight - 160;
  const transform = `${flipX ? 'translateX(-100%)' : ''} ${flipY ? 'translateY(-100%)' : ''}`.trim();
  const measures = feedback.measures
    .map((measure) => `${measure.labelKey.split('.').pop()}=${measure.value}`)
    .join(';');

  return (
    <div
      className="part-studio-sketch-feedback"
      data-testid="sketch-tool-feedback"
      data-tool={feedback.toolId}
      data-measures={measures}
      style={{
        left: x + (flipX ? -CURSOR_OFFSET : CURSOR_OFFSET),
        top: y + (flipY ? -CURSOR_OFFSET : CURSOR_OFFSET),
        ...(transform ? { transform } : {}),
      }}
      aria-hidden="true"
    >
      {feedback.hint && (
        <div className="part-studio-sketch-feedback__hint">{feedback.hint}</div>
      )}
      {feedback.measures.length > 0 && (
        <div className="part-studio-sketch-feedback__measures">
          {feedback.measures.map((measure) => (
            <span key={measure.labelKey} className="part-studio-sketch-feedback__measure">
              <span className="part-studio-sketch-feedback__label">
                {t(measure.labelKey)}
              </span>
              <span className="part-studio-sketch-feedback__value" data-measure={measure.labelKey}>
                {measure.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
