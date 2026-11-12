/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 草图模式工具注册表（2026-11-02 Onshape live 重排）——
 * 草图 ribbon 变身的数据源。Onshape 草图工具栏实测 5 组（撤消/重做组之外）：
 *   特征（拉伸/旋转）｜绘制（线 拐角矩形 中心点圆 3 点圆弧 内切多边形 样条 点
 *   文本 使用 构造）｜编辑（圆角 修剪 偏移 镜像 线性阵列 插入 DXF）｜尺寸｜
 *   约束（重合 ▾ 面板：水平/竖直/平行/垂直/相等/中点/相切/固定）。
 * 18px 图标全部取 Onshape SVG symbol（onshape-icons 表），主钮/飞菜单同源。
 *
 * 已实现工具沿用既有真 toolId（Sketch.Line/Rectangle/CenterCircle/Arc3Point/
 * Spline、Offset、Constraint 家族、Dimension 家族）；Onshape UI 里未实现的按钮与变体
 * 保留图标/飞菜单但点击 no-op（SKETCH_PLACEHOLDER_IDS，useToolActivation 早退）。
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
  /** 激活 id（投 IModelApp.tools.run；未实现项在 SKETCH_PLACEHOLDER_IDS）。 */
  id: string;
  icon: RibbonIcon;
  /** i18n 键（partStudio.ribbon.sketchTools.*.label）。 */
  labelKey: string;
  /** 能力键（草图本地面 full；拉伸/旋转沿用特征 capability）。 */
  capability: string;
  group: SketchRibbonGroup;
  /** Onshape live 飞菜单（空数组=仅显示箭头，未实现）。 */
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
): SketchRibbonTool => ({ id, icon: fallbackIcon, labelKey, capability, group, dropdownItems });

const menuItem = (
  id: string,
  labelKey: string,
  capability = 'sketch',
): RibbonDropdownItem => ({ id, icon: fallbackIcon, labelKey, capability });

/** Onshape 草图组渲染顺序。 */
export const SKETCH_TOOL_GROUP_ORDER: readonly SketchRibbonGroup[] = [
  'sketchFeature',
  'sketchDraw',
  'sketchEdit',
  'sketchDimension',
  'sketchConstraint',
];

/** 尚未实现的 Onshape 草图工具/变体：保留 UI，点击无行为。 */
export const SKETCH_PLACEHOLDER_IDS: ReadonlySet<string> = new Set([
  'Sketch.Conic',
  'sketchText',
  'sketchUse',
  'sketchFillet',
  'sketchLinearPattern',
  'sketchInsertDxf',
]);

/** 20 个可见草图工具（Onshape live 1:1 顺序 + 飞菜单内容）。 */
export const SKETCH_RIBBON_TOOLS: readonly SketchRibbonTool[] = [
  // 特征组（草图内可用）
  tool('extrude', 'partStudio.ribbon.tools.extrude.label', 'sketchFeature', 'extrude'),
  tool('revolve', 'partStudio.ribbon.tools.revolve.label', 'sketchFeature', 'revolve'),

  // 绘制组（10 钮）。Onshape live 截图：线/使用主钮均带 ▾（变体未实现，
  // 空数组=保留箭头 UI）；矩形/圆/弧/多边形/样条飞菜单已列变体。
  tool('Sketch.Line', 'partStudio.ribbon.sketchTools.line.label', 'sketchDraw', 'sketch', []),
  tool('Sketch.Rectangle', 'partStudio.ribbon.sketchTools.rectangle.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.CenterRectangle', 'partStudio.ribbon.sketchTools.rectangleCenter.label'),
    menuItem('Sketch.AlignedRectangle', 'partStudio.ribbon.sketchTools.rectangleAligned.label'),
  ]),
  tool('Sketch.CenterCircle', 'partStudio.ribbon.sketchTools.circle.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.PerimeterCircle', 'partStudio.ribbon.sketchTools.circlePerimeter.label'),
  ]),
  tool('Sketch.Arc3Point', 'partStudio.ribbon.sketchTools.arc.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.CenterArc', 'partStudio.ribbon.sketchTools.arcCenter.label'),
    menuItem('Sketch.TangentArc', 'partStudio.ribbon.sketchTools.arcTangent.label'),
  ]),
  tool('sketchInscribedPolygon', 'partStudio.ribbon.sketchTools.polygon.label', 'sketchDraw', 'sketch', [
    menuItem('sketchCircumscribedPolygon', 'partStudio.ribbon.sketchTools.polygonCircumscribed.label'),
  ]),
  tool('Sketch.Spline', 'partStudio.ribbon.sketchTools.spline.label', 'sketchDraw', 'sketch', [
    menuItem('Sketch.Bezier', 'partStudio.ribbon.sketchTools.splineBezier.label'),
    menuItem('Sketch.Conic', 'partStudio.ribbon.sketchTools.splineConic.label'),
  ]),
  tool('Sketch.Point', 'partStudio.ribbon.sketchTools.point.label', 'sketchDraw'),
  tool('sketchText', 'partStudio.ribbon.sketchTools.text.label', 'sketchDraw'),
  tool('sketchUse', 'partStudio.ribbon.sketchTools.use.label', 'sketchDraw', 'sketch', []),
  tool('sketchConstruction', 'partStudio.ribbon.sketchTools.construction.label', 'sketchDraw'),

  // 编辑组（6 钮）
  tool('sketchFillet', 'partStudio.ribbon.sketchTools.fillet.label', 'sketchEdit', 'sketch', []),
  tool('sketchTrim', 'partStudio.ribbon.sketchTools.trim.label', 'sketchEdit', 'sketch', [
    menuItem('sketchExtend', 'partStudio.ribbon.sketchTools.extend.label'),
  ]),
  tool('Sketch.Offset', 'partStudio.ribbon.sketchTools.offset.label', 'sketchEdit', 'sketch', []),
  tool('Sketch.Mirror', 'partStudio.ribbon.sketchTools.mirror.label', 'sketchEdit', 'sketch'),
  tool('sketchLinearPattern', 'partStudio.ribbon.sketchTools.linearPattern.label', 'sketchEdit', 'sketch', []),
  tool('sketchInsertDxf', 'partStudio.ribbon.sketchTools.insertDxf.label', 'sketchEdit', 'sketch', []),

  // 尺寸组（Onshape 单钮，无下拉：同一个尺寸工具按拾取动态推断长度/半径/距离）
  tool('Sketch.Dimension', 'partStudio.ribbon.sketchTools.dimension.label', 'sketchDimension'),

  // 约束组（1 钮 + 8 约束飞菜单）
  tool('Sketch.Constraint.Coincident', 'partStudio.ribbon.sketchTools.coincident.label', 'sketchConstraint', 'sketch', [
    menuItem('Sketch.Constraint.Horizontal', 'partStudio.ribbon.sketchTools.horizontal.label'),
    menuItem('Sketch.Constraint.Vertical', 'partStudio.ribbon.sketchTools.vertical.label'),
    menuItem('Sketch.Constraint.Parallel', 'partStudio.ribbon.sketchTools.parallel.label'),
    menuItem('Sketch.Constraint.Perpendicular', 'partStudio.ribbon.sketchTools.perpendicular.label'),
    menuItem('Sketch.Constraint.Equal', 'partStudio.ribbon.sketchTools.equal.label'),
    menuItem('Sketch.Constraint.Midpoint', 'partStudio.ribbon.sketchTools.midpoint.label'),
    menuItem('Sketch.Constraint.Tangent', 'partStudio.ribbon.sketchTools.tangent.label'),
    menuItem('Sketch.Constraint.Fixed', 'partStudio.ribbon.sketchTools.fixed.label'),
  ]),
];
