// src/modules/part-studio/test/capability-ledger.test.ts
//
// 能力账本一致性（2026-11-19 W0）：docs/parity/capability-ledger.json 是公共能力
// 状态的单一事实源。本测试把运行时 gating（TOOL_CAPABILITIES）与账本钉死：
//  - 每个运行时工具都有 ui.* 行；
//  - gated 工具不得在账本标 full；full 工具只能是 full/partial；
//  - 账本里的 ui.* 行必须能映射回运行时注册表（防止幽灵能力）；
//  - shared 接口版本、feature/constraint/entity 行数与账本自述一致。
//
// 只读测试：不修改账本；修改来源后必须重新生成并同步本测试。

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import { TOOL_CAPABILITIES } from '../internal/capabilities.js';

interface LedgerRow {
  id: string;
  status: string;
}

interface Ledger {
  sources: {
    sharedInterfaceVersion: string;
    uiCapabilities: number;
    featureTypes: number;
    constraintKinds: number;
    entityKinds: number;
  };
  counts: { total: number; byStatus: Record<string, number> };
  rows: LedgerRow[];
}

function findLedgerPath(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, 'docs/parity/capability-ledger.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('找不到 docs/parity/capability-ledger.json（请在仓库内运行测试）');
}

const ledgerPath = findLedgerPath();
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger;
const rowsById = new Map(ledger.rows.map((row) => [row.id, row]));

describe('capability ledger ↔ runtime gating', () => {
  it('shared 接口版本与账本一致', () => {
    expect(ledger.sources.sharedInterfaceVersion).toBe(LubanFeatureRpcInterface.interfaceVersion);
  });

  it('每个运行时工具都有 ui.* 账本行', () => {
    for (const toolId of Object.keys(TOOL_CAPABILITIES)) {
      expect(rowsById.get(`ui.${toolId}`), `缺少 ui.${toolId}`).toBeDefined();
    }
  });

  it('gated 工具不得在账本标 full；full 工具只能是 full/partial', () => {
    for (const [toolId, capability] of Object.entries(TOOL_CAPABILITIES)) {
      const row = rowsById.get(`ui.${toolId}`);
      expect(row, `缺少 ui.${toolId}`).toBeDefined();
      if (capability === 'gated') {
        expect(row!.status, `ui.${toolId} 运行时 gated 但账本 ${row!.status}`).not.toBe('full');
      } else {
        expect(['full', 'partial'], `ui.${toolId} 运行时 full 但账本 ${row!.status}`)
          .toContain(row!.status);
      }
    }
  });

  it('账本 ui.* 行都能映射回运行时注册表', () => {
    for (const row of ledger.rows) {
      if (!row.id.startsWith('ui.')) continue;
      const toolId = row.id.slice('ui.'.length);
      expect(TOOL_CAPABILITIES, `幽灵能力 ${row.id}`).toHaveProperty(toolId);
    }
  });

  it('feature/constraint/entity 行数与来源计数一致', () => {
    const count = (prefix: string) => ledger.rows.filter((row) => row.id.startsWith(prefix)).length;
    expect(count('feature.')).toBe(ledger.sources.featureTypes);
    expect(count('constraint.')).toBe(ledger.sources.constraintKinds);
    expect(count('entity.')).toBe(ledger.sources.entityKinds);
    expect(count('ui.')).toBe(ledger.sources.uiCapabilities);
  });

  it('状态计数与行数对账', () => {
    const actual: Record<string, number> = {};
    for (const row of ledger.rows) actual[row.status] = (actual[row.status] ?? 0) + 1;
    expect(actual).toEqual(ledger.counts.byStatus);
    expect(ledger.counts.total).toBe(ledger.rows.length);
  });
});
