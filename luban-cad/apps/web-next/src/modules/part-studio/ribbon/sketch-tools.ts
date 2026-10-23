/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 草图模式工具注册表（M3 Task 6）——草图模式 ribbon 变身
 * （os-30：点「创建新草图」后工具 ribbon 整体切换为草图工具组）的数据源：
 * - 12 工具按 os-30 采集的三组排布（绘制 5 / 编辑 5 / 标注 2）；
 * - 与特征模式 RIBBON_TOOLS 分离注册：命令搜索（os-30 search 框禁用）与
 *   特征模式 palette 不索引草图工具；激活路由仍走 useToolActivation
 *   （未接线 toolId 由 tools.run 返回 false 打警告——真实草图工具接线时
 *   校准 id，见 ribbon-registry 文件头校准原则）；
 * - capability 统一 'sketch'（草图编辑面 ✅，M3-b 已在旧应用落地；
 *   TOOL_CAPABILITIES 已登记，capabilities.test 钉死）。
 *
 * M6-a T5（绘制 4 件接线）：sketchLine/sketchRectangle/sketchCircle/sketchArc
 * 占位 id 校准为真 toolId——Sketch.Line/Sketch.Rectangle/Sketch.CenterCircle/
 * Sketch.Arc3Point（tools/sketch/SketchCreateTool.ts，registerSketchTools 注册，
 * Ribbon 激活路由 IModelApp.tools.run 直投真启动）。
 *
 * M6-b T5（标注 8 件接线）：sketchDimension/sketchConstraint 两占位位替换为
 * 约束 6+尺寸 2 真 toolId——Sketch.Constraint.{Coincident,Horizontal,Vertical,
 * Parallel,Perpendicular,Equal} + Sketch.Dimension.{Distance,Radius}
 *（tools/sketch/SketchAddConstraintTool.ts + SketchAddDimensionTool.ts，
 * registerSketchConstraintTools/registerSketchDimensionTools 注册，同一激活
 * 路由直投）。os-30 的「标注 2」按工具展开为 8 钮（1:1 下拉归 M6-c）。
 * 其余 6 件（样条/编辑 5）占位保留，T6+ 后续任务接线。
 *
 * 图标：沿用 ribbon-registry 自制描边 SVG 同姿态（24×24，currentColor）。
 */

import React from 'react';

import type { RibbonIcon } from './ribbon-registry.js';

/** 草图工具分组（os-30 ribbon 组切分）。 */
export type SketchRibbonGroup = 'sketchDraw' | 'sketchEdit' | 'sketchAnnotate';

/** 草图工具条目（结构同 RibbonTool；group 为草图组域）。 */
export interface SketchRibbonTool {
  /** 激活 id（投 IModelApp.tools.run；接线前占位命名）。 */
  id: string;
  icon: RibbonIcon;
  /** i18n 键（partStudio.ribbon.sketchTools.*.label）。 */
  labelKey: string;
  /** 能力键（统一 sketch——草图编辑面已落地）。 */
  capability: 'sketch';
  group: SketchRibbonGroup;
}

// ── 图标字形（与 ribbon-registry 同工艺）───────────────────────────────────
const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  'aria-hidden': true,
} as const;

type SvgNode = React.ReactElement;

function icon(...children: SvgNode[]): RibbonIcon {
  const Icon: RibbonIcon = () => React.createElement('svg', SVG_PROPS, ...children);
  return Icon;
}

const el = (tag: string, props: Record<string, unknown>): SvgNode =>
  React.createElement(tag, props);

/* 线：斜线段。 */
const LineIcon = icon(el('line', { x1: 5, y1: 19, x2: 19, y2: 5 }));

/* 矩形：方框。 */
const RectangleIcon = icon(el('rect', { x: 4, y: 6, width: 16, height: 12, rx: 1 }));

/* 圆：正圆。 */
const CircleIcon = icon(el('circle', { cx: 12, cy: 12, r: 8 }));

/* 圆弧：开口弧 + 端点。 */
const ArcIcon = icon(
  el('path', { d: 'M5 19a10 10 0 0 1 14-9' }),
  el('circle', { cx: 5, cy: 19, r: 1.2 }),
  el('circle', { cx: 19, cy: 10, r: 1.2 }),
);

/* 样条：自由曲线。 */
const SplineIcon = icon(el('path', { d: 'M4 18c4 0 3-12 8-12s4 8 8 8' }));

/* 圆角：直角倒弧。 */
const SketchFilletIcon = icon(
  el('path', { d: 'M4 20V12a8 8 0 0 1 8-8h8' }),
  el('path', { d: 'M4 20h10a6 6 0 0 0 6-6V4', strokeDasharray: '2 2' }),
);

/* 修剪：交叉线 + 剪切段。 */
const TrimIcon = icon(
  el('line', { x1: 3, y1: 12, x2: 21, y2: 12 }),
  el('line', { x1: 12, y1: 3, x2: 12, y2: 21 }),
  el('path', { d: 'M8 8l8 8', strokeDasharray: '2 2' }),
);

/* 偏移：双平行线（一实一虚）。 */
const OffsetIcon = icon(
  el('path', { d: 'M6 4v16' }),
  el('path', { d: 'M12 4v16', strokeDasharray: '3 2' }),
  el('path', { d: 'M6 4l6 2M6 20l6-2' }),
);

/* 镜像：轴 + 两侧形。 */
const SketchMirrorIcon = icon(
  el('line', { x1: 12, y1: 3, x2: 12, y2: 21, strokeDasharray: '2 2' }),
  el('path', { d: 'M8 8l-3 4 3 4' }),
  el('path', { d: 'M16 8l3 4-3 4' }),
);

/* 文本：T 字。 */
const TextIcon = icon(
  el('path', { d: 'M5 6h14' }),
  el('path', { d: 'M12 6v13' }),
);

/* M6-b T5 标注 8 件图标（约束 6 + 尺寸 2）。 */

/* 重合：两重叠点环。 */
const CoincidentIcon = icon(
  el('circle', { cx: 9.5, cy: 12, r: 3 }),
  el('circle', { cx: 14.5, cy: 12, r: 3 }),
);

/* 水平：水平线段 + 端点。 */
const HorizontalIcon = icon(
  el('line', { x1: 4, y1: 12, x2: 20, y2: 12 }),
  el('circle', { cx: 4, cy: 12, r: 1.2 }),
  el('circle', { cx: 20, cy: 12, r: 1.2 }),
);

/* 竖直：竖直线段 + 端点。 */
const VerticalIcon = icon(
  el('line', { x1: 12, y1: 4, x2: 12, y2: 20 }),
  el('circle', { cx: 12, cy: 4, r: 1.2 }),
  el('circle', { cx: 12, cy: 20, r: 1.2 }),
);

/* 平行：双平行线段。 */
const ParallelIcon = icon(
  el('line', { x1: 4, y1: 9, x2: 20, y2: 9 }),
  el('line', { x1: 4, y1: 15, x2: 20, y2: 15 }),
);

/* 垂直：直角。 */
const PerpendicularIcon = icon(el('path', { d: 'M6 4v14h14' }));

/* 等长：双线段 + 中点刻度。 */
const EqualIcon = icon(
  el('line', { x1: 4, y1: 9, x2: 20, y2: 9 }),
  el('line', { x1: 4, y1: 15, x2: 20, y2: 15 }),
  el('line', { x1: 12, y1: 7, x2: 12, y2: 11 }),
  el('line', { x1: 12, y1: 13, x2: 12, y2: 17 }),
);

/* 距离尺寸：尺寸线 + 箭头 + 标注（原「尺寸」图标）。 */
const DistanceIcon = icon(
  el('line', { x1: 4, y1: 17, x2: 20, y2: 17 }),
  el('path', { d: 'M7 14l-2 3 2 3M17 14l2 3-2 3' }),
  el('line', { x1: 12, y1: 6, x2: 12, y2: 17, strokeDasharray: '2 2' }),
);

/* 半径尺寸：圆 + 半径线 + 圆心点。 */
const RadiusIcon = icon(
  el('circle', { cx: 12, cy: 12, r: 8 }),
  el('line', { x1: 12, y1: 12, x2: 17.7, y2: 6.3 }),
  el('circle', { cx: 12, cy: 12, r: 1.2 }),
);

// ── 注册表（os-30 组序：绘制 → 编辑 → 标注）────────────────────────────────

/** 草图组渲染顺序。 */
export const SKETCH_TOOL_GROUP_ORDER: readonly SketchRibbonGroup[] = [
  'sketchDraw',
  'sketchEdit',
  'sketchAnnotate',
];

/** 18 草图工具注册表（绘制 4 + 标注 8 已接线真 toolId——M6-a T5/M6-b T5，见文件头；其余占位待接）。 */
export const SKETCH_RIBBON_TOOLS: readonly SketchRibbonTool[] = [
  // 绘制 5（前 4 件 M6-a T5 接线真 toolId；样条占位）
  { id: 'Sketch.Line', icon: LineIcon, labelKey: 'partStudio.ribbon.sketchTools.line.label', capability: 'sketch', group: 'sketchDraw' },
  { id: 'Sketch.Rectangle', icon: RectangleIcon, labelKey: 'partStudio.ribbon.sketchTools.rectangle.label', capability: 'sketch', group: 'sketchDraw' },
  { id: 'Sketch.CenterCircle', icon: CircleIcon, labelKey: 'partStudio.ribbon.sketchTools.circle.label', capability: 'sketch', group: 'sketchDraw' },
  { id: 'Sketch.Arc3Point', icon: ArcIcon, labelKey: 'partStudio.ribbon.sketchTools.arc.label', capability: 'sketch', group: 'sketchDraw' },
  { id: 'sketchSpline', icon: SplineIcon, labelKey: 'partStudio.ribbon.sketchTools.spline.label', capability: 'sketch', group: 'sketchDraw' },
  // 编辑 5
  { id: 'sketchFillet', icon: SketchFilletIcon, labelKey: 'partStudio.ribbon.sketchTools.fillet.label', capability: 'sketch', group: 'sketchEdit' },
  { id: 'sketchTrim', icon: TrimIcon, labelKey: 'partStudio.ribbon.sketchTools.trim.label', capability: 'sketch', group: 'sketchEdit' },
  { id: 'sketchOffset', icon: OffsetIcon, labelKey: 'partStudio.ribbon.sketchTools.offset.label', capability: 'sketch', group: 'sketchEdit' },
  { id: 'sketchMirror', icon: SketchMirrorIcon, labelKey: 'partStudio.ribbon.sketchTools.mirror.label', capability: 'sketch', group: 'sketchEdit' },
  { id: 'sketchText', icon: TextIcon, labelKey: 'partStudio.ribbon.sketchTools.text.label', capability: 'sketch', group: 'sketchEdit' },
  // 标注 8（M6-b T5：约束 6 + 尺寸 2，占位 sketchConstraint/sketchDimension 两
  // 位按工具展开——下拉 1:1 归 M6-c）
  { id: 'Sketch.Constraint.Coincident', icon: CoincidentIcon, labelKey: 'partStudio.ribbon.sketchTools.coincident.label', capability: 'sketch', group: 'sketchAnnotate' },
  { id: 'Sketch.Constraint.Horizontal', icon: HorizontalIcon, labelKey: 'partStudio.ribbon.sketchTools.horizontal.label', capability: 'sketch', group: 'sketchAnnotate' },
  { id: 'Sketch.Constraint.Vertical', icon: VerticalIcon, labelKey: 'partStudio.ribbon.sketchTools.vertical.label', capability: 'sketch', group: 'sketchAnnotate' },
  { id: 'Sketch.Constraint.Parallel', icon: ParallelIcon, labelKey: 'partStudio.ribbon.sketchTools.parallel.label', capability: 'sketch', group: 'sketchAnnotate' },
  { id: 'Sketch.Constraint.Perpendicular', icon: PerpendicularIcon, labelKey: 'partStudio.ribbon.sketchTools.perpendicular.label', capability: 'sketch', group: 'sketchAnnotate' },
  { id: 'Sketch.Constraint.Equal', icon: EqualIcon, labelKey: 'partStudio.ribbon.sketchTools.equal.label', capability: 'sketch', group: 'sketchAnnotate' },
  { id: 'Sketch.Dimension.Distance', icon: DistanceIcon, labelKey: 'partStudio.ribbon.sketchTools.distance.label', capability: 'sketch', group: 'sketchAnnotate' },
  { id: 'Sketch.Dimension.Radius', icon: RadiusIcon, labelKey: 'partStudio.ribbon.sketchTools.radius.label', capability: 'sketch', group: 'sketchAnnotate' },
];
