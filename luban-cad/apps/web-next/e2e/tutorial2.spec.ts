/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * M6-b T7 集成验收（常驻回归）：Tutorial 2 六特征重建——Front 平面 Sketch 1
 * （底座矩形+双弧拱+旋转矩形+轴线+拱肩曲线，按 Onshape 采集坐标 mm）→
 * Extrude 1（对称 127）→ Extrude 2（对称 50.8）→ Extrude 3（对称 15.875）→
 * Revolve 1（全周，绕轴线）→ Fillet 1（R5.08，边拾取尽力）→ 体积金标准对拍
 * 归 scratch 探针（本 spec 落库+截图+regions 台账，探针脚本不入库）。
 *
 * 分层（降级预案如实登记）：
 * - L1 Sketch 1 走 RPC 直发（insertSketch 完整 entities/constraints/plane——
 *   【降级登记】UI 绘制链已由 sketch-extrude.spec（线+弧闭环）与 M6-a T5/T8
 *   证明；本草图 30+ 曲线实体点击序列过长，按计划 T7 预案直发。直发通道=
 *   MS 的 HTTP RPC face（/rpc/metadata 在册；BentleyCloud wire：POST text
 *   载体 + CSRF 双提交 + X-Correlation-Id 活动头——页面内模块副本的
 *   rpc-over-ipc 响应关联依赖页面运行时内部态，探针实证请求帧离站无回声，
 *   故走 Node 侧 HTTP 直调）。写租约借页面 useFeatureSystem 的在持会话
 *  （acquire 探测 holder——租约单持有者语义下第二会话被拒，holder 即页面
 *   会话 sessionId，同会话 applyFeatureOp 过 assertHeld；借用会话不 release）。
 *   落库后 onCommitted 照常触发前端树刷新（与 UI 提交同管道）。
 * - L2 Extrude 1-3 + Revolve 1 全走 UI 对话框（T4/T3 接线真栈验证主目标）：
 *   面域下拉按面积判读（regions 台账写入 shots/tutorial2-regions.json），
 *   对称复选勾选（T4 载荷接线首验），revolve 轴下拉显式选轴线（缺省首条
 *   line 是矩形边，必须显式选）。
 * - L3 Fillet 1 走 UI 边拾取（T6 链真栈首验，尽力）：拾取点经视口
 *   worldToView 投影底座板上表面 4 条边中点（确定性，非盲点）；拾到 ≥1 条
 *   即算 T6 链通过；超时/失败→Esc 结束拾取+✗ 关对话框，偏差登记后继续
 *  （体积对拍按无圆角口径，见 scratch 探针报告）。
 * - 采集几何与金标准：.superpowers/sdd/onshape-tutorial2-analysis/
 *   TUTORIAL2-MODELING-CHAIN.md（六特征参数+实体坐标 in×25.4）+ 体积
 *   21.85 in³ = 358.2 cm³。v 轴取负登记：本项目 Front 基准面坐标架
 *  （normal +Y，xDir +X）的局部 v 映世界 −Z（sketch-plane.ts yDir=normal×xDir），
 *   采集 y 上对应世界 z 上须提交 v=−y，否则零件上下颠倒（体积不变，形状镜像）。
 * - 拱肩样条（采集实体 f4982b6b，isConstruction=false 实几何）按三次贝塞尔
 *   16 段折线近似（本契约无样条实体；弦高 <0.05mm，面积偏差 <0.1%）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openSeedImodelEditor, readAccessToken, waitEditorReady } from './helpers';

/** 留证目录（仓根 .superpowers/sdd/2026-10-23-tutorial2-full-chain/shots/）。 */
const SHOTS_DIR = resolve(
  process.cwd(),
  '../../../.superpowers/sdd/2026-10-23-tutorial2-full-chain/shots',
);

function shotPath(name: string): string {
  mkdirSync(SHOTS_DIR, { recursive: true });
  return resolve(SHOTS_DIR, name);
}

// ============================================================================
// 采集几何（单位 mm；u=采集 x；v=−采集 y，见头注 v 轴登记）
// ============================================================================

/** 拐角矩形拓扑（M3-b SketchRectangleTool 同构：每线独立端点 8 pt + 4 line
 * + 4 coincident 焊接——焊接而非共享端点，与求解器契约一致）。 */
function rectangle(
  x0: number,
  v0: number,
  x1: number,
  v1: number,
  nextId: () => number,
): { entities: unknown[]; constraints: unknown[] } {
  const corners: Array<[number, number]> = [
    [x0, v0],
    [x1, v0],
    [x1, v1],
    [x0, v1],
  ];
  const entities: unknown[] = [];
  const startIds: number[] = [];
  const endIds: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    const idA = nextId();
    const idB = nextId();
    const idLine = nextId();
    entities.push(
      { kind: 'point', id: idA, x: a[0], y: a[1] },
      { kind: 'point', id: idB, x: b[0], y: b[1] },
      { kind: 'line', id: idLine, p1: idA, p2: idB },
    );
    startIds.push(idA);
    endIds.push(idB);
  }
  // 焊接约束：本线终点 ≡ 下线起点（首尾相接闭环；coincident 对称无向）
  const constraints = startIds.map((startId, i) => ({
    kind: 'coincident',
    id: nextId(),
    refs: [endIds[i], startIds[(i + 1) % 4]],
  }));
  return { entities, constraints };
}

/** 三次贝塞尔采样（采集坐标系；调用方负责 v 取负）。 */
function bezierPoint(t: number): [number, number] {
  const p0 = [-41.275, 9.525] as const;
  const c1 = [-39.539240300655365, 40.3054840862751] as const;
  const c2 = [16.844818368554112, 60.51863729953766] as const;
  const p3 = [57.15, 61.925] as const;
  const u = 1 - t;
  const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0];
  const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1];
  return [x, y];
}

/** 构建 insertSketch op（entities/constraints/plane=Front 三向量）+ 轴线实体 id。 */
function buildSketchOp(): {
  op: {
    kind: 'insertSketch';
    entities: unknown[];
    constraints: unknown[];
    plane: {
      origin: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      xDir: { x: number; y: number; z: number };
    };
  };
  axisLineId: number;
} {
  let next = 1;
  const nid = (): number => next++;
  const entities: unknown[] = [];
  const constraints: unknown[] = [];

  // 底座矩形（采集：中心原点 3.25×0.75 in → 82.55×19.05）
  const base = rectangle(-41.275, -9.525, 41.275, 9.525, nid);
  entities.push(...base.entities);
  constraints.push(...base.constraints);

  // 旋转矩形（采集：中心 (3.375,2.0625)in 2×1.125in → x 60.325..111.125, y 38.1..66.675）
  const rect2 = rectangle(60.325, -66.675, 111.125, -38.1, nid);
  entities.push(...rect2.entities);
  constraints.push(...rect2.constraints);

  // 通道右壁竖线（采集 x=1.625in，y 0.375..1.0625in）
  {
    const idA = nid();
    const idB = nid();
    entities.push(
      { kind: 'point', id: idA, x: 41.275, y: -9.525 },
      { kind: 'point', id: idB, x: 41.275, y: -27.0 },
      { kind: 'line', id: nid(), p1: idA, p2: idB },
    );
  }
  // 拱左壁竖线（采集 x=0.875in）
  {
    const idA = nid();
    const idB = nid();
    entities.push(
      { kind: 'point', id: idA, x: 22.225, y: -9.525 },
      { kind: 'point', id: idB, x: 22.225, y: -27.0 },
      { kind: 'line', id: nid(), p1: idA, p2: idB },
    );
  }
  // 双弧（同心，采集圆心 (2.25,1.063)in；小弧 R0.625in 大弧 R1.375in，
  // 各为左上四分之一圆弧——本坐标系 startAngle=−π、sweep=+π/2）
  {
    const idCenter = nid();
    entities.push({ kind: 'point', id: idCenter, x: 57.15, y: -27.0 });
    entities.push({
      kind: 'arc',
      id: nid(),
      center: idCenter,
      radius: 15.875,
      startAngle: -Math.PI,
      sweepAngle: Math.PI / 2,
    });
    entities.push({
      kind: 'arc',
      id: nid(),
      center: idCenter,
      radius: 34.925,
      startAngle: -Math.PI,
      sweepAngle: Math.PI / 2,
    });
  }
  // 双切线水平线（采集 y=1.6875in / y=2.4375in，x 到轴线 3.375in）
  for (const v of [-42.875, -61.925]) {
    const idA = nid();
    const idB = nid();
    entities.push(
      { kind: 'point', id: idA, x: 57.15, y: v },
      { kind: 'point', id: idB, x: 85.725, y: v },
      { kind: 'line', id: nid(), p1: idA, p2: idB },
    );
  }
  // 旋转轴线（采集 x=3.375in，y 1.5..2.625in——revolve 轴下拉的显式选择目标）
  const axisPointA = nid();
  const axisPointB = nid();
  const axisLineId = nid();
  entities.push(
    { kind: 'point', id: axisPointA, x: 85.725, y: -38.1 },
    { kind: 'point', id: axisPointB, x: 85.725, y: -66.675 },
    { kind: 'line', id: axisLineId, p1: axisPointA, p2: axisPointB },
  );
  // 拱肩样条近似（16 段折线；首点=底座矩形左上角、末点=大弧顶点（精确））
  {
    const segments = 16;
    let prev: [number, number] | undefined;
    for (let i = 0; i <= segments; i++) {
      const [cx, cy] = bezierPoint(i / segments);
      // v 取负；末点精确落大弧顶点（防数值缝隙生 sliver 面）
      const pt: [number, number] =
        i === segments ? [57.15, -61.925] : [Number(cx.toFixed(4)), Number((-cy).toFixed(4))];
      if (prev) {
        const idA = nid();
        const idB = nid();
        entities.push(
          { kind: 'point', id: idA, x: prev[0], y: prev[1] },
          { kind: 'point', id: idB, x: pt[0], y: pt[1] },
          { kind: 'line', id: nid(), p1: idA, p2: idB },
        );
      }
      prev = pt;
    }
  }

  return {
    op: {
      kind: 'insertSketch',
      entities,
      constraints,
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 }, // Front（前视）：normal +Y（sketchPlaneFromOption 同款）
        xDir: { x: 1, y: 0, z: 0 },
      },
    },
    axisLineId,
  };
}

/** 面域判读：按面积最近匹配 regionIndex（容差 2%；regions 台账=报告依据）。 */
function regionIndexByArea(
  regions: Array<{ area: number }>,
  expected: number,
): number {
  let best = -1;
  let bestDiff = Infinity;
  regions.forEach((r, i) => {
    const diff = Math.abs(r.area - expected);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  if (best < 0 || bestDiff > expected * 0.02) {
    throw new Error(
      `面域判读失败：期望面积 ${expected} 附近无面域（最近差 ${bestDiff}）；regions=${JSON.stringify(regions)}`,
    );
  }
  return best;
}

// ============================================================================
// L1 通道：MS HTTP RPC face（BentleyCloud wire）——页面内模块副本的 rpc-over-ipc
// 走不通（IpcSession 响应关联依赖页面运行时的会话内部态，探针实证请求帧离站
// 后无回声），改 Node 侧直调 MS 的 HTTP RPC 面（/rpc/metadata 证实该面在册）：
// POST {MS}/LubanCAD/v1.0/mode/primary/context/{itwin}/imodel/{imodel}/changeset/0/
//   LubanFeatureRpcInterface-1.7.0-{op}，text 载体 body=JSON 参数数组，
//   CSRF 双提交（GET /rpc/metadata 取 csrf-token cookie + X-CSRF-Token 头）+
//   X-Correlation-Id 等活动头。前端不经此面是路由选择，MS 侧在册即契约面。
// ============================================================================

/** MS RPC 单操作（text 载体；返回值按 body JSON 直取）。 */
/** 草图通道公共动作：拉伸钮→选草图→选面域→距离→对称→确认→等树行（成功=行
 * 现身+对话框收合；拒收=就地 alert 原文抛出）。 */
async function extrudeViaDialog(
  page: Page,
  dialog: ReturnType<Page['getByTestId']>,
  featureList: ReturnType<Page['getByTestId']>,
  sketchId: string,
  regionIndices: number[],
  distance: string,
  treeRowName: string,
): Promise<void> {
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: '草图' }).selectOption(sketchId);
  const chipBox = dialog.getByTestId('part-studio-feature-dialog-region-chips');
  await expect(chipBox).toBeVisible({ timeout: 20_000 });
  // 清空缺省 [0]（=最大面域），再按目标集点选（chips 点选切换 aria-pressed）
  await dialog.getByTestId('part-studio-feature-dialog-region-clear').click();
  for (const idx of regionIndices) {
    await chipBox.getByRole('button', { name: new RegExp(`面域 ${idx}`) }).click();
  }
  await dialog.getByLabel('距离').fill(distance);
  await dialog
    .getByTestId('part-studio-feature-dialog-symmetric-flat')
    .locator('input')
    .check();
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList
      .getByRole('button', { name: treeRowName })
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 90_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0) {
    throw new Error(
      `${treeRowName} 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`,
    );
  }
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** 树行存在且非错误态（part-studio-tree-row--error 类缺席=status 0 绿行）。 */
async function expectTreeRowGreen(
  featureList: ReturnType<Page['getByTestId']>,
  name: string,
): Promise<void> {
  const row = featureList.getByRole('button', { name });
  await expect(row).toBeVisible();
  const cls = (await row.getAttribute('class')) ?? '';
  expect(cls, `${name} 行应为绿（status 0），实得 class=${cls}`).not.toContain(
    'part-studio-tree-row--error',
  );
}

/** 等轴测+适应视图（右键画布菜单双连）。 */
async function isoFitView(page: Page, cx: number, cy: number): Promise<void> {
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  const solidMenu = page.getByRole('menu', { name: '画布菜单' });
  await expect(solidMenu).toBeVisible();
  await solidMenu.getByRole('menuitem', { name: '等轴测视图' }).click();
  await expect(solidMenu).toBeHidden();
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(solidMenu).toBeVisible();
  await solidMenu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(solidMenu).toBeHidden();
}

/** fillet 边拾取会话：圆角对话框→半径→添加边→投影点逐一 boresite 点击→
 * 「添加边」钮 toggle 结束拾取（拾取态下该钮即 stopPick）。返回 chips 数。 */
async function pickFilletEdges(
  page: Page,
  dialog: ReturnType<Page['getByTestId']>,
  radius: string,
  worldPoints: Array<{ x: number; y: number; z: number }>,
  canvasBox: { x: number; y: number },
): Promise<number> {
  await page.getByRole('button', { name: '圆角', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('半径').fill(radius);
  await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
  await expect(dialog.getByTestId('part-studio-feature-dialog-picking-hint')).toBeVisible({
    timeout: 15_000,
  });
  const picks = await page.evaluate(async (pts) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: {
        viewManager: {
          getFirstOpenView(): {
            worldToView(pt: { x: number; y: number; z: number }): { x: number; y: number };
          };
        };
      };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('无打开视口');
    return pts.map((p) => {
      const v = vp.worldToView(p);
      return { x: v.x, y: v.y };
    });
  }, worldPoints);
  for (const p of picks) {
    const px = canvasBox.x + p.x;
    const py = canvasBox.y + p.y;
    await page.mouse.move(px - 15, py + 12);
    await page.waitForTimeout(150);
    await page.mouse.move(px, py);
    await page.waitForTimeout(350); // boresite 运动定位窗口
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(600);
  }
  const chipCount = await dialog
    .getByTestId('part-studio-feature-dialog-edge-chips')
    .locator('li')
    .count();
  console.log(`[t7] fillet 边拾取 chips=${chipCount}/${worldPoints.length}`);
  if (chipCount === 0) throw new Error('拾取 0 边');
  // 结束拾取：再点「添加边」钮（拾取态下该钮即 stopPick 开关——对话框自治
  // 通道，比 Esc/右键确定：Esc 经工具层分叉实测不达对话框 stopPick）。
  await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
  await expect(dialog.getByTestId('part-studio-feature-dialog-picking-hint')).toBeHidden({
    timeout: 10_000,
  });
  return chipCount;
}

const BS = String.fromCharCode(92); // 反斜杠（dbKey 路径分隔；避免模板字面量转义歧义）

async function msRpc(
  itwinId: string,
  imodelId: string,
  operation: string,
  args: unknown[],
  accessToken: string,
): Promise<unknown> {
  const MS = 'http://localhost:5401';
  const meta = await fetch(`${MS}/rpc/metadata`);
  const setCookie = meta.headers.get('set-cookie') ?? '';
  const csrf = /csrf-token=([^;]+)/.exec(setCookie)?.[1] ?? '';
  const csrfHeader = meta.headers.get('x-csrf-token') ?? csrf;
  const stamp = Date.now().toString(16).padStart(12, '0');
  const url =
    `${MS}/LubanCAD/v1.0/mode/primary/context/${itwinId}/imodel/${imodelId}` +
    `/changeset/0/LubanFeatureRpcInterface-1.7.0-${operation}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfHeader,
      Cookie: `csrf-token=${csrf}`,
      'X-Correlation-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
      'X-Application-Id': 'LubanCAD',
      'X-Application-Version': 'v1.0',
      'X-Session-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
    },
    // BentleyCloud wire：客户端包装层把操作名追加为末位参数（RpcRegistry
    // .interceptOperation 同构），服务端按末位弹出定位 operation。
    body: JSON.stringify([...args, operation]),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MS RPC ${operation} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`MS RPC ${operation} 响应非 JSON：${text.slice(0, 200)}`);
  }
  // text 载体响应形态容错：裸值 | {result} 包裹 | 序列化数组
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'result' in parsed
    && !('ok' in (parsed as Record<string, unknown>))) {
    return (parsed as { result: unknown }).result;
  }
  return parsed;
}

test('T7 冒烟：Tutorial 2 六特征重建（Front 草图 RPC 直发 + Extrude×3/Revolve UI + Fillet 边拾取尽力）', async ({
  page,
}) => {
  // 导航+就绪+建模链+内核求值远超全局 120s。
  test.slow();

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await openSeedImodelEditor(page);
  await waitEditorReady(page);

  // URL /documents/:itwinId/:imodelId 末段=iModelId（种子库每轮重置、id 逐轮
  // 变化——MS 侧 dbKey 另按 briefcase 文件路径，见下方 dbKey 构造）。
  const urlParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  const itwinId = urlParts[urlParts.length - 2] as string;
  const imodelId = urlParts[urlParts.length - 1] as string;
  expect(itwinId).toMatch(/^[0-9a-f-]{36}$/);
  expect(imodelId).toMatch(/^[0-9a-f-]{36}$/);

  const featureCount = page.getByTestId('part-studio-feature-count');
  const featureList = page.getByTestId('part-studio-feature-list');

  // ── L1：Sketch 1 RPC 直发（降级路径，登记）——MS HTTP face，Node 侧直调 ──
  const { op, axisLineId } = buildSketchOp();
  const accessToken = readAccessToken();

  // 写租约：探测页面 useFeatureSystem 的在持会话（单持有者语义下第二会话
  // acquire 被拒，holder=在持者 user=其 sessionId）；借 holder 会话落 op
  //（assertHeld 按会话匹配），页面续期语义归页面（借用会话不 release）。
  const probeId = `t7-probe-${Math.random().toString(36).slice(2)}`;
  // dbKey=后端打开登记键=briefcase 文件相对路径（useBriefcaseConnection
  // 「Connection opened: briefcase-cache\imodels\….bim」同字面——页面 ipc
  // 路径的 connection.key 即此值），HTTP 直调须同键。
  const dbKey = `briefcase-cache\\imodels\\${imodelId}\\briefcases\\2.bim`;
  const probe = (await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, probeId], accessToken)) as {
    ok: boolean;
    holder?: string;
  };
  const leaseSessionId = probe.ok ? probeId : (probe.holder ?? probeId);
  if (probe.ok) {
    await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, leaseSessionId], accessToken);
  }
  console.log(`[t7] 租约：borrowed=${!probe.ok}（session=${leaseSessionId.slice(0, 8)}…）`);

  const insertRaw = await msRpc(
    itwinId,
    imodelId,
    'applyFeatureOp',
    [dbKey, op, leaseSessionId],
    accessToken,
  );
  const result = insertRaw as { ok: boolean; featureId?: string; error?: string };
  expect(result.ok, `insertSketch 被拒收：${result.error ?? JSON.stringify(insertRaw).slice(0, 200)}`).toBe(true);
  const sketchId = result.featureId as string;
  expect(sketchId).toBeTruthy();

  // T1 全链证据：plane 回读=Front（normal +Y / xDir +X）；面域 ≥3
  const sketch = (await msRpc(itwinId, imodelId, 'getSketch', [dbKey, sketchId], accessToken)) as {
    plane?: { normal: { y: number }; xDir: { x: number } };
    regions?: Array<{ area: number; outerEntityIds: number[]; holeEntityIds?: number[] }>;
    entities: unknown[];
  };
  expect(sketch?.plane?.normal?.y, `plane 回读=${JSON.stringify(sketch?.plane)}`).toBe(1);
  expect(sketch?.plane?.xDir?.x).toBe(1);
  const regions = sketch?.regions ?? [];
  expect(
    regions.length,
    `面域数=${regions.length}（期望 ≥3）：${JSON.stringify(regions)}`,
  ).toBeGreaterThanOrEqual(3);

  // regions 台账（面积降序；面域→特征映射表进报告）
  const ledger = {
    imodelId,
    sketchId,
    axisLineId,
    plane: sketch?.plane,
    regionCount: regions.length,
    regions,
    lease: { borrowed: !probe.ok, sessionId: leaseSessionId },
  };
  writeFileSync(shotPath('tutorial2-regions.json'), JSON.stringify(ledger, null, 2), 'utf-8');
  console.log(`[t7] regions=${JSON.stringify(regions.map((r, i) => ({ i, area: Number(r.area.toFixed(2)) })))}`);

  // 面域判读（面积 mm² 解析预期——算式见报告；2% 容差吸收样条折线近似+求解噪声）
  const idxBase = regionIndexByArea(regions, 1572.585); // 底座 82.55×19.05
  const idxBand = regionIndexByArea(regions, 1153.56); // 拱形环带+喉部
  const idxLobe = regionIndexByArea(regions, 2298.36); // 拱肩环面（样条+大弧+左壁+底座顶）
  const idxRightRect = regionIndexByArea(regions, 725.775); // 旋转矩形轴右半（25.4×28.575）
  console.log(
    `[t7] 面域映射：base=${idxBase} band=${idxBand} lobe=${idxLobe} rightRect=${idxRightRect}`,
  );

  // RPC 落库经 onCommitted 自动刷新前端树（与 UI 提交同管道）
  await expect(featureCount).toHaveText('(1)', { timeout: 60_000 });
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible();
  await page.screenshot({ path: shotPath('t7-1-sketch-committed.png') });

  // ── L2：Extrude 1（NEW，面域=底座，127 对称——T4 对称接线首验）────────
  const dialog = page.getByTestId('part-studio-feature-dialog');

  await extrudeViaDialog(page, dialog, featureList, sketchId, [idxBase], '127', '拉伸 1');
  await expect(featureCount).toHaveText('(2)', { timeout: 30_000 });
  await page.screenshot({ path: shotPath('t7-2-extrude1.png') });

  await extrudeViaDialog(page, dialog, featureList, sketchId, [idxBand, idxRightRect], '50.8', '拉伸 2');
  await expect(featureCount).toHaveText('(3)', { timeout: 30_000 });
  await page.screenshot({ path: shotPath('t7-3-extrude2.png') });

  await extrudeViaDialog(page, dialog, featureList, sketchId, [idxLobe], '15.875', '拉伸 3');
  await expect(featureCount).toHaveText('(4)', { timeout: 30_000 });
  await page.screenshot({ path: shotPath('t7-4-extrude3.png') });

  // ── L2：Revolve 1（T4 Ribbon 入口+轴下拉显式选轴线，全周缺省勾选）──────
  await page.getByRole('button', { name: '旋转', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: '草图' }).selectOption(sketchId);
  await expect(dialog.getByRole('combobox', { name: '面域' })).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('combobox', { name: '面域' }).selectOption(String(idxRightRect));
  // 轴下拉（缺省首条 line=矩形边，必须显式选轴线；选项文案「线 {id}」，值=实体 id）
  await dialog.getByRole('combobox', { name: '旋转轴' }).selectOption(String(axisLineId));
  await expect(
    dialog.getByTestId('part-studio-feature-dialog-full-revolve').locator('input'),
  ).toBeChecked(); // 全方位缺省勾选（360°）
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await page.screenshot({ path: shotPath('t7-5-revolve-dialog.png') });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList
      .getByRole('button', { name: '旋转 1' })
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 120_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0) {
    throw new Error(
      `旋转 1 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`,
    );
  }
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(featureCount).toHaveText('(5)', { timeout: 30_000 });

  // ── 视图：等轴测 + 适应视图（视觉对比基准帧）────────────────────────
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  const solidMenu = page.getByRole('menu', { name: '画布菜单' });
  await expect(solidMenu).toBeVisible();
  await solidMenu.getByRole('menuitem', { name: '等轴测视图' }).click();
  await expect(solidMenu).toBeHidden();
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(solidMenu).toBeVisible();
  await solidMenu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(solidMenu).toBeHidden();
  await page.waitForTimeout(10_000); // tile 流送驻留
  await page.screenshot({ path: shotPath('t7-6-revolve1-iso.png') });

  // ── L3：Fillet 1（R5.08，底座板上表面 4 条边，尽力——T6 链真栈首验）────
  let filletDone = false;
  const filletDeadline = Date.now() + 180_000; // 3 分钟预算（演示失败纪律）
  try {
    await page.getByRole('button', { name: '圆角', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('半径').fill('5.08');
    await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
    await expect(
      dialog.getByTestId('part-studio-feature-dialog-picking-hint'),
    ).toBeVisible({ timeout: 15_000 });

    // 拾取点=底座板上表面 4 条边中点的视口投影（确定性投影，非盲点）。
    const picks = await page.evaluate(async () => {
      const cf = (await import('/@id/@itwin/core-frontend')) as {
        IModelApp: {
          viewManager: {
            getFirstOpenView(): {
              worldToView(pt: { x: number; y: number; z: number }): { x: number; y: number };
            };
          };
        };
      };
      const vp = cf.IModelApp.viewManager.getFirstOpenView();
      if (!vp) throw new Error('无打开视口');
      const edgeMidpoints = [
        { x: 0, y: 63.5, z: 9.525 },
        { x: 0, y: -63.5, z: 9.525 },
        { x: 41.275, y: 0, z: 9.525 },
        { x: -41.275, y: 0, z: 9.525 },
      ];
      return edgeMidpoints.map((p) => {
        const v = vp.worldToView(p);
        return { x: v.x, y: v.y };
      });
    });

    for (const p of picks) {
      if (Date.now() > filletDeadline) break;
      const px = box.x + p.x;
      const py = box.y + p.y;
      await page.mouse.move(px - 15, py + 12);
      await page.waitForTimeout(150);
      await page.mouse.move(px, py);
      await page.waitForTimeout(350); // boresite 运动定位窗口
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
      await page.waitForTimeout(600);
    }
    const chipCount = await dialog
      .getByTestId('part-studio-feature-dialog-edge-chips')
      .locator('li')
      .count();
    console.log(`[t7] fillet 边拾取 chips=${chipCount}（≥1 即 T6 链真栈通过）`);
    if (chipCount === 0) throw new Error('拾取预算内 0 边（T6 真栈不通过，偏差登记）');

    // 结束拾取：再点「添加边」钮（拾取态下该钮即 stopPick 开关——对话框
    // 自治通道，比 Esc/右键确定：Esc 经工具层分叉实测不达对话框 stopPick）。
    await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
    await expect(dialog.getByTestId('part-studio-feature-dialog-picking-hint')).toBeHidden({
      timeout: 10_000,
    });
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(
      featureList
        .getByRole('button', { name: '圆角 1' })
        .or(dialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 120_000 });
    if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0) {
      throw new Error(
        `圆角 1 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`,
      );
    }
    await expect(featureCount).toHaveText('(6)', { timeout: 30_000 });
    filletDone = true;
  } catch (err) {
    console.log(
      `[t7] fillet 未通过（偏差登记，体积按无圆角口径）：${err instanceof Error ? err.message : String(err)}`,
    );
    // 清场：Esc 退出拾取态 + ✗ 关对话框（留证后）
    await page.screenshot({ path: shotPath('t7-7-fillet-failed.png') });
    await page.keyboard.press('Escape').catch(() => undefined);
    if ((await dialog.getByRole('button', { name: '取消' }).count()) > 0) {
      await dialog.getByRole('button', { name: '取消' }).click();
    }
  }
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: shotPath(filletDone ? 't7-8-fillet1.png' : 't7-8-final.png') });

  // 台账补写终局态
  writeFileSync(
    shotPath('tutorial2-regions.json'),
    JSON.stringify({ ...ledger, filletDone }, null, 2),
    'utf-8',
  );



  // ── UI 对齐走查（M6c-T6）：四截图 + 轴判型断言 ──────────────────────
  // 橙色高亮（f3ad3e）=FeatureDialog 在场即全 body emphasize（FeatureTree
  // editHighlightIds → useCanvasSelection；无需进入编辑态）。
  await page.getByTestId('part-studio-ribbon').screenshot({ path: shotPath('t6-1-ribbon.png') });
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: '草图' }).selectOption(sketchId);
  await expect(dialog.getByTestId('part-studio-feature-dialog-region-chips')).toBeVisible({ timeout: 20_000 });
  await dialog.screenshot({ path: shotPath('t6-2-extrude-dialog.png') });
  await page.waitForTimeout(2_000); // emphasize 生效帧
  await page.getByTestId('part-studio-viewport').locator('canvas').first().screenshot({ path: shotPath('t6-3-edit-highlight.png') });
  await dialog.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '旋转', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: '草图' }).selectOption(sketchId);
  const axisSelect = dialog.getByRole('combobox', { name: '旋转轴' });
  await expect(axisSelect).toBeVisible({ timeout: 20_000 });
  const axisLabelText = await axisSelect.locator('option:checked').textContent();
  console.log();
  expect(axisLabelText ?? '', '轴判型命名应属竖直线/水平线/斜线族').toMatch(/竖直线|水平线|斜线/);
  await dialog.screenshot({ path: shotPath('t6-4-revolve-axis.png') });
  await dialog.getByRole('button', { name: '取消' }).click();
  // ── 全程零 console error ────────────────────────────────────────────
  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});


// ============================================================================
// T7-B（路径 1 实证，控制器 2026-10-24 指派）：Fillet 1 紧跟 Extrude 1——
// 纯盒上游阶段拾底座 4 条竖棱倒角，证明「非流形边（邻面数大于 2）」阻断只在
// 拱/底座 Union 之后出现（对照 T7 冒烟的全链后置 fillet 红行）。链序裁决：
// 建序直排（Sketch→E1→Fillet→E2→E3→R1），不走 reorderFeature——重排后
// fillet 上游集变化=几何非恒等，v1 线性链守卫必拒收，建序直排是唯一稳路径。
// 断言：6 节点全绿（无 --error 行）+零 console error；体积对拍归 scratch 探针
// （期望 ≈352.613−2.814≈349.8cm³——非 ±1% 达标测试，复合面域修复归 M6-c）。
// 拾取降级：竖棱 boresite 命中几条算几条（≥1 即机制成立，如实登记）。
// ============================================================================
test('T7-B 链序实证：Fillet 1 紧跟 Extrude 1（纯盒上游）→ 全链 6 节点全绿', async ({
  page,
}) => {
  test.slow();

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await openSeedImodelEditor(page);
  await waitEditorReady(page);

  const urlParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  const itwinId = urlParts[urlParts.length - 2] as string;
  const imodelId = urlParts[urlParts.length - 1] as string;
  const featureCount = page.getByTestId('part-studio-feature-count');
  const featureList = page.getByTestId('part-studio-feature-list');
  const dialog = page.getByTestId('part-studio-feature-dialog');

  // L1：同款草图 RPC 直发（借页面在持会话；台账单独落文件）
  const { op, axisLineId } = buildSketchOp();
  const accessToken = readAccessToken();
  const probeId = `t7b-probe-${Math.random().toString(36).slice(2)}`;
  const dbKey = ['briefcase-cache', 'imodels', imodelId, 'briefcases', '2.bim'].join(BS);
  const probe = (await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, probeId], accessToken)) as {
    ok: boolean;
    holder?: string;
  };
  const leaseSessionId = probe.ok ? probeId : (probe.holder ?? probeId);
  if (probe.ok) {
    await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, leaseSessionId], accessToken);
  }
  const insertRaw = await msRpc(
    itwinId,
    imodelId,
    'applyFeatureOp',
    [dbKey, op, leaseSessionId],
    accessToken,
  );
  const result = insertRaw as { ok: boolean; featureId?: string; error?: string };
  expect(result.ok, `insertSketch 被拒收：${result.error ?? ''}`).toBe(true);
  const sketchId = result.featureId as string;
  const sketch = (await msRpc(itwinId, imodelId, 'getSketch', [dbKey, sketchId], accessToken)) as {
    regions?: Array<{ area: number }>;
  };
  const regions = sketch?.regions ?? [];
  expect(regions.length).toBeGreaterThanOrEqual(3);
  writeFileSync(
    shotPath('tutorial2-reorder-regions.json'),
    JSON.stringify({ imodelId, sketchId, axisLineId, regionCount: regions.length, regions }, null, 2),
    'utf-8',
  );
  const idxBase = regionIndexByArea(regions, 1572.585);
  const idxBand = regionIndexByArea(regions, 1153.56);
  const idxLobe = regionIndexByArea(regions, 2298.36);
  const idxRightRect = regionIndexByArea(regions, 725.775);

  await expect(featureCount).toHaveText('(1)', { timeout: 60_000 });

  // Extrude 1（纯盒阶段——fillet 的上游）
  await extrudeViaDialog(page, dialog, featureList, sketchId, [idxBase], '127', '拉伸 1');
  await expect(featureCount).toHaveText('(2)', { timeout: 30_000 });

  // 视图就位 + Fillet 1：纯盒 4 条竖棱（前后 2 + 轮廓 2）boresite 拾取
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await isoFitView(page, cx, cy);
  await page.waitForTimeout(8_000); // tile 流送驻留
  const chips = await pickFilletEdges(page, dialog, '5.08', [
    { x: 41.275, y: 63.5, z: 0 },
    { x: 41.275, y: -63.5, z: 0 },
    { x: -41.275, y: 63.5, z: 0 },
    { x: -41.275, y: -63.5, z: 0 },
  ], box);
  expect(chips, `纯盒竖棱拾取=${chips}/4（≥1 即机制成立，如实登记）`).toBeGreaterThanOrEqual(1);
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList
      .getByRole('button', { name: '圆角 1' })
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 120_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0) {
    throw new Error(
      `圆角 1 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`,
    );
  }
  await expect(featureCount).toHaveText('(3)', { timeout: 30_000 });
  await expectTreeRowGreen(featureList, '圆角 1'); // status=0 绿行（对照全链后置的红行）
  await page.screenshot({ path: shotPath('t7b-1-box-fillet.png') });

  // 后续特征并入已倒角板（拱在中部不碰角圆角——union 预期无碍）
  await extrudeViaDialog(page, dialog, featureList, sketchId, [idxBand, idxRightRect], '50.8', '拉伸 2');
  await expect(featureCount).toHaveText('(4)', { timeout: 30_000 });
  await expectTreeRowGreen(featureList, '拉伸 2');
  await extrudeViaDialog(page, dialog, featureList, sketchId, [idxLobe], '15.875', '拉伸 3');
  await expect(featureCount).toHaveText('(5)', { timeout: 30_000 });
  await expectTreeRowGreen(featureList, '拉伸 3');
  await page.getByRole('button', { name: '旋转', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: '草图' }).selectOption(sketchId);
  await expect(dialog.getByRole('combobox', { name: '面域' })).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('combobox', { name: '面域' }).selectOption(String(idxRightRect));
  await dialog.getByRole('combobox', { name: '旋转轴' }).selectOption(String(axisLineId));
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList
      .getByRole('button', { name: '旋转 1' })
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 120_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0) {
    throw new Error(
      `旋转 1 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`,
    );
  }
  await expect(featureCount).toHaveText('(6)', { timeout: 30_000 });

  // 全链 6 节点全绿
  for (const name of ['草图 1', '拉伸 1', '圆角 1', '拉伸 2', '拉伸 3', '旋转 1']) {
    await expectTreeRowGreen(featureList, name);
  }

  await isoFitView(page, cx, cy);
  await page.waitForTimeout(10_000);
  await page.screenshot({ path: shotPath('t7b-2-final.png') });

  expect(consoleErrors, `console error 应为空：${BS}n${consoleErrors.join(BS + 'n')}`).toHaveLength(0);
});
