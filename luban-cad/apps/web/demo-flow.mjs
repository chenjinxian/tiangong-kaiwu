// 手动演示驱动：可见浏览器完整走一遍用户流程，逐步截图到 demo/manual/
// 用法：node demo-flow.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:4000';
const SHOT_DIR = 'demo/manual';
const ts = Date.now();
const DEMO_PROJECT = `演示项目-${ts}`;
const DEMO_IMODEL = `演示模型-${ts}`;
mkdirSync(SHOT_DIR, { recursive: true });

const log = (msg) => console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`);
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/${name}.png` }).then(() => log(`📸 ${SHOT_DIR}/${name}.png`));

const browser = await chromium.launch({ headless: false, slowMo: 500 });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let projectId = '';

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
        await page.reload();
      }
      last = Date.now();
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('编辑器就绪超时');
}

try {
  // ── 1. 登录页 ─────────────────────────────────────────
  log('步骤 1/12：打开登录页');
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { state: 'visible' });
  await shot(page, '01-登录页');

  // ── 2. 登录 ───────────────────────────────────────────
  log('步骤 2/12：登录 test@example.com');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'Test123!@#');
  await page.getByRole('button', { name: /^登录$/ }).click();
  await page.waitForURL('**/itwins', { timeout: 15000 });
  await page.locator('.section-title').waitFor({ state: 'visible' });
  log(`✅ 登录成功，进入「${await page.locator('.section-title').textContent()}」`);
  await shot(page, '02-项目列表-我的项目');

  // ── 3. 打开种子项目 ──────────────────────────────────
  log('步骤 3/12：点击「测试项目」卡片进入详情');
  await page.locator('main').getByRole('button', { name: '测试项目' }).first().click();
  await page.waitForURL(/\/itwins\/[^/]+$/, { timeout: 15000 });
  await page.getByRole('button', { name: '打开工作空间' }).first().waitFor({ state: 'visible', timeout: 15000 });
  await shot(page, '03-项目详情-iModel卡片');

  // ── 4. 进入编辑器 ────────────────────────────────────
  log('步骤 4/12：点击「打开工作空间」进入编辑器');
  await page.getByRole('button', { name: '打开工作空间' }).first().click();
  await page.waitForURL(/\/workspace\/[^/]+\/[^/]+/, { timeout: 60000 });
  await waitEditorReady();
  await page.locator('.cad-toolbar-horizontal').waitFor({ state: 'visible', timeout: 60000 });
  const status1 = await page.locator('.statusbar').textContent();
  log(`✅ 编辑器就绪，状态栏：${status1?.replace(/\s+/g, ' ')}`);
  await page.waitForTimeout(2500); // 等视图渲染一帧
  await shot(page, '04-编辑器-工具条与状态栏');

  // ── 5. 激活布尔工具 ──────────────────────────────────
  log('步骤 5/12：点击「并集 (Unite)」激活布尔工具');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '并集 (Unite)' }).click();
  for (let i = 0; i < 10; i++) {
    if ((await getActiveTool()) === 'UniteSolids') break;
    await page.waitForTimeout(500);
  }
  log(`✅ activeTool = ${await getActiveTool()}`);
  await shot(page, '05-并集工具已激活');

  // ── 6. 激活圆角工具 ──────────────────────────────────
  await page.keyboard.press('Escape');
  log('步骤 6/12：Esc 退出后点击「圆角 (Fillet)」');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '圆角 (Fillet)' }).click();
  for (let i = 0; i < 10; i++) {
    if ((await getActiveTool()) === 'RoundEdges') break;
    await page.waitForTimeout(500);
  }
  log(`✅ activeTool = ${await getActiveTool()}`);
  await shot(page, '06-圆角工具已激活');
  await page.keyboard.press('Escape');

  // ── 7. 返回并新建项目 ────────────────────────────────
  log(`步骤 7/12：面包屑返回，新建项目「${DEMO_PROJECT}」`);
  await page.getByRole('button', { name: '项目列表' }).first().click();
  await page.waitForURL('**/itwins', { timeout: 30000 });
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
  log(`步骤 8/12：进入新项目，新建 iModel「${DEMO_IMODEL}」`);
  await page.locator('main').getByRole('button', { name: DEMO_PROJECT }).first().click();
  await page.waitForURL(/\/itwins\/[^/]+$/, { timeout: 30000 });
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
  await page.waitForURL(/\/workspace\/[^/]+\/[^/]+/, { timeout: 60000 });
  await waitEditorReady();
  await page.locator('.cad-toolbar-horizontal').waitFor({ state: 'visible', timeout: 60000 });
  const status2 = await page.locator('.statusbar').textContent();
  log(`✅ 新模型编辑器就绪，状态栏：${status2?.replace(/\s+/g, ' ')}`);
  await page.waitForTimeout(2500);
  await shot(page, '11-新模型编辑器');

  // ── 9. 特征树：新建 extrude 特征（M3-a 特征 UX）────────
  log('步骤 9/12：特征树面板——新建特征（拉伸）');
  const treePanel = page.locator('.feature-tree-panel');
  await treePanel.waitFor({ state: 'visible', timeout: 60000 });
  await treePanel.getByText('加载中...').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await treePanel.getByRole('button', { name: '新建特征' }).click();
  const fDlg = page.getByRole('dialog');
  await fDlg.waitFor({ state: 'visible' });
  await fDlg.locator('select').selectOption('extrude');
  await fDlg.getByLabel('距离').fill('2');
  await fDlg.getByLabel('轮廓').fill('[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]');
  await fDlg.getByLabel('轮廓').blur();
  await shot(page, '12-新建特征对话框-extrude');
  await fDlg.getByRole('button', { name: '创建' }).click();
  await fDlg.waitFor({ state: 'hidden', timeout: 30000 });
  const featureRow = treePanel.locator('.feature-row').last();
  await featureRow.waitFor({ state: 'visible' });
  log(`✅ 特征已创建：${(await featureRow.textContent())?.replace(/\s+/g, ' ')}`);
  await shot(page, '13-特征树-extrude已建');

  // ── 10. 参数面板：改参 → 试算预览徽标（T6.2/T6.4）────
  log('步骤 10/12：编辑特征——距离 2→3，试算预览徽标');
  await featureRow.hover();
  await featureRow.getByRole('button', { name: '编辑特征' }).click();
  const editDlg = page.getByRole('dialog');
  await editDlg.waitFor({ state: 'visible' });
  await editDlg.getByLabel('距离').fill('3');
  const badge = editDlg.locator('.preview-badge');
  await badge.waitFor({ state: 'visible', timeout: 15000 }); // debounce 400ms + previewOp RPC 往返
  log(`✅ 预览徽标：${(await badge.textContent())?.replace(/\s+/g, ' ')}`);
  await shot(page, '14-参数面板-试算预览徽标');
  await editDlg.getByRole('button', { name: '应用' }).click();
  await page.getByText('特征参数已更新').waitFor({ state: 'visible', timeout: 15000 });
  await editDlg.waitFor({ state: 'hidden', timeout: 15000 });
  log('✅ 参数已应用（previewOp 影子试算 → applyOp 真提交）');

  // ── 11. 草图模式（M3-b：SketchPanel+状态栏提示）────────
  log('步骤 11/12：进入草图模式——SketchPanel 与状态栏提示');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '编辑草图' }).click();
  const sketchPanel = page.locator('.sketch-panel');
  await sketchPanel.waitFor({ state: 'visible', timeout: 15000 });
  const sketchStatus = await page.locator('.statusbar').textContent();
  log(`✅ 草图模式就绪，状态栏：${sketchStatus?.replace(/\s+/g, ' ')}`);
  await shot(page, '15-草图模式-SketchPanel');
  await sketchPanel.getByRole('button', { name: '退出草图' }).click();
  await sketchPanel.waitFor({ state: 'hidden', timeout: 15000 });
  log('✅ 已退出草图模式');

  // ── 12. 退出登录 ─────────────────────────────────────
  log('步骤 12/12：返回项目列表并退出登录');
  await page.getByRole('button', { name: '项目列表' }).first().click();
  await page.waitForURL('**/itwins', { timeout: 30000 });
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL('**/login', { timeout: 15000 });
  log('✅ 已退出，回到登录页');
  await shot(page, '16-退出登录');

  log('🎉 完整流程演示结束：16 张截图已存 demo/manual/');
} finally {
  // 清理演示项目（级联删 iModel）
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
  await browser.close();
}
