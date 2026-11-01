/**
 * B6 M-A5.2 多体性能探针（opt-in，默认 skip）。
 *
 * 用途：真实栈 20/50/90 body 的树就绪、fit、编辑刷新、FPS 与 tile 统计基线。
 * 只测不改：不进入默认 e2e（PERF_MULTIBODY=1 才运行），避免默认限流预算被
 * 大 N 用例挤占；tile 指标只记录、不设门。
 *
 * 证据：$PERF_EVIDENCE_DIR 或
 * `.superpowers/sdd/2026-10-29-m-a5.2-perf/perf-samples/run-<UTC>/metrics.json`
 *（原始证据不入库；tracked 文档记录机器/commit/N/阈值）。
 */
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  msRpc,
  openSeedImodelEditor,
  waitEditorReady,
} from './helpers';
import { resetBModelSeed } from './seed';

const N = Number(process.env.PERF_MULTIBODY_N ?? 20);
const ENABLED = process.env.PERF_MULTIBODY === '1'
  && (N === 20 || N === 50 || N === 90);
// 2026-11-01 本机 N=20 实测 6433ms（reload 含 briefcase 打开 + 20 体树）；
// 10s ≈ 1.55× 实测，保留余量，不抬到 2× 以上。
const TREE_READY_MS_MAX = 10_000;
const FIT_MS_MAX = 1000;
const EDIT_REFRESH_MS_MAX = 1000;
const FPS_P95_MS_MAX = 18.2;
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));

test.skip(!ENABLED, 'set PERF_MULTIBODY=1 and PERF_MULTIBODY_N=20|50|90');

function p95(samples: number[]): number {
  const sorted = samples.slice(1).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

function box(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
    { x: x + 1, y: y + 1 }, { x: x - 1, y: y + 1 },
  ];
}

test('多体基线：tree/edit/fit/FPS/tile（opt-in）', async ({ page, request }) => {
  test.setTimeout(900_000);
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  const ctx = await openSeedImodelEditor(page, seed);
  const lease = await borrowWriteLease(ctx, token, 'multibody-perf');

  // 播种 N 个独立 body：首个普通 extrude 建 body1，其余 newBody 建独立体
  //（与 newbody 夹具同口径；首个若也 newBody 会多出一个默认 body 行）。
  let lastFeatureId = '';
  for (let i = 0; i < N; i++) {
    const result = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: box((i % 10) * 3, Math.floor(i / 10) * 3),
        distance: 1,
        ...(i === 0 ? {} : { newBody: true }),
      },
    }, lease, token);
    assertFeatureOpOk(result, `seed body ${i}`);
    if (!result.featureId) throw new Error(`seed body ${i} 未返回 featureId`);
    lastFeatureId = result.featureId;
  }

  // 释放播种租约后 reload：新页面重新取得写租约，后续 UI suppress 不被旧会话阻塞。
  try {
    await msRpc(ctx.itwinId, ctx.imodelId, 'releaseWriteLease', [ctx.dbKey, lease.sessionId], token);
  } catch (err) {
    console.warn('[multibody-perf] releaseWriteLease 失败（reload 后页面会自愈取租约）：', err);
  }

  const partList = page.getByTestId('part-studio-part-list');
  const treeStart = Date.now();
  await page.reload();
  await waitEditorReady(page);
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(),
    { timeout: 90_000 }).toBe(N);
  const treeReadyMs = Date.now() - treeStart;

  const tileBefore = await page.evaluate(async () => {
    const cf = (window as any).__lubanE2E?.coreFrontend as {
      IModelApp: {
        tileAdmin: { statistics: Record<string, unknown>; totalTileContentBytes: number };
      };
    };
    const admin = cf.IModelApp.tileAdmin;
    return { ...admin.statistics, totalTileContentBytes: admin.totalTileContentBytes };
  });

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const boxRect = await canvas.boundingBox();
  if (!boxRect) throw new Error('canvas boundingBox 不可得');
  const cx = boxRect.x + boxRect.width / 2;
  const cy = boxRect.y + boxRect.height / 2;
  const menu = page.getByRole('menu', { name: '画布菜单' });
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(menu).toBeVisible();
  const fitStart = Date.now();
  await menu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(menu).toBeHidden();
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const fitMs = Date.now() - fitStart;

  const fpsSamples = await page.evaluate(async () => {
    const samples: number[] = [];
    let last = performance.now();
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (t: number) => {
        samples.push(t - last);
        last = t;
        if (t - start < 1500) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return samples;
  });
  const fpsP95Ms = p95(fpsSamples);

  const featureRow = page.getByTestId(`tree-row-${lastFeatureId}`);
  const featureMenu = page.getByRole('menu', { name: '特征菜单' });
  await expect(featureRow).toBeVisible({ timeout: 90_000 });
  const editStart = Date.now();
  await featureRow.click({ button: 'right' });
  await expect(featureMenu).toBeVisible();
  await featureMenu.getByRole('menuitem', { name: '抑制', exact: true }).click();
  await expect(featureRow).toHaveAttribute('data-suppressed', 'true', { timeout: 90_000 });
  const editRefreshMs = Date.now() - editStart;
  await featureRow.click({ button: 'right' });
  await expect(featureMenu).toBeVisible();
  await featureMenu.getByRole('menuitem', { name: '取消抑制', exact: true }).click();
  await expect(featureRow).not.toHaveAttribute('data-suppressed', 'true', { timeout: 90_000 });

  const tileAfter = await page.evaluate(async () => {
    const cf = (window as any).__lubanE2E?.coreFrontend as {
      IModelApp: {
        tileAdmin: { statistics: Record<string, unknown>; totalTileContentBytes: number };
      };
    };
    const admin = cf.IModelApp.tileAdmin;
    return { ...admin.statistics, totalTileContentBytes: admin.totalTileContentBytes };
  });

  const record = {
    n: N, treeReadyMs, fitMs, editRefreshMs, fpsP95Ms, fpsSamples: fpsSamples.length,
    tileBefore, tileAfter,
  };
  const root = process.env.PERF_EVIDENCE_DIR
    ?? path.resolve(SPEC_DIR, '../../../..', '.superpowers/sdd/2026-10-29-m-a5.2-perf/perf-samples');
  const dir = path.join(root, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(record, null, 2), 'utf-8');
  console.log(`MULTIBODY_WEB_PERF ${JSON.stringify(record)}`);

  expect(treeReadyMs).toBeLessThan(TREE_READY_MS_MAX);
  expect(fitMs).toBeLessThan(FIT_MS_MAX);
  expect(editRefreshMs).toBeLessThan(EDIT_REFRESH_MS_MAX);
  expect(fpsP95Ms).toBeLessThanOrEqual(FPS_P95_MS_MAX);
});
