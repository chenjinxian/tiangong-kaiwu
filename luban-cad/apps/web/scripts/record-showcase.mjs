/**
 * 1080p 产品演示录制（2026-11-06）。真实栈、真实鼠标操作，无剪辑。
 * 输出：public/showcase/tutorial2-demo-1080p.webm（1920×1080）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outFile = path.join(webRoot, 'public', 'showcase', 'tutorial2-demo-1080p.webm');
const authFile = path.join(webRoot, 'playwright', '.auth', 'session.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luban-showcase-video-'));

const TUTORIAL2 =
  'http://localhost:5300/documents/9808b77f-ebab-4cc3-bc5b-61fc90047a4d/f2278180-4f57-43b2-98f5-2cc8f76fd24f?model=674861d0-ed7d-46a7-97b1-392f176f2c84';
const SAMPLE_ASSIGNMENT =
  'http://localhost:5300/documents/c7778d27-f4c5-4097-a735-fc8080c2c820/a9eacfe5-825f-421e-93c3-bf55466c27cf?model=e1551bd3-8dee-4e0d-81a4-08c0bd671fc2';

const session = JSON.parse(fs.readFileSync(authFile, 'utf8'));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: 'zh-CN',
  colorScheme: 'light',
  recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } },
});
await context.addInitScript(
  ([key, value]) => sessionStorage.setItem(key, value),
  ['luban-next-auth', session['luban-next-auth']],
);
const page = await context.newPage();
const video = page.video();

const pause = (ms) => page.waitForTimeout(ms);

async function waitEditor() {
  await page.waitForSelector('[data-testid="part-studio-tab-strip"]', { timeout: 120_000 });
  await pause(11_000);
}

async function closeDialog() {
  const cancel = page.getByRole('button', { name: '取消', exact: true }).last();
  if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => undefined);
  else await page.keyboard.press('Escape').catch(() => undefined);
  await pause(700);
}

async function openTreeRow(name) {
  const row = page.locator('.part-studio-tree').getByRole('button', { name, exact: true }).first();
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.dblclick();
  await pause(2200);
}

try {
  // 文档中心开场
  await page.goto('http://localhost:5300/documents', { waitUntil: 'domcontentloaded' });
  await pause(4500);
  await page.mouse.move(1100, 420, { steps: 20 });
  await pause(1200);

  // Tutorial 2：成品 → 草图 → 拉伸 → 圆角
  await page.goto(TUTORIAL2, { waitUntil: 'domcontentloaded' });
  await waitEditor();
  await page.mouse.move(1450, 560, { steps: 30 });
  await pause(2200);
  await openTreeRow('草图 1');
  await closeDialog();
  await openTreeRow('拉伸 1');
  await closeDialog();
  await openTreeRow('圆角 1');
  await closeDialog();

  // Sample Assignment：成品 → 倒角 → 孔
  await page.goto(SAMPLE_ASSIGNMENT, { waitUntil: 'domcontentloaded' });
  await waitEditor();
  await page.mouse.move(1450, 620, { steps: 30 });
  await pause(2200);
  await openTreeRow('倒角 1');
  await closeDialog();
  const hole = page.getByRole('button', { name: '孔', exact: true }).first();
  if (await hole.isVisible().catch(() => false)) {
    await hole.click();
    await pause(3200);
    await closeDialog();
  }
  await page.mouse.move(1500, 500, { steps: 25 });
  await pause(1200);
} finally {
  await page.close();
  await context.close();
  const src = await video.path();
  fs.copyFileSync(src, outFile);
  console.log('video written:', outFile, (fs.statSync(outFile).size / 1024 / 1024).toFixed(1), 'MB');
  await browser.close();
}
