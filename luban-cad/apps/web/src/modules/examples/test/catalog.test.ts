import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_CATALOG,
  EXAMPLE_OWNERS,
  formatExampleVolume,
} from '../catalog.js';

const PUBLIC_ROOT = path.resolve(__dirname, '../../../../public');

describe('全部示例 catalog（19 个 replicable-now 的公共投影）', () => {
  it('恰好 19 个、15 个文档、4 个 owner，id 唯一', () => {
    expect(EXAMPLE_CATALOG).toHaveLength(19);
    expect(new Set(EXAMPLE_CATALOG.map((entry) => entry.document)).size).toBe(15);
    expect(EXAMPLE_OWNERS).toEqual([
      'Explore Onshape Models',
      'Onshape',
      'Onshape Training',
      'Onshape Training Repo',
    ]);
    expect(new Set(EXAMPLE_CATALOG.map((entry) => entry.id)).size).toBe(19);
  });

  it('每条有完整名称/目标体积/封面，且封面真实存在', () => {
    for (const entry of EXAMPLE_CATALOG) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.projectName.length).toBeGreaterThan(0);
      expect(entry.imodelName.length).toBeGreaterThan(0);
      expect(Number.isFinite(entry.volumeMm3)).toBe(true);
      expect(entry.volumeMm3).toBeGreaterThan(0);
      expect(entry.cover.startsWith('/showcase/')).toBe(true);
      expect(existsSync(path.join(PUBLIC_ROOT, entry.cover.replace(/^\//, '')))).toBe(true);
    }
  });

  it('Bumper 明确标为 strict oracle 轨，不把 generic resolver 说成已修复', () => {
    const bumper = EXAMPLE_CATALOG.find((entry) => entry.id === 'bumper-block');
    expect(bumper?.strictness).toBe('strict-oracle');
    expect(bumper?.note).toContain('generic resolver');
  });

  it('目标体积按 mm³ 展示，极小体积保留 3 位小数', () => {
    expect(formatExampleVolume(0.8193532)).toBe('0.819 mm³');
    expect(formatExampleVolume(636731.4988)).toBe('636,731.499 mm³');
  });
});
