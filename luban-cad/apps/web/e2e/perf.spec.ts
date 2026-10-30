/**
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *
 * 性能门禁探针（M5-T7，切换门禁第 5 条；T7 评审修复轮）——两项实测：
 *
 * ① 编辑器首帧 <5s（**文件内先跑**——冷值纪律进结构：门禁轮须新起 dev server
 *    后整文件执行，编辑器先跑才吃真冷载；滚动页会预热共享模块图，反序则冷标
 *    签失实，T7 首轮实测教训）：page.goto 编辑器 URL 起 → 状态栏「已连接」+
 *    视口挂载点 canvas 在场（≡ helpers.waitEditorReady 双锚，rAF 粒度 in-page
 *    采样；**锚点=canvas 挂载/建帧完成，非 tile 几何首帧**——只读空种子库上
 *    是视口壳就绪，先于首个 tile 绘制）止——performance.now 差值（timeOrigin=
 *    导航提交，Node 侧控制开销不计入）。**每跑 fresh browser context**（T7
 *    评审 I-1：同页三连重开测的是 teardown 叠加装置成本——首轮实测同页协议
 *    3872→4657ms 会话间摆 20%，fresh context 语义=真实每访成本）三跑取中位
 *    判门；冷/热分列。相位粗拆：shell（路由壳可见，含 dev 编译+模块图）/
 *    connect（briefcase 打开+IPC host）/ viewport（canvas 建帧）。
 *
 * ② Documents 百行滚动帧率：API 自建 100 个 perf-seed-* 文档（自建自清，
 *    afterAll 清理 + beforeAll 清理崩溃遗留）→ 列表视图渲染 ≥100 行 →
 *    page.evaluate 内 requestAnimationFrame 时间戳序列采样（采样窗含轮间
 *    空闲帧，p95 有被稀释的理论面——登记 perf.md M-8），mouse.wheel 驱动
 *    滚动（下到底 + 回顶，≥2 屏；样本不足自动重臂补轮 ≤3 轮）→ 帧间隔
 *    p95 ≤ 18.2ms 判 PASS（≈55fps 底线；目标 60fps = p95 ≈16.7ms）。
 *
 * 纪律：本探针是常驻资产；证据落 `<仓根>/.superpowers/sdd/2026-10-22-web-
 * next-m5-cutover-sprint/perf-samples/run-<时间戳>/`（**每轮独立子目录，永不
 * 覆盖**——T7 评审 C-1 根因：固定文件名被全套件回归重跑静默覆盖门禁轮证据；
 * PERF_EVIDENCE_DIR 可整体改指向）。锚定本文件位置解析（非 process.cwd()，
 * M-6）。不达标如实红——不调阈值凑绿（perf.md 登记判定与瓶颈分析）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E_IMODEL_NAME, SEED_PROJECT_NAME } from './fixtures';
import { apiFindDocumentByName, authHeaders, getApiToken, gotoDocuments, loginWithSession } from './helpers';

/** ② PASS 底线：p95 帧间隔 ≤18.2ms（≈55fps；目标 60fps=p95≈16.7ms）。 */
const SCROLL_P95_MS_MAX = 18.2;
/** ① 硬门：编辑器首帧（goto→已连接+canvas 在场）中位数 <5s。 */
const EDITOR_FIRST_FRAME_MS_MAX = 5000;
/** 百行种子数（门禁口径：列表满 100 行）。 */
const SEED_DOC_COUNT = 100;
/** 种子命名前缀（自清与遗留清理的唯一识别面）。 */
const SEED_PREFIX = 'perf-seed-';

/** 本轮证据目录：run-<UTC 时间戳> 子目录——同轮两探针归档一处，跨轮永不覆盖。 */
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');

/** 本文件位置（apps/web 是 ESM 包——__dirname 不可用，锚 import.meta.url，
 * M-6：非 apps/web cwd 起跑也写对地方）。 */
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 证据根（锚定本文件位置；PERF_EVIDENCE_DIR 可整体改指向）。 */
function evidenceRoot(): string {
  return (
    process.env.PERF_EVIDENCE_DIR ??
    path.resolve(SPEC_DIR, '../../../..', '.superpowers/sdd/2026-10-22-web-next-m5-cutover-sprint/perf-samples')
  );
}

function evidenceDir(): string {
  return path.join(evidenceRoot(), `run-${RUN_STAMP}`);
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

/** Node 侧驻留（编辑器跑间 MS 侧 db 释放）。 */
function dwell(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===========================================================================
// ① 编辑器首帧 <5s（文件内先跑——冷值纪律，见头注）
// ===========================================================================

/** 首帧相位（in-page performance.now，timeOrigin=导航提交）。 */
interface EditorPhases {
  /** 路由壳可见（含 dev 编译 + 模块图 + i18n + store 引导）。 */
  shellMs: number;
  /** 状态栏「已连接」（briefcase 打开 + IPC host ready）。 */
  connectedMs: number;
  /** 终锚：canvas 在场（挂载/建帧完成，非 tile 几何首帧）与已连接的较大者。 */
  finalMs: number;
  /** 主文档 responseEnd（参考位）。 */
  mainDocResponseEndMs: number;
  /** 资源请求数（vite dev 未打包 ESM 模块数的参考位）。 */
  resourceCount: number;
  /** 采样终止时最后连接态文本（失败/超时诊断用）。 */
  lastStatus: string;
}

interface PerfProbeState {
  result?: EditorPhases;
  failed: boolean;
  lastStatus: string;
}

/** rAF 粒度相位采集（addInitScript：每次导航首帧起采，零 clamp 偏置；
 * 锚点 ≡ helpers.waitEditorReady 双条件——状态栏已连接 + 挂载点 canvas）。 */
async function installPerfProbe(page: Page): Promise<void> {
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
}

async function readPerfState(page: Page): Promise<PerfProbeState> {
  try {
    const state = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__perf as PerfProbeState | undefined,
    );
    return state ?? { failed: false, lastStatus: '<探针状态缺失>', result: undefined };
  } catch {
    // 页面已坍缩/导航中——给超时诊断一个不至于二次抛错的兜底形状
    return { failed: false, lastStatus: '<页面状态不可读>', result: undefined };
  }
}

test.describe('性能门禁 ①：编辑器首帧', () => {
  let editorUrl = '';

  test.beforeAll(async ({ request }) => {
    const token = await getApiToken();
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

  /** 单跑 = fresh browser context（语义=真实每访成本，I-1）：新 page 即新
   * context（隔离存储/HTTP 缓存），跑毕即弃。「连接失败」按应用自面恢复路径
   * 重开（≤2 次，与 waitEditorReady 同纪律——重跑即重头计时，不吃失败残值）；
   * 等待超时抛错带 lastStatus（M-5 诊断面）。 */
  async function measureOnce(browser: Browser, url: string): Promise<EditorPhases> {
    const page = await browser.newPage();
    try {
      await loginWithSession(page);
      await installPerfProbe(page);
      for (let reloads = 0; ; ) {
        await page.goto(url, { waitUntil: 'commit' });
        let timedOut = false;
        try {
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
        } catch {
          timedOut = true;
        }
        const state = await readPerfState(page);
        if (state.result) return state.result;
        if (timedOut) {
          throw new Error(
            `编辑器首帧采样等待超时（150s；最后连接态=${state.lastStatus}，failed=${state.failed}）`,
          );
        }
        if (state.failed && reloads < 2) {
          reloads += 1;
          await dwell(3000);
          continue;
        }
        throw new Error(`编辑器首帧采样失败（failed=${state.failed}，最后连接态=${state.lastStatus}）`);
      }
    } finally {
      await page.close();
    }
  }

  test('首帧 <5s：goto → 已连接 + canvas 在场，三跑（fresh context）取中位数', async ({ browser }) => {
    test.setTimeout(600_000);

    // 三跑：#1 冷（新起 dev server 的 vite 编译冷载 + fresh context 冷 HTTP 缓存），
    // #2/#3 热（server 温态；context 恒新——无跨跑浏览器缓存收益，如实口径）
    const runs: EditorPhases[] = [];
    for (let i = 0; i < 3; i++) {
      runs.push(await measureOnce(browser, editorUrl));
      await dwell(1500); // MS 侧 db 释放驻留（复用路径「Closing existing db」为真实顺序访成本，保留计入）
    }

    const totals = runs.map((r) => r.finalMs).sort((a, b) => a - b);
    const median = totals[1]!;
    const warmRuns = runs.slice(1);
    const warmMedian = [...warmRuns.map((r) => r.finalMs)].sort((a, b) => a - b)[0]!;

    const file = writeEvidence('editor-first-frame.json', {
      gate: 'editor-first-frame',
      capturedAt: new Date().toISOString(),
      protocol: 'fresh browser context per run（真实每访语义，T7 评审 I-1）',
      editorUrl,
      thresholds: { medianMsMax: EDITOR_FIRST_FRAME_MS_MAX },
      verdict: median < EDITOR_FIRST_FRAME_MS_MAX ? 'PASS' : 'FAIL',
      medianFinalMs: median,
      marginPct: round1(((EDITOR_FIRST_FRAME_MS_MAX - median) / EDITOR_FIRST_FRAME_MS_MAX) * 100),
      coldRun: runs[0],
      warmRuns,
      warmMedianFinalMs: warmMedian,
      runs,
      anchorNote: '终锚=canvas 挂载/建帧完成（视口壳就绪），非 tile 几何首帧',
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

// ===========================================================================
// ② Documents 百行滚动帧率
// ===========================================================================

test.describe('性能门禁 ②：Documents 百行滚动', () => {
  /** 本次创建的种子 id（afterAll 按清单清；崩溃遗留由 beforeAll 按名兜清）。 */
  const seededIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    test.setTimeout(180_000);
    const token = await getApiToken();
    const headers = authHeaders(token);

    // 崩溃遗留兜清（上一轮 afterAll 未跑的 perf-seed-*；单页 $top=200，>200
    // 项目时更早遗留可能不在页内——已知边缘，登记 perf.md M-7）
    const existing = await request.get('/itwins?class=Project&$top=200', { headers });
    expect(existing.ok(), '遗留文档列表查询失败').toBeTruthy();
    const { iTwins } = (await existing.json()) as { iTwins?: Array<{ id: string; displayName?: string }> };
    const leftovers = (iTwins ?? []).filter((t) => t.displayName?.startsWith(SEED_PREFIX));
    for (const item of leftovers) {
      await request.delete(`/itwins/${item.id}`, { headers });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    // 建 100 行种子（25ms 步进控速；hub 单建 ~20ms 实测）
    const seedStart = Date.now();
    for (let i = 0; i < SEED_DOC_COUNT; i++) {
      const created = await request.post('/itwins', {
        headers,
        data: {
          displayName: `${SEED_PREFIX}${String(i).padStart(3, '0')}`,
          class: 'Endeavor',
          subClass: 'Project',
        },
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
    const headers = authHeaders(await getApiToken());
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

    // rAF 采集器（常驻循环装一次；采/停可重臂——M-1：回退轮须重新起采而非读陈旧数组）
    async function startFrameCollector(): Promise<void> {
      await page.evaluate(() => {
        const w = window as unknown as {
          __frames: number[]; __collecting: boolean; __collectorInstalled?: boolean;
        };
        w.__frames = [];
        w.__collecting = true;
        if (w.__collectorInstalled) return;
        w.__collectorInstalled = true;
        let last: number | null = null;
        const tick = (t: number) => {
          if (w.__collecting) {
            if (last !== null) w.__frames.push(t - last);
            last = t;
          } else {
            last = null; // 停采期间不打点；重臂后首帧不计旧差
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }

    async function stopFrameCollector(): Promise<number[]> {
      return page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __collecting: boolean };
        w.__collecting = false;
        return w.__frames;
      });
    }

    // wheel 驱动（真实输入路径）：下到底 → 回顶
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
      await startFrameCollector(); // 每轮重臂（清数组+重启采）
      await wheelPass(1);
      await wheelPass(-1);
      passes += 2;
      rawIntervals = await stopFrameCollector();
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
    // 帧距分布直方（登记/复核用，防 perf.md 手誊漂移——C-1 教训）
    const histogram: Record<string, number> = {};
    for (const gap of intervals) {
      const bucket = gap < 8.33 ? '<8.3' : gap < 16.67 ? '8.3-16.6' : gap < 18.2 ? '16.7-18.1' : '>=18.2';
      histogram[bucket] = (histogram[bucket] ?? 0) + 1;
    }

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
      histogram,
      thresholds: { p95MsMax: SCROLL_P95_MS_MAX, targetP95Ms: 16.7 },
      verdict: stats.p95Ms <= SCROLL_P95_MS_MAX ? 'PASS' : 'FAIL',
      samplingNote: '采样窗含轮间空闲帧（p95 稀释面，M-8 登记）；intervals 为过滤后原始帧距可独立重算',
      rawIntervalCount: rawIntervals.length,
      intervals,
    });

    expect(
      stats.p95Ms,
      `滚动帧率不达标：p95=${stats.p95Ms}ms > ${SCROLL_P95_MS_MAX}ms 基线（样本=${stats.samples}，p50=${stats.p50Ms}，max=${stats.maxMs}；证据=${file}）`,
    ).toBeLessThanOrEqual(SCROLL_P95_MS_MAX);
  });
});
