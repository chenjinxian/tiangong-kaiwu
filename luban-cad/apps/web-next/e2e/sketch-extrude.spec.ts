/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图→面域→拉伸全链冒烟（M6-a T8 收官；常驻回归）：
 * 会话注入进种子库编辑器 →「草图」钮 → SketchDialog 选上视 → ✓（insertSketch
 * 真 sketchId）→ 草图模式变身 → 线（2 点击）+ 3点弧（3 点击：起点吸线终点→
 * 终点吸线起点→弧上点外偏，闭环）→ 退出草图 →「拉伸」→ FeatureDialog 选草图
 * （单面域自动 regionIndex=0）→ ✓ 提交 → 特征树 2 节点 + 视口成体非空 →
 * 撤销回 1 节点 → 重做回 2 节点；全程零 console error。
 *
 * 实现要点（既有基建复用，禁凭记忆写选择器）：
 * - 导航/就绪：helpers.openSeedImodelEditor + waitEditorReady（WS 挂起 reload
 *   重试、连接失败两次重开、canvas 真实在场门——M4-T9 教训全在内）。
 * - 画图点击：canvas boundingBox 中心区固定屏幕位；线水平 ~300px；弧三点击=
 *   线终点像素→线起点像素→中点外挑 ~80px。**闭环由构造保证**：同会话内工具
 *   事件管道的像素→世界映射自洽，同一像素映回同一草图面点，弧端点精确落在线
 *   端点上（AccuSnap NearestKeypoint 吸附是锦上添花非依赖）。dataPoint 先近后
 *   目标两段移动+驻留，给 AccuSnap 运动定位算热捕捉的窗口。
 * - 不做视图旋转（T8 run6-8 实录裁决）：视图旋转后工具事件管道与渲染/worldToView
 *   视锥分叉（陈旧视锥+AccuDraw 轴锁），线会被画到取景外且位置不可预测——显示
 *   位置不进门禁，画图期零视图命令。
 * - tile 上屏观察：canvas 元素截图逐像素 diff（本文件内最小 PNG 解码，Node zlib；
 *   perf/visual 探针无现成采样法）。弧上屏=软观察（全画布差分如实记录）；唯一
 *   硬显示门=拉伸提交+适应视图（fit 把成体带进视野）后中心区成片新墨——元素
 *   截图走浏览器合成面，WebGL 内容与 DOM 覆盖层如实入图。
 * - 闭环真值=拉伸对话框 getSketch.regions（regions=0 → 「草图无可拉伸面域」+
 *   ✓ 恒禁用，chip 断言处红——失败即停，演示失败纪律；降级路径不写进常驻断言，
 *   按当轮现场改写并登记偏差）。
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { openSeedImodelEditor, waitEditorReady } from './helpers';

/** 留证目录（仓根 .superpowers/sdd/2026-10-23-tutorial2-sketch-chain/shots/）。 */
const SHOTS_DIR = resolve(
  process.cwd(),
  '../../../.superpowers/sdd/2026-10-23-tutorial2-sketch-chain/shots',
);

function shotPath(name: string): string {
  mkdirSync(SHOTS_DIR, { recursive: true });
  return resolve(SHOTS_DIR, name);
}

// ============================================================================
// canvas 逐像素采样（最小 PNG 解码——Playwright 截图=8bit RGB/RGBA 非隔行）
// ============================================================================

interface Snapshot {
  width: number;
  height: number;
  bpp: number;
  data: Uint8Array;
}

/** 最小 PNG 解码：仅支持 8bit 非隔行 truecolor（colorType 2/6）——Playwright
 * 元素截图形态；断言失败带形态说明，不静默猜。 */
function decodePng(buf: Buffer): Snapshot {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(signature)) {
    throw new Error('canvas 截图不是 PNG（元素截图应恒为 PNG）');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) {
    throw new Error(
      `不支持的 PNG 形态：bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`,
    );
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const data = new Uint8Array(height * stride);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read++];
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[read++];
      const left = x >= bpp ? data[y * stride + x - bpp] : 0;
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? data[(y - 1) * stride + x - bpp] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error(`未知 PNG 行过滤器 ${filter}`);
      }
      data[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, bpp, data };
}

/** 视口 canvas 元素截图 → 解码（浏览器合成面：WebGL 内容+叠加 DOM 如实入图）。 */
async function grabCanvas(page: Page): Promise<Snapshot> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  return decodePng(await canvas.screenshot());
}

/** 统计两快照在 CSS 像素矩形内的显著差异像素数（任一通道差 > threshold）。
 * 双快照同 viewport 同 DPR（同尺寸）；尺寸异常按比例映射并钳制边界。 */
function changedPixels(
  a: Snapshot,
  b: Snapshot,
  rect: { x0: number; y0: number; x1: number; y1: number },
  threshold = 24,
): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`canvas 快照尺寸不一致：${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const x0 = Math.max(0, Math.floor(rect.x0));
  const y0 = Math.max(0, Math.floor(rect.y0));
  const x1 = Math.min(a.width - 1, Math.ceil(rect.x1));
  const y1 = Math.min(a.height - 1, Math.ceil(rect.y1));
  let changed = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * a.width * a.bpp + x * a.bpp;
      for (let c = 0; c < 3; c++) {
        if (Math.abs(a.data[index + c] - b.data[index + c]) > threshold) {
          changed += 1;
          break;
        }
      }
    }
  }
  return changed;
}

/** 画布上一个数据点（data button）：两段移动（近→目标）+ 驻留——给 AccuSnap
 * 运动定位算热捕捉的窗口，再 data 按下/抬起 + 驻留给工具状态机消费。 */
async function dataPoint(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x - 28, y + 20);
  await page.waitForTimeout(120);
  await page.mouse.move(x, y);
  await page.waitForTimeout(450);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test('T8 冒烟：草图线+弧闭环 → 拉伸成体 → 撤销重做闭环', async ({ page }) => {
  // 导航（~90s 最坏）+ 就绪（~210s 最坏）+ 建模链 + tile 等待远超全局 120s。
  test.slow();

  // 全程 console error 收集（测试尾断言零；pageerror=未捕获异常一并入账）。
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await openSeedImodelEditor(page);
  await waitEditorReady(page);

  const featureCount = page.getByTestId('part-studio-feature-count');
  const featureList = page.getByTestId('part-studio-feature-list');

  // ── 1) 草图对话框：上视（Top=XY 面，屏幕点击映射最直接）→ ✓ 建草图 ──────
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(sketchDialog).toBeVisible();
  await sketchDialog.getByRole('combobox', { name: '草图平面' }).selectOption({ label: '上视' });
  await sketchDialog.getByRole('button', { name: '确认' }).click();

  // 提交窗（60s）：applyOp 链=写租约获取→insertSketch→saveChanges→onCommitted→
  // 树刷新；冷会话首笔含 RPC 通道/租约建立（FEATURE_OP_TIMEOUT_MS 15s + 陈旧
  // 租约 35s 自愈预算都在链上）。双通道等待（or）：成功=「退出草图」钮现身
  //（对话框随即卸载——勿用 aria-busy 消失判据，toHaveAttribute 会等元素存在，
  // 成功关闭反而超时）；拒收=对话框内 alert 现身（透出后端原文快速红）。
  await expect(
    page
      .getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' })
      .or(sketchDialog.getByTestId('part-studio-sketch-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
  // 拒收分辩用瞬时 count()（成功路径对话框已卸载，textContent 会等元素挂载干等到
  // 超时——T8 run5 实录 357s 假悬挂）。
  if ((await sketchDialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0) {
    throw new Error(
      `insertSketch 被后端拒收：${await sketchDialog.getByTestId('part-studio-sketch-dialog-error').textContent()}`,
    );
  }

  // 草图模式变身双证（结构断言先行）+ 特征树草图节点落位（insertSketch 提交链）
  const sketchToolbar = page.getByRole('toolbar', { name: '草图工具' });
  await expect(page.getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' })).toBeVisible({ timeout: 15_000 });
  const lineButton = sketchToolbar.getByRole('button', { name: '线', exact: true });
  const arcButton = sketchToolbar.getByRole('button', { name: '圆弧', exact: true });
  // 首笔 op 预算放宽（60s）：applyOp 链=写租约获取→insertSketch→saveChanges→
  // onCommitted→树刷新，冷会话首笔含 RPC 通道/租约建立（FEATURE_OP_TIMEOUT_MS
  // 15s + 陈旧租约 35s 自愈预算都在链上），5s 级断言会吃假红。
  await expect(sketchToolbar).toBeVisible({ timeout: 60_000 });
  await expect(lineButton).toBeVisible();
  await expect(arcButton).toBeVisible();
  await expect(featureCount).toHaveText('(1)', { timeout: 60_000 });
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible();

  // ── 2) 画线+画弧（屏幕位固定，不做视图旋转）──────────────────────────
  // 设计裁决（T8 run6-8 实录收敛）：工具事件管道的像素→世界映射在会话内自洽，
  // 但与 worldToView/渲染视锥会分叉（视图旋转后尤甚——陈旧视锥+AccuDraw 轴锁，
  // 线被画到取景外是假阴性）。故：不做任何视图旋转；线/弧点击全用画布中心区
  // 固定屏幕位；**弧端点点击=线端点完全相同的像素**——同一映射把同一像素映回
  // 同一平面点，闭环由构造保证（AccuSnap 吸附只是锦上添花）。闭环真值不依赖
  // 显示：拉伸对话框的 getSketch.regions 是唯一裁判；唯一硬显示门=拉伸提交后
  // 适应视图（fit 把成体带进视野）的中心区成墨断言。
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得（视口未挂载？）');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const pointA = { x: cx - 150, y: cy }; // 线起点（像素）
  const pointB = { x: cx + 150, y: cy }; // 线终点（像素）

  // 画线（2 点击）
  await lineButton.click();
  await expect(lineButton).toHaveAttribute('aria-pressed', 'true');
  await dataPoint(page, pointA.x, pointA.y);
  await dataPoint(page, pointB.x, pointB.y);
  await page.waitForTimeout(2_000); // 提交+tile 流送驻留

  // 基线②：线已提交态（弧的上墨差相对此基线）
  const afterLine = await grabCanvas(page);

  // 画弧（3 点击）：起点=线终点像素 → 终点=线起点像素（闭环焊接）→ 弧上点外偏
  await arcButton.click();
  await expect(arcButton).toHaveAttribute('aria-pressed', 'true');
  await dataPoint(page, pointB.x, pointB.y); // 弧起点
  await dataPoint(page, pointA.x, pointA.y); // 弧终点（闭环）
  await dataPoint(page, cx, cy - 80); // 弧上点：中点外挑 ~80px
  await page.waitForTimeout(2_000);

  // 弧上屏：软观察（tile 时序与显示位置都不进门禁——闭环真值归面域读回），
  // 全画布差分如实记录供报告。
  const fullRect = { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height };
  let arcPixels = 0;
  try {
    await expect
      .poll(async () => changedPixels(await grabCanvas(page), afterLine, fullRect), {
        timeout: 12_000,
        intervals: [500],
      })
      .toBeGreaterThan(60);
    arcPixels = changedPixels(await grabCanvas(page), afterLine, fullRect);
  } catch {
    arcPixels = 0;
  }
  console.log(`[t8] 弧上屏全画布差分像素=${arcPixels}（>60=弧段已渲染上屏；0=显示位置在取景外，不影响闭环）`);
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: shotPath('t8-1-sketch-loop.png') });

  // ── 5) 退出草图 → 拉伸对话框（草图通道）──────────────────────────────
  await page.getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' }).click();
  await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible();

  // 基线③：成体前的干净画布（拉伸对话框内联在画布上会入元素截图，须关框后取）
  const beforeSolid = await grabCanvas(page);

  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await expect(dialog).toBeVisible();

  // 草图通道：选草图 → 面域读回（getSketch.regions）。闭环成败在此亮牌——
  // regions=0 → 「草图无可拉伸面域」+ ✓ 恒禁用（断言超时红=吸附闭环失败，
  // 按纪律停在此处如实记录，不掩盖）。
  const sketchSelect = dialog.getByRole('combobox', { name: '草图' });
  await expect(sketchSelect).toBeVisible();
  await sketchSelect.selectOption({ label: '草图 1' });
  await expect(dialog.getByText('草图 1 的面', { exact: true })).toBeVisible({ timeout: 20_000 });
  // 面域数如实记录（单面域=无下拉；多面域=下拉选项数）
  const regionSelect = dialog.getByRole('combobox', { name: '面域' });
  const regionOptions = await regionSelect.locator('option').count();
  console.log(`[t8] 拉伸面域数=${regionOptions > 0 ? regionOptions : 1}（1=单面域自动 regionIndex=0）`);
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await page.screenshot({ path: shotPath('t8-2-extrude-dialog.png') });

  await dialog.getByRole('button', { name: '确认' }).click();
  // 提交窗（60s，insertFeature 含内核 Sweep）：双通道等待（or）——成功=树现
  // 「拉伸 1」行；拒收=对话框内 alert 现身（原文透出快速红）。（勿用 aria-busy
  // 消失判据——成功路径对话框卸载，toHaveAttribute 等元素存在会假超时。）
  await expect(
    featureList
      .getByRole('button', { name: '拉伸 1' })
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0) {
    throw new Error(
      `insertFeature 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`,
    );
  }
  await expect(featureCount).toHaveText('(2)', { timeout: 30_000 });
  await expect(featureList.getByRole('button', { name: '拉伸 1' })).toBeVisible();
  await expect(page.getByTestId('part-studio-undo-button')).toBeEnabled({ timeout: 15_000 });

  // ── 6) 成体视口：适应视图 → 中心区成片新墨（视口非空硬断言）──────────
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  const solidMenu = page.getByRole('menu', { name: '画布菜单' });
  await expect(solidMenu).toBeVisible();
  await solidMenu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(solidMenu).toBeHidden();
  const solidRegion = {
    x0: box.x + box.width * 0.2,
    y0: box.y + box.height * 0.2,
    x1: box.x + box.width * 0.8,
    y1: box.y + box.height * 0.8,
  };
  await expect
    .poll(async () => changedPixels(await grabCanvas(page), beforeSolid, solidRegion), {
      timeout: 45_000,
      intervals: [1_000],
      message: '拉伸提交+适应视图后 45s 内视口中心区未出现成片新墨（实体未上屏）',
    })
    .toBeGreaterThan(1_500);
  await page.screenshot({ path: shotPath('t8-3-solid.png') });

  // ── 7) 撤销 → 1 节点；重做 → 2 节点 ─────────────────────────────────
  await page.getByTestId('part-studio-undo-button').click();
  await expect(featureCount).toHaveText('(1)', { timeout: 30_000 });
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible();
  await expect(featureList.getByRole('button', { name: '拉伸 1' })).toHaveCount(0);

  await page.getByTestId('part-studio-redo-button').click();
  await expect(featureCount).toHaveText('(2)', { timeout: 30_000 });
  await expect(featureList.getByRole('button', { name: '拉伸 1' })).toBeVisible();
  await page.screenshot({ path: shotPath('t8-4-undo-redo.png') });

  // ── 8) 全程零 console error ─────────────────────────────────────────
  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});
