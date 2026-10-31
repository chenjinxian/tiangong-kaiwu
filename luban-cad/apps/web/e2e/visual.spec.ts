/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 视觉钉版基线（M5-T6，切换门禁第 3 条「截图对照零未登记差异」的回归载体）：
 * - 五关键状态 toHaveScreenshot @1440×900，亮色起底：登录页 / 文档中心网格 /
 *   文档详情（A 只读）/ 编辑器五区（A 只读）/ 设置页；P2.6c1 追加第 6 张
 *   「B 默认页签编辑器」——B/A 双 IA 模式各有可评估钉面（画布仍 mask）；
 * - **运行前提（P2.6c2 F1）：dev server 以 `VITE_B_MODEL_ENABLED=true` 启动**
 *   （文档中心渲染 B 项目区；flag 关时 B 种子不在列表——rollback 面由
 *   `DocumentsPage.flag-off.test` 单测覆盖）。快照基线只对 flag-on 环境有效。
 *   flag-on 由 `playwright.config.ts` 的 `webServer.env` 注入：`CI=true`（或
 *   无在场服务时的冷启动）由 Playwright 自己起的 dev server 必带该变量；
 *   本地复用在场的旧服务时，该服务须自行以 flag-on 启动（否则 B 区用例如实红）。
 * - 首跑 `corepack pnpm@10 test:e2e --update-snapshots` 建基线（快照落
 *   e2e/__screenshots__/，luban-cad/.gitignore 豁免行放行入库）；此后每次
 *   套件运行即对照——差异红即真红，属预期改版时随同款提交 --update-snapshots；
 * - 对照基准 = onshape-audit 采集（pub-01 登录 / os-01 文档 / os-11 Part
 *   Studio / os-48 帐户），逐张并排人工比对，差异登记 SDD sprint 目录
 *   quadrant/walkthrough.md（对齐/偏差-可接受/偏差-待修三态，M3 visual-diff
 *   口径）；
 * - 钉面 = UI 铬（布局/文案/令牌）。编辑器画布 WebGL 区 mask 掉——瓦片流送
 *   时序像素不可钉（canvas 真实在场由 waitEditorReady 断言兜住，几何内容归
 *   渲染域不归视觉域）；
 * - 数据面（P2.6c1）：**文档中心网格**用 visual 专属夹具项目——`E2E VISUAL A`
 *   （A 旧文档语义，带所有权标记 data.luban.modelMode='A'，对 `isBModelItwin`
 *   惰性）与 `E2E VISUAL B`（精确 B 标记）；搜索词 `E2E VISUAL` 同时命中双区，
 *   且**不依赖**共享库里的历史/演示项目（此前「项目」搜索会带出演示项目与
 *   每日变化的种子修改日期，快照跨日/跨演示即碎）。夹具 beforeAll 确保在场、
 *   afterAll 自清（同名但标记不符即红，不删未知数据）；tile「修改于」日期按
 *   mask 遮蔽。**文档详情**钉 A 旧文档种子的真实页（auth.setup 重置后），
 *   写入口缺席 + 只读横幅如实；iModel 卡「创建于」日期按 mask 遮蔽。编辑器
 *   两张钉面用真实种子（各自重置后钉）。
 * - 会话注入零登录（helpers.loginWithSession）；主题/语言经 addInitScript
 *   显式钉 light/zh-CN（读存储是应用合法代码路径，防开发态 localStorage
 *   残留读入污染基线）。
 */

import { expect, test, type Page } from '@playwright/test';
import {
  B_MODEL_MARKER,
  E2E_IMODEL_NAME,
  SEED_PROJECT_NAME,
} from './fixtures';
import {
  apiFindDocumentByName,
  authHeaders,
  getApiToken,
  gotoDocuments,
  gotoRoute,
  loginWithSession,
  openLegacySeedEditor,
  openSeedImodelEditor,
  readOpenBriefcaseInfo,
  SEED_PAGE_SIZE,
  uniqueMatch,
  waitEditorReady,
} from './helpers';
import { resetBModelSeed, resetE2eSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed';

test.use({ viewport: { width: 1440, height: 900 } });

/** 视觉夹具项目名（ASCII；搜索同时命中双区，且不撞共享库历史数据）。 */
const VISUAL_A_PROJECT = 'E2E VISUAL A';
const VISUAL_B_PROJECT = 'E2E VISUAL B';
/** 双区公共搜索词（只命中上面两个夹具）。 */
const VISUAL_SEARCH = 'E2E VISUAL';
/** A 夹具所有权标记（惰性数据：`isBModelItwin` 只认 modelMode==='B'，此项目
 * 仍按 A 旧文档分支渲染；标记只用于「同名项是不是本测试的」安全裁决）。 */
const VISUAL_A_MARKER = { luban: { modelMode: 'A', schemaVersion: 1 } };

let visualAId = '';
let visualBId = '';
/** A 旧文档种子项目（详情页钉面用；auth.setup 保证在场）。 */
let seedProjectId = '';

/** 按精确名 + 精确标记确保视觉夹具项目在场（同名无标记/版本不符 → 红，不删）。 */
async function ensureVisualProject(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  name: string,
  marker: Record<string, unknown>,
  expectedMode: 'A' | 'B',
): Promise<string> {
  const list = await request.get(`/itwins?subClass=Project&$top=${SEED_PAGE_SIZE}`, {
    headers: authHeaders(accessToken),
  });
  expect(list.ok(), '视觉夹具项目列表查询失败').toBeTruthy();
  const { iTwins } = (await list.json()) as {
    iTwins?: Array<{ id: string; displayName?: string }>;
  };
  const hit = uniqueMatch(iTwins ?? [], (itwin) => itwin.displayName, name, '视觉夹具项目');
  if (hit) {
    const detail = await request.get(`/itwins/${hit.id}`, { headers: authHeaders(accessToken) });
    expect(detail.ok(), `视觉夹具项目详情查询失败（${name}）`).toBeTruthy();
    const data = ((await detail.json()) as { iTwin?: { data?: Record<string, unknown> } }).iTwin?.data;
    const luban = data?.luban as Record<string, unknown> | undefined;
    if (luban?.modelMode !== expectedMode || luban?.schemaVersion !== 1) {
      throw new Error(
        `同名项目 ${name}（${hit.id}）未带本测试标记（期望 mode=${expectedMode}/v1，` +
          `实得 ${JSON.stringify(data?.luban)}）——拒绝删改未知数据；请人工清理后重跑`,
      );
    }
    return hit.id;
  }
  const created = await request.post('/itwins', {
    headers: authHeaders(accessToken),
    data: { displayName: name, subClass: 'Project', data: marker },
  });
  expect(created.status(), `视觉夹具项目创建失败（${name}）`).toBe(201);
  return ((await created.json()) as { iTwin: { id: string } }).iTwin.id;
}

test.beforeAll(async ({ request }) => {
  const token = await getApiToken();
  visualAId = await ensureVisualProject(request, token, VISUAL_A_PROJECT, VISUAL_A_MARKER, 'A');
  visualBId = await ensureVisualProject(request, token, VISUAL_B_PROJECT, B_MODEL_MARKER, 'B');
  const seed = await apiFindDocumentByName(request, SEED_PROJECT_NAME, token);
  if (!seed) throw new Error(`种子项目 ${SEED_PROJECT_NAME} 不在场（auth.setup 自愈失败？）`);
  seedProjectId = seed.id;
});

test.afterAll(async ({ request }) => {
  // 夹具自清（视觉钉版不向共享库留长期数据）；清理失败不致命——下一轮按
  // 精确名 + 标记复用，不会累积同名重复。
  const token = await getApiToken();
  for (const [name, id] of [
    [VISUAL_A_PROJECT, visualAId],
    [VISUAL_B_PROJECT, visualBId],
  ] as const) {
    if (!id) continue;
    try {
      const response = await request.delete(`/itwins/${id}`, { headers: authHeaders(token) });
      console.log(`[visual] 清理夹具项目 ${name}（${id}）：HTTP ${response.status()}`);
    } catch (error) {
      console.warn(`[visual] 清理夹具项目 ${name}（${id}）异常：`, error);
    }
  }
});

/** 钉版定妆：亮色 + 中文显式落默认存储（addInitScript 先于应用代码执行）。
 * 同时拦断外部字体 CDN：无代理环境下 fonts.gstatic.com 时通时断，同一页面
 * 「字体加载成功/失败」会把回退字形差异钉进截图（M5-T4 全量复跑实测 1% 抖动）。
 * 钉版一律走浏览器回退字体=确定性渲染；应用自身字体策略不改。 */
async function pinLightZh(page: Page): Promise<void> {
  await page.route(/https?:\/\/fonts\.(gstatic|googleapis)\.com\//, (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('luban-next-theme', 'light');
    localStorage.setItem('luban-next-lang', 'zh-CN');
  });
}

/** 字体就绪门（webfont 未就绪截图会钉出回退字形）。 */
async function settleFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => null));
}

test('视觉钉版：登录页（亮色）', async ({ page }) => {
  await pinLightZh(page);
  await page.goto('/login');
  await expect(page.getByTestId('signin-route')).toBeVisible();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  // P2.8：hero 的 HUB 端点展示 env.hubUrl（缺省=当前 origin）——:5300 源码
  // dev 与 :5301 发布镜像 origin 不同，遮蔽该运行时值（面板背景 #f5f5f5），
  // 让同一基线同时适用于 source 与 release-image 全量套件。
  const hubEndpoint = page.locator('.signin-hero__token-value');
  await expect(hubEndpoint).toBeVisible();
  await settleFonts(page);
  await expect(page).toHaveScreenshot('login-light.png', {
    mask: [hubEndpoint],
    maskColor: 'rgb(245, 245, 245)',
  });
});

test('视觉钉版：文档中心网格（亮色，flag-on B/A 双区）', async ({ page }) => {
  await pinLightZh(page);
  await gotoDocuments(page);
  // 视觉夹具公共词过滤：双区各恰一张卡（不泄漏历史/演示/前序 spec 项目）。
  const search = page.getByRole('searchbox');
  await search.fill(VISUAL_SEARCH);
  // 真实数据锚点①：B 项目区在场且 B 夹具项目落位（flag-on 分区 IA + B 徽标）
  const projects = page.getByTestId('projects-section');
  await expect(projects).toBeVisible({ timeout: 20_000 });
  await expect(
    projects.getByRole('button', { name: VISUAL_B_PROJECT, exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  // 真实数据锚点②：A 夹具项目在 A 旧文档区（网格卡片渲染完成）
  const legacyBody = page.locator('.documents-body');
  await expect(
    legacyBody.getByRole('button', { name: VISUAL_A_PROJECT, exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  // 双区各一卡（分区读取唯一事实源：B 不得混入 A 区，反之亦然）
  await expect(legacyBody.getByRole('button', { name: VISUAL_B_PROJECT })).toHaveCount(0);
  await expect(projects.getByRole('button', { name: VISUAL_A_PROJECT })).toHaveCount(0);
  await expect(legacyBody.locator('.document-tile')).toHaveCount(1);
  await expect(projects.locator('.document-tile')).toHaveCount(1);
  // 夹具每轮新建：tile「修改于」日期随日漂移——遮蔽日期文本（白底 mask
  // 与卡片同色，只去日期不遮整卡）。
  const modifiedLabels = page.locator('.document-tile').getByText(/^修改于/);
  await expect(modifiedLabels).toHaveCount(2);
  await settleFonts(page);
  await expect(page).toHaveScreenshot('documents-grid-light.png', {
    mask: await modifiedLabels.all(),
    maskColor: 'rgb(255, 255, 255)',
  });
});

test('视觉钉版：文档详情（亮色，A 旧文档只读态）', async ({ page }) => {
  await pinLightZh(page);
  await loginWithSession(page);
  // 钉 A 旧文档种子真实详情页（P2.3 只读 IA）：只读横幅 + 无写入口 + 卡片
  // 只留「打开工作空间」读路径。A 种子库每轮重置（卡序第一条），同项目人工
  // 调试库与旧基线同框如实（历史口径）；iModel 卡「创建于」日期文本按 mask
  // 遮蔽（跨日漂移）。
  await gotoRoute(page, `/documents/${seedProjectId}`, 'document-details-route');
  await expect(page.getByTestId('legacy-readonly-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建 iModel' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '删除' })).toHaveCount(0);
  const seedCard = page.locator('.imodel-card', { hasText: E2E_IMODEL_NAME });
  await expect(seedCard).toBeVisible({ timeout: 20_000 });
  await expect(seedCard.getByRole('button', { name: '打开工作空间' })).toBeVisible();
  const createdMeta = page.locator('.imodel-card').getByText(/创建于/);
  await expect(createdMeta.first()).toBeVisible();
  await settleFonts(page);
  await expect(page).toHaveScreenshot('document-details-light.png', {
    mask: await createdMeta.all(),
  });
});

test('视觉钉版：编辑器五区 A 只读态（亮色，画布 mask）', async ({ page, request }) => {
  // 编辑器用例预算放大（T8 评审 M-3，对齐 part-studio/keyboard 同款）：同链
  // openLegacySeedEditor + waitEditorReady 最坏 ~300s > 全局 120s，慢栈下
  // timeout 会抢先吃掉 helper 诊断文案。再叠种子重置（M5-T4 全量复跑实测：
  // 前序 spec 会给种子留特征，本钉版按干净种子态钉，不重置即变成执行顺序
  // 依赖）。P2.6c2 F4：预算 = 单种子重置最坏链（550s 轮询 + 15s settle）
  // + 打开/截图余量（原固定 600s 仅比重置链多 35s，未含打开预算）。
  test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
  // P2.6c1：只读五区钉 A 旧文档（P2.4 起 A 只读打开 + 只读横幅 + 无 scope
  // 页签），**不再**钉可写 B 种子（B 默认页签钉面见下一用例）。
  const aSeed = await resetE2eSeed(request, await getApiToken());
  await pinLightZh(page);
  await openLegacySeedEditor(page, aSeed);
  await waitEditorReady(page);
  // 权限门只读态如实钉（M5-T5 D-T5-1 在案，brief 纪律：写工具激活态截图
  // 以只读态为准）；canvas 区 mask（瓦片流送像素不可钉，见文件头注）
  await expect(page.getByTestId('part-studio-readonly-banner')).toBeVisible();
  await expect(page.getByTestId('part-studio-viewport').locator('canvas').first()).toBeVisible();
  // P2.6c2 F3：连接级只读位显式断言（不只靠横幅/快照像素）；树两段的异步
  // 读面（特征/零件）落定后再截图——零件段来自 getBodies/物理元素查询，慢栈
  // 下可能晚于 canvas，提前截图会把「暂无零件」钉进/钉出基线。
  const aInfo = await readOpenBriefcaseInfo(page);
  expect(aInfo.key, 'A 文档应打开 briefcase').toBeTruthy();
  expect(aInfo.isReadonly, 'A 文档连接必须以只读模式打开').toBe(true);
  await expect(page.getByTestId('part-studio-feature-count')).toHaveText('(0)', {
    timeout: 60_000,
  });
  await expect(
    page.getByTestId('part-studio-feature-list').getByText('暂无特征'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('part-studio-part-count')).toHaveText('(0)', {
    timeout: 60_000,
  });
  await expect(
    page.getByTestId('part-studio-part-list').getByText('暂无零件'),
  ).toBeVisible({ timeout: 60_000 });
  await settleFonts(page);
  await expect(page).toHaveScreenshot('editor-read-only-light.png', {
    // 编辑器可能叠加多个 canvas（主视口/选区/网格覆盖层）；全部 mask，视觉门只钉 UI 铬。
    mask: await page.getByTestId('part-studio-viewport').locator('canvas').all(),
    maskColor: 'rgb(255, 255, 255)',
  });
});

test('视觉钉版：编辑器五区 B 默认页签（亮色，画布 mask）', async ({ page, request }) => {
  // P2.6c1：第六张钉面——B 可评估编辑器默认态（解析器自动创建的 `Part Studio 1`
  // 页签 + 可写 ribbon）。B 种子每次重建（新 dbKey 规避陈旧写租约，P2.6a 纪律），
  // 保证页签名与空特征树不随执行顺序漂移。
  // P2.6c2 F4：预算 = 单种子重置最坏链 + 打开/截图余量（原 600s 仅比重置链多 35s）。
  test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
  const bSeed = await resetBModelSeed(request, await getApiToken());
  await pinLightZh(page);
  await openSeedImodelEditor(page, bSeed);
  await waitEditorReady(page);
  await expect(page.getByTestId('part-studio-readonly-banner')).toHaveCount(0);
  const tabStrip = page.getByTestId('part-studio-tab-strip');
  await expect(tabStrip.getByRole('tab')).toHaveCount(1);
  await expect(tabStrip.getByRole('tab').first()).toHaveText('Part Studio 1');
  await expect(tabStrip.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('part-studio-viewport').locator('canvas').first()).toBeVisible();
  // P2.6c2 F3：连接级可写位显式断言；零件段（getBodies 异步读面）落定后再截图
  // ——快照声明 `零件 (1) Body 1`，未等待时慢栈可能截到 `零件 (0) / 暂无零件`。
  const bInfo = await readOpenBriefcaseInfo(page);
  expect(bInfo.key, 'B 文档应打开 briefcase').toBeTruthy();
  expect(bInfo.isReadonly, 'B 文档连接应为可写').toBe(false);
  await expect(page.getByTestId('part-studio-feature-count')).toHaveText('(0)', {
    timeout: 60_000,
  });
  await expect(
    page.getByTestId('part-studio-feature-list').getByText('暂无特征'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('part-studio-part-count')).toHaveText('(1)', {
    timeout: 60_000,
  });
  await expect(
    page.getByTestId('part-studio-part-list').getByRole('button', { name: 'Body 1', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await settleFonts(page);
  await expect(page).toHaveScreenshot('editor-b-default-light.png', {
    mask: await page.getByTestId('part-studio-viewport').locator('canvas').all(),
    maskColor: 'rgb(255, 255, 255)',
  });
});

test('视觉钉版：设置页个人资料（亮色）', async ({ page }) => {
  await pinLightZh(page);
  await loginWithSession(page);
  await gotoRoute(page, '/settings', 'settings-route');
  await expect(page.getByTestId('settings-panel').getByRole('heading', { name: '个人资料' })).toBeVisible();
  await settleFonts(page);
  await expect(page).toHaveScreenshot('settings-profile-light.png');
});
