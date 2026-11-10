/**
 * Intro to CAD 1.2 Part 1–6（Onshape Quickstart 入门示例）真实 scenario 验收。
 *
 * 2026-11-09（P4.2 converter quick wins）：
 * - 草图建在上游 extrude 端盖（CAP_FACE）上的平面现在由 converter 静态推导
 *   （源草图 sketchMatrix + isStart/深度），不再「不支持的草图平面」；
 * - 压缩 imprint 查询（`$imprint`/`S7$IMPRINT`，无点号）现在识别为 imprintFace，
 *   不再落 unknown。
 * 2026-11-09（PS blocker Task 2）：Part 3 升级严格门——converter 携带 bodydetails
 * 顶面面积+bbox 证据（同面积 9 面域网格的位置 oracle），回放器按面积+bbox 唯一
 * 反解三段 ADD 面集（229,418.896 mm³）。
 * 2026-11-10（Part 4 分量质心）：Part 4 同为 9 个同面积面域，面积+bbox 仍有
 * 2/4/70 解；新增 Onshape face 连通分量面积+质心证据（对角 2 个独立面、L 形
 * 合并面、1+3 分量），回放器按共享草图实体邻接分组后一一匹配，升级严格门。
 * 2026-11-10（ADR-0006 D2）：Part 5 的派生草图平面由采集 sketches 矩阵纠正（不再
 * 误当水平面）；Extrude 1/2 用 bodydetails 面积+bbox 选集；Extrude 3 为面外单线
 * 凹口填充（void 侧）；Extrude 4 为面内单线材料侧；Extrude 5 为闭合矩形通槽。
 * Part 5 升级严格门（逐步体积 98322.384 / 245805.960 / 262193.024 / 229418.896 /
 * 204838.300）。
 * 2026-11-11（Part 6）：E1/E2/E4 闭合面域按 bodydetails 面积+bbox+质心选集；
 * E3 为面外单线空腔切分；E5 在 Onshape 前后 bodydetails 完全一致（16 面，
 * 面积/box/ID 全同），由 shared 1.67 显式 `noOpEvidence` 产品化（仅 remove +
 * 非空源证据，非失败回退）。Part 6 升级严格门：最终 188451.236 vs 188451.236
 * mm³，8 步 status=0，push+冷重开一致。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

const CASES = [
  { name: 'Part 1', elementId: '6ccf6efcd80bcab335d073b6', strict: true },
  { name: 'Part 2', elementId: '6516d9f30e2332db231b5256', strict: true },
  { name: 'Part 3', elementId: '2b8c683d9655e48fb91f2cd9', strict: true },
  { name: 'Part 4', elementId: '2de1f243168f441a7e5e1a4e', strict: true },
  { name: 'Part 5', elementId: 'ce879b3b849ab72af885bb9f', strict: true },
  { name: 'Part 6', elementId: '118732d8402228166915c5e0', strict: true },
] as const;

test.describe('Intro to CAD 1.2 Part 1–6', () => {
  for (const item of CASES) {
    test(`${item.name}：整链回放 → 树/status/body/重开`, async ({ page, request }) => {
      test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      const result = await runScenarioFile(page, request, {
        scenario: `scenarios/Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-${item.elementId}.scenario.json`,
        name: `Onshape example: Intro to CAD 1.2 ${item.name}`,
        reset: true,
        skipSketchConstraints: true,
      });
      const actual = result.volumes.reduce((sum, volume) => sum + volume, 0);
      const expected = result.expected.reduce((sum, volume) => sum + volume, 0);
      const relative = Math.abs(actual - expected) / expected;
      console.log(`[intro-cad] ${item.name} actual=${actual.toFixed(3)} expected=${expected.toFixed(3)} delta=${(relative * 100).toFixed(3)}%`);
      expect(actual).toBeGreaterThan(0);
      // known-red 与 strict 共用同一严格断言：test.fail 负责标注预期失败，
      // 修好后会变成 unexpected pass，强制复核并移除 test.fail。
      expect(relative).toBeLessThan(0.005);
    });
  }
});
