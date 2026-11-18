/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 表达式求值错误 → zh/en 本地化文案（ADR-0020 S5，shared 1.75）。
 *
 * shared `ExpressionFailure` 的 `message` 是中文直出（后端错误面兼容，逐字保留）；
 * 本模块按结构化的 `detail.kind`（locale-neutral）映射 `partStudio.expression.errors.*`
 * 模板，**绝不**回落中文 shared message（en 界面不得出现 CJK）。
 *
 * 语义：
 * - `code === 'empty'` → 空表达式文案（`detail` 缺省，见 shared 类型注释）；
 *   **本地包装**（`code:"expression"`）以 `sourceCode === 'empty'` 等价处理；
 * - `attributedVariable`（变量表实际失败变量）→ 前缀「变量 "name": reason」
 *   （zh 模板与 shared message 逐字对齐）；
 * - `referenceChain`（visiting 顺序、名字不含 #）→ 追加引用链；
 * - 无 detail / 未知 kind（旧后端或未来扩展）→ 本地化通用文案。
 */
import type {
  ExpressionErrorCode,
  ExpressionErrorDetail,
  ExpressionFailure,
} from '@luban-cad/shared';

/** helper 可接受的最小失败形状（shared ExpressionFailure 与本地包装错误共用）。 */
export interface ExpressionFailureMessageInput {
  code: string;
  message: string;
  position?: number;
  detail?: ExpressionErrorDetail;
  attributedVariable?: string;
  referenceChain?: string[];
  /**
   * 本地包装前的 shared 源错误码（S5 review P2-1）：本地 `code` 固定为
   * `'expression'`，`code:"empty"` 会丢失；包装时写入源码，helper 视
   * `sourceCode === 'empty'` 同 `code === 'empty'`（空表达式文案）。
   */
  sourceCode?: ExpressionErrorCode;
}

export type ExpressionMessageTranslator = (key: string, options?: Record<string, unknown>) => string;

const ERROR_KEY_PREFIX = 'partStudio.expression.errors';

/** 详情 kind → i18n key（缺省/未知 → 通用文案）。 */
const DETAIL_I18N_KEYS: Record<ExpressionErrorDetail['kind'], string> = {
  invalidNumber: `${ERROR_KEY_PREFIX}.invalidNumber`,
  invalidChar: `${ERROR_KEY_PREFIX}.invalidChar`,
  invalidVariableRef: `${ERROR_KEY_PREFIX}.invalidVariableRef`,
  trailingCharacter: `${ERROR_KEY_PREFIX}.trailingCharacter`,
  unexpectedToken: `${ERROR_KEY_PREFIX}.unexpectedToken`,
  unexpectedEnd: `${ERROR_KEY_PREFIX}.unexpectedEnd`,
  missingRightParen: `${ERROR_KEY_PREFIX}.missingRightParen`,
  depthLimit: `${ERROR_KEY_PREFIX}.depthLimit`,
  lengthLimit: `${ERROR_KEY_PREFIX}.lengthLimit`,
  invalidVariableName: `${ERROR_KEY_PREFIX}.invalidVariableName`,
  duplicateName: `${ERROR_KEY_PREFIX}.duplicateName`,
  unknownVariable: `${ERROR_KEY_PREFIX}.unknownVariable`,
  cycle: `${ERROR_KEY_PREFIX}.cycle`,
  divisionByZero: `${ERROR_KEY_PREFIX}.divisionByZero`,
  literalOutOfRange: `${ERROR_KEY_PREFIX}.literalOutOfRange`,
  resultNotFinite: `${ERROR_KEY_PREFIX}.resultNotFinite`,
  variableNotFinite: `${ERROR_KEY_PREFIX}.variableNotFinite`,
};

/** cycle detail 的名字补 `#` 前缀（展示口径；detail 内名字不含 #）。 */
function cycleDisplayChain(chain: readonly string[]): string {
  return chain.map((name) => `#${name}`).join(' → ');
}

/** detail → 原因文案（无 detail / 未知 kind → 通用文案）。 */
function detailMessage(
  detail: ExpressionErrorDetail | undefined,
  t: ExpressionMessageTranslator,
): string {
  if (detail === undefined)
    return t(`${ERROR_KEY_PREFIX}.expressionInvalidGeneric`);
  switch (detail.kind) {
    case 'invalidNumber':
    case 'invalidVariableRef':
    case 'unexpectedEnd':
    case 'missingRightParen':
    case 'divisionByZero':
    case 'resultNotFinite':
      return t(DETAIL_I18N_KEYS[detail.kind]);
    case 'invalidChar':
      return t(DETAIL_I18N_KEYS.invalidChar, { char: detail.char });
    case 'trailingCharacter':
      return t(DETAIL_I18N_KEYS.trailingCharacter, { token: detail.token });
    case 'unexpectedToken':
      return t(DETAIL_I18N_KEYS.unexpectedToken, { token: detail.token });
    case 'depthLimit':
      return t(DETAIL_I18N_KEYS.depthLimit, { limit: detail.limit });
    case 'lengthLimit':
      return t(DETAIL_I18N_KEYS.lengthLimit, { limit: detail.limit });
    case 'invalidVariableName':
      return t(DETAIL_I18N_KEYS.invalidVariableName, { name: detail.name });
    case 'duplicateName':
      return t(DETAIL_I18N_KEYS.duplicateName, { name: detail.name });
    case 'unknownVariable':
      return t(DETAIL_I18N_KEYS.unknownVariable, { name: detail.name });
    case 'cycle':
      return t(DETAIL_I18N_KEYS.cycle, { chain: cycleDisplayChain(detail.chain) });
    case 'literalOutOfRange':
      return t(DETAIL_I18N_KEYS.literalOutOfRange, { text: detail.text });
    case 'variableNotFinite':
      return t(DETAIL_I18N_KEYS.variableNotFinite, { name: detail.name });
    default:
      // 未来 shared 新增 kind（旧 web 消费新后端）→ 本地化通用文案。
      return t(`${ERROR_KEY_PREFIX}.expressionInvalidGeneric`);
  }
}

/**
 * 表达式失败 → 可直接展示的本地化文本（zh/en 同 key）。
 * 有 `attributedVariable` 时包「变量 "name"：原因」，有 `referenceChain` 时
 * 追加引用链；绝不返回 shared 中文 `message`。
 */
export function expressionFailureMessage(
  failure: ExpressionFailureMessageInput,
  t: ExpressionMessageTranslator,
): string {
  // 本地包装（code='expression'）用 sourceCode 还原 shared 的 empty 语义（P2-1）。
  const reason = (failure.sourceCode ?? failure.code) === 'empty'
    ? t(`${ERROR_KEY_PREFIX}.empty`)
    : detailMessage(failure.detail, t);
  const attributed = failure.attributedVariable !== undefined
    ? t(`${ERROR_KEY_PREFIX}.inVariable`, { name: failure.attributedVariable, reason })
    : reason;
  if (failure.referenceChain === undefined || failure.referenceChain.length === 0)
    return attributed;
  return `${attributed}${t(`${ERROR_KEY_PREFIX}.chain`, {
    chain: failure.referenceChain.join(' → '),
  })}`;
}

/** 失败对象共享字段（复制到 web 本地错误对象；只保留在场字段）。 */
export function expressionFailureFields(failure: {
  position?: number;
  detail?: ExpressionErrorDetail;
  attributedVariable?: string;
  referenceChain?: string[];
}): {
  position?: number;
  detail?: ExpressionErrorDetail;
  attributedVariable?: string;
  referenceChain?: string[];
} {
  return {
    ...(failure.position !== undefined ? { position: failure.position } : {}),
    ...(failure.detail !== undefined ? { detail: failure.detail } : {}),
    ...(failure.attributedVariable !== undefined
      ? { attributedVariable: failure.attributedVariable }
      : {}),
    ...(failure.referenceChain !== undefined ? { referenceChain: failure.referenceChain } : {}),
  };
}

/**
 * shared 失败 → 本地 `expression` 错误对象（code/message + additive 共享字段）。
 * `sourceCode` 保留包装前的 shared 错误码（P2-1：本地 `code` 固定 `'expression'`，
 * 若不保留则 `empty` 会被本地化通用文案吞掉）。
 */
export function expressionFailureToLocal(failure: ExpressionFailure): {
  code: 'expression';
  message: string;
  sourceCode: ExpressionErrorCode;
  position?: number;
  detail?: ExpressionErrorDetail;
  attributedVariable?: string;
  referenceChain?: string[];
} {
  return {
    code: 'expression',
    message: failure.message,
    sourceCode: failure.code,
    ...expressionFailureFields(failure),
  };
}
