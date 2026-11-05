/**
 * 宣传素材采集（2026-11-06）。
 *
 * 使用 e2e 会话文件（playwright/.auth/session.json）注入 sessionStorage，
 * 以 1920×1080 CSS / DPR2 采集 3840×2160 的 WebP 截图到 public/showcase。
 * 仅本地运行：node scripts/capture-showcase.mjs
 * 前置：dev :5300 + MS :5401 + hub 栈就绪；playwright/.auth/session.json 有效。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outDir = path.join(webRoot, 'public', 'showcase');
const authFile = path.join(webRoot, 'playwright', '.auth', 'session.json');

const TUTORIAL2 =
  'http://localhost:5300/documents/9808b77f-ebab-4cc3-bc5b-61fc90047a4d/f2278180-4f57-43b2-98f5-2cc8f76fd24f?model=674861d0-ed7d-46a7-97b1-392f176f2c84';
const SAMPLE_ASSIGNMENT =
  'http://localhost:5300/documents/c7778d27-f4c5-4097-a735-fc8080c2c820/a9eacfe5-825f-421e-93c3-bf55466c27cf?model=e1551bd3-8dee-4e0d-81a4-08c0bd671fc2';

fs.mkdirSync(outDir, { recursive: true });
const session = JSON.parse(fs.readFileSync(authFile, 'utf8'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
  colorScheme: 'light',
});
await context.addInitScript(
  ([key, value]) => sessionStorage.setItem(key, value),
  ['luban-next-auth', session['luban-next-auth']],
);
const page = await context.newPage();

async function waitEditor() {
  await page.waitForSelector('[data-testid="part-studio-tab-strip"]', { timeout: 120_000 });
  await page.waitForTimeout(10_000);
}

async function shot(name) {
  await page.screenshot({
    path: path.join(outDir, `${name}.webp`),
    type: 'webp',
    quality: 93,
    animations: 'disabled',
  });
  console.log('captured', name);
}

async function closeDialog() {
  const cancel = page.getByRole('button', { name: '取消', exact: true }).last();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click().catch(() => undefined);
  } else {
    await page.keyboard.press('Escape').catch(() => undefined);
  }
  await page.waitForTimeout(500);
}

async function openTreeRow(name) {
  const tree = page.locator('.part-studio-tree');
  const row = tree.getByRole('button', { name, exact: true }).first();
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.dblclick();
  await page.waitForTimeout(1500);
}

try {
  // 1) Tutorial 2 成品
  await page.goto(TUTORIAL2, { waitUntil: 'domcontentloaded' });
  await waitEditor();
  await shot('hero-tutorial2');

  // 2) 草图编辑对话框
  await openTreeRow('草图 1');
  await shot('sketch');
  await closeDialog();

  // 3) 拉伸对话框（参数+实时预览）
  await openTreeRow('拉伸 1');
  await shot('extrude');
  await closeDialog();

  // 4) 圆角对话框（选边+结果预览）
  await openTreeRow('圆角 1');
  await shot('fillet');
  await closeDialog();

  // 5) Sample Assignment：倒角 + 孔
  await page.goto(SAMPLE_ASSIGNMENT, { waitUntil: 'domcontentloaded' });
  await waitEditor();
  await shot('hero-sample-assignment');

  await openTreeRow('倒角 1');
  await shot('chamfer');
  await closeDialog();

  const holeTool = page.getByRole('button', { name: '孔', exact: true }).first();
  if (await holeTool.isVisible().catch(() => false)) {
    await holeTool.click();
    await page.waitForTimeout(1500);
    await shot('hole');
    await closeDialog();
  }

  // 6) 文档中心与新建对话框
  await page.goto('http://localhost:5300/documents', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await shot('documents');
  const create = page.getByTestId('document-sidebar').getByRole('button', { name: '创建', exact: true });
  await create.click();
  await page.getByRole('menuitem', { name: '新建文档' }).click();
  await page.waitForTimeout(800);
  await shot('create-document');
} finally {
  await browser.close();
}
