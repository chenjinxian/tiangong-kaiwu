/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 长度单位偏好（RW4-P5 终审 Minor#2）：Settings 写入、状态栏读取。
 * 仅前端展示偏好；建模内核/导出仍以 iModel 单位为准（Settings 页已诚实标注）。
 */

export const LENGTH_UNIT_STORAGE_KEY = 'luban-cad-length-unit';

export type LengthUnit = 'mm' | 'inch';

export function getStoredLengthUnit(): LengthUnit {
  try {
    return localStorage.getItem(LENGTH_UNIT_STORAGE_KEY) === 'inch' ? 'inch' : 'mm';
  } catch {
    return 'mm';
  }
}
