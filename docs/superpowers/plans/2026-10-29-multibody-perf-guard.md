# 多体性能护栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 127-body 服务端路径建立 in-process 门槛，并为真实栈多体树/编辑/fit/FPS/tile 建立可复现 baseline。

**Architecture:** 私有仓真内核基准负责 127 体和冷重建（权威、可重复）；web Playwright opt-in 探针负责浏览器集成指标（N=20 默认，N=50/90 可配）。只测不改生产热路径；失败记录 blocker。

**Tech Stack:** Vitest + StandaloneDb + real ACIS kernel；Playwright + iTwin tile statistics + rAF sampling。

**Spec:** `docs/superpowers/specs/2026-10-29-m-a5.2-subentity-selection-perf-design.md`

## Global Constraints

- 只新增测试/文档；不改 production web/MS/shared/schema。
- N=127 在私有仓 in-process；web 默认 N=20 opt-in；不把大 N 加入默认 34 例。
- MS 限流 100 req/15min；跑 web 探针前重启 MS 清窗口。
- 阈值先校准一次并留 2× 余量；原始 evidence gitignored，tracked 文档记录机器/commit/N/阈值。
- 不 gate tile 指标，只记录基线；tile 架构改造另立。
- 不 push/Release；每任务本地 commit。

---

### Task 1: 私有仓 127-body in-process 基准

**Files:**
- Create: `D:\Github\luban-backend\modeling-server\src\feature\MultiBodyPerf.test.ts`
- Test: same file
- Reference: `modeling-server/src/feature/BooleanBodiesFlow.test.ts:89-118`
  （`makeSvc` / `makeTwoBodyFixture` 现场）

**Interfaces:**
- Produces: metric JSON shape:
  ```ts
  interface CheckpointMetrics {
    n: number;
    getBodiesMs: number;
    getTreeMs: number;
  }
  interface PerfMetrics extends CheckpointMetrics {
    insertMs: number;
    rebuildAllMs: number;
    writtenBodies: number;
  }
  ```

- [ ] **Step 1: Write the benchmark test**

Create the file. This is a test-only file; do not add production imports.

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StandaloneDb } from '@itwin/core-backend';
import type { ExtrudeParams } from '@luban-cad/shared';
import { ensureHostStarted, makeTempDir } from './test/TestHost.js';
import { clearFeatureEngineCacheForTest, rebuildAll } from './FeatureEngine.js';
import { FeatureService } from './FeatureService.js';
import { writeLeases } from './WriteLease.js';

const square = (s: number, cx: number, cy: number) => [
  { x: cx - s / 2, y: cy - s / 2 }, { x: cx + s / 2, y: cy - s / 2 },
  { x: cx + s / 2, y: cy + s / 2 }, { x: cx - s / 2, y: cy + s / 2 },
];
const ext = (s: number, d: number, cx = 0, cy = 0): ExtrudeParams =>
  ({ profile: square(s, cx, cy), distance: d });
const newBodyExt = (s: number, d: number, cx: number, cy: number): ExtrudeParams =>
  ({ ...ext(s, d, cx, cy), newBody: true });

const N = 127;
const GET_BODIES_MS_MAX = 1000;
const GET_TREE_MS_MAX = 1000;
const INSERT_MS_MAX = 1000;
const REBUILD_ALL_MS_MAX = 12_000;

function now(): number { return Number(process.hrtime.bigint() / 1_000_000n); }
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe('MultiBodyPerf 127-body', { timeout: 900_000 }, () => {
  let dir: string; let db: StandaloneDb; let svc: FeatureService;
  const metrics: CheckpointMetrics[] = [];
  let finalMetrics: PerfMetrics | undefined;

  beforeAll(async () => {
    await ensureHostStarted();
    dir = makeTempDir('multibody-perf-');
    db = StandaloneDb.createEmpty(path.join(dir, 'perf.bim'), {
      rootSubject: { name: 'Perf' }, enableTransactions: true,
    });
    const key = `test:multibody-perf:${Date.now()}`;
    svc = FeatureService.for(key, db);
    await svc.ensureInitialized();
    writeLeases.acquire(key, 'sess1', 'alice', 900_000);
  });
  afterAll(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('N=10/50/127 缩放 + 127 插入/冷重建门槛', async () => {
    const seeds: string[] = [];

    const seedOne = async (): Promise<void> => {
      const index = seeds.length;
      const result = await svc.applyOp('sess1', {
        kind: 'insertFeature', featureType: 'extrude',
        params: index === 0
          ? ext(2, 1, 0, 0)
          : newBodyExt(2, 1, 10 + (index % 10) * 3, Math.floor(index / 10) * 3),
      });
      expect(result.ok).toBe(true);
      seeds.push((result as { featureId: string }).featureId);
    };

    const measureReads = (): CheckpointMetrics => {
      const getBodiesTimes: number[] = [];
      const getTreeTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        let t = now();
        const bodies = svc.getBodies();
        getBodiesTimes.push(now() - t);
        t = now();
        const tree = svc.getTree();
        getTreeTimes.push(now() - t);
        expect(bodies.filter((body) => body.active).length).toBeGreaterThanOrEqual(seeds.length);
        expect(tree.length).toBeGreaterThanOrEqual(seeds.length);
      }
      return {
        n: seeds.length,
        getBodiesMs: median(getBodiesTimes),
        getTreeMs: median(getTreeTimes),
      };
    };

    while (seeds.length < 10) await seedOne();
    metrics.push(measureReads());
    while (seeds.length < 50) await seedOne();
    metrics.push(measureReads());
    while (seeds.length < 126) await seedOne();

    const insertStart = now();
    await seedOne();
    const insertMs = now() - insertStart;
    metrics.push(measureReads());

    clearFeatureEngineCacheForTest();
    const rebuildStart = now();
    await rebuildAll(db);
    const rebuildAllMs = now() - rebuildStart;

    finalMetrics = {
      ...metrics[metrics.length - 1]!,
      n: 127,
      insertMs,
      rebuildAllMs,
      writtenBodies: svc.getBodies().filter((body) => body.active).length,
    };
    // eslint-disable-next-line no-console
    console.log(`MULTIBODY_PERF ${JSON.stringify({ metrics, finalMetrics })}`);

    for (const m of metrics) {
      expect(m.getBodiesMs, `getBodies(${m.n})`).toBeLessThan(GET_BODIES_MS_MAX);
      expect(m.getTreeMs, `getTree(${m.n})`).toBeLessThan(GET_TREE_MS_MAX);
    }
    expect(finalMetrics.insertMs, 'insert(126→127)').toBeLessThan(INSERT_MS_MAX);
    expect(finalMetrics.rebuildAllMs, 'rebuildAll(127)').toBeLessThan(REBUILD_ALL_MS_MAX);
    expect(finalMetrics.writtenBodies).toBe(127);

    const evidenceRoot = process.env.PERF_EVIDENCE_DIR
      ?? path.join(os.tmpdir(), 'luban-perf');
    const evidenceDir = path.join(
      evidenceRoot,
      `run-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    );
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDir, 'multibody-perf.json'),
      JSON.stringify({ metrics, finalMetrics }, null, 2),
      'utf-8',
    );
  });
});
```

- [ ] **Step 2: Run test to establish baseline**

```powershell
cd D:\Github\luban-backend\modeling-server
$env:CI = 'true'
corepack pnpm@10 exec vitest run src/feature/MultiBodyPerf.test.ts
```
Expected: PASS on the reference machine; capture `MULTIBODY_PERF {...}` and the
evidence path. If a threshold fails, record the measured value and **do not
silently raise** the threshold beyond 2× measured; use a short comment explaining
the calibration and the machine.

- [ ] **Step 3: Fix setup issues**

Use the exact fixture pattern from `BooleanBodiesFlow.test.ts`:
```ts
const svc = FeatureService.for(key, db);
await svc.ensureInitialized();
writeLeases.acquire(key, 'sess1', 'alice', 900_000);
```
Do not import helpers from another test file.

- [ ] **Step 4: Commit**

```bash
cd D:\Github\luban-backend
git add modeling-server/src/feature/MultiBodyPerf.test.ts
git commit -m "test(ms): M-A5.2 127-body 服务端性能基准"
```

---

### Task 2: Web 真栈 multibody 探针（opt-in）

**Files:**
- Create: `D:\Github\tiangong-kaiwu\luban-cad\apps\web-next\e2e\multibody-perf.spec.ts`
- Reference: `e2e/perf.spec.ts:48-73`（evidence writer）、`:357-386`（rAF collector）、
  `e2e/newbody.spec.ts:97-175`（msRpc / scratch iModel）

**Interfaces:**
- Env: `PERF_MULTIBODY=1`, `PERF_MULTIBODY_N` (default 20; allowed 20/50/90).
- Evidence file: `$PERF_EVIDENCE_DIR` or
  `.superpowers/sdd/2026-10-29-m-a5.2-perf/perf-samples/run-<UTC>/metrics.json`.

- [ ] **Step 1: Write the opt-in spec**

Create the file with the exact helper code below (it intentionally duplicates
`newbody.spec.ts` helpers rather than importing test helpers across spec files):

```ts
import { expect, test, type APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authHeaders, getApiToken, loginWithSession, waitEditorReady } from './helpers';

const RPC_VERSION = '1.16.0';
const BS = String.fromCharCode(92);
const N = Number(process.env.PERF_MULTIBODY_N ?? 20);
const ENABLED = process.env.PERF_MULTIBODY === '1'
  && (N === 20 || N === 50 || N === 90);
const TREE_READY_MS_MAX = 3000;
const FIT_MS_MAX = 1000;
const EDIT_REFRESH_MS_MAX = 1000;
const FPS_P95_MS_MAX = 18.2;
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
let projectId = '';

test.skip(!ENABLED, 'set PERF_MULTIBODY=1 and PERF_MULTIBODY_N=20|50|90');
test.afterAll(async ({ request }) => {
  if (!projectId) return;
  try {
    const token = await getApiToken();
    await request.delete(`/itwins/${projectId}`, { headers: authHeaders(token) });
  } catch (err) {
    console.warn(`[multibody-perf] 清理项目失败（${projectId}）：`, err);
  }
});

interface RpcMeta { csrfHeader: string; csrf: string }
let rpcMeta: RpcMeta | undefined;

async function getRpcMeta(): Promise<RpcMeta> {
  if (rpcMeta) return rpcMeta;
  const res = await fetch('http://localhost:5401/rpc/metadata');
  const setCookie = res.headers.get('set-cookie') ?? '';
  const csrf = /csrf-token=([^;]+)/.exec(setCookie)?.[1] ?? '';
  rpcMeta = { csrfHeader: res.headers.get('x-csrf-token') ?? csrf, csrf };
  return rpcMeta;
}

async function msRpc(
  itwinId: string,
  imodelId: string,
  operation: string,
  args: unknown[],
  accessToken: string,
): Promise<unknown> {
  const { csrfHeader, csrf } = await getRpcMeta();
  const stamp = Date.now().toString(16).padStart(12, '0');
  const url =
    `http://localhost:5401/LubanCAD/v1.0/mode/primary/context/${itwinId}/imodel/${imodelId}` +
    `/changeset/0/LubanFeatureRpcInterface-${RPC_VERSION}-${operation}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfHeader,
      Cookie: `csrf-token=${csrf}`,
      'X-Correlation-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
      'X-Application-Id': 'LubanCAD',
      'X-Application-Version': 'v1.0',
      'X-Session-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
    },
    body: JSON.stringify([...args, operation]),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MS RPC ${operation} HTTP ${res.status}: ${text.slice(0, 240)}`);
  const parsed = JSON.parse(text) as unknown;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && 'result' in parsed && !('ok' in (parsed as Record<string, unknown>))) {
    return (parsed as { result: unknown }).result;
  }
  return parsed;
}

async function createScratchImodel(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ itwinId: string; imodelId: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const project = await request.post('/itwins', {
    headers: authHeaders(accessToken),
    data: { displayName: `多体性能-${stamp}`, class: 'Project' },
  });
  expect(project.status(), `项目创建失败：HTTP ${project.status()}`).toBe(201);
  const itwinId = ((await project.json()) as { iTwin: { id: string } }).iTwin.id;
  projectId = itwinId;

  const created = await request.post('/imodels', {
    headers: authHeaders(accessToken),
    data: { iTwinId: itwinId, name: `MultiBodyPerf-${stamp}` },
  });
  expect(created.status(), `iModel 创建失败：HTTP ${created.status()}`).toBe(201);
  const imodelId = ((await created.json()) as { iModel: { id: string } }).iModel.id;

  let state = 'unknown';
  for (let i = 0; i < 110; i++) {
    const detail = await request.get(`/imodels/${imodelId}`, { headers: authHeaders(accessToken) });
    state = ((await detail.json()) as { iModel?: { state?: string } }).iModel?.state ?? 'unknown';
    if (state === 'initialized') break;
    if (state === 'failed' || state === 'missingFiles')
      throw new Error(`baseline 终态 ${state}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  expect(state, `iModel 未 initialized（最后 ${state}）`).toBe('initialized');
  // baseline 传播窗（newbody 同口径；计时从后续 reload 开始，包含此等待不影响指标口径）。
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  return { itwinId, imodelId };
}

function p95(samples: number[]): number {
  const sorted = samples.slice(1).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

test('多体基线：tree/edit/fit/FPS/tile（opt-in）', async ({ page, request }) => {
  test.setTimeout(900_000);
  const token = await getApiToken();
  const { itwinId, imodelId } = await createScratchImodel(request, token);
  await loginWithSession(page);
  await page.goto(`/documents/${itwinId}/${imodelId}`);
  await waitEditorReady(page);

  const dbKey = `briefcase-cache${BS}imodels${BS}${imodelId}${BS}briefcases${BS}2.bim`;
  const probeId = `multibody-probe-${Math.random().toString(36).slice(2)}`;
  const probe = (await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, probeId], token)) as {
    ok: boolean; holder?: string;
  };
  const sessionId = probe.ok ? probeId : (probe.holder ?? probeId);
  if (probe.ok)
    await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, sessionId], token);

  const box = (x: number, y: number) => [
    { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
    { x: x + 1, y: y + 1 }, { x: x - 1, y: y + 1 },
  ];
  let lastFeatureId = '';
  for (let i = 0; i < N; i++) {
    const raw = await msRpc(itwinId, imodelId, 'applyFeatureOp', [dbKey, {
      kind: 'insertFeature', featureType: 'extrude',
      params: {
        profile: box((i % 10) * 3, Math.floor(i / 10) * 3),
        distance: 1,
        newBody: i > 0,
      },
    }, sessionId], token);
    const result = raw as { ok: boolean; featureId?: string; error?: string };
    expect(result.ok, `seed body ${i}: ${result.error ?? ''}`).toBe(true);
    lastFeatureId = result.featureId ?? lastFeatureId;
  }

  // 释放播种租约后 reload：新页面重新取得写租约，后续 UI suppress 不受旧会话阻塞。
  try {
    await msRpc(itwinId, imodelId, 'releaseWriteLease', [dbKey, sessionId], token);
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
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
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
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
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
  // eslint-disable-next-line no-console
  console.log(`MULTIBODY_WEB_PERF ${JSON.stringify(record)}`);

  expect(treeReadyMs).toBeLessThan(TREE_READY_MS_MAX);
  expect(fitMs).toBeLessThan(FIT_MS_MAX);
  expect(editRefreshMs).toBeLessThan(EDIT_REFRESH_MS_MAX);
  expect(fpsP95Ms).toBeLessThanOrEqual(FPS_P95_MS_MAX);
});
```

- [ ] **Step 2: Run baseline**

Restart MS for a clean 100 req/15min window, then:
```bash
cd luban-cad/apps/web-next
PERF_MULTIBODY=1 CI=true corepack pnpm@10 exec playwright test e2e/multibody-perf.spec.ts
```
Expected: PASS; capture `MULTIBODY_WEB_PERF {...}` and the evidence file. If a
threshold fails, record actual vs threshold and add a short calibration comment;
do not move a threshold beyond 2× the first measured value without justification.

- [ ] **Step 3: Commit spec**

```bash
git add luban-cad/apps/web-next/e2e/multibody-perf.spec.ts
git commit -m "test(e2e): M-A5.2 多体性能探针（opt-in N=20）"
```

---

### Task 3: Baseline 记录 + 全套门禁 + 文档

**Files:**
- Create: `docs/superpowers/plans/2026-10-29-multibody-perf-baseline.md`
- Modify: `docs/superpowers/plans/2026-10-29-multibody-perf-guard.md`（执行结果）
- Modify: `.superpowers/sdd/2026-10-29-m-a5.2-perf/progress.md`（ledger，gitignored）

- [ ] **Step 1: Record baseline**

From Task 1/2 console output write:
- machine (Windows 11 / Chromium version / Node / private commit / public commit),
- private `MULTIBODY_PERF` JSON (N=10/50/127 + insert + rebuild),
- e2e `MULTIBODY_WEB_PERF` JSON (N=20 default; N=50/90 if run),
- threshold constants and 2× margin rationale,
- tile before/after deltas (`totalCacheMisses`, `totalDispatchedRequests`,
  `totalCompletedRequests`, `totalTileContentBytes`).

Do not commit raw evidence JSON; only the summary markdown with numbers.

- [ ] **Step 2: Run regression gates**

```bash
cd luban-cad/apps/web-next
CI=true corepack pnpm@10 test
CI=true corepack pnpm@10 exec tsc --noEmit
CI=true corepack pnpm@10 lint
# clean MS window:
CI=true corepack pnpm@10 exec playwright test
```
Expected: web unit all green; full e2e still 34/34 (`multibody-perf.spec.ts`
skips without `PERF_MULTIBODY=1`); private feature suite was green in Task 1.
Then rebuild web and verify:
```powershell
powershell -NoProfile -File scripts/rebuild-web.ps1
docker compose up -d web
powershell -NoProfile -File scripts/verify-stack.ps1
```
Expected: verify 17/17 and image revision = final web source commit.

- [ ] **Step 3: Commit docs**

```bash
git add docs/superpowers/plans/2026-10-29-multibody-perf-baseline.md \
  docs/superpowers/plans/2026-10-29-multibody-perf-guard.md
git commit -m "docs(plans): M-A5.2 多体性能基线"
```

---

## Self-Review

- Spec coverage: private 127 benchmark (T1), web N=20 opt-in probe (T2), baseline/docs/gates (T3).
- No production hot-path change; tile is evidence-only.
- Exact N/thresholds/env/evidence paths defined; no new dependencies.
- Perf spec is skipped by default (`test.skip` unless `PERF_MULTIBODY=1`), preserving
  the default 34-test rate-limit budget; N=20 is the default opt-in.
- Private benchmark uses the real kernel and a unique FeatureService key per DB;
  evidence is written outside the temp DB so it survives teardown.
