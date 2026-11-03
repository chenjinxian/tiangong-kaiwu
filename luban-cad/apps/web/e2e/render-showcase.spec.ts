/**
 * 完整 BRep 渲染演示（2026-11-03）：在已构建的 Tutorial 2 成品上演示
 * - 默认顶光/AO 后的 Shaded 外观与全部拓扑边线；
 * - 显示设置：BRep 边线叠加开关、顶点显示、AO 开关；
 * - 隐藏边可见（xray 全拓扑边）/ 半透明模式；
 * - 面/边/点三种拾取与高亮（画布右键菜单入口）。
 *
 * 运行（系统 Chrome，演示后保持打开）：
 *   T2_RENDER_SHOWCASE=1 T2_KEEP_OPEN=1 npx playwright test e2e/render-showcase.spec.ts \
 *     --config=playwright.demo.config.ts --project=chrome-demo
 *
 * 默认跳过，不进入常规 e2e 套件。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  apiFindDocumentByName,
  authHeaders,
  getApiToken,
  gotoRoute,
  loginWithSession,
  waitEditorReady,
} from './helpers';
import { setStandardView } from './tutorial2-helpers';
import { TUTORIAL2_IMODEL_NAME, TUTORIAL2_PROJECT_NAME } from './tutorial2-showcase';

const enabled = process.env.T2_RENDER_SHOWCASE === '1';

async function caption(page: Page, title: string, detail: string, holdMs = 1200): Promise<void> {
  await page.evaluate(({ title, detail }) => {
    let root = document.getElementById('brep-demo-caption');
    if (!root) {
      root = document.createElement('div');
      root.id = 'brep-demo-caption';
      root.innerHTML = '<div class="brep-demo-caption__tag">鲁班CAD · 完整 BRep 渲染演示</div>'
        + '<div class="brep-demo-caption__title"></div><div class="brep-demo-caption__detail"></div>';
      const style = document.createElement('style');
      style.textContent = `
        #brep-demo-caption{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:9999;
          pointer-events:none;width:min(780px,calc(100vw - 48px));padding:9px 16px 10px;
          border:1px solid rgba(255,255,255,.16);border-radius:8px;
          background:linear-gradient(180deg,rgba(20,26,33,.94),rgba(20,26,33,.86));
          color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.28);
          font:13px/1.45 "Segoe UI","Microsoft YaHei",sans-serif;}
        #brep-demo-caption .brep-demo-caption__tag{font-size:11px;opacity:.62;letter-spacing:.04em;margin-bottom:2px;}
        #brep-demo-caption .brep-demo-caption__title{font-size:16px;font-weight:700;margin-bottom:3px;}
        #brep-demo-caption .brep-demo-caption__detail{opacity:.92;white-space:pre-line;}
      `;
      document.head.appendChild(style);
      document.body.appendChild(root);
    }
    root.querySelector('.brep-demo-caption__title')!.textContent = title;
    root.querySelector('.brep-demo-caption__detail')!.textContent = detail;
  }, { title, detail });
  await page.waitForTimeout(holdMs);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/render-showcase/${name}.png` });
}

async function openTutorial2(page: Page, request: APIRequestContext): Promise<void> {
  const token = await getApiToken();
  const project = await apiFindDocumentByName(request, TUTORIAL2_PROJECT_NAME, token);
  if (!project)
    throw new Error(`找不到演示项目「${TUTORIAL2_PROJECT_NAME}」；请先跑一次 Tutorial 2 展示。`);
  const response = await request.get(`/imodels?iTwinId=${project.id}&$top=200`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), `iModel 列表查询失败：HTTP ${response.status()}`).toBeTruthy();
  const list = await response.json() as { iModels?: Array<{ id: string; displayName?: string; name?: string }> };
  const imodel = (list.iModels ?? []).find((row) =>
    (row.displayName ?? row.name) === TUTORIAL2_IMODEL_NAME);
  if (!imodel)
    throw new Error(`找不到演示 iModel「${TUTORIAL2_IMODEL_NAME}」；请先跑一次 Tutorial 2 展示。`);
  await loginWithSession(page);
  await gotoRoute(page, `/documents/${project.id}/${imodel.id}`, 'part-studio-page');
  await waitEditorReady(page);
  await page.waitForTimeout(8_000);
}

async function setIso(page: Page): Promise<void> {
  await setStandardView(page, 6, {
    low: { x: -90, y: -90, z: -50 },
    high: { x: 180, y: 90, z: 100 },
  });
  await page.waitForTimeout(1_200);
}

async function openDisplayPanel(page: Page): Promise<void> {
  await page.getByTestId('viewcube-menu-trigger').click();
  await page.getByTestId('viewcube-menu-graphics').click();
  await expect(page.getByTestId('part-studio-dock-body')).toBeVisible({ timeout: 15_000 });
}

async function closeDisplayPanel(page: Page): Promise<void> {
  await page.locator('#part-studio-dock-tab-display').click();
  await expect(page.getByTestId('part-studio-dock-body')).toHaveCount(0, { timeout: 10_000 });
}

async function chooseSelectionMode(
  page: Page,
  canvas: ReturnType<Page['locator']>,
  label: string,
  mode: 'body' | 'face' | 'edge' | 'vertex',
): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  try {
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55, { button: 'right' });
    const item = page.getByRole('menuitem', { name: label, exact: true });
    await expect(item).toBeVisible({ timeout: 3_000 });
    await item.click();
  } catch {
    // 演示稳定兜底：右键菜单被遮挡/语言差异时直接走同一 store 通道。
    await page.evaluate((next) => {
      (window as unknown as {
        __lubanE2EApp: { usePartStudioStore: { getState(): { setSelectionMode(mode: string): void } } };
      }).__lubanE2EApp.usePartStudioStore.getState().setSelectionMode(next);
    }, mode);
  }
  await expect.poll(async () => page.evaluate(() => (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.selectionMode), {
    timeout: 15_000,
  }).toBe(mode);
  if (mode === 'body')
    return;
  await expect.poll(async () => page.evaluate(() => {
    const tool = (window as unknown as {
      __lubanE2E?: { coreFrontend: { IModelApp: { toolAdmin: { activeTool?: { toolId?: string } } } } };
    }).__lubanE2E?.coreFrontend.IModelApp.toolAdmin.activeTool;
    return tool?.toolId;
  }), { timeout: 15_000 }).toBe('LubanCAD.SelectSubEntity');
}

async function projectedEdgePoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const cf = (window as unknown as {
      __lubanE2E?: { coreFrontend: any; coreCommon: any };
    }).__lubanE2E;
    if (!cf) throw new Error('E2E hook 缺失');
    const vp = cf.coreFrontend.IModelApp.viewManager.getFirstOpenView();
    const deco = cf.coreFrontend.IModelApp.viewManager.decorators
      .find((entry: { id?: string }) => entry.id === 'luban.brep-topology');
    const edge = deco?._topology?.edges?.[0];
    if (!edge) throw new Error('BRep 拓扑尚未就绪（无边）');
    const iterator = new cf.coreCommon.ElementGeometry.Iterator({ entryArray: [edge.entry] });
    for (const item of iterator) {
      const geometry = item.toGeometryQuery();
      if (geometry?.geometryCategory === 'curvePrimitive') {
        const view = vp.worldToView(geometry.startPoint());
        return { x: view.x, y: view.y };
      }
    }
    throw new Error('无法解析第一条拓扑边');
  });
}

async function projectedVertexPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const cf = (window as unknown as { __lubanE2E?: { coreFrontend: any } }).__lubanE2E;
    if (!cf) throw new Error('E2E hook 缺失');
    const vp = cf.coreFrontend.IModelApp.viewManager.getFirstOpenView();
    const deco = cf.coreFrontend.IModelApp.viewManager.decorators
      .find((entry: { id?: string }) => entry.id === 'luban.brep-topology');
    const vertex = deco?._topology?.vertices?.[0];
    if (!vertex) throw new Error('BRep 顶点尚未就绪');
    const view = vp.worldToView(vertex);
    return { x: view.x, y: view.y };
  });
}


/** 在面模式下扫描几个落在实体上的屏幕点，返回实际点亮的点（避开空白/边线热区）。 */
async function pickFaceAt(page: Page, box: { x: number; y: number; width: number; height: number }): Promise<{ x: number; y: number }> {
  const points: Array<[number, number]> = [
    [0.43, 0.60], [0.47, 0.62], [0.5, 0.65], [0.55, 0.60], [0.5, 0.55], [0.6, 0.62],
  ];
  for (const [fx, fy] of points) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(350);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(500);
    const selected = await page.evaluate(() => (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.selection);
    if (selected.some((entry: { kind: string }) => entry.kind === 'face'))
      return { x: box.x + box.width * fx, y: box.y + box.height * fy };
  }
  throw new Error('面拾取未命中：扫描点均未选中实体面');
}

test.describe('完整 BRep 渲染演示', () => {
  test.skip(!enabled, 'T2_RENDER_SHOWCASE=1 才运行（不进入常规 e2e）');

  test('默认外观 / 显示设置 / 显示模式 / 面边点拾取', async ({ page, request }) => {
    const keepOpen = process.env.T2_KEEP_OPEN === '1';
    test.setTimeout(keepOpen ? 0 : 600_000);
    await openTutorial2(page, request);
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');

    await setIso(page);
    await expect.poll(() => page.evaluate(() => {
      const deco = (window as unknown as {
        __lubanE2E?: { coreFrontend: any };
      }).__lubanE2E?.coreFrontend.IModelApp.viewManager.decorators
        .find((entry: { id?: string }) => entry.id === 'luban.brep-topology');
      return deco?._topology?.edges?.length ?? 0;
    }), { timeout: 30_000 }).toBeGreaterThan(0);

    console.log('[render-showcase] default');
    await caption(page, '默认 Shaded｜顶光 + AO + 全部拓扑边',
      '面片使用 Onshape 式顶光（顶面亮、侧面暗）；深灰边来自完整 BRep 拓扑，\n圆角与相邻面的切线边不再缺失。');
    await shot(page, '01-default-shaded');

    // ── 显示设置：BRep 边线 / 顶点 / AO ───────────────────────────────
    console.log('[render-showcase] display panel');
    await openDisplayPanel(page);
    await caption(page, '显示设置｜BRep 拓扑边线开关',
      '右停靠面板新增「显示全部 BRep 边线」。先关闭它，观察 native tile 只保留折角/轮廓边。', 900);
    await page.getByTestId('part-studio-display-settings-brep-edges').click();
    await page.waitForTimeout(700);
    await shot(page, '02-native-edges-only');
    await caption(page, '重新打开｜全部拓扑边',
      '再次打开后，圆角/切线等光滑拓扑边补回——模型边线完整且仍受深度遮挡。', 900);
    await page.getByTestId('part-studio-display-settings-brep-edges').click();
    await page.waitForTimeout(700);
    await shot(page, '03-all-brep-edges');

    await caption(page, '显示设置｜BRep 顶点',
      '开启「显示 BRep 顶点」：全部拓扑顶点以屏幕小点显示；点选择模式会自动打开。', 900);
    await page.getByTestId('part-studio-display-settings-brep-vertices').click();
    await page.waitForTimeout(700);
    await shot(page, '04-brep-vertices');
    await page.getByTestId('part-studio-display-settings-brep-vertices').click();

    await caption(page, '渲染对比｜AO 关闭',
      'AO 只收缝隙；默认强度已从 2.0 调回 iTwin 默认 1.0，不再把整体压暗。', 900);
    await page.getByTestId('part-studio-display-settings-ao').click();
    await page.waitForTimeout(700);
    await shot(page, '05-ao-off');
    await page.getByTestId('part-studio-display-settings-ao').click();
    await page.waitForTimeout(500);
    await closeDisplayPanel(page);

    console.log('[render-showcase] display modes');
    // ── 显示模式：隐藏边可见（全拓扑 xray）/ 半透明 ───────────────────
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-hidden').click();
    await page.getByTestId('viewcube-mode-hidden-visible').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await caption(page, '显示模式｜隐藏边可见（Wireframe）',
      '拓扑叠加切换为 x-ray：全部 BRep 边（含被实体遮住的边）都可读，便于检查拓扑。');
    await shot(page, '06-hidden-visible');
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-shaded').click();
    await page.getByTestId('viewcube-mode-translucent').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await caption(page, '显示模式｜半透明',
      '半透明模式下的全拓扑 x-ray 边线：面与内部边同时可见。');
    await shot(page, '07-translucent');
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-shaded').click();
    await page.getByTestId('viewcube-mode-shaded').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);

    console.log('[render-showcase] picking');
    // ── 面/边/点拾取 ─────────────────────────────────────────────────
    await caption(page, '拾取演示｜选择边',
      '画布右键 →「选择边」；悬停高亮后单击，显示蓝色选中边（与圆角橙色选边同一基座）。', 900);
    await chooseSelectionMode(page, canvas, '选择边', 'edge');
    const edge = await projectedEdgePoint(page);
    await page.mouse.move(box.x + edge.x, box.y + edge.y);
    await page.waitForTimeout(700);
    await shot(page, '08-edge-hover');
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(700);
    await shot(page, '09-edge-selected');
    expect((await page.evaluate(() => (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.selection))
      .some((entry: { kind: string }) => entry.kind === 'edge')).toBe(true);

    await caption(page, '拾取演示｜选择面',
      '右键 →「选择面」；点击实体面，蓝色半透明面高亮。', 900);
    await chooseSelectionMode(page, canvas, '选择面', 'face');
    const facePoint = await pickFaceAt(page, box);
    await page.mouse.move(facePoint.x, facePoint.y);
    await page.waitForTimeout(500);
    await shot(page, '10-face-selected');
    expect((await page.evaluate(() => (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.selection))
      .some((entry: { kind: string }) => entry.kind === 'face')).toBe(true);

    await caption(page, '拾取演示｜选择点',
      '右键 →「选择点」；点选择模式显示全部顶点小点，悬停/单击以蓝色点高亮。', 900);
    await chooseSelectionMode(page, canvas, '选择点', 'vertex');
    const vertex = await projectedVertexPoint(page);
    await page.mouse.move(box.x + vertex.x, box.y + vertex.y);
    await page.waitForTimeout(700);
    await shot(page, '11-vertex-hover');
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(700);
    await shot(page, '12-vertex-selected');
    expect((await page.evaluate(() => (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.selection))
      .some((entry: { kind: string }) => entry.kind === 'vertex')).toBe(true);

    // 收尾：回到实体选择，便于用户自行操作。
    console.log('[render-showcase] complete');
    await chooseSelectionMode(page, canvas, '选择零件', 'body');
    await setIso(page);
    await caption(page, '演示完成｜可自行操作',
      '右键画布可切换面/边/点选择；右侧显示设置可开关 BRep 边线/顶点、AO、显示模式。\n'
      + '浏览器保持打开，不自动关闭。', 1_500);
    await shot(page, '13-final');
    if (keepOpen)
      await page.waitForTimeout(6 * 60 * 60 * 1000);
  });
});
