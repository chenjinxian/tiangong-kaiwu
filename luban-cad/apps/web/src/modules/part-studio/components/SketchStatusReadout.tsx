/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图底部状态读数（2026-11-15 E4/S4b Onshape live）：
 * - 长度段：单条选中曲线（line 长度 / circle/arc 半径），前置小尺图标；
 * - 点段：光标在草图平面上的世界坐标（固定 mm，3 位小数）。
 *
 * live 证据：读数位于编辑器右下角，标签 `长度:` 为 13.3333px / 400 /
 * rgb(102,102,102)（`.measurement-name`），值深色、尺图标在值左侧。本产品
 * 固定 mm（不跟随文档单位英寸）。
 *
 * 纯视觉层：pointer-events:none / aria-hidden（光标坐标高频更新，不进屏幕
 * 阅读器；可访问的尺寸信息走工具 ToolAssistance）。数据由宿主注入——点来自
 * `useSketchCursorPoint`（画布局部订阅），长度来自 `store.canvas.selection`
 * 唯一权威 + 活动草图 DTO。
 *
 * 图标说明：`onshape-icons.tsx` sprite 无尺图标，按 brief 用内联 SVG 尺
 *（aria-hidden），不新增 sprite 条目。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatStatusLength,
  formatStatusPoint,
  type SketchStatusLength,
  type SketchStatusPoint,
} from '../internal/sketch-status.js';
import './SketchStatusReadout.css';

export interface SketchStatusReadoutProps {
  /** 光标世界点（mm）；null/缺省=不渲染点段。 */
  point?: SketchStatusPoint | null;
  /** 选中曲线读数（mm）；null/缺省=不渲染长度段。 */
  length?: SketchStatusLength | null;
}

/** 小尺图标（14×14，描边随 currentColor）。 */
function RulerIcon(): React.JSX.Element {
  return (
    <svg
      className="part-studio-sketch-status__ruler"
      data-testid="sketch-status-ruler"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.4 9.9 9.9 2.4l3.7 3.7-7.5 7.5z" />
      <path d="M5.6 6.2 6.8 7.4M7.5 4.3 8.7 5.5M9.4 6.2 10.6 7.4M4.3 7.9l1.2 1.2" />
    </svg>
  );
}

export function SketchStatusReadout({
  point,
  length,
}: SketchStatusReadoutProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!point && !length)
    return null;

  const lengthLabelKey = length?.kind === 'radius'
    ? 'partStudio.sketch.live.radius'
    : 'partStudio.sketch.live.length';

  return (
    <div
      className="part-studio-sketch-status"
      data-testid="sketch-status-readout"
      aria-hidden="true"
    >
      {length && (
        <span
          className="part-studio-sketch-status__segment"
          data-testid="sketch-status-length"
          data-kind={length.kind}
        >
          <span className="part-studio-sketch-status__label">{t(lengthLabelKey)}:</span>
          <RulerIcon />
          <span className="part-studio-sketch-status__value">
            {formatStatusLength(length.valueMm)}
          </span>
        </span>
      )}
      {point && (
        <span
          className="part-studio-sketch-status__segment"
          data-testid="sketch-status-point"
        >
          <span className="part-studio-sketch-status__label">
            {t('partStudio.sketch.status.point')}:
          </span>
          <span className="part-studio-sketch-status__value">{formatStatusPoint(point)}</span>
        </span>
      )}
    </div>
  );
}
