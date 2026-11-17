/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 表达式求值器（ADR-0020 S1）：草图尺寸表达式 + Part Studio 变量的**纯算术**求值。
 * 前后端同源（shared 单一实现）；禁止 `eval`/`new Function`；纯函数、无副作用、无 I/O。
 *
 * 语法（v1）：
 *   expression := term (("+" | "-") term)*
 *   term       := unary (("*" | "/") unary)*
 *   unary      := ("+" | "-") unary | primary
 *   primary    := NUMBER | "#" NAME | "(" expression ")"
 * - NUMBER：十进制（`123`、`12.3`、`.5`、`12.`）；不接受指数/十六进制/单位后缀；
 * - NAME：`[A-Za-z_][A-Za-z0-9_]*`，大小写敏感；
 * - 空白容忍；**无单位后缀/函数/幂运算**（单位与角度换算由调用方按量纲负责）。
 *
 * 语义：
 * - `/0` 或任何非有限结果 → `nonFinite`；空/全空白 → `empty`；非法字符/缺操作数/
 *   多余字符/嵌套超限 → `syntax`（带 0 基 position）；未知 `#name` → `unknownVariable`；
 *   变量表重复名 → `duplicateName`；循环依赖 → `cycle`（message 含确定性循环链）。
 * - 变量表按依赖需要递归求值（访问栈检测循环；同层按输入顺序，结果确定）。
 * - 边界：表达式长度上限 1024 字符、解析递归深度上限 64（括号嵌套 + 一元链），
 *   超限一律 `syntax`。
 * - 求值器只处理**数值**：角度表达式由后端从度换算为弧度（S1b 职责），单位系统不在 v1。
 * - `collectVariableReferences`（S3）只做**词法级**引用收集（按首次出现序去重；词法错误 →
 *   `[]`）——需要错误详情的调用方走 `evaluateExpression`；类型校验不得把语法错误改写成
 *   另一种错误，故本 helper 不抛错、不重复做语法分析。
 */

export interface ExpressionVariableRef { name: string; expression: string }

export type ExpressionErrorCode =
  | "empty" | "syntax" | "unknownVariable" | "cycle" | "duplicateName" | "nonFinite";

export interface ExpressionFailure {
  ok: false;
  code: ExpressionErrorCode;
  message: string;
  /** 出错字符下标（0 基；empty/cycle/duplicateName 可省略）。 */
  position?: number;
}

export type ExpressionResult = { ok: true; value: number } | ExpressionFailure;

export type VariableTableResult =
  | { ok: true; values: ReadonlyMap<string, number> }
  | ExpressionFailure;

/** 表达式长度上限（UTF-16 码元；超限 → syntax）。
 *  v1.73（ADR-0020 S4a）：公开导出——后端特征字段 schema（如 `ExtrudeParams.distanceExpression`
 *  的 zod `.max()`）与求值器共用同一上限，避免两侧硬编码漂移。 */
export const MAX_EXPRESSION_LENGTH = 1024;
/** 解析递归深度上限（括号嵌套 + 一元运算符链；超限 → syntax）。 */
const MAX_PARSE_DEPTH = 64;
const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 变量名规则：`[A-Za-z_][A-Za-z0-9_]*`，大小写敏感。 */
export function isValidVariableName(name: string): boolean {
  return VARIABLE_NAME_PATTERN.test(name);
}

// =============================================================================
// 词法
// =============================================================================

type TokenKind = "number" | "variable" | "op" | "eof";

interface Token {
  kind: TokenKind;
  /** number=字面量文本；variable=变量名（不含 #）；op=运算符；eof=""。 */
  text: string;
  /** 0 基起始下标（eof = 表达式长度）。 */
  start: number;
  /** 仅 number：解析后的有限数值。 */
  value?: number;
}

/** 求值内部错误（统一在公开入口捕获并转 ExpressionFailure）。 */
class ExpressionEvalError extends Error {
  public constructor(
    public readonly code: ExpressionErrorCode,
    message: string,
    public readonly position?: number,
    /** true=已由实际失败的变量归因（含引用链），上层不再重复前缀。 */
    public readonly attributed = false,
  ) {
    super(message);
    this.name = "ExpressionEvalError";
  }
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function isNameStart(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_";
}

function isNamePart(ch: string): boolean {
  return isNameStart(ch) || isDigit(ch);
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (isWhitespace(ch)) {
      i++;
      continue;
    }
    if (isDigit(ch) || ch === ".") {
      const start = i;
      let hasDigits = false;
      while (i < expression.length && isDigit(expression[i])) {
        i++;
        hasDigits = true;
      }
      if (i < expression.length && expression[i] === ".") {
        i++;
        while (i < expression.length && isDigit(expression[i])) {
          i++;
          hasDigits = true;
        }
      }
      if (!hasDigits)
        throw new ExpressionEvalError("syntax", "非法数字字面量", start);
      const text = expression.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value))
        throw new ExpressionEvalError("nonFinite", `数字字面量超出有限数范围: ${text}`, start);
      tokens.push({ kind: "number", text, start, value });
      continue;
    }
    if (ch === "#") {
      const start = i;
      i++;
      if (i >= expression.length || !isNameStart(expression[i]))
        throw new ExpressionEvalError("syntax", "变量引用 # 后须为字母或下划线", start);
      const nameStart = i;
      while (i < expression.length && isNamePart(expression[i]))
        i++;
      tokens.push({ kind: "variable", text: expression.slice(nameStart, i), start });
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "(" || ch === ")") {
      tokens.push({ kind: "op", text: ch, start: i });
      i++;
      continue;
    }
    throw new ExpressionEvalError("syntax", `非法字符 "${ch}"`, i);
  }
  tokens.push({ kind: "eof", text: "", start: expression.length });
  return tokens;
}

// =============================================================================
// 语法分析 + 求值（递归下降，边解析边求值，无 AST 物化）
// =============================================================================

/** 变量名 → 数值（未定义返回 undefined；position=引用处 0 基下标，供错误定位）。 */
type VariableLookup = (name: string, position: number) => number | undefined;

class ExpressionParser {
  private _index = 0;
  private _depth = 0;

  public constructor(
    private readonly _tokens: readonly Token[],
    private readonly _lookup: VariableLookup,
  ) {}

  public parse(): number {
    const value = this.parseExpression();
    const token = this.peek();
    if (token.kind !== "eof")
      throw new ExpressionEvalError("syntax", `多余的字符 "${token.text}"`, token.start);
    return value;
  }

  private peek(): Token {
    return this._tokens[this._index];
  }

  private advance(): Token {
    const token = this._tokens[this._index];
    if (this._index < this._tokens.length - 1)
      this._index++;
    return token;
  }

  private enterDepth(position: number): void {
    this._depth++;
    if (this._depth > MAX_PARSE_DEPTH)
      throw new ExpressionEvalError("syntax", `表达式嵌套超过 ${MAX_PARSE_DEPTH} 层`, position);
  }

  private leaveDepth(): void {
    this._depth--;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token.kind !== "op" || (token.text !== "+" && token.text !== "-"))
        return value;
      this.advance();
      const rhs = this.parseTerm();
      const next = token.text === "+" ? value + rhs : value - rhs;
      if (!Number.isFinite(next))
        throw new ExpressionEvalError("nonFinite", "表达式结果不是有限数", token.start);
      value = next;
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.kind !== "op" || (token.text !== "*" && token.text !== "/"))
        return value;
      this.advance();
      const rhs = this.parseUnary();
      if (token.text === "/" && rhs === 0)
        throw new ExpressionEvalError("nonFinite", "除数为零", token.start);
      const next = token.text === "*" ? value * rhs : value / rhs;
      if (!Number.isFinite(next))
        throw new ExpressionEvalError("nonFinite", "表达式结果不是有限数", token.start);
      value = next;
    }
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token.kind === "op" && (token.text === "+" || token.text === "-")) {
      this.advance();
      this.enterDepth(token.start);
      try {
        const value = this.parseUnary();
        return token.text === "-" ? -value : value;
      } finally {
        this.leaveDepth();
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.peek();
    if (token.kind === "number") {
      this.advance();
      return token.value;
    }
    if (token.kind === "variable") {
      this.advance();
      const value = this._lookup(token.text, token.start);
      if (value === undefined)
        throw new ExpressionEvalError("unknownVariable", `未知变量: #${token.text}`, token.start);
      if (!Number.isFinite(value))
        throw new ExpressionEvalError("nonFinite", `变量 #${token.text} 的值不是有限数`, token.start);
      return value;
    }
    if (token.kind === "op" && token.text === "(") {
      this.advance();
      this.enterDepth(token.start);
      const value = this.parseExpression();
      this.leaveDepth();
      const close = this.peek();
      if (close.kind !== "op" || close.text !== ")")
        throw new ExpressionEvalError("syntax", "缺少右括号", token.start);
      this.advance();
      return value;
    }
    if (token.kind === "eof")
      throw new ExpressionEvalError("syntax", "表达式意外结束（缺少操作数）", token.start);
    throw new ExpressionEvalError("syntax", `意外的记号 "${token.text}"`, token.start);
  }
}

// =============================================================================
// 公开入口
// =============================================================================

function makeFailure(code: ExpressionErrorCode, message: string, position?: number): ExpressionFailure {
  return position === undefined ? { ok: false, code, message } : { ok: false, code, message, position };
}

/**
 * 单条表达式的求值内核：成功返回数值，失败抛 ExpressionEvalError。
 * 变量表递归求值需要保留错误对象（归因链），故与 `evaluateWith` 分离。
 */
function evaluateOrThrow(expression: string, lookup: VariableLookup): number {
  if (expression.trim() === "")
    throw new ExpressionEvalError("empty", "表达式为空");
  if (expression.length > MAX_EXPRESSION_LENGTH)
    throw new ExpressionEvalError("syntax", `表达式超过 ${MAX_EXPRESSION_LENGTH} 字符上限`, MAX_EXPRESSION_LENGTH);
  const value = new ExpressionParser(tokenize(expression), lookup).parse();
  if (!Number.isFinite(value))
    throw new ExpressionEvalError("nonFinite", "表达式结果不是有限数");
  return value;
}

/** 单条表达式的求值内核（ExpressionEvalError → ExpressionFailure，供公开入口复用）。 */
function evaluateWith(expression: string, lookup: VariableLookup): ExpressionResult {
  try {
    return { ok: true, value: evaluateOrThrow(expression, lookup) };
  } catch (error) {
    if (error instanceof ExpressionEvalError)
      return makeFailure(error.code, error.message, error.position);
    throw error;
  }
}

/**
 * 收集表达式中引用的变量名（ADR-0020 S3）：按首次出现顺序去重。
 * 词法错误（非法字符/`#` 后无名称等）→ `[]`——调用方若需要该错误应改走
 * `evaluateExpression`（类型校验不得覆盖语法错误）。纯函数、不修改输入。
 */
export function collectVariableReferences(expression: string): string[] {
  // 与 evaluateExpression 同长度门禁（MAX_EXPRESSION_LENGTH）：超限表达式求值必为
  // syntax，收集器不得先 tokenize 无界输入（防御性，避免类型门禁预占求值错误）。
  if (expression.length > MAX_EXPRESSION_LENGTH)
    return [];
  let tokens: Token[];
  try {
    tokens = tokenize(expression);
  } catch {
    return [];
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "variable" || seen.has(token.text))
      continue;
    seen.add(token.text);
    names.push(token.text);
  }
  return names;
}

/** 求值单条表达式；`variables` 为已求值的变量名→数值表（可选）。 */
export function evaluateExpression(
  expression: string,
  variables?: ReadonlyMap<string, number>,
): ExpressionResult {
  return evaluateWith(expression, (name) => variables?.get(name));
}

/**
 * 按依赖顺序求值整张变量表（名称唯一；循环检测；未知引用）。
 * 依赖按需递归求值（访问栈检测循环），同层按输入顺序——结果与输入顺序确定。
 * 失败时不返回部分结果（`ok:false` 即零可用输出）；不修改输入数组/表达式。
 *
 * 错误归因：失败消息标注**实际失败的变量**（`变量 "name": <原因>`）并附引用链
 * （`（引用链：a → b）`）；`position` 始终相对该变量**自身表达式**（非表）。
 * 归因只在实际失败的那一层做一次，嵌套依赖不重复前缀。`cycle` 自带完整环链，
 * 不附加引用链前缀。
 */
export function evaluateVariableTable(variables: readonly ExpressionVariableRef[]): VariableTableResult {
  const definitions = new Map<string, string>();
  for (const variable of variables) {
    if (!isValidVariableName(variable.name))
      return makeFailure("syntax", `非法变量名: "${variable.name}"`);
    if (definitions.has(variable.name))
      return makeFailure("duplicateName", `变量名重复: "${variable.name}"`);
    definitions.set(variable.name, variable.expression);
  }

  const values = new Map<string, number>();
  const visiting: string[] = [];

  const resolve = (name: string, position: number): number => {
    const cached = values.get(name);
    if (cached !== undefined)
      return cached;
    const expression = definitions.get(name);
    if (expression === undefined)
      throw new ExpressionEvalError("unknownVariable", `未知变量: #${name}`, position);
    const cycleStart = visiting.indexOf(name);
    if (cycleStart !== -1) {
      const chain = [...visiting.slice(cycleStart), name].map((item) => `#${item}`).join(" → ");
      throw new ExpressionEvalError("cycle", `变量循环引用: ${chain}`);
    }
    visiting.push(name);
    try {
      const value = evaluateOrThrow(expression, resolve);
      values.set(name, value);
      return value;
    } catch (error) {
      if (!(error instanceof ExpressionEvalError))
        throw error;
      // cycle 消息已含完整环链；已归因的依赖失败保持原样——两种情况都不重复前缀。
      if (error.code === "cycle" || error.attributed)
        throw error;
      const chain = visiting.join(" → ");
      throw new ExpressionEvalError(
        error.code,
        `变量 "${name}": ${error.message}（引用链：${chain}）`,
        error.position,
        true,
      );
    } finally {
      visiting.pop();
    }
  };

  try {
    for (const variable of variables)
      resolve(variable.name, 0);
  } catch (error) {
    if (error instanceof ExpressionEvalError)
      return makeFailure(error.code, error.message, error.position);
    throw error;
  }
  return { ok: true, values };
}
