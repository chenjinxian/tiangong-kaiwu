// 手动演示驱动：可见浏览器完整走一遍用户流程，逐步截图到 demo/manual/
// 用法：node demo-flow.mjs（需本地栈：MS :4001 + hub :4000 + 前端 :3000）
// 深流程（2026-10-11 并入 demo-show.tmp.mjs 并转正）：圆角选边（几何驱动取棱——B4 根因
// 修复，不再硬编码世界坐标：硬编码 0.06 内收≈十数像素偏离棱线超出拾取孔径，且背面棱
// 不可透选）→ 创建 → 重开零操作显示（绿像素断言）→ 服务端健康审计（日志增量口径）。
import { chromium } from '@playwright/test';
import { mkdirSync, statSync } from 'node:fs';
import { openSync, readSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:4000';
const SHOT_DIR = 'demo/manual';
const MS_LOG = 'C:/Users/24389/AppData/Local/Temp/luban-cad-modeling-server.log';
const ts = Date.now();
const DEMO_PROJECT = `演示项目-${ts}`;
const DEMO_IMODEL = `演示模型-${ts}`;
mkdirSync(SHOT_DIR, { recursive: true });
// 健康审计基线：只统计本次运行新增的日志切片（栈长跑时全量计数会被历史会话污染）
const msLogStart = statSync(MS_LOG, { throwIfNoEntry: false })?.size ?? 0;

const log = (msg) => console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`);
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/${name}.png` }).then(() => log(`📸 ${SHOT_DIR}/${name}.png`));

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

const browser = await chromium.launch({ headless: false, slowMo: 500 });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let projectId = '';

// WS 帧级捕获（页面创建即挂，覆盖后续所有 WS）：resolveEdgeRef/子实体 RPC 的发出-应答
// 配对（悬挂=只有 > 没有 <）。payload 非 string 帧（二进制）不计——RPC 走 JSON 文本帧。
const wsFrames = [];
page.on('websocket', (ws) => {
  ws.on('framesent', (f) => {
    const s = typeof f.payload === 'string' ? f.payload : '';
    if (s) wsFrames.push([Date.now(), `> ${s.slice(0, 200)}`]);
  });
  ws.on('framereceived', (f) => {
    const s = typeof f.payload === 'string' ? f.payload : '';
    if (s) wsFrames.push([Date.now(), `< ${s.slice(0, 200)}`]);
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
  log('步骤 1/15：打开登录页');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[type="email"]', { state: 'visible' });
  await shot(page, '01-登录页');

  // ── 2. 登录 ───────────────────────────────────────────
  log('步骤 2/15：登录 test@example.com');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'Test123!@#');
  await page.getByRole('button', { name: /^登录$/ }).click();
  await page.waitForURL('**/itwins', { timeout: 15000 });
  await page.locator('.section-title').waitFor({ state: 'visible' });
  log(`✅ 登录成功，进入「${await page.locator('.section-title').textContent()}」`);
  await shot(page, '02-项目列表-我的项目');

  // ── 3. 打开种子项目 ──────────────────────────────────
  log('步骤 3/15：点击「测试项目」卡片进入详情');
  await page.locator('main').getByRole('button', { name: '测试项目' }).first().click();
  await page.waitForURL(/\/itwins\/[^/]+$/, { timeout: 15000 });
  await page.getByRole('button', { name: '打开工作空间' }).first().waitFor({ state: 'visible', timeout: 15000 });
  await shot(page, '03-项目详情-iModel卡片');

  // ── 4. 进入编辑器 ────────────────────────────────────
  log('步骤 4/15：点击「打开工作空间」进入编辑器');
  await page.getByRole('button', { name: '打开工作空间' }).first().click();
  await page.waitForURL(/\/workspace\/[^/]+\/[^/]+/, { timeout: 60000 });
  await waitEditorReady();
  await page.locator('.cad-toolbar-horizontal').waitFor({ state: 'visible', timeout: 60000 });
  const status1 = await page.locator('.statusbar').textContent();
  log(`✅ 编辑器就绪，状态栏：${status1?.replace(/\s+/g, ' ')}`);
  await page.waitForTimeout(2500); // 等视图渲染一帧
  await shot(page, '04-编辑器-工具条与状态栏');

  // ── 5. 激活布尔工具 ──────────────────────────────────
  log('步骤 5/15：点击「并集 (Unite)」激活布尔工具');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '并集 (Unite)' }).click();
  for (let i = 0; i < 10; i++) {
    if ((await getActiveTool()) === 'UniteSolids') break;
    await page.waitForTimeout(500);
  }
  log(`✅ activeTool = ${await getActiveTool()}`);
  await shot(page, '05-并集工具已激活');

  // ── 6. 激活圆角工具 ──────────────────────────────────
  await page.keyboard.press('Escape');
  log('步骤 6/15：Esc 退出后点击「圆角 (Fillet)」');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '圆角 (Fillet)' }).click();
  for (let i = 0; i < 10; i++) {
    if ((await getActiveTool()) === 'RoundEdges') break;
    await page.waitForTimeout(500);
  }
  log(`✅ activeTool = ${await getActiveTool()}`);
  await shot(page, '06-圆角工具已激活');
  await page.keyboard.press('Escape');

  // ── 7. 返回并新建项目 ────────────────────────────────
  log(`步骤 7/15：面包屑返回，新建项目「${DEMO_PROJECT}」`);
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
  log(`步骤 8/15：进入新项目，新建 iModel「${DEMO_IMODEL}」`);
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
  log('步骤 9/15：特征树面板——新建特征（拉伸）');
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
  log('步骤 10/15：编辑特征——距离 2→3，试算预览徽标');
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
  log('步骤 11/15：进入草图模式——SketchPanel 与状态栏提示');
  await page.locator('.cad-toolbar-horizontal').getByRole('button', { name: '编辑草图' }).click();
  const sketchPanel = page.locator('.sketch-panel');
  await sketchPanel.waitFor({ state: 'visible', timeout: 15000 });
  const sketchStatus = await page.locator('.statusbar').textContent();
  log(`✅ 草图模式就绪，状态栏：${sketchStatus?.replace(/\s+/g, ' ')}`);
  await shot(page, '15-草图模式-SketchPanel');
  await sketchPanel.getByRole('button', { name: '退出草图' }).click();
  await sketchPanel.waitFor({ state: 'hidden', timeout: 15000 });
  log('✅ 已退出草图模式');

  // ── 12. 圆角选边 + 创建（B4 修复：几何驱动取棱）────────
  log('步骤 12/15：新建特征（圆角）——从视图选边');

  // B4 根因修复（2026-10-11 实证）：编辑器打开时模型为空——内容感知初始取景框住的是
  // 空模型的大 extents，建 extrude 后相机从未重取景，实体只占视口 2×4 像素（探针实测
  // 包围盒 [659,446,661,450]@1320x681），一切点击都落在 3 像素小点之外。先「适应」重建
  // 取景，并加形体投影尺寸守卫（<80px 即取景失败，拒绝盲点）。
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
  await shot(page, '17-圆角表单');

  // 从当前体 contentRange 取四条竖棱中点的屏幕投影（真实棱线上的点，非硬编码坐标），
  // 并向投影形体中心方向内收 6px——恰在轮廓线上的点对要素定位是边界态（人手点击
  // 天然落在棱内侧几像素处；要素命中要求点落在投影实体内，棱又在拾取孔径内）
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
    // chips 轮询：首击 ≤90s、后续 ≤8s。已知产品债（2026-10-11 登记）：单选会话结束
    // onCleanup 清几何缓存与 resolveEdgeRef 查询竞态 → MS 侧防御性重建走慢路径，回包
    // ok:true 迟到 30-65s 实测（WS 帧序实证；期间心跳应答流畅=通道健康）。长窗兜底。
    const budget = picked === 0 ? 90000 : 8000;
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
    const winFrames = wsFrames.filter(([t]) => t >= clickAt - 1500 && t <= Date.now()).slice(-14).map(([, s]) => s);
    log(`   点棱(${Math.round(pt.x)},${Math.round(pt.y)}) 前态=${JSON.stringify(state)} → chips ${pickedNow}${grew ? ` ✅落账(${took}ms)` : ` 未落(${took}ms)`} toasts=${JSON.stringify(toastLog.slice(-4))}`);
    if (!grew && winFrames.length) log(`   [ws 窗口帧]\n     ${winFrames.join('\n     ')}`);
  }
  log(`   [console 全量]\n${consoleLines.join('\n   ')}`);
  if (picked < 1) {
    // 已知产品债（backlog ⑩，2026-10-11 登记）：resolveEdgeRef RPC 在「单选会话结束
    // onCleanup 清几何缓存」竞态下永久悬挂——WS 帧序实证（请求已发、应答永不至；期间
    // 心跳/租约应答全程流畅=通道健康；全新 MS 进程复现）。演示降级：跳过圆角创建，
    // 继续 13/14 幕；链路本身可全绿（同脚本 10:11 轮实证：chips 落账→圆角入树→重开
    // 渲染全过），竞态窗时开时关。
    log('❌ 圆角选边未落账（chips=0）——命中已知 MS 悬挂竞态（backlog ⑩），本轮降级跳过圆角创建');
    await shot(page, '19-圆角选边未落账-诊断');
    await filletDlg.getByRole('button', { name: '取消' }).click().catch(() => {});
    await page.waitForTimeout(1000);
  } else {
    await shot(page, '18-选边chips落账');
    await filletDlg.getByRole('button', { name: '创建', exact: true }).click();
    for (let i = 0; i < 60; i++) {
      if ((await page.getByRole('dialog').count()) === 0) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(6000); // 内核 blend 求值 + 树刷新
    const hasFillet = await treePanel.getByText('圆角').first().isVisible().catch(() => false);
    const failedRows = await treePanel.locator('.feature-row--failed').count();
    await shot(page, '19-圆角创建');
    log(`✅ 圆角入树=${hasFillet}，失败行=${failedRows}（内核 blend）`);
    if (!hasFillet || failedRows > 0) throw new Error('圆角创建未落树或存在失败行');
  }

  // ── 13. 重开零操作显示（含圆角几何）────────────────────
  log('步骤 13/15：reload 重开——持久化后零操作显示');
  await page.reload();
  await waitEditorReady();
  await page.waitForTimeout(9000); // briefcase 重连 + tile 加载
  await shot(page, '20-重开显示');
  const rendered = await pixelRendered(browser, `${SHOT_DIR}/20-重开显示.png`);
  log(`✅ 重开有效渲染像素 ${rendered.toLocaleString()}（阈值 30000）`);
  if (rendered < 30000) throw new Error(`重开后几何未渲染（有效像素 ${rendered} < 30000）`);

  // ── 14. 服务端健康审计（本次运行增量）──────────────────
  log('步骤 14/15：MS 日志健康审计（增量切片）');
  const slice = readMsLogSlice();
  const commits = (slice.match(/notifyCommitted/g) ?? []).length;
  const evalFail = (slice.match(/求值失败/g) ?? []).length;
  const errors = (slice.match(/\[ERROR\]/g) ?? []).length;
  log(`✅ 本次运行：commit ${commits} 次、求值失败 ${evalFail}、ERROR ${errors}`);
  if (commits > 15 || evalFail > 0 || errors > 0)
    throw new Error(`健康审计未过：commit=${commits}(≤15) 求值失败=${evalFail} ERROR=${errors}`);

  // ── 15. 退出登录 ─────────────────────────────────────
  log('步骤 15/15：返回项目列表并退出登录');
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
