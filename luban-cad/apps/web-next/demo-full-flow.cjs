// 全流程演示脚本（有头浏览器，用户可实时观看；截图落 .demo-shots/ 供会话审计）。
// 选择器全部承自 e2e 已验证口径（login.spec / T8 sketch-extrude / part-studio / tutorial2 S7）。
// 栈：nginx :5301 部署形态（backend-20261027）。结束时不关浏览器——留给用户自行查看。
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.DEMO_BASE || 'http://localhost:5301';
const EMAIL = 'test@example.com';
const PASSWORD = 'Test123!@#';
const PROJ = '演示项目-全流程';
const SHOTS = path.join(__dirname, '.demo-shots');
fs.mkdirSync(SHOTS, { recursive: true });
let shotNo = 0;
const shot = async (page, name) => {
  shotNo += 1;
  const file = path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[shot] ${path.basename(file)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dataPoint(page, x, y) {
  await page.mouse.move(x - 28, y + 20);
  await sleep(120);
  await page.mouse.move(x, y);
  await sleep(450);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
  await sleep(250);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));
  page.on('console', (m) => {
    const t = m.text();
    // token 只可见尾段：WS URL 上的 JWT 先打码再截断（纪律：不输出完整 token）
    const safe = t.replace(/token=[^&\s]+/, (s) => 'token=…' + s.slice(-9));
    if (m.type() === 'error' || m.type() === 'warning' || t.startsWith('[WebInitializer]')) console.log('[console.' + m.type() + ']', safe.slice(0, 200));
  });
  page.on('requestfailed', (r) => console.log('[requestfailed]', r.url().slice(-90), r.failure()?.errorText));
  page.on('response', (r) => { if (r.status() >= 400) console.log('[http' + r.status() + ']', r.url().slice(-90)); });
  page.on('requestfailed', (r) => console.log('[requestfailed]', r.url().slice(-80), r.failure()?.errorText));

  // ── 1) 登录页（表单真登录——完整流程第一幕）。
  //      hub 登录限流 = 每 IP+email 15min 5 次（AuthThrottlerGuard）：全程只登
  //      这一次，后续 API 复用 UI 会话 token（sessionStorage `luban-next-auth`） ──
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await shot(page, 'login');
  await page.getByLabel('邮箱').fill(EMAIL);
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/documents/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await shot(page, 'documents-center');
  const accessToken = await page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem('luban-next-auth') || '').accessToken || ''; } catch { return ''; }
  });
  if (!accessToken) throw new Error('UI 登录后未取到会话 token');
  console.log('[demo] UI 登录完成，token 尾号:', accessToken.slice(-8));
  const H = { Authorization: `Bearer ${accessToken}` };

  // ── 2) API 备好演示库（项目+iModel；管理面走 API，演示焦点留给编辑器）。
  //      iModel 每轮新建（名带时间戳）：失败残留的旧库会让草图编号漂移（实测：
  //      上轮悬挂草图 → 本轮 草图 2，拉伸选 草图 1 = 空库 regions=0） ──
  const IMODEL_NAME = '演示库-' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
  let proj = null;
  const listRes = await context.request.get(`${BASE}/itwins?class=Project&$top=100`, { headers: H });
  proj = ((await listRes.json()).iTwins || []).find((p) => p.displayName === PROJ);
  console.log('[demo] 项目:', proj ? `已存在 ${proj.id.slice(0, 8)}…` : '未找到');
  if (!proj) {
    const created = await context.request.post(`${BASE}/itwins`, { headers: H, data: { displayName: PROJ, class: 'Project' } });
    const cb = await created.json();
    proj = cb.iTwin;
    if (!proj?.id) throw new Error(`项目创建失败 ${created.status()}: ${JSON.stringify(cb).slice(0, 200)}`);
    console.log('[demo] 项目已创建:', proj.id);
  }
  let imodel = null;
  const cm = await context.request.post(`${BASE}/imodels`, { headers: H, data: { iTwinId: proj.id, name: IMODEL_NAME } });
  const mb = await cm.json();
  imodel = mb.iModel;
  if (!imodel?.id) throw new Error(`iModel 创建失败 ${cm.status()}: ${JSON.stringify(mb).slice(0, 200)}`);
  console.log('[demo] iModel 已创建:', IMODEL_NAME, imodel.id);
  for (let i = 0; i < 60; i++) {
    const st = (await (await context.request.get(`${BASE}/imodels/${imodel.id}`, { headers: H })).json()).iModel?.state;
    if (st === 'initialized') break;
    if (st === 'failed' || st === 'missingFiles') throw new Error(`baseline 终态 ${st}`);
    await sleep(3000);
  }
  console.log('[demo] 库就绪');

  // hub 851c213 起 GET /itwins、/imodels 读响应统一 Cache-Control: no-store
  // （镜像 backend-20261027 上线，2026-10-27）——建项后普通重载即见新卡，
  // 原先「清浏览器缓存再重载」的绕行已删除（浏览器级验收见
  // demo-no-store-check.cjs）。
  await page.goto(`${BASE}/documents`);
  await page.waitForLoadState('networkidle');
  await shot(page, 'documents-with-project');

  // ── 3) UI 打开编辑器（项目卡 → 库卡「打开工作空间」） ──
  await page.getByRole('button', { name: PROJ }).first().click();
  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 20_000 });
  const seedCard = page.locator('.imodel-card', { hasText: IMODEL_NAME });
  await seedCard.waitFor({ timeout: 15_000 });
  await shot(page, 'imodel-card');
  await seedCard.getByRole('button', { name: '打开工作空间' }).click();
  await page.waitForURL(/\/documents\/[^/]+\/[^/]+$/, { timeout: 30_000 });

  // 就绪双门：状态栏「已连接」+ canvas 在场
  const status = page.getByTestId('part-studio-status-connection');
  const deadline = Date.now() + 180_000;
  while ((await status.textContent()) !== '已连接') {
    if (Date.now() > deadline) throw new Error(`连接未就绪：${await status.textContent()}`);
    await sleep(500);
  }
  await page.getByTestId('part-studio-viewport').locator('canvas').first().waitFor({ timeout: 60_000 });
  await sleep(1500);
  await shot(page, 'editor-five-zones');

  // ── 4) 草图：上视面 → 矩形（4 线同像素闭环）。
  //      T8 口径：确认后必须等 insertSketch 提交链落位双证（树「草图 1」节点，60s+
  //      预算：冷会话含 RPC 通道/租约建立）——树不落位=op 未提交，后续全空转
  //      （2026-10-26 demo 实测：确认后立即开画 → MS 零 applyOp → 拉伸无草图可选） ──
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await sketchDialog.waitFor({ timeout: 15_000 });
  await shot(page, 'sketch-dialog');
  await sketchDialog.getByRole('combobox', { name: '草图平面' }).selectOption({ label: '上视' });
  await sketchDialog.getByRole('button', { name: '确认' }).click();
  await page.getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' }).waitFor({ timeout: 60_000 });
  if ((await sketchDialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0) {
    throw new Error('insertSketch 被拒收：' + await sketchDialog.getByTestId('part-studio-sketch-dialog-error').textContent());
  }
  const featureList = page.getByTestId('part-studio-feature-list');
  const featureCount = page.getByTestId('part-studio-feature-count');
  try {
    await featureList.getByRole('button', { name: '草图 1' }).waitFor({ timeout: 45_000 });
  } catch {
    // 落位失败：抓现场全貌（对话框态/错误条/状态栏/树/console 已由监听器透出）
    console.log('[demo] 草图 1 未落位——现场 dump：');
    console.log('  dialog aria-busy:', await sketchDialog.getAttribute('aria-busy'));
    console.log('  dialog error:', await sketchDialog.getByTestId('part-studio-sketch-dialog-error').textContent().catch(() => '(无)'));
    console.log('  tree:', JSON.stringify((await featureList.innerText().catch(() => '')).slice(0, 300)));
    const statuses = await page.getByTestId(/part-studio-status-/).allTextContents().catch(() => []);
    console.log('  status bar:', JSON.stringify(statuses));
    console.log('  退出草图 visible:', await page.getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' }).isVisible().catch(() => false));
    await shot(page, 'sketch-stuck-dump');
    throw new Error('insertSketch 未落位（见上方 dump 与 console 输出）');
  }
  console.log('[demo] 草图 1 落位，树计数:', (await featureCount.textContent())?.trim());
  await shot(page, 'sketch-mode');

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const P = [
    { x: cx - 160, y: cy - 90 },
    { x: cx + 160, y: cy - 90 },
    { x: cx + 160, y: cy + 90 },
    { x: cx - 160, y: cy + 90 },
  ];
  // 矩形工具（2 击对角）——线工具是「一次激活画一条」：SketchCreateTool
  // 提交成功即 exitTool（SketchCreateTool.ts onDataButtonDown 尾），8 连击
  // 只成 1 条线+6 次空点（2026-10-26 demo 实测 regions=0）。矩形工具 2 击
  // 出 4 线+4 角点 coincident 焊接 = 闭环面域，拉伸正解入口。
  const rectButton = page.getByRole('toolbar', { name: '草图工具' }).getByRole('button', { name: '矩形', exact: true });
  await rectButton.waitFor({ timeout: 60_000 });
  await rectButton.click();
  for (let i = 0; i < 24 && (await rectButton.getAttribute('aria-pressed')) !== 'true'; i++) await sleep(250);
  console.log('[demo] 矩形工具 aria-pressed =', await rectButton.getAttribute('aria-pressed'));
  await dataPoint(page, P[0].x, P[0].y); // 第一角点
  await dataPoint(page, P[2].x, P[2].y); // 对角点 → 4 线焊接闭环，工具自退
  await sleep(2000);
  await shot(page, 'sketch-rect');

  // ── 5) 退出草图 → 拉伸 ──
  await page.getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' }).click();
  await page.getByRole('toolbar', { name: '特征工具' }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await dialog.waitFor({ timeout: 15_000 });
  await dialog.getByRole('combobox', { name: '草图' }).selectOption({ label: '草图 1' });
  await dialog.getByText('草图 1 的面', { exact: true }).waitFor({ timeout: 20_000 });
  await sleep(800);
  await shot(page, 'extrude-dialog');
  await dialog.getByRole('button', { name: '确认' }).click();
  await featureList.getByRole('button', { name: '拉伸 1' }).waitFor({ timeout: 60_000 });
  await sleep(1500);
  // 适应视图带体入框
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  const menu = page.getByRole('menu', { name: '画布菜单' });
  await menu.waitFor({ timeout: 10_000 });
  await menu.getByRole('menuitem', { name: '适应视图' }).click();
  await sleep(3500);
  await shot(page, 'solid-box');

  // ── 6) 圆角：对话框 → 添加边 → 扫描拾竖棱（chips「边 N」为命中信号） ──
  await page.getByRole('button', { name: '圆角', exact: true }).click();
  const fdialog = page.getByTestId('part-studio-feature-dialog');
  await fdialog.waitFor({ timeout: 15_000 });
  await shot(page, 'fillet-dialog-default');
  // 添加边/结束拾取是同一钮换名（picking 态 label=「结束拾取」）——testid 直取
  const addEdgeBtn = fdialog.getByTestId('part-studio-feature-dialog-add-edge');
  await addEdgeBtn.click();
  await sleep(800);
  // 拾取：适应视图后箱体居中，四条竖棱投影落在 cx±0.3w 带内；沿中线横向扫描，
  // 每击后数对话框 chips「边 N」（面点击惰性——FilletEdgePickTool 只收边）
  const vb = await canvas.boundingBox();
  const chipCount = async () => fdialog.getByText(/^边 \d+$/).count().catch(() => 0);
  let picked = 0;
  for (let dx = -0.30; dx <= 0.301 && picked < 2; dx += 0.045) {
    await dataPoint(page, vb.x + vb.width * (0.5 + dx), vb.y + vb.height * 0.5);
    const n = await chipCount();
    if (n > picked) { picked = n; console.log('[demo] 已拾边数:', picked); }
  }
  await sleep(800);
  // 再点同钮 = 结束拾取回对话框（M6-b T6 三通道之一；picking 态下 label 已换名）
  await addEdgeBtn.click();
  await sleep(800);
  await shot(page, 'fillet-edges-picked');
  const confirmBtn = fdialog.getByRole('button', { name: '确认' });
  const enabled = await confirmBtn.isEnabled();
  console.log('[demo] 圆角确认钮可用:', enabled, '已拾边数:', await chipCount());
  if (enabled) {
    await confirmBtn.click();
    await featureList.getByRole('button', { name: '圆角 1' }).waitFor({ timeout: 60_000 });
    await sleep(2500);
    await shot(page, 'fillet-done');
  } else {
    console.log('[demo] 边拾取未命中（守卫态：空边集禁提交——如实展示）');
    await shot(page, 'fillet-guard');
    await fdialog.getByRole('button', { name: '取消' }).click().catch(() => fdialog.getByRole('button', { name: '✗' }).click().catch(() => {}));
  }

  // ── 7) 撤销 → 重做 ──
  const undoBtn = page.getByTestId('part-studio-undo-button');
  await undoBtn.click();
  await sleep(3000);
  await shot(page, 'after-undo');
  const redoBtn = page.getByTestId('part-studio-redo-button');
  if (await redoBtn.isEnabled()) { await redoBtn.click(); await sleep(3000); }
  await shot(page, 'after-redo');

  // ── 8) 保存 → 推送 → 版本历史 ──
  const saveBtn = page.getByTestId('part-studio-save-button');
  await saveBtn.waitFor({ timeout: 15_000 });
  await sleep(1000);
  await shot(page, 'save-enabled');
  await saveBtn.click();
  const pushDialog = page.getByRole('dialog', { name: '保存版本' });
  await pushDialog.waitFor({ timeout: 15_000 });
  await shot(page, 'push-dialog');
  // 描述必填（trim 门）；确认钮名=「推送」（i18n pushChangeset.confirm），用
  // testid 直取（part-studio-push-confirm-button）
  await pushDialog.getByTestId('part-studio-push-description-input').fill('全流程演示：草图矩形→拉伸→圆角→推送');
  await pushDialog.getByTestId('part-studio-push-confirm-button').click();
  await pushDialog.waitFor({ state: 'hidden', timeout: 120_000 });
  await page.getByTestId('part-studio-dock').getByRole('tab', { name: '版本历史' }).click();
  await sleep(2000);
  await shot(page, 'version-history');

  console.log('[demo] 全流程完成。浏览器保持打开——可自行查看/操作；脚本将挂起（Ctrl+C 或由 Claude 关闭）。');
  await new Promise(() => {});
})().catch((e) => { console.error('[demo] FATAL:', e.message); process.exit(1); });
