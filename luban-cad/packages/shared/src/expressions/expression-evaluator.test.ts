/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 表达式求值器测试（ADR-0020 S1）：
 *  - 运算/优先级/结合性/一元/括号/小数/空白；
 *  - #name 引用与变量表依赖序（乱序输入按依赖求值）；
 *  - 错误矩阵：empty/syntax（非法字符/缺括号/缺操作数/多余字符/超长/超深）/
 *    unknownVariable/duplicateName/cycle（自引用与两变量环）/nonFinite（除零/溢出）；
 *  - 名称校验与纯函数性（不修改输入 map、结果确定性）。
 */
import { describe, expect, it } from "vitest";
import {
  collectVariableReferences,
  evaluateExpression,
  evaluateVariableTable,
  type ExpressionResult,
  type ExpressionVariableRef,
  isValidVariableName,
} from "./expression-evaluator.js";

/** 断言成功并返回数值（失败时打印整包便于定位）。 */
function okValue(result: ExpressionResult): number {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return (result as { ok: true; value: number }).value;
}

/** 断言失败并返回 code（失败结构完整：code/message 均非空）。 */
function failureCode(result: ExpressionResult): string {
  expect(result.ok, JSON.stringify(result)).toBe(false);
  const failure = result as { ok: false; code: string; message: string };
  expect(failure.message.length).toBeGreaterThan(0);
  return failure.code;
}

describe("表达式求值器：算术 / 优先级 / 一元 / 括号 / 小数 / 空白", () => {
  it.each([
    ["1+2*3", 7],
    ["(1+2)*3", 9],
    ["10-2-3", 5],
    ["8/4/2", 1],
    ["2*3+4*5", 26],
    ["1+2*3-4/2", 5],
    ["-5+3", -2],
    ["--2", 2],
    ["+-2", -2],
    ["2*-3", -6],
    ["-(2+3)", -5],
    ["12.3", 12.3],
    [".5", 0.5],
    ["12.", 12],
    ["0.25*4", 1],
    ["  1 + 2 * ( 3 - 1 )  ", 5],
    ["\t1\n+\r\n2", 3],
    ["((((1))))", 1],
  ])("%s = %s", (expression, expected) => {
    expect(okValue(evaluateExpression(expression))).toBe(expected);
  });
});

describe("表达式求值器：#name 引用", () => {
  it("从变量表读取数值并参与运算", () => {
    const variables = new Map<string, number>([["a", 3], ["b", 4]]);
    expect(okValue(evaluateExpression("#a*2+#b", variables))).toBe(10);
    expect(okValue(evaluateExpression("(#a+#b)/#a", variables))).toBeCloseTo(7 / 3, 12);
  });

  it("变量名大小写敏感：未命中的大小写变体 → unknownVariable", () => {
    const variables = new Map<string, number>([["a", 3]]);
    const result = evaluateExpression("#A", variables);
    expect(failureCode(result)).toBe("unknownVariable");
    expect((result as { message: string }).message).toContain("#A");
  });

  it("未提供变量表/名字不存在 → unknownVariable，position 指向 # 下标", () => {
    const missing = evaluateExpression("1 + #width");
    expect(failureCode(missing)).toBe("unknownVariable");
    expect(missing).toMatchObject({ code: "unknownVariable", position: 4 });
    expect((missing as { message: string }).message).toContain("#width");
    expect(failureCode(evaluateExpression("#x", new Map()))).toBe("unknownVariable");
  });

  it("变量值非有限数 → nonFinite（拒绝 NaN/Infinity 注入）", () => {
    expect(failureCode(evaluateExpression("#a", new Map([["a", Number.NaN]])))).toBe("nonFinite");
    expect(failureCode(evaluateExpression("#a", new Map([["a", Number.POSITIVE_INFINITY]])))).toBe("nonFinite");
  });
});

describe("表达式求值器：变量表依赖序", () => {
  it("乱序输入按依赖求值：#b=#a*2、#a=3 → a=3、b=6", () => {
    const result = evaluateVariableTable([
      { name: "b", expression: "#a * 2" },
      { name: "a", expression: "3" },
    ]);
    expect(result.ok).toBe(true);
    const values = (result as { ok: true; values: ReadonlyMap<string, number> }).values;
    expect(values.get("a")).toBe(3);
    expect(values.get("b")).toBe(6);
    expect(values.size).toBe(2);
  });

  it("多级依赖链与同层变量共存（确定性）", () => {
    const table: ExpressionVariableRef[] = [
      { name: "c", expression: "#b + #a" },
      { name: "b", expression: "#a * 2" },
      { name: "a", expression: "1 + 1" },
    ];
    const first = evaluateVariableTable(table);
    const second = evaluateVariableTable(table);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const values = (first as { ok: true; values: ReadonlyMap<string, number> }).values;
    expect(values.get("a")).toBe(2);
    expect(values.get("b")).toBe(4);
    expect(values.get("c")).toBe(6);
  });

  it("空变量表 → 成功且为空映射", () => {
    const result = evaluateVariableTable([]);
    expect(result.ok).toBe(true);
    expect((result as { ok: true; values: ReadonlyMap<string, number> }).values.size).toBe(0);
  });

  it("变量表达式内的语法错误保留 code 与位置（消息标注变量名）", () => {
    const result = evaluateVariableTable([{ name: "a", expression: "1 +" }]);
    expect(result).toMatchObject({ ok: false, code: "syntax", position: 3 });
    expect((result as { message: string }).message).toContain('变量 "a"');
  });

  it("依赖失败归因到实际失败的变量（不误标引用方）：a=#b+1、b=1+ → syntax 标注 b", () => {
    const result = evaluateVariableTable([
      { name: "a", expression: "#b + 1" },
      { name: "b", expression: "1 +" },
    ]);
    expect(result).toMatchObject({ ok: false, code: "syntax", position: 3 });
    const message = (result as { message: string }).message;
    expect(message).toContain('变量 "b"');
    expect(message).toContain("引用链：a → b");
    expect(message).not.toContain('变量 "a"'); // 单次归因，不重复前缀
  });

  it("依赖失败归因：a=#b+1、b=1/0 → nonFinite 标注 b 与引用链", () => {
    const result = evaluateVariableTable([
      { name: "a", expression: "#b + 1" },
      { name: "b", expression: "1/0" },
    ]);
    expect(result).toMatchObject({ ok: false, code: "nonFinite", position: 1 });
    const message = (result as { message: string }).message;
    expect(message).toContain('变量 "b"');
    expect(message).toContain("引用链：a → b");
    expect(message).not.toContain('变量 "a"');
  });

  it("三级依赖失败归因：a→b→c，c 语法错误 → 消息含完整引用链 a → b → c", () => {
    const result = evaluateVariableTable([
      { name: "a", expression: "#b + 1" },
      { name: "b", expression: "#c + 1" },
      { name: "c", expression: "2 +" },
    ]);
    expect(result).toMatchObject({ ok: false, code: "syntax", position: 3 });
    const message = (result as { message: string }).message;
    expect(message).toContain('变量 "c"');
    expect(message).toContain("引用链：a → b → c");
    expect(message).not.toContain('变量 "a"');
    expect(message).not.toContain('变量 "b"');
  });

  it("依赖未知变量归因到引用它的变量（position 相对该变量表达式）", () => {
    const result = evaluateVariableTable([
      { name: "a", expression: "#b + 1" },
      { name: "b", expression: "2 + #missing" },
    ]);
    expect(result).toMatchObject({ ok: false, code: "unknownVariable", position: 4 });
    const message = (result as { message: string }).message;
    expect(message).toContain('变量 "b"');
    expect(message).toContain("引用链：a → b");
    expect(message).toContain("#missing");
  });
});

describe("表达式求值器：错误矩阵", () => {
  it("empty：空串/全空白（无 position）", () => {
    for (const expression of ["", "   ", "\t\n\r "]) {
      const result = evaluateExpression(expression);
      expect(failureCode(result)).toBe("empty");
      expect((result as { position?: number }).position).toBeUndefined();
    }
  });

  it("syntax：非法字符/缺括号/缺操作数/多余字符（position 合理）", () => {
    expect(evaluateExpression("$1")).toMatchObject({ code: "syntax", position: 0 });
    expect(evaluateExpression("1$2")).toMatchObject({ code: "syntax", position: 1 });
    expect(evaluateExpression("(1+2")).toMatchObject({ code: "syntax", position: 0 }); // 未闭合的 (
    expect(evaluateExpression("1+2)")).toMatchObject({ code: "syntax", position: 3 });
    expect(evaluateExpression("1+")).toMatchObject({ code: "syntax", position: 2 }); // 缺操作数
    expect(evaluateExpression("*1")).toMatchObject({ code: "syntax", position: 0 });
    expect(evaluateExpression("1 2")).toMatchObject({ code: "syntax", position: 2 }); // 多余字符
    expect(evaluateExpression("()")).toMatchObject({ code: "syntax", position: 1 });
    expect(evaluateExpression("#")).toMatchObject({ code: "syntax", position: 0 }); // # 后无名称
    expect(evaluateExpression("#1a")).toMatchObject({ code: "syntax", position: 0 });
    expect(evaluateExpression(".")).toMatchObject({ code: "syntax", position: 0 });
  });

  it("syntax：v1 只收十进制——拒绝指数/十六进制/裸小数点", () => {
    expect(evaluateExpression("1e3")).toMatchObject({ ok: false, code: "syntax", position: 1 });
    expect(evaluateExpression("0x10")).toMatchObject({ ok: false, code: "syntax", position: 1 });
    expect(evaluateExpression(".")).toMatchObject({ ok: false, code: "syntax", position: 0 });
  });

  it("nonFinite：除零与溢出（position 指向运算符）", () => {
    expect(evaluateExpression("1/0")).toMatchObject({ ok: false, code: "nonFinite", position: 1 });
    expect(evaluateExpression("0/(2-2)")).toMatchObject({ code: "nonFinite", position: 1 });
    expect(evaluateExpression("1/0/0")).toMatchObject({ code: "nonFinite" });
    // 两个有限大数相乘溢出 → nonFinite 指向 * 运算符（字面量本身有限，故非字面量错误）
    const overflow = `${"9".repeat(200)} * ${"9".repeat(200)}`;
    expect(evaluateExpression(overflow)).toMatchObject({ code: "nonFinite", position: 201 });
    // 字面量本身超出有限数范围 → nonFinite 指向字面量起点
    expect(evaluateExpression("9".repeat(400))).toMatchObject({ code: "nonFinite", position: 0 });
  });

  it("unknownVariable：变量表未知引用（position 指向该变量表达式内的 #）", () => {
    const result = evaluateVariableTable([
      { name: "a", expression: "1" },
      { name: "b", expression: "2 + #missing" },
    ]);
    expect(result).toMatchObject({ ok: false, code: "unknownVariable", position: 4 });
    expect((result as { message: string }).message).toContain("#missing");
  });

  it("duplicateName：重复变量名（无 position）", () => {
    const result = evaluateVariableTable([
      { name: "a", expression: "1" },
      { name: "a", expression: "2" },
    ]);
    expect(result).toMatchObject({ ok: false, code: "duplicateName" });
    expect((result as { message: string }).message).toContain('"a"');
    expect((result as { position?: number }).position).toBeUndefined();
  });

  it("变量名非法 → syntax", () => {
    expect(evaluateVariableTable([{ name: "1a", expression: "1" }])).toMatchObject({ ok: false, code: "syntax" });
    expect(evaluateVariableTable([{ name: "", expression: "1" }])).toMatchObject({ ok: false, code: "syntax" });
  });

  it("cycle：自引用与两变量环（message 含确定性循环链）", () => {
    const self = evaluateVariableTable([{ name: "a", expression: "#a + 1" }]);
    expect(self).toMatchObject({ ok: false, code: "cycle" });
    expect((self as { message: string }).message).toContain("#a → #a");

    const table: ExpressionVariableRef[] = [
      { name: "a", expression: "#b + 1" },
      { name: "b", expression: "#c + 1" },
      { name: "c", expression: "#a + 1" },
    ];
    const first = evaluateVariableTable(table);
    const second = evaluateVariableTable(table);
    expect(first).toMatchObject({ ok: false, code: "cycle" });
    expect((first as { message: string }).message).toContain("#a → #b → #c → #a");
    expect((second as { message: string }).message).toBe((first as { message: string }).message);
  });
});

describe("表达式求值器：名称校验", () => {
  it.each([
    ["a", true],
    ["_a", true],
    ["A1_b2", true],
    ["w_2", true],
    ["", false],
    ["1a", false],
    ["a b", false],
    ["a-b", false],
    ["#a", false],
    ["a.b", false],
    ["变量", false],
    ["a\n", false],
  ])("isValidVariableName(%j) = %s", (name, expected) => {
    expect(isValidVariableName(name)).toBe(expected);
  });
});

describe("变量引用收集（ADR-0020 S3 collectVariableReferences）", () => {
  it("按首次出现顺序去重（重复引用只保留一次）", () => {
    expect(collectVariableReferences("#b + #a * #b")).toEqual(["b", "a"]);
    expect(collectVariableReferences("#a + #a + #a")).toEqual(["a"]);
    expect(collectVariableReferences("#width*2 + #height/2 - #width")).toEqual(["width", "height"]);
  });

  it("纯算术/空表达式无引用 → []", () => {
    expect(collectVariableReferences("1+2*3")).toEqual([]);
    expect(collectVariableReferences("(10 - 2) / 4")).toEqual([]);
    expect(collectVariableReferences("")).toEqual([]);
    expect(collectVariableReferences("   ")).toEqual([]);
  });

  it("词法错误 → []（不把语法错误改写成类型错误；错误详情归 evaluateExpression）", () => {
    expect(collectVariableReferences("1 +")).toEqual([]); // 语法错误但词法完整 → 无 variable 记号
    expect(collectVariableReferences("#a @ #b")).toEqual([]); // 非法字符
    expect(collectVariableReferences("#")).toEqual([]); // # 后无名称
    expect(collectVariableReferences("#1a")).toEqual([]); // 名称首字符非法
    expect(collectVariableReferences("#a + #b;")).toEqual([]); // 非法字符出现在已有引用之后
  });

  it("长度门禁：恰好 1024 字符可收集，>1024 → []（不 tokenize 无界输入）", () => {
    const exact = `#a${" ".repeat(1022)}`; // 1024 字符
    expect(collectVariableReferences(exact)).toEqual(["a"]);
    const over = `#a${" ".repeat(1023)}`; // 1025 字符
    expect(collectVariableReferences(over)).toEqual([]);
  });

  it("引用名大小写敏感；不与纯函数性耦合（不修改输入）", () => {
    expect(collectVariableReferences("#Width + #width")).toEqual(["Width", "width"]);
    const expression = "#a*2";
    collectVariableReferences(expression);
    expect(expression).toBe("#a*2");
  });
});

describe("表达式求值器：边界与纯函数性", () => {
  it("长度上限 1024：超限 → syntax（position=上限下标）", () => {
    const long = `${"1+".repeat(600)}1`; // 1201 字符
    expect(evaluateExpression(long)).toMatchObject({ ok: false, code: "syntax", position: 1024 });
    expect(okValue(evaluateExpression(`${"1+".repeat(300)}1`))).toBe(301); // 601 字符，正常
  });

  it("长度边界：恰好 1024 字符可求值、1025 字符拒收", () => {
    expect(okValue(evaluateExpression("0".repeat(1024)))).toBe(0);
    expect(evaluateExpression("0".repeat(1025))).toMatchObject({ ok: false, code: "syntax", position: 1024 });
  });

  it("递归深度上限 64：64 层括号可求值、65 层 → syntax", () => {
    const nest = (depth: number) => `${"(".repeat(depth)}1${")".repeat(depth)}`;
    expect(okValue(evaluateExpression(nest(64)))).toBe(1);
    expect(evaluateExpression(nest(65))).toMatchObject({ ok: false, code: "syntax", position: 64 });
  });

  it("一元运算符链深度同受上限约束", () => {
    expect(okValue(evaluateExpression(`${"-".repeat(64)}1`))).toBe(1);
    expect(evaluateExpression(`${"-".repeat(65)}1`)).toMatchObject({ ok: false, code: "syntax", position: 64 });
  });

  it("不修改输入变量 map；返回值为独立结果对象", () => {
    const variables = new Map<string, number>([["a", 2]]);
    const before = [...variables.entries()];
    const result = evaluateExpression("#a*3", variables);
    expect(result).toEqual({ ok: true, value: 6 });
    expect([...variables.entries()]).toEqual(before);
    expect(variables.size).toBe(1);
  });

  it("不修改输入变量表数组（纯函数、确定性）", () => {
    const table: ExpressionVariableRef[] = [
      { name: "b", expression: "#a*2" },
      { name: "a", expression: "3" },
    ];
    const snapshot = JSON.parse(JSON.stringify(table)) as ExpressionVariableRef[];
    const first = evaluateVariableTable(table);
    const second = evaluateVariableTable(table);
    expect(table).toEqual(snapshot);
    expect((first as { ok: true; values: ReadonlyMap<string, number> }).values.get("b")).toBe(6);
    expect((second as { ok: true; values: ReadonlyMap<string, number> }).values.get("b")).toBe(6);
  });
});
