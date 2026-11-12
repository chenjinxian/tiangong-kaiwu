/**
 * ADR-0017 Stage B：编辑器首帧背景真栈门。
 *
 * 从文档中心经 CDP 导航到编辑器，连续截图直到 viewport ready；每帧在
 * about:blank 采样页用 canvas 缩到 160×100，统计画布区域近黑像素比例。
 * 旧实现「ViewState 默认黑底 → addViewport 渲染 → 后置 useEffect 写白」
 * 会出现明显黑帧；新实现必须在 addViewport 前写入主题背景。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, loginWithSession } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const DARK_RGB = 30;

test.describe('editor first frame', () => {
  test('导航到编辑器期间无全黑帧，首帧即主题背景', async ({ page, context, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);

    await loginWithSession(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/documents');
    await page.waitForLoadState('domcontentloaded');

    const sampler = await context.newPage();
    await sampler.goto('about:blank');

    const editorUrl = new URL(`/documents/${seed.itwinId}/${seed.imodelId}`, page.url()).href;
    const cdp = await context.newCDPSession(page);
    const frames: { data: string; ts: number }[] = [];
    await cdp.send('Page.navigate', { url: editorUrl });
    const started = Date.now();
    for (let i = 0; i < 80; i++) {
      try {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        frames.push({ data: shot.data, ts: Date.now() - started });
      } catch {
        // 导航中偶发目标切换；跳过该帧，继续采样。
      }
      await page.waitForTimeout(120);
      if (frames.length >= 12 && i > 20) {
        const ready = await page.evaluate(() =>
          Boolean(document.querySelector('[data-viewport-ready="true"]'))).catch(() => false);
        if (ready) break;
      }
    }
    expect(frames.length).toBeGreaterThan(10);

    const samples = await Promise.all(frames.map((frame) =>
      sampler.evaluate(async ({ b64, dark }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 100;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let total = 0;
        let darkCount = 0;
        // 画布主体区域（避开顶部工具栏/左侧面板与底部页签）。
        for (let y = 15; y < 85; y += 2) {
          for (let x = 30; x < 145; x += 2) {
            const idx = (y * canvas.width + x) * 4;
            total++;
            if (data[idx]! < dark && data[idx + 1]! < dark && data[idx + 2]! < dark) darkCount++;
          }
        }
        return { darkRatio: total === 0 ? 0 : darkCount / total };
      }, { b64: frame.data, dark: DARK_RGB }),
    ));

    const worst = samples.reduce((a, b) => (b.darkRatio > a.darkRatio ? b : a), { darkRatio: 0 });
    // 打印时序便于定位（黑帧若出现会在 120ms 采样窗口内被捕获）。
    console.log(`[editor-first-frame] frames=${samples.length} worstDark=${worst.darkRatio.toFixed(3)}`);
    expect(worst.darkRatio).toBeLessThan(0.5);

    // 最终必须真正进入编辑器（而不是停在导航页）。
    await expect(page.locator('[data-viewport-ready="true"]')).toBeVisible({ timeout: 60_000 });
    const finalBg = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="part-studio-viewport"] canvas, .part-studio-viewport canvas');
      if (!canvas) return null;
      const style = getComputedStyle(canvas.parentElement as HTMLElement);
      return style.backgroundColor;
    });
    expect(finalBg).not.toBeNull();
    await sampler.close();
  });
});
