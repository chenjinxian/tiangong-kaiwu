// 渲染对齐阶段1视觉验证：dev :5300（源码态=运行时画像生效）打开既有演示库截图。
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.DEMO_BASE || 'http://localhost:5300';
// 缺省指向 2026-10-26 视觉验证现场的演示库；其他现场用 DEMO_PROJ/DEMO_IMODEL 覆盖。
const PROJ = process.env.DEMO_PROJ || '06d91760-28bf-47b3-adec-72a7b092d15b';
const IMODEL = process.env.DEMO_IMODEL || 'db7cb82c-1a6b-4475-8b15-fbf6cb2896df';
const SHOTS = path.join(__dirname, '.demo-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 注：vite dev 无头模式会撞 ERR_INSUFFICIENT_RESOURCES（千级未打包模块并发请求
  // 打满资源）——必须有头。窗口会弹出约 1 分钟，请勿关闭。
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.text().startsWith('[render-profile]') || m.text().startsWith('[useViewport]')) console.log('[page]', m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.url().includes('/auth/') && r.status() >= 400) console.log('[auth-' + r.status() + ']', r.url().slice(-60)); });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('邮箱').fill('test@example.com');
  await page.getByLabel('密码', { exact: true }).fill('Test123!@#');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/documents/, { timeout: 60_000, waitUntil: 'domcontentloaded' });

  // vite 按需编译首载慢（编辑器路由冷编译 >30s）——不等整页 load 事件
  await page.goto(`${BASE}/documents/${PROJ}/${IMODEL}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const status = page.getByTestId('part-studio-status-connection');
  const deadline = Date.now() + 180_000;
  while ((await status.textContent()) !== '已连接') {
    if (Date.now() > deadline) throw new Error('连接未就绪');
    await sleep(500);
  }
  await page.getByTestId('part-studio-viewport').locator('canvas').first().waitFor({ timeout: 60_000 });
  await sleep(6000); // tile 加载+画像应用后的稳定帧
  const file = path.join(SHOTS, 'render-profile-before-after-box.png');
  await page.screenshot({ path: file });
  console.log('[shot]', path.basename(file));
  // 右键适应视图（体入框）后再来一张
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  const menu = page.getByRole('menu', { name: '画布菜单' });
  await menu.waitFor({ timeout: 10_000 });
  await menu.getByRole('menuitem', { name: '适应视图' }).click();
  await sleep(4000);
  await page.screenshot({ path: path.join(SHOTS, 'render-profile-fit-state.png') });
  console.log('[shot] render-profile-fit-state.png');
  // 整图取色聚类（背景/网格外的前景色簇=实体面颜色证据）
  const colors = await page.evaluate(() => {
    const cv = document.querySelector('[data-testid="part-studio-viewport"] canvas');
    const off = document.createElement('canvas');
    off.width = 320; off.height = 180;
    const ctx = off.getContext('2d');
    ctx.drawImage(cv, 0, 0, 320, 180);
    const data = ctx.getImageData(0, 0, 320, 180).data;
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 232 && g > 236 && b > 240) continue; // 背景/基准面浅簇剔除
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, n]) => `rgb(${k.split(',').map((v) => v * 16 + 8).join(',')})x${n}`);
  });
  console.log('[colors]', JSON.stringify(colors));
  console.log('[visual-check] 完成，浏览器保持打开');
  await new Promise(() => {});
})().catch((e) => { console.error('[visual-check] FATAL:', e.message); process.exit(1); });
