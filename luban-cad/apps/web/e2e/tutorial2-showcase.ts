/**
 * Tutorial 2 展示编排（2026-11-02）：新建并持久化「Tutorial 2 - Build a Part」
 * 项目/iModel；每步建模选用最合适的相机视口并驻留、截图；特征对话框实时预览
 * 断言。默认 **关闭**（T2_SHOWCASE=1 开启），不改变严格回归用例的相机轨迹。
 *
 * 相机口径：草图各阶段 Front 正对 + 局部取景（内容落在左侧草图面板之右），
 * 特征阶段 Iso 立体取景，圆角拾取沿用严格用例的 Right/Left 分面取景，收官
 * Iso/Front/Right 三视角展示。
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { B_MODEL_MARKER } from './fixtures';
import { assertBModelProject, ensureSeedProject, resetSeedImodel } from './seed';
import type { SeedImodelRef } from './seed';
import { setStandardView, type Vec3 } from './tutorial2-helpers';

export const TUTORIAL2_PROJECT_NAME = 'Tutorial 2 - Build a Part';
export const TUTORIAL2_IMODEL_NAME = 'Tutorial 2 - Build a Part';

/** 展示模式开关（环境变量，CLI 前置 `T2_SHOWCASE=1`）。 */
export function showcaseEnabled(): boolean {
  return process.env.T2_SHOWCASE === '1';
}

/**
 * 展示项目重置：按名确保 B 标记项目在场（首次运行即「新建项目」），只删/重建
 * 同名 iModel（保留项目本体与元数据）。幂等，重复演示不产生同名项目漂移。
 */
export async function resetTutorial2Project(
  request: APIRequestContext,
  accessToken: string,
): Promise<SeedImodelRef> {
  const itwinId = await ensureSeedProject(request, accessToken, TUTORIAL2_PROJECT_NAME, B_MODEL_MARKER);
  await assertBModelProject(request, accessToken, itwinId);
  const imodelId = await resetSeedImodel(request, accessToken, itwinId, TUTORIAL2_IMODEL_NAME);
  return { itwinId, imodelId };
}

export interface ShowcaseScene {
  viewId: number;
  low: Vec3;
  high: Vec3;
  label: string;
  holdMs?: number;
}

/** 相机场景（Front=4 / Iso=6；世界坐标米制）。 */
export const SCENES = {
  /** 整幅 T2 草图（Front 正对）：左侧留白避开草图面板，右侧留出尺寸标注
   *  与 ViewCube 间距（2026-11-02 标注落地后重钉；模型尽量居中）。 */
  sketchFull: {
    viewId: 4,
    low: { x: -125, y: -120, z: -40 },
    high: { x: 195, y: 120, z: 100 },
    label: '草图全貌',
    holdMs: 1200,
  },
  /** 中心矩形 + 原点定位（局部 x −41..41，z −9.5..9.5）。 */
  sketchBase: {
    viewId: 4,
    low: { x: -170, y: -120, z: -70 },
    high: { x: 90, y: 120, z: 80 },
    label: '中心矩形',
  },
  /** 右腿/小弧/喉线 + 紧随其后的第二矩形（世界 z −10..67，x 41..111）。 */
  sketchRight: {
    viewId: 4,
    low: { x: -100, y: -120, z: -60 },
    high: { x: 160, y: 120, z: 110 },
    label: '右腿-小弧-喉线',
  },
  /** 第二矩形及之后（偏移/轴线/样条均需可见：世界 z 9..67）。 */
  sketchRect2: {
    viewId: 4,
    low: { x: -120, y: -120, z: -20 },
    high: { x: 160, y: 120, z: 100 },
    label: '第二矩形',
  },
  /** 偏移链 + 轴线（x 22..102，世界 z 18..62）。 */
  sketchOffset: {
    viewId: 4,
    low: { x: -110, y: -120, z: -30 },
    high: { x: 160, y: 120, z: 100 },
    label: '偏移链-轴线',
  },
  /** 三维成品 Iso（与严格用例收官取景一致）。 */
  partIso: {
    viewId: 6,
    low: { x: -90, y: -90, z: -50 },
    high: { x: 180, y: 90, z: 100 },
    label: 'Iso 立体',
    holdMs: 1400,
  },
  /** 正视图（展示拱形轮廓/圆角）。 */
  partFront: {
    viewId: 4,
    low: { x: -120, y: -120, z: -70 },
    high: { x: 160, y: 120, z: 120 },
    label: '正视图',
    holdMs: 1200,
  },
  /** 右视图（展示拉伸厚度/圆角）。 */
  partRight: {
    viewId: 3,
    low: { x: -120, y: -110, z: -70 },
    high: { x: 120, y: 160, z: 120 },
    label: '右视图',
    holdMs: 1200,
  },
} satisfies Record<string, ShowcaseScene>;

let shotCounter = 0;

/**
 * 演示字幕（仅展示模式）：在页面注入一条固定定位的操作说明条，录屏/截图可见。
 * 纯测试注入，不是产品 UI；pointer-events:none 不挡任何真实操作。
 */
export async function showcaseCaption(page: Page, title: string, detail: string, holdMs = 650): Promise<void> {
  if (!showcaseEnabled()) return;
  await page.evaluate(({ title, detail }) => {
    let root = document.getElementById('t2-demo-caption');
    if (!root) {
      root = document.createElement('div');
      root.id = 't2-demo-caption';
      root.innerHTML = '<div class="t2-demo-caption__tag">Tutorial 2 · 鲁班CAD 真实 UI 演示</div>'
        + '<div class="t2-demo-caption__title"></div><div class="t2-demo-caption__detail"></div>';
      const style = document.createElement('style');
      style.textContent = `
        #t2-demo-caption{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:9999;
          pointer-events:none;width:min(760px,calc(100vw - 48px));padding:9px 16px 10px;
          border:1px solid rgba(255,255,255,.16);border-radius:8px;
          background:linear-gradient(180deg,rgba(20,26,33,.94),rgba(20,26,33,.86));
          color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.28);
          font:13px/1.45 "Segoe UI","Microsoft YaHei",sans-serif;}
        #t2-demo-caption .t2-demo-caption__tag{font-size:11px;opacity:.62;letter-spacing:.04em;margin-bottom:2px;}
        #t2-demo-caption .t2-demo-caption__title{font-size:16px;font-weight:700;margin-bottom:3px;}
        #t2-demo-caption .t2-demo-caption__detail{opacity:.92;white-space:pre-line;}
      `;
      document.head.appendChild(style);
      document.body.appendChild(root);
    }
    (root.querySelector('.t2-demo-caption__title') as HTMLElement).textContent = title;
    (root.querySelector('.t2-demo-caption__detail') as HTMLElement).textContent = detail;
  }, { title, detail });
  await page.waitForTimeout(holdMs);
}

/**
 * 无条件按场景范围取景（严格/展示模式共用的测试前置）。
 * 只用于特征面域拾取等需要确定性视口的步骤；草图绘制阶段仍保留原有相机，
 * 否则会把弧点推到 ViewCube 命中区（2026-11-04 X-14 复测实测）。
 */
export async function frameScene(page: Page, scene: ShowcaseScene): Promise<void> {
  await setStandardView(page, scene.viewId, { low: scene.low, high: scene.high });
}

/** 相机到场景 + 驻留 + 截图（仅展示模式）。 */
export async function showcaseScene(page: Page, scene: ShowcaseScene): Promise<void> {
  if (!showcaseEnabled()) return;
  await frameScene(page, scene);
  await page.waitForTimeout(scene.holdMs ?? 850);
  const index = String(++shotCounter).padStart(2, '0');
  await page.screenshot({ path: `test-results/t2-showcase-${index}-${scene.label}.png` });
}

/** 原地驻留 + 截图（预览/拾取等无相机变化的节点）。 */
export async function showcaseShot(page: Page, label: string, holdMs = 900): Promise<void> {
  if (!showcaseEnabled()) return;
  await page.waitForTimeout(holdMs);
  const index = String(++shotCounter).padStart(2, '0');
  await page.screenshot({ path: `test-results/t2-showcase-${index}-${label}.png` });
}

/** v1.21：后端影子求值几何（fillet）经 TileRpc 动态图形预览已就绪。 */
export async function expectDynamicPreview(page: Page, label: string): Promise<void> {
  if (!showcaseEnabled()) return;
  const preview = page.getByTestId('part-studio-feature-preview');
  await expect(preview, `${label} 应显示 TileRpc 动态结果预览`).toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
  await showcaseShot(page, `实时预览-${label}`, 1200);
}

/** 特征实时预览断言（extrude/revolve 对话框面）。 */
export async function expectLivePreview(page: Page, label: string): Promise<void> {
  if (!showcaseEnabled()) return;
  // 预览现在是 3D WorldDecoration（无屏幕 canvas）；观测标记带真实几何计数。
  const preview = page.getByTestId('part-studio-feature-preview');
  await expect(preview, `${label} 应显示实时预览`).toBeAttached({ timeout: 20_000 });
  const quads = Number((await preview.getAttribute('data-quads')) ?? '0');
  const fills = Number((await preview.getAttribute('data-fills')) ?? '0');
  const edges = Number((await preview.getAttribute('data-edges')) ?? '0');
  expect(quads, `${label} 预览侧面四边形数`).toBeGreaterThan(0);
  expect(fills, `${label} 橙色选中面域环数`).toBeGreaterThan(0);
  expect(edges, `${label} 橙色边界轮廓数`).toBeGreaterThan(0);
  await showcaseShot(page, `实时预览-${label}`, 1200);
}
