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
 * 反解三段 ADD 面集（229,418.896 mm³）。Part 4 同为 9 个同面积面域但面积+bbox
 * 不唯一（对角 2 格 2 解 / L 形 3 格 4 解 / 4 格 70 解），保持 known-red。
 * 其余用例继续以 record 观测逐 body 体积/status；证据唯一后再升级严格门。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

const CASES = [
  { name: 'Part 1', elementId: '6ccf6efcd80bcab335d073b6', strict: true },
  { name: 'Part 2', elementId: '6516d9f30e2332db231b5256', strict: true },
  { name: 'Part 3', elementId: '2b8c683d9655e48fb91f2cd9', strict: true },
  {
    name: 'Part 4', elementId: '2de1f243168f441a7e5e1a4e', strict: false,
    // KNOWN_SELECTOR_BLOCKERS：Part 4 面集位置证据不足。9 个 region 均为
    // 645.16mm²；bodydetails 顶面给出的 area+bbox 不能唯一选集（实测候选：
    // Extrude 1 对角 2 格 2 组、Extrude 2 3 格 L 形 4 组、Extrude 3 4 格 70 组），
    // selector 只能按 mask 猜，故不添加证据、保持 test.fail。
    reason: 'known-red: Part 4 面集位置证据不足（面积+bbox 多解，非唯一）',
  },
  {
    name: 'Part 5', elementId: 'ce879b3b849ab72af885bb9f', strict: false,
    reason: 'known-red: Sketch 2 只有单线，Extrude 3 的 imprintFace 需要实体面 split（当前 0 面域）',
  },
  {
    name: 'Part 6', elementId: '118732d8402228166915c5e0', strict: false,
    reason: 'known-red: Sketch 2 单线 imprint（实体面 split）导致 Extrude 3 0 面域',
  },
] as const;

test.describe('Intro to CAD 1.2 Part 1–6', () => {
  for (const item of CASES) {
    test(`${item.name}：整链回放 → 树/status/body/重开`, async ({ page, request }) => {
      test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      if (!item.strict) test.fail(true, item.reason);
      const result = await runScenarioFile(page, request, {
        scenario: `scenarios/Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-${item.elementId}.scenario.json`,
        name: `Onshape example: Intro to CAD 1.2 ${item.name}`,
        reset: true,
        skipSketchConstraints: true,
        ...(item.strict ? {} : { volumePolicy: 'record' as const, statusPolicy: 'record' as const }),
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
