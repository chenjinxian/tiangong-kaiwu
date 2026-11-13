/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 草图模式工具注册表（2026-11-13 live 全量对拍：私有
 * `ui-evidence/toolbar-audit-20261113/20-23-*`）——草图 ribbon 变身的数据源。
 * Onshape 草图工具栏 5 组（撤消/重做组之外）：
 *   特征（拉伸/旋转）｜绘制（线 拐角矩形 中心点圆 三点圆弧 内接多边形 样条 点
 *   文本 使用 构造）｜编辑（草图圆角 修剪 偏移 镜像 线性阵列 插入 DXF）｜尺寸｜
 *   约束（重合 ▾：同心/平行/相切/水平/竖直/垂直/等长/中点/法向/穿透/对称/
 *   固定/曲率/草图流）。
 * 主钮 tooltip 与飞菜单父行文案在 live 中有四处不同：三点圆弧/3 点圆弧、
 * 草图圆角/圆角、内接多边形/内切多边形、使用（投影/转换）/使用——用
 * `menuLabelKey` 分别承载。快捷键逐字对齐（l/g/c/a/shift+s/u/q/shift+f/m/o/d/i
 * + 约束与变体 keycap）。
 *
 * 已实现工具沿用既有真 toolId（Sketch.Line/Rectangle/CenterCircle/Arc3Point/
 * Spline、Offset、Constraint 家族、Dimension 家族）；未实现的 live 项登记
 * gated 能力（点击开能力引导说明真实原因，不静默 no-op）。
 */

import type { RibbonDropdownItem, RibbonIcon } from './ribbon-registry.js';

/** 草图工具分组（Onshape live 五组）。 */
export type SketchRibbonGroup =
  | 'sketchFeature'
  | 'sketchDraw'
  | 'sketchEdit'
  | 'sketchDimension'
  | 'sketchConstraint';

/** 草图工具条目（结构同 RibbonTool；group 为草图组域）。 */
export interface SketchRibbonTool {
  /** 激活 id（投 IModelApp.tools.run；未实现项登记 gated 能力）。 */
  id: string;
  icon: RibbonIcon;
  /** i18n 键（partStudio.ribbon.sketchTools.*.label）。 */
  labelKey: string;
  /** 飞菜单父行文案键（缺省 labelKey；live 里圆弧/圆角/多边形/使用四项不同）。 */
  menuLabelKey?: string;
  /** 快捷键（live 2026-11-13：l/g/c/a/shift+s/u/q/shift+f/m/o/d/i）。 */
  shortcut?: string;
  /** 能力键（草图本地面 full；拉伸/旋转沿用特征 capability）。 */
  capability: string;
  group: SketchRibbonGroup;
  /** Onshape live 飞菜单（父行由 RibbonDropdown 前置；此数组=变体）。 */
  dropdownItems?: readonly RibbonDropdownItem[];
}

/** 图标由 onshape-icons 映射（ribbon-registry ONSHAPE_TOOL_ICONS）统一渲染。 */
const fallbackIcon: RibbonIcon = () => null;

const tool = (
  id: string,
  labelKey: string,
  group: SketchRibbonGroup,
  capability = 'sketch',
  dropdownItems?: readonly RibbonDropdownItem[],
  shortcut?: string,
  menuLabelKey?: string,
): SketchRibbonTool => ({ id, icon: fallbackIcon, labelKey, group, capability, dropdownItems, shortcut, menuLabelKey });

const menuItem = (
  id: string,
  labelKey: string,
  capability = 'sketch',
  shortcut?: string,
): RibbonDropdownItem => ({ id, icon: fallbackIcon, labelKey, capability, shortcut });

/** Onshape 草图组渲染顺序。 */
export const SKETCH_TOOL_GROUP_ORDER: readonly SketchRibbonGroup[] = [
  'sketchFeature',
  'sketchDraw',
  'sketchEdit',
  'sketchDimension',
  'sketchConstraint',
];

/**
 * 尚未实现的 Onshape 草图工具/变体（2026-11-13 起统一登记 gated 能力，点击开
 * 能力引导说明真实原因；空集保留以兼容既有引用）。
 */
export const SKETCH_PLACEHOLDER_IDS: ReadonlySet<string> = new Set<string>();

/**
 * 20 个可见草图工具（2026-11-13 live 逐字对拍：标签/快捷键/飞菜单变体）。
 * 飞菜单父行由 RibbonDropdown 自动前置（=主工具），以下数组只列变体。
 * `menuLabelKey` 仅用于 live 中工具栏 tooltip 与菜单父行文案不同的四项。
 */
export const SKETCH_RIBBON_TOOLS: readonly SketchRibbonTool[] = [
  // 特征组（草图内可用）
  tool('extrude', 'partStudio.ribbon.tools.extrude.label', 'sketchFeature', 'extrude', undefined, 'shift+e'),
  tool('revolve', 'partStudio.ribbon.tools.revolve.label', 'sketchFeature', 'revolve', undefined, 'shift+w'),

  // 绘制组（10 钮）
  tool('Sketch.Line', 'partStudio.ribbon.sketchTools.line.label', 'sketchDraw', 'sketch', [
    menuItem('sketchMidline', 'partStudio.ribbon.sketchTools.midline.label', 'sketchMidline'),
  ], 'l'),
  tool('Sketch.Rectangle', 'partStudio.ribbon.sketchTools.rectangle.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.CenterRectangle', 'partStudio.ribbon.sketchTools.rectangleCenter.label', 'sketch', 'r'),
    menuItem('Sketch.AlignedRectangle', 'partStudio.ribbon.sketchTools.rectangleAligned.label'),
  ], 'g'),
  tool('Sketch.CenterCircle', 'partStudio.ribbon.sketchTools.circle.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.PerimeterCircle', 'partStudio.ribbon.sketchTools.circlePerimeter.label'),
    menuItem('sketchEllipse', 'partStudio.ribbon.sketchTools.ellipse.label', 'sketchEllipse'),
  ], 'c'),
  tool('Sketch.Arc3Point', 'partStudio.ribbon.sketchTools.arc.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.TangentArc', 'partStudio.ribbon.sketchTools.arcTangent.label'),
    menuItem('Sketch.CenterArc', 'partStudio.ribbon.sketchTools.arcCenter.label'),
    menuItem('sketchEllipseArc', 'partStudio.ribbon.sketchTools.ellipseArc.label', 'sketchEllipseArc'),
    menuItem('Sketch.Conic', 'partStudio.ribbon.sketchTools.conic.label', 'sketchConic'),
  ], 'a', 'partStudio.ribbon.sketchTools.arcMenu.label'),
  tool('sketchInscribedPolygon', 'partStudio.ribbon.sketchTools.polygon.label', 'sketchDraw', 'sketch', [
    menuItem('sketchCircumscribedPolygon', 'partStudio.ribbon.sketchTools.polygonCircumscribed.label'),
  ], undefined, 'partStudio.ribbon.sketchTools.polygonMenu.label'),
  tool('Sketch.Spline', 'partStudio.ribbon.sketchTools.spline.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.Bezier', 'partStudio.ribbon.sketchTools.splineBezier.label'),
    menuItem('sketchSplineControlPoints', 'partStudio.ribbon.sketchTools.splineControlPoints.label', 'sketchSplineControlPoints'),
  ]),
  tool('Sketch.Point', 'partStudio.ribbon.sketchTools.point.label', 'sketchDraw', 'sketch', undefined, 'shift+s'),
  tool('sketchText', 'partStudio.ribbon.sketchTools.text.label', 'sketchDraw', 'sketchText'),
  tool('sketchUse', 'partStudio.ribbon.sketchTools.use.label', 'sketchDraw', 'sketch', [
    menuItem('sketchIntersection', 'partStudio.ribbon.sketchTools.intersection.label', 'sketchIntersection'),
  ], 'u', 'partStudio.ribbon.sketchTools.useMenu.label'),
  tool('sketchConstruction', 'partStudio.ribbon.sketchTools.construction.label', 'sketchDraw', 'sketch', undefined, 'q'),

  // 编辑组（6 钮）
  tool('sketchFillet', 'partStudio.ribbon.sketchTools.fillet.label', 'sketchEdit', 'sketch', [
    menuItem('sketchChamfer', 'partStudio.ribbon.sketchTools.chamfer.label', 'sketchChamfer'),
  ], 'shift+f', 'partStudio.ribbon.sketchTools.filletMenu.label'),
  tool('sketchTrim', 'partStudio.ribbon.sketchTools.trim.label', 'sketchEdit', 'sketch', [
    menuItem('sketchExtend', 'partStudio.ribbon.sketchTools.extend.label', 'sketch', 'x'),
    menuItem('sketchSplit', 'partStudio.ribbon.sketchTools.split.label'),
  ], 'm'),
  tool('Sketch.Offset', 'partStudio.ribbon.sketchTools.offset.label', 'sketchEdit', 'sketch', [
    menuItem('sketchSlot', 'partStudio.ribbon.sketchTools.slot.label', 'sketchSlot'),
  ], 'o'),
  tool('Sketch.Mirror', 'partStudio.ribbon.sketchTools.mirror.label', 'sketchEdit', 'sketch'),
  tool('sketchLinearPattern', 'partStudio.ribbon.sketchTools.linearPattern.label', 'sketchEdit', 'sketch', [
    menuItem('sketchCircularPattern', 'partStudio.ribbon.sketchTools.circularPattern.label'),
    menuItem('sketchTransform', 'partStudio.ribbon.sketchTools.transform.label'),
  ]),
  tool('sketchInsertDxf', 'partStudio.ribbon.sketchTools.insertDxf.label', 'sketchEdit', 'sketch', [
    menuItem('sketchInsertImage', 'partStudio.ribbon.sketchTools.insertImage.label', 'sketchInsertImage'),
  ]),

  // 尺寸组（Onshape 单钮：同一个尺寸工具按拾取动态推断长度/半径/距离）
  tool('Sketch.Dimension', 'partStudio.ribbon.sketchTools.dimension.label', 'sketchDimension', 'sketch', undefined, 'd'),

  // 约束组（父行=重合；变体顺序/快捷键与 live 逐字一致）
  tool('Sketch.Constraint.Coincident', 'partStudio.ribbon.sketchTools.coincident.label', 'sketchConstraint', 'sketch', [
    menuItem('Sketch.Constraint.Concentric', 'partStudio.ribbon.sketchTools.concentric.label', 'sketchConcentric', 'shift+o'),
    menuItem('Sketch.Constraint.Parallel', 'partStudio.ribbon.sketchTools.parallel.label', 'sketch', 'b'),
    menuItem('Sketch.Constraint.Tangent', 'partStudio.ribbon.sketchTools.tangent.label', 'sketch', 't'),
    menuItem('Sketch.Constraint.Horizontal', 'partStudio.ribbon.sketchTools.horizontal.label', 'sketch', 'h'),
    menuItem('Sketch.Constraint.Vertical', 'partStudio.ribbon.sketchTools.vertical.label', 'sketch', 'v'),
    menuItem('Sketch.Constraint.Perpendicular', 'partStudio.ribbon.sketchTools.perpendicular.label', 'sketch', 'shift+l'),
    menuItem('Sketch.Constraint.Equal', 'partStudio.ribbon.sketchTools.equal.label', 'sketch', 'e'),
    menuItem('Sketch.Constraint.Midpoint', 'partStudio.ribbon.sketchTools.midpoint.label', 'sketch', 'shift+m'),
    menuItem('Sketch.Constraint.Normal', 'partStudio.ribbon.sketchTools.normal.label', 'sketchNormal', 'shift+k'),
    menuItem('Sketch.Constraint.Pierce', 'partStudio.ribbon.sketchTools.pierce.label', 'sketchPierce', 'shift+g'),
    menuItem('Sketch.Constraint.Symmetric', 'partStudio.ribbon.sketchTools.symmetric.label', 'sketchSymmetric', 'shift+q'),
    menuItem('Sketch.Constraint.Fixed', 'partStudio.ribbon.sketchTools.fixed.label', 'sketch', 'shift+j'),
    menuItem('Sketch.Constraint.Curvature', 'partStudio.ribbon.sketchTools.curvature.label', 'sketchCurvature', 'shift+u'),
    menuItem('sketchFlow', 'partStudio.ribbon.sketchTools.sketchFlow.label', 'sketchFlow'),
  ], 'i'),
];
