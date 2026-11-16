/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 十进制定点格式化（2026-11-16 W18 live 对拍）：
 * Onshape 标注/数值编辑器按十进制 half-up 取整。JS `Number.prototype.toFixed`
 * 直接对 IEEE-754 二进制值取整，`28.575`（二进制略低于半值）会得到 `28.57`，
 * 与 live 的 `28.58` 不符（live 实采：mm 文档 2 位小数下输入 28.575 → 标签
 * 28.58）。这里按 `scaled + EPSILON * |scaled|` 修正半值的表示噪声后取整，
 * 再定点输出；尾零裁剪由调用方决定（标注去尾零，编辑器按需固定位数后裁剪）。
 *
 * 语义：正数 half-up；负数 half-away-from-zero（-2.5 → -3）。修正量只覆盖
 * “十进制半值在二进制中恰好落在半值下方 ~1 ulp”的表示噪声（如 1.0049999999999999
 * 视为 1.005）；明显低于半值的数仍向下取整。
 */
export function formatFixedHalfUp(value: number, decimals: number): string {
  if (!Number.isFinite(value))
    return String(value);
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  const scaled = Math.abs(value) * factor;
  const rounded = Math.round(scaled + Number.EPSILON * Math.abs(scaled));
  return ((sign * rounded) / factor).toFixed(decimals);
}
