/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Export measurement utilities
 */

import { MeasurementRecord } from '../hooks/useMeasurementManager';

export function exportToCSV(measurements: MeasurementRecord[]): string {
  const headers = ['类型', '数值', '单位', '描述', '时间'];
  const rows = measurements.map((m) => [
    getTypeLabel(m.type),
    m.value.toString(),
    m.unit,
    m.description || '',
    new Date(m.timestamp).toLocaleString(),
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');
}

export function downloadMeasurements(measurements: MeasurementRecord[]): void {
  const csv = exportToCSV(measurements);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `测量数据_${new Date().toLocaleDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    distance: '距离',
    area: '面积',
    volume: '体积',
    length: '长度',
    location: '坐标',
  };
  return labels[type] || type;
}
