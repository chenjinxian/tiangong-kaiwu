// 浏览器级 no-store 验收（2026-10-27，hub 851c213 / 镜像 backend-20261027）。
//
// 原始症状：SPA POST /itwins 建项成功后列表不出新卡，清浏览器缓存即好。
// 修复契约：GET/HEAD /itwins、/imodels 响应带 Cache-Control: no-store。
// 本脚本验证**用户可见行为**：登录后先加载一次列表（可能进缓存），经 API 建
// 新项目，然后普通 reload（不清缓存）——新卡必须出现，且重载后的 GET /itwins
// 不得来自 disk/memory cache（CDP Network.responseReceived 取证）。
//
// 前置：部署栈 :5301 在线；test@example.com 可登录。
// 用法：node demo-no-store-check.cjs   （可用 DEMO_BASE 覆盖地址）
const { chromium } = require('@playwright/test');

const BASE = process.env.DEMO_BASE || 'http://localhost:5301';
const EMAIL = 'test@example.com';
const PASSWORD = 'Test123!@#';
const NAME = 'no-store验收-' + Date.now().toString().slice(-6);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  let token = '';
  let createdId = null;

  try {
    // 登录一次（hub 登录限流 5/15min；全程复用会话 token）
    await page.goto(`${BASE}/login`);
    await page.getByLabel('邮箱').fill(EMAIL);
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL(/documents/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    token = await page.evaluate(() => {
      try {
        return (
          JSON.parse(sessionStorage.getItem('luban-next-auth') || '')
            .accessToken || ''
        );
      } catch {
        return '';
      }
    });
    if (!token) throw new Error('UI 登录后未取到会话 token');
    const H = { Authorization: `Bearer ${token}` };

    // 负向准备：首屏列表已加载（若响应可缓存，此时可能已有缓存条目）
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const itwinResponses = [];
    cdp.on('Network.responseReceived', (e) => {
      const u = e.response.url;
      if ((e.type === 'Fetch' || e.type === 'XHR') && /\/itwins(\?|$)/.test(u)) {
        itwinResponses.push({
          status: e.response.status,
          fromDiskCache: e.response.fromDiskCache,
          fromMemoryCache: e.response.fromMemoryCache,
          url: u.slice(-80),
        });
      }
    });

    // 经 API 建新项目（写响应不参与浏览器缓存）
    const created = await context.request.post(`${BASE}/itwins`, {
      headers: { ...H, 'Content-Type': 'application/json' },
      data: { displayName: NAME, class: 'Endeavor', subClass: 'Project' },
    });
    const cb = await created.json();
    createdId = cb.iTwin?.id;
    if (created.status() !== 201 || !createdId) {
      throw new Error(`建项失败 ${created.status()}: ${JSON.stringify(cb).slice(0, 200)}`);
    }
    console.log('[check] 新项目已建:', NAME, createdId.slice(0, 8) + '…');

    // 关键动作：普通 reload，**不清浏览器缓存**。
    await page.reload({ waitUntil: 'networkidle' });

    // 1) 用户可见：新项目卡必须出现（waitFor 超时即失败）
    await page
      .getByRole('button', { name: NAME })
      .first()
      .waitFor({ timeout: 15_000 });
    console.log('[check] 新项目卡在普通重载后可见');

    // 2) 传输证据：重载后的 GET /itwins 必须走网络，不得命中 disk/memory cache
    const fresh = itwinResponses.filter((r) => r.status === 200);
    if (fresh.length === 0) {
      throw new Error('重载后未捕获 GET /itwins 的 200 响应（无法证明取网）');
    }
    const cached = fresh.find((r) => r.fromDiskCache || r.fromMemoryCache);
    if (cached) {
      throw new Error(`GET /itwins 命中浏览器缓存: ${JSON.stringify(cached)}`);
    }
    console.log('[check] GET /itwins 走网络:', JSON.stringify(fresh.at(-1)));
    console.log('PASS: no-store 浏览器行为验收通过（建项后不清缓存即见新卡）');
    process.exitCode = 0;
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    // 清场：删本次验收项目（失败轮不留残留）；登录限流下不再二次登录
    try {
      if (createdId && token) {
        const del = await context.request.delete(`${BASE}/itwins/${createdId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('[cleanup] DELETE /itwins:', del.status());
      }
    } catch (e) {
      console.error('[cleanup] 删除验收项目失败:', e.message);
      process.exitCode = process.exitCode || 2;
    }
    await browser.close();
  }
})();
