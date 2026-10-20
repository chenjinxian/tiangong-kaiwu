/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Export measurement utilities（RW4 终审：CSV 表头/文件名/类型标签走 i18n，
 * en 导出不再出现中文）
 */

import i18n from '../../../shared/i18n/index.js';
import { MeasurementRecord } from '../hooks/useMeasurementManager';

const t = (key: string): string => String(i18n.t(key, { ns: 'editor' }));

export function exportToCSV(measurements: MeasurementRecord[]): string {
  const headers = [
    t('measurement.csv.type'),
    t('measurement.csv.value'),
    t('measurement.csv.unit'),
    t('measurement.csv.description'),
    t('measurement.csv.time'),
  ];
  const rows = measurements.map((m) => [
    getTypeLabel(m.type),
    m.value.toString(),
    m.unit,
    m.description || '',
    new Date(m.timestamp).toLocaleString(i18n.language),
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');
}

export function downloadMeasurements(measurements: MeasurementRecord[]): void {
  const csv = exportToCSV(measurements);
  const blob = new Blob([`﻿${  csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${t('measurement.exportFileName')}_${new Date().toLocaleDateString(i18n.language)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getTypeLabel(type: string): string {
  const key = `measurement.types.${type}`;
  const translated = i18n.t(key, { ns: 'editor' });
  // 未知类型回落原始码（不输出 key 字面量）
  return translated === key ? type : String(translated);
}
