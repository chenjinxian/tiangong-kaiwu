/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Part Studio 变量表纯逻辑（ADR-0020 §2.6 D5–D7，S3b）。
 *
 * - 变量是 Part Studio 级行（`(fx) #name = 值/表达式`）；事实源是后端 params
 *   （`getVariables`/`updateVariables`），本文件只做**纯**格式化/草稿校验，
 *   不读写模型、不发 RPC。
 * - 展示口径（live 2026-11-17）：表达式是纯数字 → 格式化数值 + 类型单位
 *   （`10 mm` / `45 deg`）；否则显示表达式原文（`#width*2`）。树行与对话框
 *   标题共用同一格式；对话框值字段 blur 后显示**求值结果**（见
 *   `formatVariableNumber`），编辑态聚焦时回到表达式原文。
 * - 类型单位：length→mm、angle→deg、number/any→''（缺省 type=length，S1 旧
 *   变量语义）。求值器只处理数值，角度在 v1 无单位换算（shared 契约）。
 * - 校验：名称规则/scope 唯一、类型枚举、说明 ≤1024、值表达式可求值；编辑
 *   时排除自身旧定义（防止自引用），其余既有变量作为引用表。
 */
import {
  evaluateExpression,
  evaluateVariableTable,
  isValidVariableName,
  type ExpressionFailure,
  type VariableDto,
  type VariableType,
} from '@luban-cad/shared';
import { isNumericDimensionText } from './sketch-dimension-expression.js';
import { formatDimensionPopupValue } from './sketch-dimension-value.js';

/** 变量表读取超时（P3-6：MS 无响应时不把写门永久卡在 loading）。 */
export const VARIABLES_READ_TIMEOUT_MS = 15_000;

/** 异步操作加超时（导出供单测；超时 reject，由调用方按读取失败处理）。 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}超时（${timeoutMs} ms）`));
    }, timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}


/** 变量对话框两种变体：命令/树编辑 与 尺寸字段内联创建。 */
export type VariableDialogVariant = 'variables' | 'inline-create';

/** live 变量对话框四类型（顺序即 UI 行序）。 */
export const VARIABLE_TYPES: readonly VariableType[] = ['length', 'angle', 'number', 'any'];

/**
 * 尺寸字段 → 内联创建面板请求（S3b D7）：name=token、valueText=尺寸当前值
 * （显示单位数值文本）、anchor=尺寸对话框右侧的 client 坐标（宿主定位）。
 */
export interface VariableCreateRequest {
  name: string;
  valueText: string;
  /**
   * 尺寸当前值单位（`mm`/`deg`）。**当前宿主未消费**：P2-4 决定内联创建
   * 默认类型固定 length；保留字段是因为该请求形状按 S3b 简报固定，且未来
   * 量纲感知的默认值/提示可复用（不在本切片做隐式切换）。
   */
  unit: string;
  anchor?: { x: number; y: number };
}

/** 说明字段上限（与表达式长度门禁同量级；live 未采，产品护栏）。 */
export const MAX_VARIABLE_DESCRIPTION_LENGTH = 1024;

/**
 * ADR-0020 S4c：内联创建请求单位 → 变量类型。角度表达式字段（draft/revolve）
 * 传 `°`，创建出的变量必须是 angle，否则字段的量纲门会立刻拒收。
 */
export function variableTypeForInlineCreateUnit(unit: string): VariableType {
  // `°` = 特征表达式字段；`deg` = 草图尺寸编辑器/SketchValuePopup（S2）。两者
  // 都必须建 angle 变量，否则对应字段的量纲门立即拒收 length。
  return unit === '°' || unit === 'deg' ? 'angle' : 'length';
}

/** 全部变量单位（''=无量纲类型）。 */
export function variableUnit(type: VariableType | undefined): 'mm' | 'deg' | '' {
  switch (type ?? 'length') {
    case 'length':
      return 'mm';
    case 'angle':
      return 'deg';
    case 'number':
    case 'any':
      return '';
  }
}

/** 求值结果格式化（角度 7 位、长度 5 位，去尾零；与尺寸编辑器同口径）。 */
export function formatVariableNumber(value: number, type: VariableType | undefined): string {
  return formatDimensionPopupValue(type === 'angle' ? 'angle' : 'length', value);
}

/** 求值结果 + 单位（`10 mm` / `45 deg` / `10`）。 */
export function formatVariableValueWithUnit(value: number, type: VariableType | undefined): string {
  const unit = variableUnit(type);
  const number = formatVariableNumber(value, type);
  return unit === '' ? number : `${number} ${unit}`;
}

/**
 * 既有变量表 → name→值；表损坏（循环/语法/重复名）返回 undefined（不伪造
 * 部分结果，调用方不显示值）。
 */
export function evaluatedVariableValues(
  variables: readonly VariableDto[],
): ReadonlyMap<string, number> | undefined {
  if (variables.length === 0)
    return new Map();
  const result = evaluateVariableTable(variables.map((variable) => ({
    name: variable.name,
    expression: variable.expression,
  })));
  return result.ok ? result.values : undefined;
}

/**
 * 单条表达式在既有变量表上下文中的求值（展示用；变量表损坏/引用失败一律
 * undefined，不 throw）。
 *
 * 注意：求值上下文用**完整既有表**（含被编辑变量的旧值）——其它变量可能依赖
 * 该变量，若为了防自引用而剔除旧定义，依赖变量的值也会一起丢失。自引用/循环
 * 由 `validateVariableDraft` 的「提议整表」校验拦截，展示层不用它做门禁。
 */
export function evaluateVariableExpression(
  expression: string,
  existing: readonly VariableDto[],
): number | undefined {
  let values: ReadonlyMap<string, number> | undefined;
  if (existing.length > 0) {
    const table = evaluateVariableTable(existing.map((variable) => ({
      name: variable.name,
      expression: variable.expression,
    })));
    if (!table.ok)
      return undefined;
    values = table.values;
  }
  const result = evaluateExpression(expression, values);
  return result.ok ? result.value : undefined;
}

/**
 * 变量显示文本（树行/对话框标题）：纯数字 → `<数值><单位>`（`10 mm`）；
 * 表达式 → 原文（`#width*2`）。永不 throw。
 *
 * 展示口径不含「表达式求值结果」（树行按 live 显示表达式原文），因此不需要
 * 既有变量求值表参数（S3b review P3：移除无用形参/tree 每渲染全表求值）。
 */
export function formatVariableDisplay(
  variable: Pick<VariableDto, 'expression' | 'type'>,
): string {
  const expression = typeof variable.expression === 'string' ? variable.expression : '';
  try {
    const trimmed = expression.trim();
    if (isNumericDimensionText(trimmed)) {
      const value = Number(trimmed);
      if (Number.isFinite(value)) {
        const unit = variableUnit(variable.type);
        const number = formatVariableNumber(value, variable.type);
        return unit === '' ? number : `${number} ${unit}`;
      }
    }
  } catch {
    // 格式化失败（非有限/异常输入）→ 原文兜底，不 throw。
  }
  return expression;
}

/** 特征树变量行文本：`#name = <formatVariableDisplay>`。 */
export function variableTreeRowText(variable: VariableDto): string {
  return `#${variable.name} = ${formatVariableDisplay(variable)}`;
}

/** 稳定、不与既有 id 冲突的新 id（`v1`、`v2`…；空洞复用后仍确定）。 */
export function nextVariableId(existing: readonly Pick<VariableDto, 'id'>[]): string {
  const used = new Set(existing.map((variable) => variable.id));
  let highest = 0;
  for (const id of used) {
    const match = /^v(\d+)$/.exec(id);
    if (match)
      highest = Math.max(highest, Number(match[1]));
  }
  let next = highest + 1;
  while (used.has(`v${next}`))
    next++;
  return `v${next}`;
}

/** 追加或按 id 替换（返回新数组，不修改入参）。 */
export function upsertVariable(
  variables: readonly VariableDto[],
  dto: VariableDto,
): VariableDto[] {
  const index = variables.findIndex((variable) => variable.id === dto.id);
  if (index < 0)
    return [...variables, dto];
  return variables.map((variable, current) => (current === index ? dto : variable));
}

/** 删除一条（整表覆写前的纯函数；返回新数组）。 */
export function removeVariable(
  variables: readonly VariableDto[],
  id: string,
): VariableDto[] {
  return variables.filter((variable) => variable.id !== id);
}


/** 变量写门阻断原因（S3b final re-review P2-1）：loading 优先于不可用，
 * 并区分「未连接/Part Studio 未就绪」与「读取失败」。 */
export type VariableWriteBlockReason = 'loading' | 'notReady' | 'readFailed';

/** 写门判定（单一顺序，Ribbon/对话框/树删除共用）。 */
export function variableWriteBlockReason(input: {
  loading?: boolean;
  ready?: boolean;
  scopeActive?: boolean;
  error?: string;
}): VariableWriteBlockReason | undefined {
  if (input.loading)
    return 'loading';
  if (input.scopeActive === false)
    return 'notReady';
  if (input.error !== undefined)
    return 'readFailed';
  if (input.ready === false)
    return 'readFailed';
  return undefined;
}

/** 写门原因 → i18n key（zh/en 同 key）。 */
export function variableWriteBlockI18nKey(reason: VariableWriteBlockReason): string {
  switch (reason) {
    case 'loading':
      return 'partStudio.variables.errors.loading';
    case 'notReady':
      return 'partStudio.variables.errors.notReady';
    case 'readFailed':
      return 'partStudio.variables.errors.unavailable';
  }
}

/** 变量草稿（对话框本地态；`valueText` 是表达式原文/设计意图）。 */
export interface VariableDraft {
  id?: string;
  name: string;
  valueText: string;
  type: VariableType;
  description: string;
}

export type VariableDraftField = 'name' | 'value' | 'type' | 'description';

/**
 * 草稿校验结果（S5 本地化；判别联合）：本地规则错误 `message` 是 i18n key
 * （`partStudio.variables.*`）；求值错误（仅 value 字段）携带 shared **结构化
 * failure**（`detail/attributedVariable/referenceChain`），由 `VariablesDialog`
 * 用 `expressionFailureMessage` 做 zh/en 本地化。判别联合保证失败分支不可能
 * 同时缺 message 与 failure。
 */
export type VariableDraftValidation =
  | { ok: true; dto: VariableDto }
  | {
    ok: false;
    /** 本地规则字段（message 分支；含 value 的本地规则如空值）。 */
    field: VariableDraftField;
    /** 本地规则错误的 i18n key（`partStudio.variables.*`）。 */
    message: string;
    failure?: never;
  }
  | {
    ok: false;
    /** 求值错误只归 value 字段。 */
    field: 'value';
    /** 求值失败的 shared 结构化错误。 */
    failure: ExpressionFailure;
    message?: never;
  };

/**
 * 草稿 → 契约 DTO（单一校验入口；对话框 ✓ 门禁与提交载荷共用）。
 *
 * - name：trim 后 `isValidVariableName`、scope 内唯一（编辑排除自身 id）；
 * - type：四值枚举；
 * - description：trim 后 ≤1024；
 * - value：非空表达式；既有变量（排除自身）作为引用表求值——自引用即
 *   unknownVariable，循环/语法错误返回 shared 结构化 failure（不拼中文）。
 */
export function validateVariableDraft(
  draft: VariableDraft,
  existing: readonly VariableDto[],
): VariableDraftValidation {
  const name = draft.name.trim();
  if (!isValidVariableName(name))
    return { ok: false, field: 'name', message: 'partStudio.variables.errors.invalidName' };
  if (existing.some((variable) => variable.id !== draft.id && variable.name === name))
    return { ok: false, field: 'name', message: 'partStudio.variables.errors.duplicateName' };

  if (!VARIABLE_TYPES.includes(draft.type))
    return { ok: false, field: 'type', message: 'partStudio.variables.errors.invalidType' };

  const description = draft.description.trim();
  if (description.length > MAX_VARIABLE_DESCRIPTION_LENGTH)
    return { ok: false, field: 'description', message: 'partStudio.variables.errors.descriptionTooLong' };

  const expression = draft.valueText.trim();
  if (expression === '')
    return { ok: false, field: 'value', message: 'partStudio.variables.errors.emptyValue' };

  // 「提议整表」求值：编辑位置替换为新定义（名字/表达式），新建追加。这样
  // 自引用/循环变成显式 cycle、重命名导致依赖失效变成 dependent 的明确错误；
  // 依赖该变量的其它变量仍按新定义解析（不会因剔除旧定义而整体误报）。
  const reusingId = draft.id !== undefined && existing.some((variable) => variable.id === draft.id);
  const proposed = existing.map((variable) => (variable.id === draft.id
    ? { name, expression }
    : { name: variable.name, expression: variable.expression }));
  if (!reusingId)
    proposed.push({ name, expression });
  const table = evaluateVariableTable(proposed);
  if (!table.ok)
    return { ok: false, field: 'value', failure: table };

  const dto: VariableDto = {
    id: draft.id ?? nextVariableId(existing),
    name,
    expression,
    type: draft.type,
    ...(description === '' ? {} : { description }),
  };
  return { ok: true, dto };
}
