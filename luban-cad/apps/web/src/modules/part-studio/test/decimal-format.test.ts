/**
 * 十进制定点格式化（W18 live）：Onshape 标注按十进制 half-up 取整；JS toFixed
 * 对二进制半值（28.575、1.005）会向下。负数按 half-away-from-zero。
 */
import { describe, expect, it } from 'vitest';
import { formatFixedHalfUp } from '../internal/decimal-format.js';

describe('formatFixedHalfUp', () => {
  it('十进制 half-up：live 28.575 → 28.58（JS toFixed 给 28.57）', () => {
    expect(formatFixedHalfUp(28.575, 2)).toBe('28.58');
    expect(formatFixedHalfUp(15.875, 2)).toBe('15.88');
    expect(formatFixedHalfUp(1.005, 2)).toBe('1.01');
    expect(formatFixedHalfUp(25.98062, 2)).toBe('25.98');
    expect(formatFixedHalfUp(52.4002, 2)).toBe('52.40');
  });

  it('半值下方的表示噪声（~1 ulp）按半值处理；明显低于半值不进位', () => {
    expect(formatFixedHalfUp(1.0049999999999999, 2)).toBe('1.01');
    expect(formatFixedHalfUp(1.0049, 2)).toBe('1.00');
    expect(formatFixedHalfUp(28.574999, 2)).toBe('28.57');
  });

  it('负数 half-away-from-zero；非有限值原样字符串化', () => {
    expect(formatFixedHalfUp(-2.5, 0)).toBe('-3');
    expect(formatFixedHalfUp(-28.575, 2)).toBe('-28.58');
    expect(formatFixedHalfUp(Number.NaN, 2)).toBe('NaN');
    expect(formatFixedHalfUp(Number.POSITIVE_INFINITY, 2)).toBe('Infinity');
  });

  it('0 位小数与高精度（角度 7 位）', () => {
    expect(formatFixedHalfUp(90, 0)).toBe('90');
    expect(formatFixedHalfUp(83.73251885, 7)).toBe('83.7325189');
    expect(formatFixedHalfUp(83.7325188, 7)).toBe('83.7325188');
  });
});
