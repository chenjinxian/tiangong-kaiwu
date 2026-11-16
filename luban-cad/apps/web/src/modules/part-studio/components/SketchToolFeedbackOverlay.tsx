/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图工具标注提示覆盖层（2026-11-02 Onshape live）：阶段提示与光标旁实时尺寸
 * （线长/角度、矩形宽高、圆/弧半径）。数据来自 sketch-tool-feedback 总线——
 * 仅本组件随光标重渲染，画布/树/面板零联动。
 *
 * 2026-11-15 E4 live 校准：Onshape 的阶段提示是顶部居中浅蓝 pill（镜像工具
 * 实测：~180×27、底 #e2f0fa、字 #1c4070 13px、圆角 4px、ⓘ 图标），不是光标
 * 旁白卡片的一部分；光标旁卡片只保留实时尺寸（无尺寸不渲染白卡片）。
 *
 * 2026-11-16 E6/S5 live：矩形拖拽时宽/高数值直接贴在对应边旁（蓝字
 * #4a90e2 13.3333px、无底色/描边/引线、随边旋转且保持正立），不再进白卡片。
 *
 * 纯视觉层：pointer-events:none，不参与拾取；aria-hidden（屏幕阅读器另有
 * ToolAssistance 通道）。
 */
import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { layoutSketchEdgeLabel } from '../tools/sketch/sketch-edge-labels.js';
import {
  getSketchToolFeedback,
  subscribeSketchToolFeedback,
} from '../tools/sketch/sketch-tool-feedback.js';
import './SketchToolFeedbackOverlay.css';

/** 光标右/下偏移；靠近画布右/下边缘时翻转到另一侧。 */
const CURSOR_OFFSET = 18;

/** 顶部居中阶段提示 pill 的 ⓘ 图标（14px 圆环 + 竖干，颜色随 currentColor）。 */
function HintInfoIcon(): React.JSX.Element {
  return (
    <svg
      className="part-studio-sketch-hint-pill__icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
      <path
        d="M8 7.1v4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SketchToolFeedbackOverlay(): React.JSX.Element | null {
  const feedback = useSyncExternalStore(
    subscribeSketchToolFeedback,
    getSketchToolFeedback,
    getSketchToolFeedback,
  );
  const { t } = useTranslation();
  if (!feedback) return null;

  const hintPill = feedback.hint ? (
    <div
      className="part-studio-sketch-hint-pill"
      data-testid="sketch-tool-hint"
      data-tool={feedback.toolId}
      aria-hidden="true"
    >
      <HintInfoIcon />
      <span className="part-studio-sketch-hint-pill__text">{feedback.hint}</span>
    </div>
  ) : null;

  // 2026-11-15 E3 Onshape live：草图圆角悬停角点的橙色圆点 + R 标签。只读
  // 视觉层（pointer-events:none / aria-hidden），与光标坐标同一 CSS px 空间。
  const badge = feedback.badge ? (
    <div
      className="part-studio-sketch-hint-badge"
      data-testid="sketch-tool-badge"
      data-tool={feedback.toolId}
      style={{ left: feedback.badge.x, top: feedback.badge.y }}
      aria-hidden="true"
    >
      <span className="part-studio-sketch-hint-badge__dot" />
      <span className="part-studio-sketch-hint-badge__label">{feedback.badge.text}</span>
    </div>
  ) : null;

  // 2026-11-16 E6/S5 Onshape live：矩形拖拽的宽/高贴在对应边旁。位置=边中点
  // 沿法线外移（背离矩形内部），文字随边旋转并归一到 (−90°, 90°] 保持正立。
  // 内部参考点取两条边中点的平均（凸四边形内部），避免第三次投影。
  const edgeLabels = feedback.edgeLabels ?? [];
  const edgeMidpoints = edgeLabels.map((label) => ({
    x: (label.start.x + label.end.x) / 2,
    y: (label.start.y + label.end.y) / 2,
  }));
  const interior = edgeMidpoints.length > 0
    ? {
        x: edgeMidpoints.reduce((sum, point) => sum + point.x, 0) / edgeMidpoints.length,
        y: edgeMidpoints.reduce((sum, point) => sum + point.y, 0) / edgeMidpoints.length,
      }
    : undefined;
  // 先布局再决定渲染哪些：零长度（投影退化）边没有标签。
  const renderedEdgeLabels = edgeLabels.flatMap((label) => {
    const layout = layoutSketchEdgeLabel(label.start, label.end, interior);
    return layout ? [{ label, layout }] : [];
  });
  // 白卡片的抑制集只能来自**实际渲染**的边标签：折叠的边没有标签时，对应
  // measure 必须回落到白卡片，不得静默消失（2026-11-16 W11 review）。
  const edgeLabelKeys = new Set(renderedEdgeLabels.map(({ label }) => label.labelKey));
  const edgeLabelNodes = renderedEdgeLabels.map(({ label, layout }) => {
    const suffix = label.labelKey.split('.').pop() ?? 'value';
    return (
      <span
        key={label.labelKey}
        className="part-studio-sketch-edge-label"
        data-testid={`sketch-draw-edge-label-${suffix}`}
        data-edge-label={label.labelKey}
        style={{
          left: layout.x,
          top: layout.y,
          transform: `translate(-50%, -50%) rotate(${layout.angleDeg}deg)`,
        }}
        aria-hidden="true"
      >
        {label.value}
      </span>
    );
  });

  // 光标旁卡片只承载实时尺寸：无尺寸（或没有光标）时不渲染空白卡片。
  // 已贴边的数值不再重复进白卡片（2026-11-16 E6/S5）。
  let measuresCard: React.JSX.Element | null = null;
  const cursor = feedback.cursor;
  const cardMeasures = feedback.measures.filter((measure) => !edgeLabelKeys.has(measure.labelKey));
  if (cursor && cardMeasures.length > 0) {
    const { x, y } = cursor;
    const flipX = x > window.innerWidth - 280;
    const flipY = y > window.innerHeight - 160;
    const transform = `${flipX ? 'translateX(-100%)' : ''} ${flipY ? 'translateY(-100%)' : ''}`.trim();
    const measures = cardMeasures
      .map((measure) => `${measure.labelKey.split('.').pop()}=${measure.value}`)
      .join(';');

    measuresCard = (
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
        <div className="part-studio-sketch-feedback__measures">
          {cardMeasures.map((measure) => (
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
      </div>
    );
  }

  if (!hintPill && !measuresCard && !badge && edgeLabelNodes.length === 0) return null;
  return (
    <>
      {hintPill}
      {badge}
      {edgeLabelNodes}
      {measuresCard}
    </>
  );
}
