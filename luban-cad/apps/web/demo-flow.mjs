// 手动演示驱动：可见浏览器完整走一遍用户流程，逐步截图到 demo/manual/
// 用法：node demo-flow.mjs（需本地栈：MS :5401 + hub :5400 + 前端 :5300）
// 节奏旋钮（2026-10-11 晚，「给人看」优先）：
//   DEMO_SLOWMO — 每个 Playwright 动作的间隔 ms（默认 900，观看档；验证档可 300）
//   DEMO_DWELL  — 关键节拍驻留 ms（默认 2500：几何变化/徽标/对话框在屏幕上停住供人看清；
//                 改参幕的预览徽标在「应用」前驻留，建特征表单在「创建」前驻留）
//   例：快速验证跑 `DEMO_SLOWMO=300 DEMO_DWELL=0 node demo-flow.mjs`
//   DEMO_PACE  — 步骤间驻留 ms（默认 6000：对外展示档——每步开始前上一幕结果停驻供讲解；
//                 5-10 秒可调，`DEMO_PACE=8000 node demo-flow.mjs`；验证档 DEMO_PACE=0 关闭）
//   DEMO_KEEP=1 — 保留演示项目不做 API 清理（跑完自己从项目列表打开工作空间查看/继续编辑）
//
// 24 幕四阶段（2026-10-11 参数化能力增强版，当日晚重构链序）：
//   Phase A（幕 1-8）   登录 → 种子项目工具冒烟 → 新建项目/iModel → 编辑器就绪
//   Phase B（幕 9-14）  建链：拉伸底座 → 圆角选边创建 → [草图幕] → 布尔减圆孔 →
//                        布尔加圆柱凸台——四种特征类型全覆盖；圆孔/凸台=32 边形近似
//                       （轮廓契约是多边形点列，演示分辨率下与圆不可分辨，零后端改动）
//   Phase C（幕 15-21） 改参链（核心叙事「链上任意位置改参，最终结果都正确再生」）：
//                        倒序改参 凸台→孔径→孔深（贯通→盲孔）→圆角→底座，预览徽标
//                        「N 个特征受影响」按依赖闭包精确断言（1/2/2/3/4）→ 撤销/重做
//                       （OpLog 通道，读回存储参数硬断言）→ 抑制/恢复圆角
//   Phase D（幕 22-24）  reload 零操作显示（像素≥30000 + bbox z-span=5 冷重建确定性）→
//                        MS 健康审计（日志增量口径，commit 预算 22）→ 退出登录+清理
//
// 链序裁决（2026-10-11 晚，resolveEdgeRef 几何相关性实证）：圆角创建**前置**到孔/凸台之前
// ——选边在纯 sweep 体（底座单特征）上执行。实证：本日 resolveEdgeRef 在「底座+圆孔+凸台」
// 的布尔结果体上悬挂 4/4（跨两个 MS 进程；请求帧发出、应答永不至），同日下午纯底座体
// 绿 2/2（应答 <1s）。⑩ 从「随机竞态窗」升级为「布尔结果体强相关」——登记于 roadmap
// 2026-10-11 注记；后端修复后链序可还原（圆角回链尾，徽标计数随之 1/2/3/3/4）。
//
// 韧性基建（前序版本沉淀，全部保留）：登录重试 / 编辑器初始化卡滞 reload /
// WS 帧级配对仪器（resolveEdgeRef 请求-应答）/ toast MutationObserver 常驻捕获 /
// 拾取链猴补丁探针 / 实体投影尺寸守卫（<80px 拒绝盲点）/ ⑩ 悬挂快判（首击无应答
// 则后续拾取转短窗，降级轮省 ~4.5 分钟）。backlog ⑩ 随机形态命中时降级：跳过圆角
// 创建，Phase C 圆角相关幕（18 改半径/21 抑制）自适应跳过、底座徽标计数重算 4→3。
import { chromium } from '@playwright/test';
import { mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { openSync, readSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE = 'http://localhost:5300';
const API = 'http://localhost:5400';
const SHOT_DIR = 'demo/manual';
const MS_LOG = 'C:/Users/24389/AppData/Local/Temp/luban-cad-modeling-server.log';
// 健康审计 commit 预算（2026-10-11 晚实证校准）：计数含 **EvalCarrier scratch 载体库**的
// txn 提交（MS 侧 IpcWebSocket 广播对所有连接同发，载体通道名是裸 GUID）——每次 fillet
// 求值（含 previewOp 影子试算）= 1 次载体写 + 载体初建 2 次。全绿路径实测 28（op 本体 18
// + 载体 ~10），降级路径实测 14。预算 40：P0 风暴量级是每秒数十次，40 照样一击拦截。
const COMMIT_BUDGET = 40;
const ts = Date.now();
const DEMO_PROJECT = `演示项目-${ts}`;
const DEMO_IMODEL = `演示模型-${ts}`;
mkdirSync(SHOT_DIR, { recursive: true });
// 旧截图清场（编号方案随版本演进，防陈图混入本轮证据集）
for (const f of readdirSync(SHOT_DIR)) if (f.endsWith('.png')) unlinkSync(`${SHOT_DIR}/${f}`);
// 健康审计基线：只统计本次运行新增的日志切片（栈长跑时全量计数会被历史会话污染）
const msLogStart = statSync(MS_LOG, { throwIfNoEntry: false })?.size ?? 0;

const log = (msg) => console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`);
let shotCount = 0;
const shot = (page, name) =>
  page.screenshot({ path: `${SHOT_DIR}/${name}.png` })
    .then(() => {
      shotCount++;
      log(`📸 ${SHOT_DIR}/${name}.png`);
      // 观看驻留：每张截图即一个叙事节拍——画面停住供人看清（含对话框/徽标截图，
      // helper 里 dialogShot 拍完后驻留，观众能读完徽标再看到「应用」点击）。
      return page.waitForTimeout(DWELL);
    });

// ── 几何常量（建链形态）──────────────────────────────────────────────
// 底座：2×2 方 [0..2]²，高 2→（幕 10）3→（幕 19）4。
// 圆角：底座四角竖棱，r 0.2→（幕 18）0.35。
// 圆孔：32 边形，圆心 (0.55,0.55)（西南象限），r 0.25→（幕 16）0.4，深 10→（幕 17）1.5 盲孔。
// 凸台：32 边形，圆心 (1.45,1.45)（东北象限），r 0.45，高 4→（幕 15）5。
// 间隙核验：孔 r0.4 时占 [0.15..0.95]²，凸台占 [1.0..1.9]²——互不重叠、不碰外廓角棱
// （圆角引用在上游改形后自愈的安全前提）。
const ngon = (r, cx, cy, n = 32) =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return { x: +(cx + r * Math.cos(a)).toFixed(6), y: +(cy + r * Math.sin(a)).toFixed(6) };
  });
const HOLE = { c: { x: 0.55, y: 0.55 }, r0: 0.25, r1: 0.4, depthThrough: 10, depthBlind: 1.5 };
const BOSS = { c: { x: 1.45, y: 1.45 }, r: 0.45, h0: 4, h1: 5 };
const BASE_PROFILE = '[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]';

/** 截图有效渲染像素计数（渲染确实发生的像素级证据；file:// 独立页读取）。
 *  以四角背景色为基准，统计显著偏离背景的像素——不绑定具体主题材质色
 *  （2026-10-11 实证：暗色主题下实体渲白色+黑背景，旧「纯绿像素」契约失效）。 */
async function pixelRendered(browser, file) {
  const p2 = await browser.newPage();
  try {
    await p2.goto(pathToFileURL(`${process.cwd()}/${file}`).href);
    return await p2.evaluate(() => {
      const img = document.querySelector('img') ?? document.body;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const w = c.width, h = c.height;
      const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]
        .map(([x, y]) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; });
      const isBg = (i) => corners.some(([r, g, b]) =>
        Math.abs(d[i] - r) < 40 && Math.abs(d[i + 1] - g) < 40 && Math.abs(d[i + 2] - b) < 40);
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (!isBg(i)) n++;
      return n;
    });
  } catch {
    return 0;
  } finally {
    await p2.close();
  }
}

/** MS 日志增量切片读取（msLogStart 之后的字节） */
function readMsLogSlice() {
  try {
    const size = statSync(MS_LOG, { throwIfNoEntry: false })?.size ?? 0;
    if (size <= msLogStart) return '';
    const fd = openSync(MS_LOG, 'r');
    const buf = Buffer.alloc(size - msLogStart);
    try { readSync(fd, buf, 0, buf.length, msLogStart); } finally { closeSync(fd); }
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

// 节奏旋钮实现（见文件头注释）：SLOW_MO=动作间隔，DWELL=关键节拍驻留，PACE=步骤间展示驻留
const SLOW_MO = Number(process.env.DEMO_SLOWMO ?? 900);
const DWELL = Number(process.env.DEMO_DWELL ?? 2500);
const PACE = Number(process.env.DEMO_PACE ?? 6000);
const browser = await chromium.launch({ headless: false, slowMo: SLOW_MO });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
/** 步骤间展示驻留：每步开始前停 PACE ms——上一幕完成状态（含截图）停驻供对外讲解（DEMO_PACE=0 关闭） */
const pace = () => (PACE > 0 ? page.waitForTimeout(PACE) : Promise.resolve());
let projectId = '';
/** 圆角是否成功入树（⑩ 降级时 false——Phase C 圆角相关幕据此自适应跳过/重算） */
let hasFillet = false;

// WS 帧级捕获（页面创建即挂，覆盖后续所有 WS）：resolveEdgeRef/子实体 RPC 的发出-应答
// 配对（悬挂=只有 > 没有 <）。payload 非 string 帧（二进制）不计——RPC 走 JSON 文本帧。
const wsFrames = [];
page.on('websocket', (ws) => {
  ws.on('framesent', (f) => {
    const s = typeof f.payload === 'string' ? f.payload : '';
    if (s) wsFrames.push([Date.now(), `> ${s.slice(0, 800)}`]);
  });
  ws.on('framereceived', (f) => {
    const s = typeof f.payload === 'string' ? f.payload : '';
    if (s) wsFrames.push([Date.now(), `< ${s.slice(0, 800)}`]);
  });
});

const getActiveTool = () => page.evaluate(() =>
  window.IModelApp?.toolAdmin?.activeTool?.toolId ?? null);

/** 等编辑器就绪（状态栏出现）；卡在「初始化编辑器」30s 则 reload 重试（WS 握手偶发挂起） */
async function waitEditorReady(timeout = 180000) {
  const deadline = Date.now() + timeout;
  let last = Date.now();
  while (Date.now() < deadline) {
    if (await page.locator('.statusbar').isVisible().catch(() => false)) return;
    if (Date.now() - last > 30000) {
      if (await page.getByText('初始化编辑器').isVisible().catch(() => false)) {
        log('⚠️ 编辑器初始化卡滞，刷新页面重试');
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      }
      last = Date.now();
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('编辑器就绪超时');
}

// ── Phase B/C 共享助手 ──────────────────────────────────────────────

/** 树行定位（按类型标签；locator 是活的，树刷新后自动重解析） */
const featureRow = (label) => page.locator('.feature-tree-panel .feature-row', { hasText: label }).first();

/** 零失败行断言（求值失败级联的 UI 证据面——status≠0 的行带 .feature-row--failed） */
async function assertNoFailedRows(label) {
  const n = await page.locator('.feature-tree-panel .feature-row--failed').count();
  if (n > 0) throw new Error(`${label}：存在 ${n} 个求值失败特征行（级联失守）`);
}

/** 「适应」重取景 + 等一帧（改动 bbox 的幕截图前调用，防顶面出画） */
async function refit() {
  await page.locator('.toolbar-primary').getByRole('button', { name: '适应' }).first().click();
  await page.waitForTimeout(1800);
}

/** 参数表单特征创建（extrude/booleanAdd/booleanSubtract 同构）：新建对话框 → 选类型 →
 *  填字段 →（dialogShot 截图）→ 创建 → 等 toast+对话框关闭 → 树行落账 → 零失败行断言。
 *  fillet 不走这里（有选边）。 */
async function createParamFeature({ type, fill, label, dialogShot }) {
  await page.locator('.feature-tree-panel').getByRole('button', { name: '新建特征' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor({ state: 'visible' });
  await dlg.locator('select').selectOption(type);
  await page.waitForTimeout(400); // 表单按类型重渲染
  await fill(dlg);
  if (dialogShot) await shot(page, dialogShot); // 对话框开着时拍（表单证据）
  await dlg.getByRole('button', { name: '创建', exact: true }).click();
  // .first()：相邻幕间隔可短于 toast ~5s 寿命，上幕残留 toast 会造成 strict-mode 双命中
  await page.getByText('特征已创建').first().waitFor({ state: 'visible', timeout: 60000 });
  await dlg.waitFor({ state: 'hidden', timeout: 60000 });
  const row = featureRow(label);
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await assertNoFailedRows(`创建 ${label}`);
  return row;
}

/** 改参幕统一形态（Phase C 核心）：开编辑对话框 → 填草稿 → 等预览徽标 →
 *  断言「N 个特征受影响」（依赖闭包大小的 UI 可见证据）→（dialogShot 截图）→ 应用 →
 *  等 toast → 零失败行。badgeCount=null 跳过计数断言。 */
async function editFeatureAndAssert({ rowLabel, edit, badgeCount, label, dialogShot }) {
  const row = featureRow(rowLabel);
  await row.hover();
  await row.getByRole('button', { name: '编辑特征' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor({ state: 'visible' });
  await edit(dlg);
  const badge = dlg.locator('.preview-badge');
  // debounce 400ms + previewOp 影子求值（下游含 fillet 时是真实 blend，秒级）——长窗兜底
  await badge.waitFor({ state: 'visible', timeout: 45000 });
  const txt = (await badge.textContent())?.replace(/\s+/g, ' ');
  log(`   ${label} 预览徽标：${txt}`);
  if (txt?.includes('试算失败')) throw new Error(`${label}：影子试算失败——${txt}`);
  if (badgeCount !== null && !txt?.includes(`（${badgeCount} 个特征受影响）`))
    throw new Error(`${label}：预览受影响特征数不符（预期 ${badgeCount}，实为 ${txt}）`);
  if (dialogShot) await shot(page, dialogShot); // 徽标可见时拍（闭包计数证据）
  await dlg.getByRole('button', { name: '应用' }).click();
  // .first()：相邻改参幕间隔可短于 toast ~5s 寿命（22:49:55 vs 22:49:58 实测双命中）
  await page.getByText('特征参数已更新').first().waitFor({ state: 'visible', timeout: 60000 });
  await dlg.waitFor({ state: 'hidden', timeout: 60000 });
  await assertNoFailedRows(label);
}

/** 体包围盒读数（queryModelRanges 是 DB 级查询——placement bbox 由 native 随几何
 *  重算，不依赖 tile 加载时序；内容感知初始取景同款通道） */
async function bodyBBox(page) {
  return page.evaluate(async () => {
    const vp = window.IModelApp?.viewManager?.selectedView;
    if (!vp) return null;
    const iModel = vp.iModel;
    const ids = [];
    for await (const row of iModel.createQueryReader('SELECT ECInstanceId FROM BisCore.PhysicalModel')) ids.push(row[0]);
    if (!ids.length) return null;
    const ranges = await iModel.models.queryModelRanges(ids);
    let xLo = Infinity, yLo = Infinity, zLo = Infinity, xHi = -Infinity, yHi = -Infinity, zHi = -Infinity;
    for (const r of ranges) {
      xLo = Math.min(xLo, r.low.x); xHi = Math.max(xHi, r.high.x);
      yLo = Math.min(yLo, r.low.y); yHi = Math.max(yHi, r.high.y);
      zLo = Math.min(zLo, r.low.z); zHi = Math.max(zHi, r.high.z);
    }
    return { x: xHi - xLo, y: yHi - yLo, z: zHi - zLo };
  });
}

/** bbox z-span 收敛断言（轮询至 |实测-预期|<0.01；超时红——改参几何再生的 DB 级硬证据） */
async function expectZSpan(expected, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await bodyBBox(page).catch(() => null);
    if (last && Math.abs(last.z - expected) < 0.01) {
      log(`   ${label}：bbox z-span=${last.z.toFixed(3)} ✅（x=${last.x.toFixed(2)} y=${last.y.toFixed(2)}）`);
      return;
    }
    await page.waitForTimeout(800);
  }
  throw new Error(`${label}：bbox z-span 未收敛到 ${expected}（最后读数 ${JSON.stringify(last)}）`);
}

try {
  // ══ Phase A：启动（幕 1-8）════════════════════════════════════════
  // ── 1. 登录页 ─────────────────────────────────────────
  await pace();
  log('步骤 1/24：打开登录页');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[type="email"]', { state: 'visible' });
  await shot(page, '01-登录页');

  // ── 2. 登录 ───────────────────────────────────────────
  await pace();
  log('步骤 2/24：登录 test@example.com');
  // 登录重试（≤3）：本地栈偶发登录不跳转（HUB/代理抖动,2026-10-11 实测背靠背轮次复发）
  let loggedIn = false;
  for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.getByRole('button', { name: /^登录$/ }).click();
    try {
      await page.waitForURL('**/documents', { timeout: 15000 });
      loggedIn = true;
    } catch {
      log(`   登录未跳转（第 ${attempt} 次）——重载重试`);
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // 慢成功陷阱（2026-10-11 晚两次实测）：登录其实已成功但跳转超 15s——重进 /login
      // 会因已认证被重定向去 /documents，email 输入框永不渲染，waitForSelector 烧满误杀。
      // 轮询双信号：见到 /documents = 直接视为登录成功；见到表单 = 正常重试。
      let landed = null;
      for (let i = 0; i < 30 && !landed; i++) {
        if (page.url().includes('/documents')) landed = 'documents';
        else if (await page.locator('input[type="email"]').isVisible().catch(() => false)) landed = 'form';
        else await page.waitForTimeout(1000);
      }
      if (landed === 'documents') { log('   （慢成功）已在项目列表——视为登录成功'); loggedIn = true; }
      else if (!landed) throw new Error('登录页未就绪（email 输入框未渲染且未跳转项目列表）');
    }
  }
  if (!loggedIn) throw new Error('登录 3 次未成功');
  await page.locator('.section-title').waitFor({ state: 'visible' });
  log(`✅ 登录成功，进入「${await page.locator('.section-title').textContent()}」`);
  await shot(page, '02-项目列表-我的项目');

  // ── 3. 打开种子项目 ──────────────────────────────────
  await pace();
  log('步骤 3/24：点击「测试项目」卡片进入详情');
  await page.locator('main').getByRole('button', { name: '测试项目' }).first().click();
  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 15000 });
  await page.getByRole('button', { name: '打开工作空间' }).first().waitFor({ state: 'visible', timeout: 15000 });
  await shot(page, '03-项目详情-iModel卡片');

  // ── 4. 进入编辑器 ────────────────────────────────────
  await pace();
  log('步骤 4/24：点击「打开工作空间」进入编辑器');
  await page.getByRole('button', { name: '打开工作空间' }).first().click();
  await page.waitForURL(/\/documents\/[^/]+\/[^/]+/, { timeout: 60000 });
  await waitEditorReady();
  await page.locator('.cad-toolbar-horizontal').waitFor({ state: 'visible', timeout: 60000 });
  const status1 = await page.locator('.statusbar').textContent();
  log(`✅ 编辑器就绪，状态栏：${status1?.replace(/\s+/g, ' ')}`);
  await page.waitForTimeout(2500); // 等视图渲染一帧
  await shot(page, '04-编辑器-工具条与状态栏');

  // ── 5. 激活布尔工具（直接建模轨道冒烟）────────────────
  await pace();
  log('步骤 5/24：点击「并集 (Unite)」激活布尔工具');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '并集 (Unite)' }).click();
  for (let i = 0; i < 10; i++) {
    if ((await getActiveTool()) === 'UniteSolids') break;
    await page.waitForTimeout(500);
  }
  log(`✅ activeTool = ${await getActiveTool()}`);
  await shot(page, '05-并集工具已激活');

  // ── 6. 激活圆角工具 ──────────────────────────────────
  await page.keyboard.press('Escape');
  await pace();
  log('步骤 6/24：Esc 退出后点击「圆角 (Fillet)」');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '圆角 (Fillet)' }).click();
  for (let i = 0; i < 10; i++) {
    if ((await getActiveTool()) === 'RoundEdges') break;
    await page.waitForTimeout(500);
  }
  log(`✅ activeTool = ${await getActiveTool()}`);
  await shot(page, '06-圆角工具已激活');
  await page.keyboard.press('Escape');

  // ── 7. 返回并新建项目 ────────────────────────────────
  await pace();
  log(`步骤 7/24：面包屑返回，新建项目「${DEMO_PROJECT}」`);
  await page.getByRole('button', { name: '项目列表' }).first().click();
  await page.waitForURL('**/documents', { timeout: 30000 });
  await page.getByRole('button', { name: '新建项目' }).click();
  const dlg = page.getByRole('dialog', { name: '创建 iTwin 项目' });
  await dlg.waitFor({ state: 'visible' });
  await shot(page, '07-新建项目对话框');
  await page.locator('input[placeholder="输入项目名称"]').fill(DEMO_PROJECT);
  await dlg.getByRole('button', { name: '创建', exact: true }).click();
  await dlg.waitFor({ state: 'hidden', timeout: 30000 });
  await page.locator('main').getByRole('button', { name: DEMO_PROJECT }).first().waitFor({ state: 'visible', timeout: 30000 });
  log('✅ 项目已创建');
  await shot(page, '08-新项目卡片出现');

  // ── 8. 新建 iModel 并进编辑器 ────────────────────────
  await pace();
  log(`步骤 8/24：进入新项目，新建 iModel「${DEMO_IMODEL}」`);
  await page.locator('main').getByRole('button', { name: DEMO_PROJECT }).first().click();
  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 30000 });
  projectId = page.url().split('/')[4];
  await page.getByRole('button', { name: '新建 iModel' }).first().click();
  const iDlg = page.locator('.dialog-container').filter({ hasText: '创建 iModel' });
  await iDlg.waitFor({ state: 'visible' });
  await shot(page, '09-新建iModel对话框');
  await page.locator('input[placeholder="输入模型名称"]').fill(DEMO_IMODEL);
  await iDlg.getByRole('button', { name: '创建', exact: true }).click();
  await iDlg.waitFor({ state: 'hidden', timeout: 120000 }); // onCreated 即关闭
  const openBtn = page.getByRole('button', { name: '打开工作空间' }).first();
  await openBtn.waitFor({ state: 'visible', timeout: 60000 });
  for (let i = 0; i < 120; i++) {
    if (await openBtn.isEnabled()) break;
    await page.waitForTimeout(1000);
  }
  log('✅ iModel 已创建并初始化');
  await shot(page, '10-新iModel卡片-打开工作空间已解锁');
  await openBtn.click();
  await page.waitForURL(/\/documents\/[^/]+\/[^/]+/, { timeout: 60000 });
  await waitEditorReady();
  await page.locator('.cad-toolbar-horizontal').waitFor({ state: 'visible', timeout: 60000 });
  const status2 = await page.locator('.statusbar').textContent();
  log(`✅ 新模型编辑器就绪，状态栏：${status2?.replace(/\s+/g, ' ')}`);
  await page.waitForTimeout(2500);
  await shot(page, '11-新模型编辑器');

  // ══ Phase B：建链（幕 9-14）═══════════════════════════════════════
  // ── 9. 特征树：新建 extrude 底座 ─────────────────────
  await pace();
  log('步骤 9/24：特征树面板——新建特征（拉伸底座 2×2×2）');
  const treePanel = page.locator('.feature-tree-panel');
  await treePanel.waitFor({ state: 'visible', timeout: 60000 });
  await treePanel.getByText('加载中...').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await treePanel.getByRole('button', { name: '新建特征' }).click();
  const fDlg = page.getByRole('dialog');
  await fDlg.waitFor({ state: 'visible' });
  await fDlg.locator('select').selectOption('extrude');
  await fDlg.getByLabel('距离').fill('2');
  await fDlg.getByLabel('轮廓').fill(BASE_PROFILE);
  await fDlg.getByLabel('轮廓').blur();
  await shot(page, '12-新建特征对话框-extrude');
  await fDlg.getByRole('button', { name: '创建' }).click();
  await page.getByText('特征已创建').first().waitFor({ state: 'visible', timeout: 30000 });
  await fDlg.waitFor({ state: 'hidden', timeout: 30000 });
  await featureRow('拉伸 (extrude)').waitFor({ state: 'visible' });
  await assertNoFailedRows('创建底座');
  log(`✅ 底座已建：${(await featureRow('拉伸 (extrude)').textContent())?.replace(/\s+/g, ' ')}`);
  await shot(page, '13-特征树-extrude底座已建');

  // ── 10. 改底座高 2→3（试算预览徽标首演：此时全链仅 1 特征）──
  await pace();
  log('步骤 10/24：编辑底座——距离 2→3，试算预览徽标（闭包=1）');
  await editFeatureAndAssert({
    rowLabel: '拉伸 (extrude)',
    edit: async (d) => await d.getByLabel('距离').fill('3'),
    badgeCount: 1,
    label: '底座 2→3',
    dialogShot: '14-改底座高-预览徽标N1',
  });
  log('✅ 底座高度 2→3 已应用（previewOp 影子试算 → applyOp 真提交）');

  // ── 11. 圆角选边 + 创建（链序裁决：前置到孔/凸台之前，纯 sweep 体上选边）──
  await pace();
  log('步骤 11/24：新建特征（圆角 r=0.2）——从视图选边（底座四角竖棱）');

  // 取景守卫（B4 根因修复，2026-10-11 实证）：编辑器打开时模型为空——内容感知初始取景
  // 框住的是空模型的大 extents，建特征后相机从未重取景，实体只占视口数像素，一切点击
  // 落在小点之外。先「适应」重建取景，并加形体投影尺寸守卫（<80px 即取景失败，拒绝盲点）。
  await page.locator('.toolbar-primary').getByRole('button', { name: '适应' }).first().click();
  await page.waitForTimeout(2000);

  // 实体投影包围盒守卫 + 普通选择探针（可命中性验明）
  {
    const cboxP = await page.locator('canvas').first().boundingBox();
    const proj = await page.evaluate(() => {
      const vp = window.IModelApp.viewManager.selectedView;
      for (const entry of vp.iModel.tiles) {
        const cr = entry.owner?.tileTree?.rootTile?.contentRange;
        if (cr && !cr.isNull && cr.low.x < 1e6 && cr.high.x - cr.low.x < 100) {
          const c = [(cr.low.x + cr.high.x) / 2, (cr.low.y + cr.high.y) / 2, (cr.low.z + cr.high.z) / 2];
          const p = vp.worldToView({ x: c[0], y: c[1], z: c[2] });
          let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
          for (const [x, y, z] of [
            [cr.low.x, cr.low.y, cr.low.z], [cr.high.x, cr.low.y, cr.low.z],
            [cr.low.x, cr.high.y, cr.low.z], [cr.high.x, cr.high.y, cr.low.z],
            [cr.low.x, cr.low.y, cr.high.z], [cr.high.x, cr.low.y, cr.high.z],
            [cr.low.x, cr.high.y, cr.high.z], [cr.high.x, cr.high.y, cr.high.z],
          ]) {
            const q = vp.worldToView({ x, y, z });
            minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
            minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
          }
          return { center: [Math.round(p.x), Math.round(p.y)], rect: [Math.round(minX), Math.round(minY), Math.round(maxX), Math.round(maxY)], viewW: vp.viewRect.width, viewH: vp.viewRect.height };
        }
      }
      return null;
    });
    log(`   实体投影中心=${JSON.stringify(proj?.center)} 包围盒=${JSON.stringify(proj?.rect)} 视口=${proj?.viewW}x${proj?.viewH}`);
    if (proj && (proj.rect[2] - proj.rect[0]) < 80)
      throw new Error(`取景后实体投影仍过小（${proj.rect.join(',')}）——「适应」未生效，拒绝盲点`);
    if (proj) {
      await page.locator('.toolbar-primary').getByRole('button', { name: /^选择/ }).first().click();
      await page.waitForTimeout(800);
      await page.mouse.click(cboxP.x + proj.center[0], cboxP.y + proj.center[1]);
      await page.waitForTimeout(1500);
      const sel = await page.evaluate(() => window.IModelApp.viewManager.selectedView.iModel.selectionSet.size);
      log(`   普通选择点实体中心 → selectionSet.size=${sel}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }
  await treePanel.getByRole('button', { name: '新建特征' }).click();
  const filletDlg = page.getByRole('dialog');
  await filletDlg.waitFor({ state: 'visible' });
  await filletDlg.locator('select').selectOption('fillet');
  await page.waitForTimeout(900);
  await filletDlg.getByLabel('圆角半径').fill('0.2');
  await shot(page, '15-圆角表单');

  // 从当前体 contentRange 取四条竖棱中点的屏幕投影（真实棱线上的点，非硬编码坐标），
  // 并向投影形体中心方向内收 6px——恰在轮廓线上的点对要素定位是边界态（人手点击
  // 天然落在棱内侧几像素处；要素命中要求点落在投影实体内，棱又在拾取孔径内）。
  const pickTargets = await page.evaluate(() => {
    const vp = window.IModelApp.viewManager.selectedView;
    for (const entry of vp.iModel.tiles) {
      const cr = entry.owner?.tileTree?.rootTile?.contentRange;
      if (cr && !cr.isNull && cr.low.x < 1e6 && cr.high.x - cr.low.x < 100) {
        const zMid = (cr.low.z + cr.high.z) / 2;
        const center = vp.worldToView({ x: (cr.low.x + cr.high.x) / 2, y: (cr.low.y + cr.high.y) / 2, z: zMid });
        return [[cr.low.x, cr.low.y], [cr.high.x, cr.low.y], [cr.high.x, cr.high.y], [cr.low.x, cr.high.y]]
          .map(([x, y]) => vp.worldToView({ x, y, z: zMid }))
          .map((p) => {
            const dx = center.x - p.x, dy = center.y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            return { x: p.x + (dx / len) * 6, y: p.y + (dy / len) * 6 };
          });
      }
    }
    return null;
  });
  if (!pickTargets) throw new Error('未取到体 contentRange——圆角选边前置失败');
  const cbox = await page.locator('canvas').first().boundingBox();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text().slice(0, 160)}`));
  // toast 常驻捕获（MutationObserver，大小写不敏感）——错误 toast ~5s 自灭，轮询间隙可能错过
  await page.evaluate(() => {
    window.__toastLog = [];
    const isToast = (n) => {
      const cls = n.className?.toString().toLowerCase() ?? '';
      return n.nodeType === 1 &&
        (cls.includes('toast') || cls.includes('notification') || cls.includes('message') ||
          n.getAttribute?.('role') === 'alert' || n.getAttribute?.('role') === 'status');
    };
    const record = (n) => {
      if (isToast(n)) window.__toastLog.push(`${Date.now() % 100000}:${n.textContent?.slice(0, 140)}`);
    };
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(record);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
  let picked = 0;
  /** ⑩ 悬挂快判：一旦某次拾取的 resolveEdgeRef 请求在窗口内无应答（会话毒化形态），
   *  后续拾取不再给 90s 长窗（降级轮省时 ~4.5 分钟；应答流畅的正常轮不受影响）。 */
  let resolveHangSuspected = false;
  for (const pt of pickTargets) {
    if (picked >= 2) break;
    if ((await page.getByRole('dialog').count()) > 0) {
      await page.getByRole('button', { name: '从视图选边' }).click();
      await page.waitForTimeout(1300);
    }
    const state = await page.evaluate(() => ({
      tool: window.IModelApp?.toolAdmin?.activeTool?.toolId ?? null,
      dialogOpen: document.querySelector('[role="dialog"]') !== null,
      picking: [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('停止选边')),
    }));
    // 终局判别：全链路猴补丁——拒绝点自曝（仅首轮打补丁，幂等）
    await page.evaluate(() => {
      const t = window.IModelApp?.toolAdmin?.activeTool;
      const lm = window.IModelApp?.locateManager;
      if (!t || !lm || t.__probePatched) return 'skip';
      t.__probePatched = true;
      for (const name of ['buildLocateAgenda', 'getLocateCandidates', 'acceptElementForOperation', 'doLocateSubEntity', 'doPickSubEntities']) {
        const orig = t[name].bind(t);
        t[name] = async (...args) => {
          const r = await orig(...args);
          console.log(`[probe] ${name} -> ${JSON.stringify(r)?.slice(0, 140)}`);
          return r;
        };
      }
      const ag = t.agenda;
      const origAdd = ag.add.bind(ag);
      ag.add = (...args) => {
        const r = origAdd(...args);
        console.log(`[probe] agenda.add(${JSON.stringify(args[0])?.slice(0, 60)}) -> ${JSON.stringify(r)}`);
        return r;
      };
      const orig = t.onDataButtonDown.bind(t);
      t.onDataButtonDown = async (...args) => {
        const r = await orig(...args);
        console.log(`[probe] onDataButtonDown -> ${String(r)} agenda=${t.agenda?.length ?? '?'}`);
        return r;
      };
      const origLocate = lm.doLocate.bind(lm);
      lm.doLocate = async (...args) => {
        const r = await origLocate(...args);
        console.log(`[probe] locateManager.doLocate -> ${r ? `hit srcId=${r.sourceId}` : 'null'}`);
        return r;
      };
      return 'patched';
    });
    const clickAt = Date.now();
    await page.mouse.click(cbox.x + pt.x, cbox.y + pt.y);
    // chips 轮询：首击 ≤90s、后续 ≤8s；若此前已侦到 resolveEdgeRef 悬挂（请求>应答），
    // 本轮直接按 8s 短窗（⑩ 毒化形态下长窗必烧满）。已知产品债（2026-10-11 登记）：
    // 单选会话结束 onCleanup 清几何缓存与 resolveEdgeRef 查询竞态 → MS 侧防御性重建走
    // 慢路径，回包 ok:true 迟到 30-65s 实测（WS 帧序实证；期间心跳应答流畅=通道健康）。
    const budget = picked === 0 ? (resolveHangSuspected ? 8000 : 90000) : 8000;
    let pickedNow = 0;
    for (let w = 0; w < budget / 400; w++) {
      await page.waitForTimeout(400);
      pickedNow = await page.evaluate(() => document.querySelectorAll('.feature-edge-chip').length).catch(() => 0);
      if (pickedNow > picked) break;
    }
    const grew = pickedNow > picked;
    if (grew) picked = pickedNow;
    const took = Date.now() - clickAt;
    const toastLog = await page.evaluate(() => window.__toastLog ?? []).catch(() => []);
    // 全量 resolveEdgeRef 帧配对：请求帧含 operation 名,应答帧按 request id 反查
    const edgeReqFrames = wsFrames.filter(([, s]) => /resolveEdgeRef/.test(s));
    const edgeIds = edgeReqFrames.map(([, s]) => {
      const m = s.match(/"request":(\d+)/); return m ? Number(m[1]) : -1;
    });
    const edgeRespFrames = wsFrames.filter(([, s]) =>
      s.startsWith('< ') && edgeIds.some((id) => s.includes(`"response":${id},`)));
    if (edgeReqFrames.length > edgeRespFrames.length) resolveHangSuspected = true;
    log(`   点棱(${Math.round(pt.x)},${Math.round(pt.y)}) 前态=${JSON.stringify(state)} → chips ${pickedNow}${grew ? ` ✅落账(${took}ms)` : ` 未落(${took}ms)`} toasts=${JSON.stringify(toastLog.slice(-4))} resolveReq=${edgeReqFrames.length} resolveResp=${edgeRespFrames.length}`);
    if (!grew) {
      if (edgeReqFrames.length) log(`   [resolveEdgeRef 请求]\n     ${edgeReqFrames.map(([, s]) => s).join('\n     ')}`);
      if (edgeRespFrames.length) log(`   [resolveEdgeRef 应答]\n     ${edgeRespFrames.map(([, s]) => s.slice(0, 300)).join('\n     ')}`);
      if (!edgeReqFrames.length) log('   [零请求] 前端未发出 resolveEdgeRef（拾取回调未触发或 RPC 客户端未 dispatch）');
    }
  }
  log(`   [console 全量]\n${consoleLines.join('\n   ')}`);
  if (picked < 1) {
    // 已知产品债（backlog ⑩，2026-10-11 登记并升级几何相关性注记）：resolveEdgeRef
    // 悬挂——请求已发、应答永不至（期间心跳/租约应答全程流畅=通道健康）。演示降级：
    // 跳过圆角创建，Phase C 圆角相关幕（18 改半径/21 抑制）随之跳过、底座徽标计数
    // 重算 4→3；链路本身可全绿（同日 22:28 纯底座体实证：chips 919ms 落账→入树）。
    log('❌ 圆角选边未落账（chips=0）——命中已知 MS 悬挂（backlog ⑩），本轮降级跳过圆角创建');
    await shot(page, '16-圆角选边未落账-诊断');
    await filletDlg.getByRole('button', { name: '取消' }).click().catch(() => {});
    await page.waitForTimeout(1000);
  } else {
    await shot(page, '16-选边chips落账');
    await filletDlg.getByRole('button', { name: '创建', exact: true }).click();
    for (let i = 0; i < 60; i++) {
      if ((await page.getByRole('dialog').count()) === 0) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(6000); // 内核 blend 求值 + 树刷新
    hasFillet = await treePanel.getByText('圆角').first().isVisible().catch(() => false);
    await assertNoFailedRows('圆角创建');
    await shot(page, '17-圆角已建');
    log(`✅ 圆角入树=${hasFillet}（内核 blend，四角棱各一条引用）`);
    if (!hasFillet) throw new Error('圆角创建未落树');
  }

  // ── 12. 草图模式（M3-b：SketchPanel+状态栏提示）────────
  await pace();
  log('步骤 12/24：进入草图模式——SketchPanel 与状态栏提示');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '编辑草图' }).click();
  const sketchPanel = page.locator('.sketch-panel');
  await sketchPanel.waitFor({ state: 'visible', timeout: 15000 });
  const sketchStatus = await page.locator('.statusbar').textContent();
  log(`✅ 草图模式就绪，状态栏：${sketchStatus?.replace(/\s+/g, ' ')}`);
  await shot(page, '18-草图模式-SketchPanel');
  await sketchPanel.getByRole('button', { name: '退出草图' }).click();
  await sketchPanel.waitFor({ state: 'hidden', timeout: 15000 });
  log('✅ 已退出草图模式');

  // ── 13. 新建 booleanSubtract 圆孔（32 边形近似）────────────────
  await pace();
  log('步骤 13/24：新建特征（布尔减圆孔——32 边形 r=0.25 居中偏西南，贯通）');
  await createParamFeature({
    type: 'booleanSubtract',
    fill: async (d) => {
      await d.getByLabel('距离').fill(String(HOLE.depthThrough));
      await d.getByLabel('轮廓').fill(JSON.stringify(ngon(HOLE.r0, HOLE.c.x, HOLE.c.y)));
      await d.getByLabel('轮廓').blur();
    },
    label: '布尔减 (booleanSubtract)',
    dialogShot: '19-新建圆孔对话框-subtract',
  });
  log('✅ 圆孔已建（两步制建链：角点锚定引导 → retool 目标参数）');
  await page.waitForTimeout(3000); // 等 tile 刷新出孔
  await shot(page, '20-圆孔已建-贯通孔可见');

  // ── 14. 新建 booleanAdd 圆柱凸台（32 边形近似）────────────────
  await pace();
  log('步骤 14/24：新建特征（布尔加圆柱凸台——32 边形 r=0.45 居中偏东北，高 4）');
  await createParamFeature({
    type: 'booleanAdd',
    fill: async (d) => {
      await d.getByLabel('距离').fill(String(BOSS.h0));
      await d.getByLabel('轮廓').fill(JSON.stringify(ngon(BOSS.r, BOSS.c.x, BOSS.c.y)));
      await d.getByLabel('轮廓').blur();
    },
    label: '布尔加 (booleanAdd)',
    dialogShot: '21-新建凸台对话框-add',
  });
  await page.waitForTimeout(3000);
  await refit();
  await shot(page, '22-凸台已建-圆柱露头');
  log('✅ 圆柱凸台已建（链=底座→圆角→孔→凸台，四类型全覆盖达成）');

  // ══ Phase C：改参链（幕 15-21）——倒序改参，每步断言下游全量正确再生 ══
  // 链序=底座→圆角→孔→凸台，徽标计数（依赖闭包大小）：改凸台闭包 1、孔 2、圆角 3、底座 4；
  // ⑩ 降级（无圆角）时链=底座→孔→凸台：凸台 1、孔 2、底座 3。
  const badgeFor = { boss: 1, hole: 2, fillet: 3, base: hasFillet ? 4 : 3 };

  // ── 15. 改凸台高度（链尾编辑 + bbox 硬断言）────────────
  await pace();
  log('步骤 15/24：编辑圆柱凸台——高度 4→5（链尾编辑，闭包=1，bbox z-span 4→5）');
  await editFeatureAndAssert({
    rowLabel: '布尔加 (booleanAdd)',
    edit: async (d) => await d.getByLabel('距离').fill(String(BOSS.h1)),
    badgeCount: badgeFor.boss,
    label: '凸台高度 4→5',
    dialogShot: '23-改凸台高度-徽标N1',
  });
  await expectZSpan(BOSS.h1, '凸台高度编辑再生');
  await refit();
  await shot(page, '23b-凸台抬高-bbox5');
  log('✅ 凸台高度 4→5 已应用——bbox z-span=5 硬断言通过（几何真再生）');

  // ── 16. 改孔半径（中链编辑：32 边形轮廓整体改写）────────
  await pace();
  log(`步骤 16/24：编辑圆孔——半径 ${HOLE.r0}→${HOLE.r1}（闭包=孔+凸台）`);
  await editFeatureAndAssert({
    rowLabel: '布尔减 (booleanSubtract)',
    edit: async (d) => {
      await d.getByLabel('轮廓').fill(JSON.stringify(ngon(HOLE.r1, HOLE.c.x, HOLE.c.y)));
      await d.getByLabel('轮廓').blur(); // json 字段失焦 parse 才入草稿（外发恒为合法 JSON）
    },
    badgeCount: badgeFor.hole,
    label: `孔半径 ${HOLE.r0}→${HOLE.r1}`,
    dialogShot: '24-改孔半径-徽标N2',
  });
  await page.waitForTimeout(3000); // 等 tile 刷新出大孔
  await shot(page, '24b-孔加大');
  log('✅ 孔半径已改（下游凸台随链重算）');

  // ── 17. 孔深改到不贯通（贯通→盲孔，拓扑真变）───────────
  await pace();
  log(`步骤 17/24：编辑圆孔——深度 ${HOLE.depthThrough}→${HOLE.depthBlind}（贯通→盲孔：顶面孔口消失）`);
  await editFeatureAndAssert({
    rowLabel: '布尔减 (booleanSubtract)',
    edit: async (d) => await d.getByLabel('距离').fill(String(HOLE.depthBlind)),
    badgeCount: badgeFor.hole,
    label: '孔深贯通→盲孔',
    dialogShot: '25-孔改盲孔-徽标N2',
  });
  await page.waitForTimeout(3000);
  await shot(page, '25b-盲孔-顶面孔口消失');
  log('✅ 孔深已改（盲孔从底面开——顶视孔口消失即拓扑真变的可见证据）');

  // ── 18. 改圆角半径（中链编辑：下游孔/凸台随圆角重算）─────
  if (hasFillet) {
    await pace();
  log('步骤 18/24：编辑圆角——半径 0.2→0.35（中链编辑，闭包=圆角+孔+凸台）');
    await editFeatureAndAssert({
      rowLabel: '圆角 (fillet)',
      edit: async (d) => await d.getByLabel('圆角半径').fill('0.35'),
      badgeCount: badgeFor.fillet,
      label: '圆角半径 0.2→0.35',
      dialogShot: '26-改圆角半径-徽标N3',
    });
    await shot(page, '26b-圆角加大');
    log('✅ 圆角半径已改（中链编辑——下游孔/凸台在新几何上随链重算）');
  } else {
    await pace();
  log('步骤 18/24：⚠️ 无圆角（⑩ 降级）——跳过改圆角幕');
  }

  // ── 19. 改底座高度（链头编辑：全链重算，圆角引用自愈合链）──
  await pace();
  log('步骤 19/24：编辑底座——高度 3→4（链头编辑，闭包=全链 4 特征）');
  await editFeatureAndAssert({
    rowLabel: '拉伸 (extrude)',
    edit: async (d) => await d.getByLabel('距离').fill('4'),
    badgeCount: badgeFor.base,
    label: '底座高度 3→4',
    dialogShot: '27-改底座高度-徽标N4',
  });
  await refit();
  await shot(page, '27b-底座长高');
  log('✅ 底座高度 3→4 已应用——链头编辑全链再生（圆角引用在新几何上重解析）');

  // ── 20. 撤销/重做（OpLog 通道；读回存储参数硬断言）──────
  // 幕序硬约束：undo 只逆 updateParams，suppress 等非可逆 opType 会挡住 undo 目标扫描
  // （findUndoTarget 对最新活动条目非可逆即报无可撤销）——本幕必须在抑制幕之前。
  await pace();
  log('步骤 20/24：撤销底座改参 → 读回距离=3 → 重做 → 读回距离=4');
  const readBaseDistance = async () => {
    const row = featureRow('拉伸 (extrude)');
    await row.hover();
    await row.getByRole('button', { name: '编辑特征' }).click();
    const d = page.getByRole('dialog');
    await d.waitFor({ state: 'visible' });
    const v = await d.getByLabel('距离').inputValue();
    await d.getByRole('button', { name: '取消' }).click();
    await d.waitFor({ state: 'hidden', timeout: 15000 });
    return v;
  };
  /** op+树刷新是异步往返——读回带重试（读的是 getFeatureTree 刷新后的存储 params） */
  const waitBaseDistance = async (expected, label) => {
    for (let i = 0; i < 6; i++) {
      const v = await readBaseDistance();
      if (v === expected) { log(`   ${label}：读回距离=${v} ✅`); return; }
      await page.waitForTimeout(1500);
    }
    throw new Error(`${label}：读回距离未收敛到 ${expected}（撤销/重做未生效？）`);
  };
  await treePanel.getByRole('button', { name: '撤销' }).click();
  await waitBaseDistance('3', '撤销底座 4→3');
  await assertNoFailedRows('撤销');
  await shot(page, '28-撤销-底座回3');
  await treePanel.getByRole('button', { name: '重做' }).click();
  await waitBaseDistance('4', '重做底座 3→4');
  await assertNoFailedRows('重做');
  await shot(page, '29-重做-底座回4');
  log('✅ 撤销/重做全通（OpLog 栈语义：updateParams 可逆，存储参数读回硬断言）');

  // ── 21. 抑制/恢复圆角（直通语义：尖棱↔圆角）────────────
  if (hasFillet) {
    await pace();
  log('步骤 21/24：抑制圆角 → 尖棱截图 → 取消抑制 → 圆角恢复');
    const waitSuppressed = async (want, label) => {
      for (let i = 0; i < 20; i++) {
        const n = await treePanel.locator('.feature-row--suppressed').count();
        if (want ? n >= 1 : n === 0) return;
        await page.waitForTimeout(500);
      }
      throw new Error(`${label}：抑制状态未收敛（want=${want}）`);
    };
    const fRow = featureRow('圆角 (fillet)');
    await fRow.hover();
    await fRow.getByRole('button', { name: '抑制特征' }).click();
    await waitSuppressed(true, '抑制圆角');
    await assertNoFailedRows('抑制圆角');
    await page.waitForTimeout(2500); // 等 tile 刷新出尖棱
    await shot(page, '30-抑制圆角-尖棱');
    log('   圆角已抑制（直通：body=上游尖棱几何，下游孔/凸台照常）');
    await fRow.hover();
    await fRow.getByRole('button', { name: '取消抑制' }).click();
    await waitSuppressed(false, '恢复圆角');
    await assertNoFailedRows('恢复圆角');
    await page.waitForTimeout(6000); // blend 重求值 + 下游重算 + tile 刷新
    await shot(page, '31-恢复圆角');
    log('✅ 抑制/恢复全通（suppressed 直通语义，几何随开关真实往返）');
  } else {
    await pace();
  log('步骤 21/24：⚠️ 无圆角（⑩ 降级）——跳过抑制/恢复幕');
  }

  // ══ Phase D：终审（幕 22-24）══════════════════════════════════════
  // ── 22. 重开零操作显示（持久化 + 冷重建确定性）─────────
  await pace();
  log('步骤 22/24：reload 重开——持久化后零操作显示（含圆角/孔/盲孔/凸台）');
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await waitEditorReady();
  await page.waitForTimeout(9000); // briefcase 重连 + tile 加载
  await shot(page, '32-重开显示');
  const rendered = await pixelRendered(browser, `${SHOT_DIR}/32-重开显示.png`);
  log(`✅ 重开有效渲染像素 ${rendered.toLocaleString()}（阈值 30000）`);
  if (rendered < 30000) throw new Error(`重开后几何未渲染（有效像素 ${rendered} < 30000）`);
  // 冷重建确定性（FilletFlow 臂 3 不变式的 UI 版）：终态凸台高 5 → bbox z-span 恒 5
  await expectZSpan(BOSS.h1, '重开后冷重建');
  log('✅ 重开 bbox z-span=5——持久化几何与编辑终态逐位一致');

  // ── 23. 服务端健康审计（本次运行增量）──────────────────
  await pace();
  log('步骤 23/24：MS 日志健康审计（增量切片）');
  const slice = readMsLogSlice();
  const commits = (slice.match(/notifyCommitted/g) ?? []).length;
  const evalFail = (slice.match(/求值失败/g) ?? []).length;
  const errors = (slice.match(/\[ERROR\]/g) ?? []).length;
  log(`✅ 本次运行：commit ${commits} 次（预算 ≤${COMMIT_BUDGET}）、求值失败 ${evalFail}、ERROR ${errors}`);
  if (commits > COMMIT_BUDGET || evalFail > 0 || errors > 0)
    throw new Error(`健康审计未过：commit=${commits}(≤${COMMIT_BUDGET}) 求值失败=${evalFail} ERROR=${errors}`);

  // ── 24. 退出登录 ─────────────────────────────────────
  await pace();
  log('步骤 24/24：返回项目列表并退出登录');
  await page.getByRole('button', { name: '项目列表' }).first().click();
  await page.waitForURL('**/documents', { timeout: 30000 });
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL('**/login', { timeout: 15000 });
  log('✅ 已退出，回到登录页');
  await shot(page, '33-退出登录');

  log(`🎉 完整流程演示结束：${shotCount} 张截图已存 demo/manual/`);
} finally {
  // 清理演示项目（级联删 iModel）；DEMO_KEEP=1 时保留供人工查看/继续编辑
  if (process.env.DEMO_KEEP) {
    log(`🔒 DEMO_KEEP：演示项目「${DEMO_PROJECT}」已保留（id=${projectId || '未创建'}）——前端 :5300 项目列表可见，打开工作空间即可查看最终模型`);
  } else {
    try {
      const login = await fetch(`${API}/auth/email/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'Test123!@#' }),
      }).then(r => r.json());
      const r = await fetch(`${API}/itwins/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${login.token}` },
      });
      log(`清理演示项目 ${DEMO_PROJECT} -> HTTP ${r.status}`);
    } catch (e) {
      log(`清理跳过：${e}`);
    }
  }
  await browser.close();
}
