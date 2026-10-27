/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 工具 ribbon 注册表（M3 Task 4）——ribbon 渲染层与命令搜索
 * 的唯一数据源（os-11/os-20 采集对齐；M6-c T5 分组序权威升级）：
 * - 27 工具按 Onshape 主工具栏分组序在册——**分组序权威 = diag-tools.json
 *  （2026-10-23 Tutorial 2 实测采集）：撤消重做｜草图｜拉伸 旋转 扫掠 放样
 *   加厚▾｜圆角▾ 倒角 拔模▾ 筋 抽壳 孔 外部螺纹｜线性阵列▾ 镜像｜布尔运算
 *   分割 变换▾ 删除零件｜修改圆角 删除面 移动面 替换面｜平面▾｜框架▾｜
 *   钣金模型▾｜添加自定义特征**。两处刻意缺席（工具集不变裁决）：①撤消/重做
 *   归顶栏操作簇（本仓 M4-T4 装配，不入 ribbon）；②筋（Rib）未注册（未接线
 *   占位不入册）。surfaceCurve 组=本仓扩充（UI-INVENTORY §2.2 曲面/曲线大全，
 *   Onshape 主工具栏无此独立组），钉在末位。8 个下拉飞菜单（加厚/圆角/拔模/
 *   线性阵列/变换/框架/钣金模型/曲面曲线组）携全量子项（os-20 txt 证据逐项
 *   对账）；
 * - id 校准原则（T2 挂账「gated toolId 暂定命名待 T4 校准」收口）：已有
 *   真实 iTwin 工具的 8 项沿用旧应用 toolId（CadToolbar.tsx 取证：
 *   SweepFaces/RoundEdges/ChamferEdges/DraftFaces/HollowFaces/CreateHole/
 *   MirrorElements/LinearPattern）——useToolActivation 直投
 *   IModelApp.tools.run 即可真激活；其余未接线命令用 Onshape command-id
 *   （newSketch/extrude/…/USER_FEATURES），后续里程碑接线时替换或映射；
 *   B3 注：SweepFaces 虽仍是真实直改工具 id，但参数化特征链入口已在
 *   B5 注：LinearPattern/CircularPattern（下拉子项）同姿态改道 new/pattern 对话框
 *   （PART/body 级参数化阵列——count/spacing/angle/axis）；curvePattern 无工具/后端面，
 *   capability 翻 gated（点击走能力引导，不再伪 toolId 静默失败）。
 *   useToolActivation 特例改道 new/sweep 对话框（同 extrude/revolve/loft/
 *   RoundEdges 姿态；直改通道后续按需单裁入口）；
 * - capability 维度消费 internal/capabilities（gated 照常可点 → 能力引导
 *   对话框；本注册表引用的 capability 键已全量入册 TOOL_CAPABILITIES）；
 * - 图标：官方 @itwin/itwin-icons 无对应字形，自制描边 SVG（旧应用
 *   CadToolbar 同姿态）；下拉子项复用家族图标，官方补齐后可逐个替换。
 */

import React from 'react';

/** ribbon 分组（os-11 toolset-seperator 切分序）。 */
export type RibbonGroup =
  | 'sketch'
  | 'create'
  | 'shape'
  | 'pattern'
  | 'combine'
  | 'directEdit'
  | 'reference'
  | 'frames'
  | 'sheetMetal'
  | 'custom'
  | 'surfaceCurve';

/** 图标字形组件（无 props 依赖的纯 SVG）。 */
export type RibbonIcon = React.ComponentType;

/** 下拉飞菜单子项（os-20）。 */
export interface RibbonDropdownItem {
  /** 激活 id（投 IModelApp.tools.run）。 */
  id: string;
  icon: RibbonIcon;
  /** i18n 键（partStudio.ribbon.items.*.label）。 */
  labelKey: string;
  /** 能力键（internal/capabilities 注册表寻址）。 */
  capability: string;
}

/** ribbon 工具条目。 */
export interface RibbonTool {
  /** 激活 id（见文件头校准原则）。 */
  id: string;
  icon: RibbonIcon;
  /** i18n 键（partStudio.ribbon.tools.*.label）。 */
  labelKey: string;
  /** 快捷键（os-11 title 属性钉死：shift+s/shift+e/shift+w/shift+f）。 */
  shortcut?: string;
  /** 能力键（internal/capabilities 注册表寻址）。 */
  capability: string;
  group: RibbonGroup;
  /** 下拉飞菜单子项（8 工具携带；其余 undefined）。 */
  dropdownItems?: readonly RibbonDropdownItem[];
}

/** 命令搜索可寻址单元 = 工具 | 下拉子项。 */
export type RibbonCommand = RibbonTool | RibbonDropdownItem;

// ── 图标字形（自制描边 24×24，iTwinUI 令牌随当前色）───────────────────────
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

/* 草图：虚位平面 + 铅笔。 */
const SketchIcon = icon(
  el('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, strokeDasharray: '2 2' }),
  el('path', { d: 'M15.5 4.5l4 4L9 19l-4.5 1L5 15.5 15.5 4.5z' }),
);

/* 拉伸：轮廓 + 向上箭头。 */
const ExtrudeIcon = icon(
  el('rect', { x: 5, y: 13, width: 14, height: 7, rx: 1 }),
  el('path', { d: 'M12 3v8' }),
  el('path', { d: 'M8.5 7.5L12 4l3.5 3.5' }),
);

/* 旋转：轮廓绕轴。 */
const RevolveIcon = icon(
  el('path', { d: 'M12 2v20', strokeDasharray: '2 2' }),
  el('path', { d: 'M12 4c-4.5 3-4.5 13 0 16' }),
  el('path', { d: 'M12 4c-1.5 1-2.5 3.5-2.8 6' }),
);

/* 扫掠：轮廓沿路径（旧应用 SweepIcon 同形）。 */
const SweepIcon = icon(
  el('rect', { x: 4, y: 4, width: 8, height: 6, rx: 1 }),
  el('rect', { x: 4, y: 14, width: 8, height: 6, rx: 1 }),
  el('path', { d: 'M8 10v4', strokeDasharray: '2 2' }),
  el('path', { d: 'M14 7l4 4-4 4' }),
  el('path', { d: 'M14 17l4 4' }),
);

/* 放样：两轮廓过渡。 */
const LoftIcon = icon(
  el('rect', { x: 3, y: 4, width: 7, height: 5, rx: 1 }),
  el('rect', { x: 14, y: 15, width: 7, height: 5, rx: 1 }),
  el('path', { d: 'M10 5.5c3 0 7 1 11 12' }),
  el('path', { d: 'M3 8c3 0 8 2 11 13' }),
);

/* 加厚：面片偏移（旧应用 OffsetIcon 同形）。 */
const ThickenIcon = icon(
  el('rect', { x: 3, y: 3, width: 18, height: 18, rx: 1 }),
  el('rect', { x: 6, y: 6, width: 12, height: 12, rx: 1, strokeDasharray: '2 2' }),
  el('path', { d: 'M6 6l-3-3M18 6l3-3M6 18l-3 3M18 18l3 3' }),
);

/* 圆角（旧应用 FilletIcon 同形）。 */
const FilletIcon = icon(
  el('path', { d: 'M4 20V10a6 6 0 0 1 6-6h10' }),
  el('path', { d: 'M4 20h10a6 6 0 0 0 6-6V4', strokeDasharray: '2 2' }),
);

/* 倒角（旧应用 ChamferIcon 同形）。 */
const ChamferIcon = icon(
  el('path', { d: 'M4 20V10h10V4' }),
  el('path', { d: 'M4 20h10a6 6 0 0 0 6-6V4', strokeDasharray: '2 2' }),
  el('path', { d: 'M4 10l10-6', strokeDasharray: '2 2' }),
);

/* 拔模：斜面。 */
const DraftIcon = icon(
  el('path', { d: 'M4 20h16' }),
  el('path', { d: 'M6 20L9 6h6l3 14' }),
  el('path', { d: 'M9 6h6', strokeDasharray: '2 2' }),
);

/* 抽壳（旧应用 ShellIcon 同形）。 */
const ShellIcon = icon(
  el('rect', { x: 4, y: 4, width: 16, height: 16, rx: 1 }),
  el('rect', { x: 7, y: 7, width: 10, height: 10, rx: 1 }),
  el('path', { d: 'M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3' }),
);

/* 孔（旧应用 HoleIcon 同形）。 */
const HoleIcon = icon(
  el('circle', { cx: 12, cy: 12, r: 7 }),
  el('circle', { cx: 12, cy: 12, r: 3 }),
  el('path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3' }),
);

/* 外部螺纹：圆柱 + 螺旋。 */
const ThreadIcon = icon(
  el('ellipse', { cx: 12, cy: 5, rx: 7, ry: 3 }),
  el('path', { d: 'M5 5v14a7 3 0 0 0 14 0V5' }),
  el('path', { d: 'M5 9.5h14M5 14h14' }),
);

/* 线性阵列（旧应用 LinearPatternIcon 同形）。 */
const LinearPatternIcon = icon(
  el('rect', { x: 3, y: 3, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 10, y: 3, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 17, y: 3, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 3, y: 10, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 10, y: 10, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 17, y: 10, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 3, y: 17, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 10, y: 17, width: 4, height: 4, rx: 1 }),
  el('rect', { x: 17, y: 17, width: 4, height: 4, rx: 1 }),
);

/* 镜像（旧应用 MirrorIcon 同形）。 */
const MirrorIcon = icon(
  el('line', { x1: 12, y1: 4, x2: 12, y2: 20, strokeDasharray: '2 2' }),
  el('rect', { x: 4, y: 8, width: 6, height: 8, rx: 1 }),
  el('rect', { x: 14, y: 8, width: 6, height: 8, rx: 1 }),
  el('path', { d: 'M10 12h4' }),
);

/* 布尔运算（旧应用 UniteIcon 同形）。 */
const BooleanIcon = icon(
  el('circle', { cx: 9, cy: 12, r: 5 }),
  el('circle', { cx: 15, cy: 12, r: 5 }),
  el('path', { d: 'M12 7v10', strokeDasharray: '2 2' }),
  el('path', { d: 'M12 9v6', strokeWidth: 2 }),
  el('path', { d: 'M9 12h6', strokeWidth: 2 }),
);

/* 分割：体 + 剖切面。 */
const SplitPartIcon = icon(
  el('path', { d: 'M4 8l8-4 8 4v8l-8 4-8-4V8z' }),
  el('path', { d: 'M4 8l8 4 8-4' }),
  el('path', { d: 'M12 12v8' }),
  el('line', { x1: 2, y1: 12, x2: 22, y2: 12, strokeDasharray: '2 2' }),
);

/* 变换：平移 + 旋转弧。 */
const TransformIcon = icon(
  el('path', { d: 'M3 12h10' }),
  el('path', { d: 'M10 8.5L13.5 12 10 15.5' }),
  el('path', { d: 'M17 5a7 7 0 0 1 4 6' }),
  el('path', { d: 'M21 8.5V11h-2.5' }),
);

/* 删除零件：体 + 删除叉。 */
const DeleteBodiesIcon = icon(
  el('path', { d: 'M4 8l8-4 8 4v8l-8 4-8-4V8z' }),
  el('path', { d: 'M4 8l8 4 8-4' }),
  el('path', { d: 'M12 12v8' }),
  el('path', { d: 'M8.5 3.5l7 7M15.5 3.5l-7 7' }),
);

/* 修改圆角：弧 + 半径针。 */
const ModifyFilletIcon = icon(
  el('path', { d: 'M4 20V10a6 6 0 0 1 6-6h10' }),
  el('circle', { cx: 10, cy: 10, r: 1.5 }),
  el('path', { d: 'M10 10l6 6' }),
  el('path', { d: 'M16 12v4h-4' }),
);

/* 删除面：面片 + 叉。 */
const DeleteFaceIcon = icon(
  el('rect', { x: 4, y: 6, width: 12, height: 12, rx: 1 }),
  el('path', { d: 'M16 10l5 5M21 10l-5 5' }),
);

/* 移动面：面片 + 箭头。 */
const MoveFaceIcon = icon(
  el('rect', { x: 4, y: 6, width: 10, height: 10, rx: 1 }),
  el('path', { d: 'M14 4h6v6' }),
  el('path', { d: 'M20 4l-8 8' }),
);

/* 替换面：两面 + 互换弧。 */
const ReplaceFaceIcon = icon(
  el('rect', { x: 3, y: 5, width: 8, height: 6, rx: 1 }),
  el('rect', { x: 13, y: 13, width: 8, height: 6, rx: 1 }),
  el('path', { d: 'M11 8h6a4 4 0 0 1 4 4' }),
  el('path', { d: 'M18 9l3 3 3-3', transform: 'translate(-3 0)' }),
);

/* 平面：虚位构造面。 */
const CPlaneIcon = icon(
  el('rect', { x: 3, y: 7, width: 18, height: 10, rx: 1, strokeDasharray: '3 2' }),
  el('circle', { cx: 12, cy: 12, r: 1.5 }),
);

/* 框架：型材截面 + 路径。 */
const FrameIcon = icon(
  el('rect', { x: 4, y: 4, width: 7, height: 7, rx: 1 }),
  el('rect', { x: 6, y: 6, width: 3, height: 3 }),
  el('path', { d: 'M11 15c2 0 3 1 3 3', strokeDasharray: '2 2' }),
  el('path', { d: 'M13 12h7v7h-7z' }),
);

/* 钣金模型：折弯板。 */
const SheetMetalIcon = icon(
  el('path', { d: 'M4 18V8l8-4v10' }),
  el('path', { d: 'M4 18h16' }),
  el('path', { d: 'M12 14v4' }),
  el('path', { d: 'M12 14l8-3v7' }),
);

/* 添加自定义特征：形 + 加号。 */
const UserFeaturesIcon = icon(
  el('rect', { x: 3, y: 3, width: 13, height: 13, rx: 2 }),
  el('path', { d: 'M18 16v6M15 19h6' }),
);

/* 曲面/曲线组：波形面 + 网格。 */
const SurfaceCurveIcon = icon(
  el('path', { d: 'M3 16c3-6 6 2 9-4s6 2 9-4' }),
  el('path', { d: 'M3 20c3-6 6 2 9-4s6 2 9-4', strokeDasharray: '2 2' }),
  el('circle', { cx: 6, cy: 7, r: 1.5 }),
  el('circle', { cx: 12, cy: 5, r: 1.5 }),
  el('circle', { cx: 18, cy: 7, r: 1.5 }),
);

// ── 注册表（Onshape 主工具栏分组序——diag-tools.json 权威，见文件头；
//    group 切换即分隔条）──────────────────────────────────────────────────

/** 分组渲染顺序（os-11 toolset-seperator 切分序 = diag-tools.json 组界序；
 *  surfaceCurve 为本仓扩充组钉末位）。 */
export const RIBBON_GROUP_ORDER: readonly RibbonGroup[] = [
  'sketch',
  'create',
  'shape',
  'pattern',
  'combine',
  'directEdit',
  'reference',
  'frames',
  'sheetMetal',
  'custom',
  'surfaceCurve',
];

/**
 * 27 工具注册表。toolId 校准见文件头；capability 键已全量入册
 * TOOL_CAPABILITIES（ribbon-registry.test.ts 钉死该不变式）。
 */
export const RIBBON_TOOLS: readonly RibbonTool[] = [
  {
    id: 'newSketch',
    icon: SketchIcon,
    labelKey: 'partStudio.ribbon.tools.sketch.label',
    shortcut: 'shift+s',
    capability: 'sketch',
    group: 'sketch',
  },
  {
    id: 'extrude',
    icon: ExtrudeIcon,
    labelKey: 'partStudio.ribbon.tools.extrude.label',
    shortcut: 'shift+e',
    capability: 'extrude',
    group: 'create',
  },
  {
    id: 'revolve',
    icon: RevolveIcon,
    labelKey: 'partStudio.ribbon.tools.revolve.label',
    shortcut: 'shift+w',
    capability: 'revolve',
    group: 'create',
  },
  {
    id: 'SweepFaces',
    icon: SweepIcon,
    labelKey: 'partStudio.ribbon.tools.sweep.label',
    capability: 'sweep',
    group: 'create',
  },
  {
    id: 'loft',
    icon: LoftIcon,
    labelKey: 'partStudio.ribbon.tools.loft.label',
    capability: 'loft',
    group: 'create',
  },
  {
    id: 'thicken',
    icon: ThickenIcon,
    labelKey: 'partStudio.ribbon.tools.thicken.label',
    capability: 'thicken',
    group: 'create',
    dropdownItems: [
      { id: 'thickenClosed', icon: ThickenIcon, labelKey: 'partStudio.ribbon.items.thickenClosed.label', capability: 'thicken' },
    ],
  },
  {
    id: 'RoundEdges',
    icon: FilletIcon,
    labelKey: 'partStudio.ribbon.tools.fillet.label',
    shortcut: 'shift+f',
    capability: 'fillet',
    group: 'shape',
    dropdownItems: [
      { id: 'faceBlend', icon: FilletIcon, labelKey: 'partStudio.ribbon.items.faceBlend.label', capability: 'fillet' },
    ],
  },
  {
    id: 'ChamferEdges',
    icon: ChamferIcon,
    labelKey: 'partStudio.ribbon.tools.chamfer.label',
    capability: 'chamfer',
    group: 'shape',
  },
  {
    id: 'DraftFaces',
    icon: DraftIcon,
    labelKey: 'partStudio.ribbon.tools.draft.label',
    capability: 'draft',
    group: 'shape',
    dropdownItems: [
      { id: 'bodyDraft', icon: DraftIcon, labelKey: 'partStudio.ribbon.items.bodyDraft.label', capability: 'draft' },
    ],
  },
  {
    id: 'HollowFaces',
    icon: ShellIcon,
    labelKey: 'partStudio.ribbon.tools.shell.label',
    capability: 'shell',
    group: 'shape',
  },
  {
    id: 'CreateHole',
    icon: HoleIcon,
    labelKey: 'partStudio.ribbon.tools.hole.label',
    capability: 'hole',
    group: 'shape',
  },
  {
    id: 'externalThread',
    icon: ThreadIcon,
    labelKey: 'partStudio.ribbon.tools.thread.label',
    capability: 'thread',
    group: 'shape',
  },
  {
    id: 'LinearPattern',
    icon: LinearPatternIcon,
    labelKey: 'partStudio.ribbon.tools.linearPattern.label',
    capability: 'linearPattern',
    group: 'pattern',
    dropdownItems: [
      // B5：子项 id 校准为 register-edit-tools.ts 登记的真实直改 toolId
      // （CircularPattern）——旧 'circularPattern' 为伪 id（tools.run 静默失败）；
      // 主钮/子项均由 useToolActivation 改道参数化 new/pattern 对话框。
      { id: 'CircularPattern', icon: LinearPatternIcon, labelKey: 'partStudio.ribbon.items.circularPattern.label', capability: 'circularPattern' },
      // 曲线阵列无对应工具/后端面（首版 pattern 仅 PART 级线性/圆周）——capability
      // 已翻 gated：点击开能力引导对话框，不再静默假启动。
      { id: 'curvePattern', icon: LinearPatternIcon, labelKey: 'partStudio.ribbon.items.curvePattern.label', capability: 'curvePattern' },
    ],
  },
  {
    id: 'MirrorElements',
    icon: MirrorIcon,
    labelKey: 'partStudio.ribbon.tools.mirror.label',
    capability: 'mirror',
    group: 'pattern',
  },
  {
    id: 'booleanBodies',
    icon: BooleanIcon,
    labelKey: 'partStudio.ribbon.tools.boolean.label',
    capability: 'boolean',
    group: 'combine',
  },
  {
    id: 'splitPart',
    icon: SplitPartIcon,
    labelKey: 'partStudio.ribbon.tools.splitPart.label',
    capability: 'splitPart',
    group: 'combine',
  },
  {
    id: 'transform',
    icon: TransformIcon,
    labelKey: 'partStudio.ribbon.tools.transform.label',
    capability: 'transform',
    group: 'combine',
    dropdownItems: [
      { id: 'wrap', icon: TransformIcon, labelKey: 'partStudio.ribbon.items.wrap.label', capability: 'wrap' },
      { id: 'decal', icon: TransformIcon, labelKey: 'partStudio.ribbon.items.decal.label', capability: 'decal' },
    ],
  },
  {
    id: 'deleteBodies',
    icon: DeleteBodiesIcon,
    labelKey: 'partStudio.ribbon.tools.deleteBodies.label',
    capability: 'deleteBodies',
    group: 'combine',
  },
  {
    id: 'modifyFillet',
    icon: ModifyFilletIcon,
    labelKey: 'partStudio.ribbon.tools.modifyFillet.label',
    capability: 'modifyFillet',
    group: 'directEdit',
  },
  {
    id: 'deleteFace',
    icon: DeleteFaceIcon,
    labelKey: 'partStudio.ribbon.tools.deleteFace.label',
    capability: 'deleteFace',
    group: 'directEdit',
  },
  {
    id: 'moveFace',
    icon: MoveFaceIcon,
    labelKey: 'partStudio.ribbon.tools.moveFace.label',
    capability: 'moveFace',
    group: 'directEdit',
  },
  {
    id: 'replaceFace',
    icon: ReplaceFaceIcon,
    labelKey: 'partStudio.ribbon.tools.replaceFace.label',
    capability: 'replaceFace',
    group: 'directEdit',
  },
  {
    id: 'cPlane',
    icon: CPlaneIcon,
    labelKey: 'partStudio.ribbon.tools.cPlane.label',
    capability: 'cPlane',
    group: 'reference',
  },
  {
    id: 'frame',
    icon: FrameIcon,
    labelKey: 'partStudio.ribbon.tools.frame.label',
    capability: 'frames',
    group: 'frames',
    dropdownItems: [
      { id: 'frameTrim', icon: FrameIcon, labelKey: 'partStudio.ribbon.items.frameTrim.label', capability: 'frames' },
      { id: 'gusset', icon: FrameIcon, labelKey: 'partStudio.ribbon.items.gusset.label', capability: 'frames' },
      { id: 'endCap', icon: FrameIcon, labelKey: 'partStudio.ribbon.items.endCap.label', capability: 'frames' },
      { id: 'cutList', icon: FrameIcon, labelKey: 'partStudio.ribbon.items.cutList.label', capability: 'frames' },
    ],
  },
  {
    id: 'sheetMetalStart',
    icon: SheetMetalIcon,
    labelKey: 'partStudio.ribbon.tools.sheetMetal.label',
    capability: 'sheetMetal',
    group: 'sheetMetal',
    dropdownItems: [
      { id: 'flange', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.flange.label', capability: 'sheetMetal' },
      { id: 'hem', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.hem.label', capability: 'sheetMetal' },
      { id: 'tab', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.tab.label', capability: 'sheetMetal' },
      { id: 'smBend', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.smBend.label', capability: 'sheetMetal' },
      { id: 'smJog', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.smJog.label', capability: 'sheetMetal' },
      { id: 'forming', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.forming.label', capability: 'sheetMetal' },
      { id: 'sheetMetalLoft', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.sheetMetalLoft.label', capability: 'sheetMetal' },
      { id: 'smJoint', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.smJoint.label', capability: 'sheetMetal' },
      { id: 'bendRelief', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.bendRelief.label', capability: 'sheetMetal' },
      { id: 'cornerBreak', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.cornerBreak.label', capability: 'sheetMetal' },
      { id: 'endSheetMetal', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.endSheetMetal.label', capability: 'sheetMetal' },
      { id: 'pcbFlexModel', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.pcbFlexModel.label', capability: 'sheetMetal' },
      { id: 'pcbEndFlexModel', icon: SheetMetalIcon, labelKey: 'partStudio.ribbon.items.pcbEndFlexModel.label', capability: 'sheetMetal' },
    ],
  },
  {
    id: 'USER_FEATURES',
    icon: UserFeaturesIcon,
    labelKey: 'partStudio.ribbon.tools.userFeatures.label',
    capability: 'userFeatures',
    group: 'custom',
  },
  {
    id: 'surfaceCurve',
    icon: SurfaceCurveIcon,
    labelKey: 'partStudio.ribbon.tools.surfaceCurve.label',
    capability: 'surfaces',
    group: 'surfaceCurve',
    dropdownItems: [
      // 曲面 8（capability=surfaces；UI-INVENTORY §2.2 曲面/曲线大全）
      { id: 'surfacePlane', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.surfacePlane.label', capability: 'surfaces' },
      { id: 'offsetSurface', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.offsetSurface.label', capability: 'surfaces' },
      { id: 'boundarySurface', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.boundarySurface.label', capability: 'surfaces' },
      { id: 'fillSurface', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.fillSurface.label', capability: 'surfaces' },
      { id: 'moveBoundary', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.moveBoundary.label', capability: 'surfaces' },
      { id: 'ruledSurface', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.ruledSurface.label', capability: 'surfaces' },
      { id: 'mutualTrim', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.mutualTrim.label', capability: 'surfaces' },
      { id: 'constraintSurface', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.constraintSurface.label', capability: 'surfaces' },
      // 曲线 12（capability=curves）
      { id: 'helix', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.helix.label', capability: 'curves' },
      { id: 'fitSpline3d', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.fitSpline3d.label', capability: 'curves' },
      { id: 'projectCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.projectCurve.label', capability: 'curves' },
      { id: 'bridgeCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.bridgeCurve.label', capability: 'curves' },
      { id: 'compositeCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.compositeCurve.label', capability: 'curves' },
      { id: 'intersectionCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.intersectionCurve.label', capability: 'curves' },
      { id: 'trimCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.trimCurve.label', capability: 'curves' },
      { id: 'isoline', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.isoline.label', capability: 'curves' },
      { id: 'offsetCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.offsetCurve.label', capability: 'curves' },
      { id: 'isoparametricCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.isoparametricCurve.label', capability: 'curves' },
      { id: 'editCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.editCurve.label', capability: 'curves' },
      { id: 'routeCurve', icon: SurfaceCurveIcon, labelKey: 'partStudio.ribbon.items.routeCurve.label', capability: 'curves' },
    ],
  },
];

/** 按 id 寻址工具或下拉子项（命令搜索/激活路由统一入口）。 */
export function findRibbonCommand(id: string): RibbonCommand | undefined {
  for (const tool of RIBBON_TOOLS) {
    if (tool.id === id) return tool;
    for (const item of tool.dropdownItems ?? []) {
      if (item.id === id) return item;
    }
  }
  return undefined;
}

/** 展开全部可寻址命令（27 工具 + 44 下拉子项 = 71），ribbon 顺序保序。 */
export function allRibbonCommands(): RibbonCommand[] {
  const commands: RibbonCommand[] = [];
  for (const tool of RIBBON_TOOLS) {
    commands.push(tool);
    commands.push(...(tool.dropdownItems ?? []));
  }
  return commands;
}
