/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 尺寸数值「显示值 ↔ 契约值」转换（ADR-0018 S1e/S1h 2026-11-12）。
 *
 * 后端 updateSketchConstraint 白名单：distance/radius/diameter/length/angle/slotWidth。
 * 除 angle 外均为草图局部毫米值，编辑器原样显示/提交；angle 在 shared 契约中
 * 是弧度（direction-vector 语义），而 Onshape 显示度数——编辑器显示度、提交
 * 前换算回弧度，避免把用户输入的 45 当成 45 rad。
 *
 * 2026-11-16 W17（live 尺寸对话框）：长度类初值精度 = 工作区显示小数 + 3
 *（本产品 mm 口径 2+3 = 5 位，去尾零）；输入框内 ArrowUp/ArrowDown 对长度类
 * 步进 ±1 mm。
 *
 * 2026-11-16 W18（live 角度编辑器）：角度初值 = 度、7 位小数、去尾零
 *（live 83.7325188 deg）；方向键 ±1°（显示单位），步进结果同初值口径。
 * 步进/格式化入口统一按**显示单位**接收 `rawValue`（角度由调用方把契约弧度
 * 换算为度后再传入）。
 */
import type { SketchConstraintDto } from '@luban-cad/shared';
import { formatFixedHalfUp } from './decimal-format.js';

/** 后端 `precomputeSketchConstraint` 白名单（与私有 backend 保持同一集合）。 */
export const EDITABLE_CONSTRAINT_KINDS = new Set<SketchConstraintDto['kind']>([
  'distance', 'radius', 'diameter', 'length', 'angle', 'slotWidth',
]);

/** 长度类编辑器初值小数位（live：工作区显示小数 + 3；mm 产品 2+3 = 5）。 */
export const DIMENSION_EDITOR_DECIMALS = 5;

/** 角度编辑器初值/步进小数位（2026-11-16 W18 live：角度 7 位小数）。 */
export const DIMENSION_EDITOR_ANGLE_DECIMALS = 7;

/** 放置值弹层角度初值小数位（2026-11-16 W17b live：角度 7 位小数）。 */
export const DIMENSION_POPUP_ANGLE_DECIMALS = DIMENSION_EDITOR_ANGLE_DECIMALS;

/** 方向键步进量（mm；live 长度类约束 ±1）。 */
export const DIMENSION_EDITOR_STEP_MM = 1;

/** 方向键步进量（度；live 2026-11-16 W18：角度 ±1°）。 */
export const DIMENSION_EDITOR_STEP_DEG = 1;

/** 固定小数位（十进制 half-up，W18 live 28.575 → 28.58）+ 去尾零。 */
function formatFixedTrimmed(value: number, decimals: number): string {
  const fixed = formatFixedHalfUp(value, decimals);
  // 仅裁小小数部分（decimals=0 时无小数点）。
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

/** 长度类格式化：最多 5 位小数、去尾零（"15.74583" / "20"）。 */
function formatEditorLengthValue(value: number): string {
  return formatFixedTrimmed(value, DIMENSION_EDITOR_DECIMALS);
}

/**
 * 角度格式化（度为显示单位）：最多 7 位小数、去尾零（live W18：
 * "83.7325188" / "90"）。初值与方向键步进共用同一口径。
 */
export function formatAngleEditorDegrees(degrees: number): string {
  return formatFixedTrimmed(degrees, DIMENSION_EDITOR_ANGLE_DECIMALS);
}

/**
 * 放置值弹层初值格式化（2026-11-16 W17b live）：长度类 5 位小数（工作区
 * 显示小数 + 3），角度 7 位小数；均去尾零。非有限值返回空文本（几何不可测
 * 时保持空输入 + 占位）。
 */
export function formatDimensionPopupValue(kind: string, value: number): string {
  if (!Number.isFinite(value))
    return '';
  return formatFixedTrimmed(
    value,
    kind === 'angle' ? DIMENSION_POPUP_ANGLE_DECIMALS : DIMENSION_EDITOR_DECIMALS,
  );
}

/**
 * 约束值 → 显示单位数值（W21 既有尺寸对话框预填）：长度/距离/半径/直径保持
 * 毫米，angle 由契约弧度换算为度。缺值/非有限 → undefined（不猜）。
 */
export function dimensionConstraintDisplayValue(
  constraint: Pick<SketchConstraintDto, 'kind' | 'value'>,
): number | undefined {
  if (constraint.value === undefined || !Number.isFinite(constraint.value))
    return undefined;
  if (constraint.kind === 'angle')
    return Math.abs(constraint.value) * 180 / Math.PI;
  return constraint.value;
}

/**
 * 约束 → 编辑器初值（angle 显示为度、7 位小数；其余保持毫米/5 位小数）。
 * shared 契约 angle.value 为弧度，此处换算为显示单位度。
 */
export function formatConstraintEditorValue(constraint: SketchConstraintDto): string {
  const display = dimensionConstraintDisplayValue(constraint);
  if (display === undefined)
    return '';
  if (constraint.kind === 'angle')
    return formatAngleEditorDegrees(display);
  return formatEditorLengthValue(display);
}

/** 编辑器单位文本（live 2026-11-20 S2w：长度 `mm` / 角度 `deg`，单位在输入文本内）。 */
export function dimensionEditorUnitText(kind: SketchConstraintDto['kind']): 'mm' | 'deg' {
  return kind === 'angle' ? 'deg' : 'mm';
}

/**
 * 去掉输入文本尾部单位（大小写不敏感；无单位时返回 trim 后原文）。
 *
 * 2026-11-21 评审判定（Finding 2）：单位 token 前必须是空白才剥离。旧实现
 * `^(.*?)\s*${unit}\s*$` 会把合法变量名的尾部字母当单位吃掉（`#width_mm` →
 * `#width_`、`#fooDEG` → `#foo`、`#foo2mm` → `#foo2`），而这些都满足
 * `[A-Za-z_][A-Za-z0-9_]*`。live 输入形态均带空格（`20 mm` / `(5*2) mm` /
 * `90 deg`），因此「单位前必须有空白」既能归一化 live 文本，又不破坏标识符。
 */
export function stripDimensionEditorUnit(text: string, unit: string): string {
  const trimmed = text.trim();
  const lowerUnit = unit.toLowerCase();
  if (trimmed.length <= lowerUnit.length || !trimmed.toLowerCase().endsWith(lowerUnit))
    return trimmed;
  const prefix = trimmed.slice(0, trimmed.length - lowerUnit.length);
  // `#width_mm` / `#fooDEG` / `#foo2mm` / `#mm`：单位前不是空白 → 不剥。
  if (!/\s$/.test(prefix))
    return trimmed;
  return prefix.trim();
}

/**
 * 仅当最外层一对括号包住整段表达式时剥一层：`(5*2)` → `5*2`；
 * `(a+b)*(c)`（首括号中途闭合）原样返回。live S2w：表达式尺寸打开显示
 * `(5*2) mm`，求值需去括号与单位。
 */
export function stripOuterExpressionParens(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')'))
    return trimmed;
  let depth = 0;
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
    if (char === '(')
      depth++;
    else if (char === ')') {
      depth--;
      if (depth < 0)
        return trimmed;
      if (depth === 0 && index !== trimmed.length - 1)
        return trimmed;
    }
  }
  return depth === 0 ? trimmed.slice(1, -1).trim() : trimmed;
}

/** 输入框文本 → 求值文本（去尾部单位 + 去整段外层括号）。 */
export function normalizeDimensionEditorText(text: string, unit: string): string {
  return stripOuterExpressionParens(stripDimensionEditorUnit(text, unit));
}

/**
 * 2026-11-21 评审 Finding 3：blur 归一化把表达式尺寸显示成 `10 mm` 后，若
 * 用户没有实际编辑（onValueChange 会清掉 preservedExpression），提交时数值
 * 仍是原约束值的显示舍入——只有在此容差内才继续携带原表达式，否则按纯数值
 * 提交（避免把舍入差误认成「保留表达式」）。比较用契约值：长度类毫米、
 * 角度为弧度（归一化文本按度求值后已换算回弧度）。容差 = 显示舍入半位：
 * 长度 5 位小数 → 5e-6 mm；角度 7 位小数（度）→ 5e-8° ≈ 8.7e-10 rad。
 */
export function dimensionEditorValueMatchesOriginal(
  kind: SketchConstraintDto['kind'],
  original: number | undefined,
  candidate: number,
): boolean {
  if (original === undefined || !Number.isFinite(original) || !Number.isFinite(candidate))
    return false;
  const tolerance = kind === 'angle' ? 1e-9 : 1e-5;
  return Math.abs(candidate - original) <= tolerance;
}

/**
 * 编辑器输入 → 契约值；非正/非有限/角度 ≥180° 返回 undefined（拒绝提交，
 * 不静默改值——后端求解器 angle 契约为 (0, π) 弧度，前端提前拦截）。
 * 角度输入按度解释并换算为弧度。
 */
export function parseConstraintEditorValue(
  kind: SketchConstraintDto['kind'],
  input: string,
): number | undefined {
  const numeric = Number(input.trim());
  if (!Number.isFinite(numeric) || numeric <= 0)
    return undefined;
  if (kind === 'angle') {
    if (numeric >= 180)
      return undefined;
    return numeric * Math.PI / 180;
  }
  return numeric;
}

/**
 * 可方向键步进的约束种类（live 2026-11-16）：长度类 ±1 mm、角度 ±1°
 * （W18 起角度也可步进）。保留函数名作为宿主/外壳的单一判定面。
 */
export function isSteppableConstraintKind(kind: SketchConstraintDto['kind']): boolean {
  return EDITABLE_CONSTRAINT_KINDS.has(kind);
}

export interface ConstraintEditorStepInput {
  kind: SketchConstraintDto['kind'];
  /** 当前输入文本。 */
  text: string;
  /** 打开编辑器时的初始格式化文本（与 text 相同 = 尚未编辑）。 */
  initialText: string;
  /** 约束原始值（显示单位；未编辑时以它为步进基线，保留全精度）。 */
  rawValue?: number;
  /** +1 = ArrowUp，-1 = ArrowDown。 */
  direction: 1 | -1;
}

/**
 * 方向键步进（live）：文本仍是初始格式化时以约束原始值（显示单位、全精度）
 * 为基线，编辑过则以 `Number(text)` 为基线。长度类返回 `String(next)`（live
 * 显示完整内部值，如 14.74582793）；角度按初值同口径 7 位小数去尾零
 * （83.7325188 − 1 → "82.7325188"）。步进不提交。空文本、非数字返回
 * undefined（调用方不拦截按键，交给输入框默认行为）。非正值不做步进侧
 * 静默抑制：输入框可显示非正值，提交仍由既有 `parseConstraintEditorValue`
 * 拒收。
 */
export function stepConstraintEditorValue(input: ConstraintEditorStepInput): string | undefined {
  const { kind, text, initialText, rawValue, direction } = input;
  if (!isSteppableConstraintKind(kind))
    return undefined;
  const untouched = text === initialText;
  let base: number;
  if (untouched && rawValue !== undefined && Number.isFinite(rawValue)) {
    base = rawValue;
  } else {
    const trimmed = text.trim();
    if (trimmed === '')
      return undefined;
    base = Number(trimmed);
  }
  if (!Number.isFinite(base))
    return undefined;
  const step = kind === 'angle' ? DIMENSION_EDITOR_STEP_DEG : DIMENSION_EDITOR_STEP_MM;
  const next = base + direction * step;
  if (!Number.isFinite(next))
    return undefined;
  return kind === 'angle' ? formatAngleEditorDegrees(next) : String(next);
}
