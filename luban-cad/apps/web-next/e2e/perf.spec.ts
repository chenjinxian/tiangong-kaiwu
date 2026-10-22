/**
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *
 * 性能门禁探针（M5-T7，切换门禁第 5 条）——两项实测：
 *
 * ① Documents 百行滚动帧率：API 自建 100 个 perf-seed-* 文档（自建自清，
 *    afterAll 清理 + beforeAll 清理崩溃遗留）→ 列表视图渲染 ≥100 行 →
 *    page.evaluate 内 requestAnimationFrame 时间戳序列采样，mouse.wheel
 *    驱动滚动（下到底 + 回顶，≥2 屏）→ 帧间隔 p95 ≤ 18.2ms 判 PASS
 *    （≈55fps 底线；目标 60fps = p95 ≈16.7ms）。
 *
 * ② 编辑器首帧 <5s：page.goto 编辑器 URL 起 → 视口 canvas 在场 + 状态栏
 *    「已连接」（≡ helpers.waitEditorReady 的双锚，rAF 粒度 in-page 采样）
 *    止——performance.now 差值（timeOrigin = 导航提交，Node 侧控制开销不计入，
 *    如实声明）。三次采样取中位数判门；首跑（新起 dev server + 冷 HTTP 缓存）
 *    与热跑分列。相位粗拆：shell（路由壳可见，含 dev 编译+模块图）/
 *    connect（briefcase 打开+IPC host）/ viewport（ScreenViewport 建帧）。
 *
 * 纪律：本探针是常驻资产；采样原始 JSON 落 .superpowers/sdd/2026-10-22-
 * web-next-m5-cutover-sprint/perf-samples/（git-ignored，PERF_EVIDENCE_DIR
 * 可覆盖）。不达标如实红——不调阈值凑绿（perf.md 登记判定与瓶颈分析）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { E2E_IMODEL_NAME, SEED_PROJECT_NAME } from './fixtures';
import { apiFindDocumentByName, authHeaders, gotoDocuments, loginWithSession, readAccessToken } from './helpers';

/** ① PASS 底线：p95 帧间隔 ≤18.2ms（≈55fps；目标 60fps=p95≈16.7ms）。 */
const SCROLL_P95_MS_MAX = 18.2;
/** ② 硬门：编辑器首帧（goto→已连接+canvas 在场）中位数 <5s。 */
const EDITOR_FIRST_FRAME_MS_MAX = 5000;
/** 百行种子数（门禁口径：列表满 100 行）。 */
const SEED_DOC_COUNT = 100;
/** 种子命名前缀（自清与遗留清理的唯一识别面）。 */
const SEED_PREFIX = 'perf-seed-';

/** 采样证据目录（git-ignored；默认仓根 .superpowers SDD sprint 目录）。 */
function evidenceDir(): string {
  return (
    process.env.PERF_EVIDENCE_DIR ??
    path.resolve(process.cwd(), '../../..', '.superpowers/sdd/2026-10-22-web-next-m5-cutover-sprint/perf-samples')
  );
}

function writeEvidence(name: string, payload: unknown): string {
  const dir = evidenceDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
  return file;
}

/** 分位数（线性序位法——sort 后取 ceil(p/100*n)-1）。 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ===========================================================================
// ① Documents 百行滚动帧率
// ===========================================================================

test.describe('性能门禁 ①：Documents 百行滚动', () => {
  /** 本次创建的种子 id（afterAll 按清单清；崩溃遗留由 beforeAll 按名兜清）。 */
  const seededIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    test.setTimeout(180_000);
    const token = readAccessToken();
    const headers = authHeaders(token);

    // 崩溃遗留兜清（上一轮 afterAll 未跑的 perf-seed-*）
    const existing = await request.get('/itwins?class=Project&$top=200', { headers });
    expect(existing.ok(), '遗留文档列表查询失败').toBeTruthy();
    const { iTwins } = (await existing.json()) as { iTwins?: Array<{ id: string; displayName?: string }> };
    const leftovers = (iTwins ?? []).filter((t) => t.displayName?.startsWith(SEED_PREFIX));
    for (const item of leftovers) {
      await request.delete(`/itwins/${item.id}`, { headers });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    // 建 100 行种子（25ms 步进既控速也避开同刻并发毛刺；hub 20ms/ creations）
    const seedStart = Date.now();
    for (let i = 0; i < SEED_DOC_COUNT; i++) {
      const created = await request.post('/itwins', {
        headers,
        data: { displayName: `${SEED_PREFIX}${String(i).padStart(3, '0')}`, class: 'Project' },
      });
      expect(created.status(), `种子文档 #${i} 创建失败`).toBe(201);
      seededIds.push(((await created.json()) as { iTwin: { id: string } }).iTwin.id);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    writeEvidence('seed-log.json', {
      capturedAt: new Date().toISOString(),
      created: seededIds.length,
      leftoversRemoved: leftovers.length,
      seedingMs: Date.now() - seedStart,
    });
  });

  test.afterAll(async ({ request }) => {
    const headers = authHeaders(readAccessToken());
    for (const id of seededIds) {
      await request.delete(`/itwins/${id}`, { headers });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  test('百行列表滚动帧率：p95 帧间隔 ≤18.2ms（60fps 目标 / 55fps 底线）', async ({ page }) => {
    test.setTimeout(240_000);
    await gotoDocuments(page); // 默认档=我的文档（种子全 createdBy 当前用户）

    // 列表视图（表格行=滚动负载形态；网格卡片是另一形态不属本门禁口径）
    await page.getByRole('button', { name: '列表视图' }).click();
    const rows = page.locator('.documents-table .documents-table-row');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(SEED_DOC_COUNT);
    const rowCount = await rows.count();

    // 滚动容器须有 ≥2 屏可滚量（门禁口径：驱动 ≥2 屏）
    const scroller = page.locator('.documents-table');
    const scrollMetrics = await scroller.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    const scrollablePx = scrollMetrics.scrollHeight - scrollMetrics.clientHeight;
    expect(
      scrollablePx,
      `表格可滚量不足 2 屏（scrollHeight=${scrollMetrics.scrollHeight} clientHeight=${scrollMetrics.clientHeight}）`,
    ).toBeGreaterThanOrEqual(scrollMetrics.clientHeight * 2);

    // rAF 采集器（in-page；时间戳序列 → 帧间隔）
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __collecting: boolean };
      w.__frames = [];
      w.__collecting = true;
      let last: number | null = null;
      const tick = (t: number) => {
        if (!w.__collecting) return;
        if (last !== null) w.__frames.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // wheel 驱动（真实输入路径）：下到底 → 回顶；样本不足再来一轮（≤3 轮）
    async function wheelPass(direction: 1 | -1): Promise<void> {
      const box = await scroller.boundingBox();
      if (!box) throw new Error('.documents-table 无 boundingBox（表格不可见？）');
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
      for (let tick = 0; tick < 400; tick++) {
        await page.mouse.wheel(0, direction * 240);
        await page.waitForTimeout(40);
        const atEnd = await scroller.evaluate((el, d) => {
          const e = el as HTMLElement;
          return d > 0 ? e.scrollTop + e.clientHeight >= e.scrollHeight - 2 : e.scrollTop <= 1;
        }, direction);
        if (atEnd) return;
      }
      throw new Error(`wheel 驱动 400 tick 未到${direction > 0 ? '底' : '顶'}（滚动失效？）`);
    }

    let rawIntervals: number[] = [];
    let passes = 0;
    for (let round = 0; round < 3 && rawIntervals.length < 120; round++) {
      await wheelPass(1);
      await wheelPass(-1);
      passes += 2;
      rawIntervals = await page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __collecting: boolean };
        w.__collecting = false;
        return w.__frames;
      });
    }

    // 空闲间隙过滤（wheel 轮次间 >200ms 无渲染失效的空档），首帧热身剔除
    const intervals = rawIntervals.slice(1).filter((gap) => gap < 200);
    expect(
      intervals.length,
      `帧样本不足 120（raw=${rawIntervals.length} filtered=${intervals.length}）`,
    ).toBeGreaterThanOrEqual(120);

    const sorted = [...intervals].sort((a, b) => a - b);
    const stats = {
      samples: intervals.length,
      p50Ms: round1(percentile(sorted, 50)),
      p95Ms: round1(percentile(sorted, 95)),
      p99Ms: round1(percentile(sorted, 99)),
      maxMs: round1(sorted[sorted.length - 1]!),
      meanMs: round1(intervals.reduce((sum, v) => sum + v, 0) / intervals.length),
    };

    const file = writeEvidence('scroll-frames.json', {
      gate: 'documents-scroll-fps',
      capturedAt: new Date().toISOString(),
      viewport: page.viewportSize(),
      rowCount,
      seededDocs: SEED_DOC_COUNT,
      scroll: {
        scrollablePx,
        clientHeight: scrollMetrics.clientHeight,
        screensScrolled: round1(scrollablePx / scrollMetrics.clientHeight),
        wheelDeltaPerTickPx: 240,
        tickIntervalMs: 40,
        passes,
        idleGapFilterMs: 200,
      },
      stats,
      thresholds: { p95MsMax: SCROLL_P95_MS_MAX, targetP95Ms: 16.7 },
      verdict: stats.p95Ms <= SCROLL_P95_MS_MAX ? 'PASS' : 'FAIL',
      rawIntervalCount: rawIntervals.length,
      intervals,
    });

    expect(
      stats.p95Ms,
      `滚动帧率不达标：p95=${stats.p95Ms}ms > ${SCROLL_P95_MS_MAX}ms 基线（样本=${stats.samples}，p50=${stats.p50Ms}，max=${stats.maxMs}；证据=${file}）`,
    ).toBeLessThanOrEqual(SCROLL_P95_MS_MAX);
  });
});

// ===========================================================================
// ② 编辑器首帧 <5s
// ===========================================================================

/** 首帧相位（in-page performance.now，timeOrigin=导航提交）。 */
interface EditorPhases {
  /** 路由壳可见（含 dev 编译 + 模块图 + i18n + store 引导）。 */
  shellMs: number;
  /** 状态栏「已连接」（briefcase 打开 + IPC host ready）。 */
  connectedMs: number;
  /** 终锚：canvas 在场（ScreenViewport 建帧）与已连接的较大者。 */
  finalMs: number;
  /** 主文档 responseEnd（参考位）。 */
  mainDocResponseEndMs: number;
  /** 资源请求数（vite dev 未打包 ESM 模块数的参考位）。 */
  resourceCount: number;
  /** 采样终止时最后连接态文本（失败诊断用）。 */
  lastStatus: string;
}

test.describe('性能门禁 ②：编辑器首帧', () => {
  let editorUrl = '';

  test.beforeAll(async ({ request }) => {
    const token = readAccessToken();
    const project = await apiFindDocumentByName(request, SEED_PROJECT_NAME, token);
    if (!project) throw new Error(`种子项目 ${SEED_PROJECT_NAME} 不在场（auth.setup 自愈失败？）`);
    const listResponse = await request.get(`/imodels?iTwinId=${project.id}&$top=100`, {
      headers: authHeaders(token),
    });
    expect(listResponse.ok(), 'iModel 列表查询失败').toBeTruthy();
    const { iModels } = (await listResponse.json()) as {
      iModels?: Array<{ id: string; displayName?: string; name?: string; state?: string }>;
    };
    const seed = (iModels ?? []).find((m) => (m.displayName ?? m.name) === E2E_IMODEL_NAME);
    if (!seed) throw new Error(`种子库 ${E2E_IMODEL_NAME} 不在场`);
    if (seed.state !== 'initialized') {
      throw new Error(`种子库未 initialized（state=${seed.state}）——首帧测量前提不成立`);
    }
    editorUrl = `/documents/${project.id}/${seed.id}`;
  });

  test('首帧 <5s：goto → 已连接 + canvas 在场，三跑取中位数', async ({ page }) => {
    test.setTimeout(600_000);
    await loginWithSession(page);

    // rAF 粒度相位采集（addInitScript：每次导航首帧起采，零 clamp 偏置；
    // 锚点 ≡ helpers.waitEditorReady 双条件——状态栏已连接 + 挂载点 canvas）。
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__perf = { shell: undefined, connected: undefined, canvas: undefined, failed: false, result: undefined, lastStatus: '' };
      const tick = () => {
        const p = w.__perf as {
          shell?: number; connected?: number; canvas?: number; failed: boolean;
          result?: EditorPhases; lastStatus: string;
        };
        if (p.result) return;
        const now = performance.now();
        if (p.shell === undefined && document.querySelector('[data-testid="part-studio-page"]')) {
          p.shell = now;
        }
        const statusText =
          document.querySelector('[data-testid="part-studio-status-connection"]')?.textContent ?? '';
        p.lastStatus = statusText;
        if (p.connected === undefined && statusText === '已连接') p.connected = now;
        const canvas = document.querySelector('[data-testid="part-studio-viewport"] canvas') as HTMLCanvasElement | null;
        if (p.canvas === undefined && canvas && canvas.width > 0) p.canvas = now;
        if (p.shell !== undefined && statusText === '连接失败') p.failed = true;
        if (p.shell !== undefined && p.connected !== undefined && p.canvas !== undefined) {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          const final = Math.max(p.connected, p.canvas ?? p.connected);
          p.result = {
            shellMs: Math.round(p.shell),
            connectedMs: Math.round(p.connected),
            finalMs: Math.round(final),
            mainDocResponseEndMs: Math.round(nav?.responseEnd ?? 0),
            resourceCount: performance.getEntriesByType('resource').length,
            lastStatus: statusText,
          };
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    /** 单跑：goto 起 → 相位收齐止；「连接失败」按应用自面恢复路径重开（≤2 次，
     * 与 waitEditorReady 同纪律——重跑即重头计时，不吃失败残值）。 */
    async function measureOnce(): Promise<EditorPhases> {
      for (let reloads = 0; ; ) {
        await page.goto(editorUrl, { waitUntil: 'commit' });
        await page.waitForFunction(
          () => {
            const p = (window as unknown as Record<string, unknown>).__perf as
              | { result?: unknown; failed?: boolean }
              | undefined;
            return p?.result !== undefined || p?.failed === true;
          },
          undefined,
          { polling: 250, timeout: 150_000 },
        );
        const state = await page.evaluate(
          () => (window as unknown as Record<string, unknown>).__perf as {
            result?: EditorPhases; failed: boolean; lastStatus: string;
          },
        );
        if (state.result) return state.result;
        if (state.failed && reloads < 2) {
          reloads += 1;
          await page.waitForTimeout(3000);
          continue;
        }
        throw new Error(`编辑器首帧采样失败（failed=${state.failed}，最后连接态=${state.lastStatus}）`);
      }
    }

    // 三跑：#1 冷（新起 dev server 的 vite 编译冷载 + 冷 HTTP 缓存），#2/#3 热
    const runs: EditorPhases[] = [];
    for (let i = 0; i < 3; i++) {
      runs.push(await measureOnce());
      await page.waitForTimeout(2000); // MS 侧 db 释放驻留（复用路径「Closing existing db」）
    }

    const totals = runs.map((r) => r.finalMs).sort((a, b) => a - b);
    const median = totals[1]!;
    const warmRuns = runs.slice(1);
    const warmMedian = [...warmRuns.map((r) => r.finalMs)].sort((a, b) => a - b)[0]!;

    const file = writeEvidence('editor-first-frame.json', {
      gate: 'editor-first-frame',
      capturedAt: new Date().toISOString(),
      editorUrl,
      thresholds: { medianMsMax: EDITOR_FIRST_FRAME_MS_MAX },
      verdict: median < EDITOR_FIRST_FRAME_MS_MAX ? 'PASS' : 'FAIL',
      medianFinalMs: median,
      coldRun: runs[0],
      warmRuns,
      warmMedianFinalMs: warmMedian,
      runs,
      phaseNotes: {
        shellMs: '路由壳可见（dev 编译+模块图+引导）',
        connectMsHint: 'connectedMs - shellMs ≈ briefcase 打开+IPC host 相位',
        viewportMsHint: 'finalMs - connectedMs ≈ ScreenViewport 建帧相位',
      },
    });

    expect(
      median,
      `编辑器首帧不达标：中位数=${median}ms ≥ ${EDITOR_FIRST_FRAME_MS_MAX}ms（冷=${runs[0]!.finalMs}ms，热中位=${warmMedian}ms；证据=${file}）`,
    ).toBeLessThan(EDITOR_FIRST_FRAME_MS_MAX);
  });
});
