/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ExpressionNumberField（ADR-0020 S4c）——特征数值字段的唯一表达式输入组件。
 *
 * 从 S4b 拉伸深度字段**抽取**（不复制第二套状态机）：聚焦显示表达式原文、
 * 失焦显示求值数 + 单位；`#` 既有变量补全 + `新建变量…` 内联创建（复用 S3b
 * 宿主面板）；程序化写回（补全选中/内联创建回填）不得重开补全；变量表
 * loading/unavailable 时未触碰的落库表达式按物化快照放行、新表达式给独立
 * 错误（绝不误报未知变量）；本地无效表达式红态 + 宿主提交/预览阻断。
 *
 * 与 S4b 的差异：kind 取代固定 length 域（length/signedLength/angleDeg/
 * angleRadFromDeg）；补全菜单按 input rect + 菜单尺寸夹到 viewport（8px 边距，
 * resize/滚动关闭）；每个实例独立 ref/pending，不跨字段串状态。
 *
 * 宿主集成（`useExpressionField`）：表达式/求值结果由宿主 state 持有（提交载荷
 * 与预览读取同一求值），组件通过 `onValidity` 回报；数值状态仍走宿主既有
 * 变量（numberText/setNumberText），改数值即清除表达式（与 S4b 一致）。
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { VariableDto } from '@luban-cad/shared';
import {
  clampExpressionMenuPosition,
  evaluateFeatureNumberField,
  expressionFieldMessage,
  formatExpressionFieldValue,
  type ExpressionFieldKind,
  type FeatureExpressionFieldError,
} from '../internal/feature-expression-field.js';
import { isNumericDimensionText } from '../internal/sketch-dimension-expression.js';
import type { VariableCreateRequest } from '../internal/variables.js';
import {
  applyExpressionAutocomplete,
  expressionAutocompleteQuery,
} from './SketchDimensionDialog.js';
import {
  autocompleteOptionCount,
  matchesVariableSuggestions,
  SketchExpressionAutocomplete,
} from './SketchExpressionAutocomplete.js';

/** 组件回报的求值结果（含变量表未就绪的两种附属错误）。 */
export type ExpressionFieldEvaluation =
  | { ok: true; value: number; expression?: string }
  | {
    ok: false;
    error:
      | FeatureExpressionFieldError
      | { code: 'variablesLoading' }
      | { code: 'variablesUnavailable'; message?: string };
  };

/** 宿主侧字段控制器（`useExpressionField`）：表达式 + 最近求值 + 禁用门。 */
export interface ExpressionFieldController {
  expression: string | undefined;
  setExpression: (next: string | undefined) => void;
  evaluation: ExpressionFieldEvaluation | undefined;
  onValidity: (evaluation: ExpressionFieldEvaluation | undefined) => void;
  /** 表达式在场但本地求值未通过（宿主提交/预览门）。 */
  invalid: boolean;
}

/**
 * 宿主字段状态（一次声明 expression/evaluation 两个本地态；求值引擎只有组件
 * 一侧）。`invalid` 在求值尚未回报时按保守口径视为 true（不提前放行提交）。
 */
export function useExpressionField(initialExpression?: string): ExpressionFieldController {
  const [expression, setExpressionState] = React.useState<string | undefined>(initialExpression);
  const [evaluation, setEvaluation] = React.useState<ExpressionFieldEvaluation | undefined>(undefined);
  const onValidity = React.useCallback(
    (next: ExpressionFieldEvaluation | undefined): void => setEvaluation(next),
    [],
  );
  const setExpression = React.useCallback((next: string | undefined): void => {
    setExpressionState(next);
    if (next === undefined)
      setEvaluation(undefined);
  }, []);
  // P1（review）：控制器对象必须**身份稳定**——FeatureDialog/HoleDialog 的预览
  // effect 依赖控制器（buildParams/previewGeometry/deps），字面量对象每次渲染
  // 新身份会让「preview RPC 返回 → setState → 重渲染 → effect 重新武装」形成
  // 2–6 req/s 的反馈环（并反复占写租约）。仅在 expression/evaluation 变化时重建。
  return React.useMemo<ExpressionFieldController>(() => ({
    expression,
    setExpression,
    evaluation,
    onValidity,
    invalid: expression !== undefined && (evaluation === undefined || !evaluation.ok),
  }), [expression, setExpression, evaluation, onValidity]);
}

export interface ExpressionNumberFieldProps {
  id: string;
  /** 可见标签 + 输入 aria-label（showLabel=false 时仅 aria-label）。 */
  label: string;
  /** 宿主既有数值文本状态（表达式模式下同步承载草稿；聚焦时显示 expression）。 */
  numberText: string;
  setNumberText: (next: string) => void;
  /** 当前表达式原文（undefined=数值模式）。 */
  expression?: string;
  setExpression: (next: string | undefined) => void;
  kind: ExpressionFieldKind;
  /** 单位后缀（mm/°/in）；空串不渲染。 */
  unitLabel: string;
  /** false=不渲染表达式能力（清空 expression，仅数值输入）。 */
  applicable: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** 强制红态（如提交失败后）；本地无效表达式也会自动红。 */
  invalid?: boolean;
  /** 本地求值回报（宿主提交/预览门；undefined=字段不适用）。 */
  onValidity?: (evaluation: ExpressionFieldEvaluation | undefined) => void;
  /** 落库表达式原文（判断“未触碰”即可用物化快照）。 */
  storedExpression?: string;
  /** 变量表不可用时未触碰落库表达式的物化快照（signed 值按原符号）。 */
  storedExpressionUntouchedValue?: number;
  /** 字段领域校验（角度类收到度值）。 */
  validate?: (value: number) => boolean;
  /** 失焦显示投影覆盖（如孔对话框 mm/in 单位投影）；缺省 4 位小数。 */
  formatValue?: (value: number) => string;
  /**
   * 内联创建「值」的契约单位解释器（如孔对话框 in 显示 → 变量值必须 mm）。
   * 仅在**纯数字草稿**时调用；表达式求值数已是契约单位（length=mm / angle=°）。
   */
  inlineCreateValue?: (text: string) => number | undefined;
  /** 内联创建请求的单位（缺省 unitLabel；显式给 mm 时宿主按 length 建变量）。 */
  inlineCreateUnit?: string;
  variables?: readonly VariableDto[];
  variablesLoading?: boolean;
  variablesError?: string;
  variablesReady?: boolean;
  onCreateVariable?: (request: VariableCreateRequest) => void;
  /** 宿主内联创建面板当前 active 变体（null=关闭；用于取消检测）。 */
  variablesDialogActive?: boolean | string | null;
  showLabel?: boolean;
  labelClassName?: string;
  inputClassName?: string;
  unitClassName?: string;
  /** 行内前置内容（如孔对话框的图标）。 */
  leading?: React.ReactNode;
  /** 单位之后的宿主控件（计算器等）。 */
  trailing?: React.ReactNode;
  inputTestId?: string;
  /** 提示（title/aria）：如「半径表达式」——说明该字段接受表达式。 */
  expressionLabel?: string;
  /** 变量量纲错误文案里的字段名（如「深度字段」；缺省通用「字段」）。 */
  variableTypeField?: string;
  onFocusChange?: (focused: boolean) => void;
  /** Enter 且无补全威胁时回调宿主（S4b 深度字段=提交）。 */
  onEnter?: () => void;
}

const DEFAULT_LABEL_CLASS = 'part-studio-feature-dialog__distance-label';
const DEFAULT_INPUT_CLASS = 'part-studio-feature-dialog__input';
const DEFAULT_UNIT_CLASS = 'part-studio-feature-dialog__value-unit';

/** 内联创建「值」预填的显示单位（angleRadFromDeg 的求值数是弧度，变量按度）。 */
function inlineCreateValueTextFor(kind: ExpressionFieldKind, value: number): string {
  if (!Number.isFinite(value))
    return '';
  return kind === 'angleRadFromDeg' ? String(value * 180 / Math.PI) : String(value);
}

/** 深度文本中 `#name` token 的唯一区间（内联创建回填身份验证；同 S4b）。 */
function findVariableTokenRange(
  text: string,
  name: string,
): { start: number; end: number } | undefined {
  if (name === '') return undefined;
  const matches: Array<{ start: number; end: number }> = [];
  const pattern = new RegExp(`#${name}(?![A-Za-z0-9_])`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    if (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1]!)) continue;
    matches.push({ start, end: start + match[0].length });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

/** 空 query 创建（点「新建变量…」时的裸 `#`）：仅当原位置仍是 `#token` 时返回整段。 */
function findEmptyTokenRange(text: string, start: number): { start: number; end: number } | undefined {
  if (start < 0 || start >= text.length || text[start] !== '#') return undefined;
  const match = /^#([A-Za-z_][A-Za-z0-9_]*)?/.exec(text.slice(start));
  if (!match) return undefined;
  return { start, end: start + match[0].length };
}

export function ExpressionNumberField({
  id,
  label,
  numberText,
  setNumberText,
  expression,
  setExpression,
  kind,
  unitLabel,
  applicable,
  disabled = false,
  placeholder,
  invalid,
  onValidity,
  storedExpression,
  storedExpressionUntouchedValue,
  validate,
  formatValue,
  inlineCreateValue,
  inlineCreateUnit,
  variables,
  variablesLoading = false,
  variablesError,
  variablesReady = true,
  onCreateVariable,
  variablesDialogActive = null,
  showLabel = true,
  labelClassName = DEFAULT_LABEL_CLASS,
  inputClassName = DEFAULT_INPUT_CLASS,
  unitClassName = DEFAULT_UNIT_CLASS,
  leading,
  trailing,
  inputTestId,
  expressionLabel,
  variableTypeField,
  onFocusChange,
  onEnter,
}: ExpressionNumberFieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const errorId = React.useId();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const menuHostRef = React.useRef<HTMLSpanElement | null>(null);
  const numberTextRef = React.useRef(numberText);
  numberTextRef.current = numberText;
  const onCreateVariableRef = React.useRef(onCreateVariable);
  onCreateVariableRef.current = onCreateVariable;
  const onValidityRef = React.useRef(onValidity);
  onValidityRef.current = onValidity;
  // 领域校验函数按 ref 取用：宿主常在 JSX 内联箭头函数（每次渲染新身份），
  // 若进求值 useMemo 依赖会每渲染产生新 evaluation → onValidity → 宿主
  // setState 的无限环。校验是纯函数（只读当前 kind 域），无状态可忽略身份。
  const validateRef = React.useRef(validate);
  validateRef.current = validate;

  const [focused, setFocused] = React.useState(false);
  const focusedRef = React.useRef(false);
  focusedRef.current = focused;
  const [dirty, setDirty] = React.useState(false);
  const [autocomplete, setAutocomplete] = React.useState<{ query: string; index: number } | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<{ left: number; top: number } | undefined>(undefined);
  /** 本字段最近一次**原始数值文本**（内联创建「值」预填；不取格式化值/非法表达式）。 */
  const lastNumericTextRef = React.useRef(numberText);
  /**
   * 内联创建成功后回填：记录发起时的既有变量名集/请求名/空 query 的 `#` 位置；
   * 变量表刷新出现新变量时按**当前文本**重新定位 token 再替换（不产生
   * `#barbazar`/`##baz`；面板取消/关闭即丢弃 pending）。
   */
  const pendingCreateRef = React.useRef<{
    existingNames: Set<string>;
    requestedName: string;
    start: number;
    sawPanelOpen: boolean;
  } | null>(null);

  const variableList = React.useMemo(() => variables ?? [], [variables]);
  const variablesUnavailable = variablesLoading
    || variablesError !== undefined
    || variablesReady === false;
  const storedExpressionUntouched = storedExpression !== undefined
    && expression === storedExpression
    && !dirty;
  const formatEvaluated = React.useCallback(
    (value: number): string => (formatValue !== undefined
      ? formatValue(value)
      : formatExpressionFieldValue(kind, value)),
    [formatValue, kind],
  );

  /** 本地求值（变量表未就绪时：未触碰落库表达式按物化快照）。 */
  const evaluation = React.useMemo<ExpressionFieldEvaluation | undefined>(() => {
    if (!applicable) return undefined;
    const text = expression ?? numberText;
    if (variablesUnavailable) {
      if (expression !== undefined) {
        if (storedExpressionUntouched && storedExpressionUntouchedValue !== undefined)
          return { ok: true, value: storedExpressionUntouchedValue, expression };
        return {
          ok: false,
          error: variablesLoading
            ? { code: 'variablesLoading' }
            : { code: 'variablesUnavailable', message: variablesError },
        };
      }
      // 纯数字不依赖变量表。
      return evaluateFeatureNumberField({ kind, text, variables: [], validate: validateRef.current });
    }
    return evaluateFeatureNumberField({ kind, text, variables: variableList, validate: validateRef.current });
  }, [
    applicable, expression, numberText, variablesUnavailable, variablesLoading,
    variablesError, storedExpressionUntouched, storedExpressionUntouchedValue,
    kind, variableList,
  ]);

  // 回报宿主（ref 间接：宿主回调不必稳定；效果只随求值身份变化）。
  React.useEffect(() => {
    onValidityRef.current?.(evaluation);
  }, [evaluation]);

  // 最近一次原始数值草稿（内联创建值预填；不做格式化/不从非法表达式回填）。
  // P3-1（review）：必须看**数值状态 numberText**而非可见文本 `expression ?? numberText`
  // ——表达式在场时可见文本是 `#expr`，旧实现永不刷新 ref；HoleDialog mm↔in 切换后
  // 仍拿旧单位数值去换算（6.35 mm → Inch → 误预填 161.29 mm）。表达式失焦/切换
  // 单位时 numberText 会被投影为当前单位数值，这里照常刷新；聚焦中 numberText 是
  // 表达式草稿（非数字）→ 保留上一数值。S4b 纯数值原始草稿行为不变。
  React.useEffect(() => {
    if (applicable && isNumericDimensionText(numberText))
      lastNumericTextRef.current = numberText.trim();
  }, [applicable, numberText]);

  // 不适用（如切到 throughAll / 非 THIN / fullRevolve）→ 清空表达式（仅数值输入）。
  React.useEffect(() => {
    if (!applicable && expression !== undefined)
      setExpression(undefined);
  }, [applicable, expression, setExpression]);

  // 卸载清理 pending 内联创建状态（不跨字段串状态）。
  React.useEffect(() => () => {
    pendingCreateRef.current = null;
  }, []);

  const autocompleteMatches = React.useMemo(
    () => (autocomplete ? matchesVariableSuggestions(variableList, autocomplete.query) : []),
    [autocomplete, variableList],
  );
  const autocompleteCount = autocomplete === null
    ? 0
    : autocompleteOptionCount(variableList, autocomplete.query, onCreateVariable !== undefined);
  const autocompleteOpen = applicable
    && autocomplete !== null
    && autocompleteCount > 0;

  // 视口夹紧（S4b 残留）：按 input rect + 菜单实测尺寸夹到 viewport（8px）；
  // resize/滚动关闭（口径允许“关闭或重算”，关闭最不易与画布滚动竞争）。
  React.useLayoutEffect(() => {
    if (!autocompleteOpen) {
      setMenuAnchor(undefined);
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    const measure = (): void => {
      const rect = input.getBoundingClientRect();
      const menuRect = menuHostRef.current?.firstElementChild?.getBoundingClientRect();
      setMenuAnchor(clampExpressionMenuPosition({
        anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        menu: {
          width: menuRect?.width !== undefined && menuRect.width > 0 ? menuRect.width : 180,
          height: menuRect?.height !== undefined && menuRect.height > 0 ? menuRect.height : 180,
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }));
    };
    measure();
    const close = (): void => setAutocomplete(null);
    // 菜单自身滚动（max-height 180px）不关闭；窗口/外部滚动关闭。
    const onScroll = (event: Event): void => {
      const target = event.target as Node | null;
      if (target !== null && typeof (target as Node).nodeType === 'number'
        && menuHostRef.current?.contains(target) === true) {
        return;
      }
      close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [autocompleteOpen, autocomplete?.query, variableList]);

  /**
   * 输入变化：同步表达式状态 + `#` 补全查询。
   * `syncAutocomplete=false` 用于程序化写回（补全选中/内联创建回填）：不得再
   * 从旧 DOM caret 重推 query 重新打开菜单。
   */
  const handleChange = React.useCallback((next: string, options?: {
    caret?: number | null;
    syncAutocomplete?: boolean;
  }): void => {
    setDirty(true);
    setNumberText(next);
    if (applicable && !isNumericDimensionText(next))
      setExpression(next);
    else
      setExpression(undefined);
    if (applicable) {
      const evaluated = evaluateFeatureNumberField({ kind, text: next, variables: variableList, validate });
      // 失焦状态下程序化写回（内联创建成功）显示求值结果，而非原始 token。
      if (!focusedRef.current && evaluated.ok && evaluated.expression !== undefined)
        setNumberText(formatEvaluated(evaluated.value));
    }
    if (!applicable || options?.syncAutocomplete === false) {
      setAutocomplete(null);
      return;
    }
    const caret = options?.caret ?? inputRef.current?.selectionStart ?? next.length;
    const query = expressionAutocompleteQuery(next, caret);
    const hasCreate = onCreateVariableRef.current !== undefined;
    if (query === null
      || autocompleteOptionCount(variableList, query, hasCreate) === 0) {
      setAutocomplete(null);
      return;
    }
    setAutocomplete((current) =>
      current && current.query === query ? current : { query, index: 0 });
  }, [applicable, kind, variableList, validate, setExpression, setNumberText, formatEvaluated]);

  /** caret/选区变化只收窄/关闭菜单（不重新打开；同 S2 口径）。 */
  const syncAutocompleteFromCaret = React.useCallback((text: string, caret: number | null): void => {
    if (!applicable) {
      setAutocomplete(null);
      return;
    }
    const query = expressionAutocompleteQuery(text, caret);
    const hasCreate = onCreateVariableRef.current !== undefined;
    setAutocomplete((current) => {
      if (!current) return current;
      if (query === null || autocompleteOptionCount(variableList, query, hasCreate) === 0)
        return null;
      return current.query === query ? current : { query, index: 0 };
    });
  }, [applicable, variableList]);

  /** 选中补全项：替换 caret 前 `#query` → `#name`，并关闭菜单。 */
  const selectAutocomplete = React.useCallback((name: string): boolean => {
    const input = inputRef.current;
    const applied = applyExpressionAutocomplete(
      numberTextRef.current,
      input?.selectionStart ?? null,
      name,
    );
    if (!applied) {
      setAutocomplete(null);
      return false;
    }
    handleChange(applied.text, { caret: applied.caret, syncAutocomplete: false });
    window.requestAnimationFrame(() => {
      const element = inputRef.current;
      // 用户可能已在选中后立即 Tab/点击离开：延迟帧只恢复仍在字段上的光标，
      // 不得把焦点抢回来——否则失焦求值结果会被表达式原文覆盖。
      if (element === null || element.ownerDocument.activeElement !== element)
        return;
      element.focus();
      element.setSelectionRange(applied.caret, applied.caret);
    });
    return true;
  }, [handleChange]);

  /** 内联创建「值」预填：原始数值文本 → 求值数；否则最近原始数值（绝不回填非法表达式）。 */
  const inlineCreateValueText = React.useCallback((): string => {
    const parseNumeric = (raw: string): string => {
      const trimmed = raw.trim();
      if (inlineCreateValue === undefined)
        return trimmed; // S4b 原口径：保留用户输入的原始数值文本
      const contract = inlineCreateValue(trimmed);
      return contract !== undefined && Number.isFinite(contract)
        ? String(contract)
        : trimmed;
    };
    const text = expression ?? numberText;
    if (applicable && isNumericDimensionText(text) && evaluation?.ok)
      return parseNumeric(text);
    if (evaluation?.ok)
      return inlineCreateValueTextFor(kind, evaluation.value);
    return parseNumeric(lastNumericTextRef.current);
  }, [applicable, evaluation, expression, inlineCreateValue, kind, numberText]);

  /** 请求宿主打开 S3b 内联创建面板（name=token、值=字段当前值、锚定输入框右侧）。 */
  const requestInlineCreate = React.useCallback((name: string): boolean => {
    const handler = onCreateVariableRef.current;
    if (!handler) return false;
    setAutocomplete(null);
    const input = inputRef.current;
    const caret = input?.selectionStart ?? numberTextRef.current.length;
    const query = autocomplete?.query ?? name.trim();
    pendingCreateRef.current = {
      existingNames: new Set(variableList.map((variable) => variable.name)),
      requestedName: name.trim(),
      // 仅供空 query（裸 `#`）定位；完成时仍按当前文本重新验证 token 身份。
      start: Math.max(0, caret - query.length - 1),
      sawPanelOpen: false,
    };
    const rect = input?.getBoundingClientRect();
    handler({
      name: name.trim(),
      valueText: inlineCreateValueText(),
      unit: inlineCreateUnit ?? unitLabel,
      ...(rect ? { anchor: { x: rect.right + 8, y: rect.top } } : {}),
    });
    return true;
  }, [autocomplete, inlineCreateUnit, inlineCreateValueText, unitLabel, variableList]);

  /** 未知整 token `#name` + Enter → 打开内联创建（不提交）。 */
  const tryCreateUnknownVariable = React.useCallback((): boolean => {
    if (!applicable || onCreateVariableRef.current === undefined) return false;
    const match = /^\s*#([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(numberTextRef.current);
    if (!match) return false;
    const name = match[1]!;
    if (variableList.some((variable) => variable.name === name)) return false;
    return requestInlineCreate(name);
  }, [applicable, requestInlineCreate, variableList]);

  // 内联创建完成：变量表刷新出现新变量 → 按**当前文本**重定位 token 再替换；
  // 面板取消/关闭且无新变量 → 丢弃 pending（不残留跨次创建的状态）。
  React.useEffect(() => {
    const pending = pendingCreateRef.current;
    if (!pending) return;
    if (variablesDialogActive !== null && variablesDialogActive !== undefined)
      pending.sawPanelOpen = true;
    const added = variableList.filter((variable) => !pending.existingNames.has(variable.name));
    if (added.length === 0) {
      // 只在“确实打开过面板后关闭”时判取消；宿主尚未打开（同一次事件内）不清。
      if (pending.sawPanelOpen && (variablesDialogActive === null || variablesDialogActive === undefined))
        pendingCreateRef.current = null;
      return;
    }
    // 用户可能在创建面板改名：精确名缺失时接受唯一新变量，并把 token 换成新名。
    const created = (pending.requestedName !== ''
      ? variableList.find((variable) => variable.name === pending.requestedName)
      : undefined)
      ?? (added.length === 1 ? added[0] : undefined);
    if (!created) return;
    pendingCreateRef.current = null;
    const text = numberTextRef.current;
    // token 身份验证：只在当前文本仍唯一包含该 token（或空 query 的 `#` 原位）
    // 时替换；找不到/歧义 → 不改文本（重新校验当前草稿即可）。
    const range = pending.requestedName !== ''
      ? findVariableTokenRange(text, pending.requestedName)
      : findEmptyTokenRange(text, pending.start);
    let nextText = text;
    if (range) {
      const inserted = `#${created.name}`;
      const before = text.slice(0, range.start);
      const after = text.slice(range.end);
      // 绝不产生 `##name`；token 身份不匹配/歧义时保持当前文本。
      if (!before.endsWith('#'))
        nextText = `${before}${inserted}${after}`;
    }
    // 即使 token 已是目标名（仅重新校验路径），也要走同一写回：字段失焦时
    // 显示求值结果并清除旧的无效态；不抢焦点。
    handleChange(nextText, { syncAutocomplete: false });
  }, [variableList, variablesDialogActive, handleChange]);

  const showingExpression = applicable && expression !== undefined && focused;
  const showInvalid = invalid === true
    || (applicable && expression !== undefined && evaluation !== undefined && !evaluation.ok);
  // P2.1（review）：表达式错误文本必须**在字段侧可达**（aria-describedby +
  // 可见 note），而不是只能靠宿主提交出口。仅表达式在场时渲染（S4b 的数值
  // 空/非正仍走点击确认就地错误，保持既有手感）。
  const expressionErrorText = showInvalid
    && applicable
    && expression !== undefined
    && evaluation !== undefined
    && !evaluation.ok
    ? expressionFieldMessage(evaluation.error, kind, t, { variableTypeField })
    : undefined;

  return (
    <React.Fragment>
      {leading}
      {showLabel && (
        <label className={labelClassName} htmlFor={id}>
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={applicable ? 'text' : 'decimal'}
        aria-label={label}
        aria-invalid={showInvalid ? 'true' : undefined}
        data-invalid={showInvalid ? 'true' : 'false'}
        data-expression-field={applicable ? kind : undefined}
        aria-describedby={expressionErrorText !== undefined ? errorId : undefined}
        title={applicable ? expressionLabel : undefined}
        className={inputClassName}
        data-testid={inputTestId}
        placeholder={placeholder}
        value={showingExpression ? expression : numberText}
        disabled={disabled}
        onFocus={() => {
          setFocused(true);
          focusedRef.current = true;
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setFocused(false);
          focusedRef.current = false;
          onFocusChange?.(false);
          setAutocomplete(null);
          if (applicable && expression !== undefined) {
            setNumberText(evaluation?.ok
              ? formatEvaluated(evaluation.value)
              : expression);
          }
        }}
        onChange={(event) => {
          if (!applicable) {
            setNumberText(event.target.value);
            setAutocomplete(null);
            return;
          }
          handleChange(event.target.value, { caret: event.target.selectionStart });
        }}
        onSelect={(event) => {
          if (!applicable) return;
          syncAutocompleteFromCaret(
            event.currentTarget.value,
            event.currentTarget.selectionStart,
          );
        }}
        onKeyDown={(event) => {
          if (!applicable) return;
          // `#` 补全打开时先消费（↑/↓ 导航、Enter 选中/新建、Escape 关闭——
          // 不把 Enter 偷换成提交）。
          if (autocompleteOpen) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const delta = event.key === 'ArrowDown' ? 1 : -1;
              setAutocomplete((current) => {
                if (!current) return current;
                const count = autocompleteOptionCount(
                  variableList,
                  current.query,
                  onCreateVariableRef.current !== undefined,
                );
                if (count === 0) return null;
                return { ...current, index: (current.index + delta + count) % count };
              });
              return;
            }
            if (event.key === 'Enter') {
              const index = autocomplete?.index ?? 0;
              if (index >= autocompleteMatches.length
                && requestInlineCreate(autocomplete?.query ?? '')) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              const match = autocompleteMatches[index];
              if (match && selectAutocomplete(match.name)) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              setAutocomplete(null);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setAutocomplete(null);
              return;
            }
          }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            // 未知整 token `#name` + Enter → 内联创建面板（不提交）。
            if (tryCreateUnknownVariable()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (onEnter !== undefined) {
              event.preventDefault();
              event.stopPropagation();
              onEnter();
            }
          }
        }}
      />
      {unitLabel !== '' && <span className={unitClassName}>{unitLabel}</span>}
      {trailing}
      {expressionErrorText !== undefined && (
        <p
          id={errorId}
          role="note"
          className="part-studio-feature-dialog__expression-error"
          data-testid="expression-field-error"
        >
          {expressionErrorText}
        </p>
      )}
      {autocompleteOpen && (
        <span ref={menuHostRef} style={{ display: 'contents' }}>
          <SketchExpressionAutocomplete
            variables={variableList}
            query={autocomplete?.query ?? ''}
            highlightedIndex={autocomplete?.index ?? 0}
            onHighlight={(index) => {
              setAutocomplete((current) => (current ? { ...current, index } : current));
            }}
            onSelect={selectAutocomplete}
            onCreate={onCreateVariable !== undefined
              ? (name) => { requestInlineCreate(name); }
              : undefined}
            anchor={menuAnchor}
          />
        </span>
      )}
    </React.Fragment>
  );
}
