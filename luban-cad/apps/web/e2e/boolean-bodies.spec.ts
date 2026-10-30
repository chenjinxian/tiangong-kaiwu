/**
 * 发布窗真栈：B6 M-A4 body boolean 全链。
 *
 * P2.6a：数据面迁到 **B 种子**（`E2E B 项目` / `E2E B Seed`，项目带
 * data.luban.modelMode='B'）——每例 beforeEach 重置种子，首开编辑器由解析器
 * 创建默认 Part Studio；直连 RPC 一律携带该 scope（applyFeatureOp 第 4 参 /
 * getBodies/getFeatureTree 第 2 参），**不再走 legacy 无 scope 读写**。
 * （原「自建独立 A iModel」在 A 只读语义下不可写。）
 *
 * 场景：
 *   草图 A → extrude body1 → 草图 B → extrude(newBody) body2
 *   → UI 体布尔 unite（消费 body2）→ 树/零件行/consumed 隐藏/bodyKey 稳定
 *   → 原生 undo → 两体恢复；redo → 再消费；undo 回到两体
 *   → UI 体布尔 subtract + keepTools=true → 两体均 active；target 源=布尔、tool 源不变
 *   → I3：编辑保留工具 body → 后端拒收（BOOLEAN_TOOL_BODY_LOCKED）
 *   → RPC 建 body3 → UI 连续布尔（target=body1 链前驱为布尔）→ body3 消费
 *   → undo/redo 第二轮 → 三/两体与隐藏同步。
 *
 * 该用例同时覆盖首开并发（全新 iModel 首次打开）与 getBodies/booleanBodies RPC
 * （1.16 引入；URL 版本由 shared interfaceVersion 提供）；
 * body boolean 的对话框单测见 FeatureDialog.test.tsx。
 */

import { expect, test, type Page } from '@playwright/test';
import type { FeatureOp } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  borrowWriteLease,
  collectConsoleErrors,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  openSeedImodelEditor,
} from './helpers';
import { resetBModelSeed, type SeedImodelRef } from './seed';

// L3：reset 返回的同一组 id 交给 open，避免各自按名解析。
let bSeed: SeedImodelRef | undefined;

test.beforeEach(async ({ request }) => {
  test.setTimeout(900_000);
  bSeed = await resetBModelSeed(request, await getApiToken());
});

interface Sketch2d { entities: unknown[]; constraints: unknown[] }
interface PlaneDto {
  origin: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  xDir: { x: number; y: number; z: number };
}
interface FeatureTreeRow { id: string; featureType: string; status: number }
interface BodyInfo { bodyKey: string; name?: string; active: boolean; authored?: boolean; sourceFeatureId?: string }

function rectangleSketch(x0: number, y0: number, x1: number, y1: number): Sketch2d {
  let next = 1;
  const nid = (): number => next++;
  const corners: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const entities: unknown[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    const idA = nid();
    const idB = nid();
    entities.push(
      { kind: 'point', id: idA, x: a[0], y: a[1] },
      { kind: 'point', id: idB, x: b[0], y: b[1] },
      { kind: 'line', id: nid(), p1: idA, p2: idB },
    );
    starts.push(idA);
    ends.push(idB);
  }
  const constraints = starts.map((_startId, i) => ({
    kind: 'coincident',
    id: nid(),
    refs: [ends[i], starts[(i + 1) % 4]],
  }));
  return { entities, constraints };
}

const xyPlane = (z: number): PlaneDto => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});

async function hiddenElementIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: { viewManager: { getFirstOpenView(): unknown } };
      EmphasizeElements: { get(vp: unknown): { getHiddenElements(vp: unknown): Iterable<string> | undefined } | undefined };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    const ee = cf.EmphasizeElements.get(vp);
    const set = ee?.getHiddenElements(vp);
    return set ? Array.from(set).map(String) : [];
  });
}

test('真栈：体布尔 unite/subtract/keepTools/连续布尔 → 消费隐藏/undo/redo/bodyKey/I3', async ({ page }) => {
  test.setTimeout(1_200_000);
  const consoleErrors = collectConsoleErrors(page);
  const accessToken = await getApiToken();
  // B 种子：helper 等解析器落位 ?model= scope + 编辑器就绪；返回的 dbKey 取自
  // 已打开 briefcase（connection.key）。
  const ctx = await openSeedImodelEditor(page, bSeed);
  console.log(`[boolean] B scope=${ctx.scopeId} dbKey=${ctx.dbKey}`);

  const lease = await borrowWriteLease(ctx, accessToken, 'boolean');
  console.log(`[boolean] lease borrowed=${lease.borrowed}`);

  const apply = async (op: Record<string, unknown>, label: string): Promise<string> => {
    const r = await applyFeatureOpRpc(ctx, op as unknown as FeatureOp, lease, accessToken);
    expect(r.ok, `${label} 被拒收：${r.error ?? JSON.stringify(r).slice(0, 300)}`).toBe(true);
    expect(r.featureId, `${label} 无 featureId`).toBeTruthy();
    console.log(`[boolean] ${label} OK ${r.featureId!.slice(0, 8)}…`);
    return r.featureId!;
  };
  const insertSketch = async (s: Sketch2d, plane: PlaneDto, label: string): Promise<string> =>
    apply({ kind: 'insertSketch', entities: s.entities, constraints: s.constraints, plane }, label);
  // 读面只留关键检查点（MS 全局 100 req/15min；全量 e2e 串行共享该配额）。
  // 等待/同步一律走 UI 零件行计数（不消耗 RPC），状态断言再单次读 getBodies/getTree。
  const getBodies = async (): Promise<BodyInfo[]> => (await getBodiesRpc(ctx, accessToken)) as BodyInfo[];
  const getTree = async (): Promise<FeatureTreeRow[]> =>
    (await getFeatureTreeRpc(ctx, accessToken)) as FeatureTreeRow[];

  // ── 两体基线 ───────────────────────────────────────────────────────────────
  const sketchA = await insertSketch(rectangleSketch(0, 0, 2, 2), xyPlane(0), '草图 A');
  const extrudeA = await apply({
    kind: 'insertFeature', featureType: 'extrude',
    params: { profile: [], distance: 1, sketchId: sketchA, regions: [0] },
  }, 'extrude body1');
  const sketchB = await insertSketch(rectangleSketch(4, 0, 6, 2), xyPlane(0), '草图 B');
  const extrudeB = await apply({
    kind: 'insertFeature', featureType: 'extrude',
    params: { profile: [], distance: 2, sketchId: sketchB, regions: [0], newBody: true },
  }, 'extrude newBody body2');

  const initialBodies = await getBodies();
  const body1 = initialBodies.find((b) => b.sourceFeatureId === extrudeA);
  const body2 = initialBodies.find((b) => b.sourceFeatureId === extrudeB);
  expect(body1, 'body1 应由 extrudeA 驱动').toBeTruthy();
  expect(body2, 'body2 应由 extrudeB 驱动').toBeTruthy();
  expect(body1!.bodyKey).not.toBe(body2!.bodyKey);
  const body1Key = body1!.bodyKey;
  const body2Key = body2!.bodyKey;

  // B6 M-A5 T2：part 行尾有逐 body eye 钮——按主行 class 计数
  //（getByRole('button') 会翻倍）。
  const partList = page.getByTestId('part-studio-part-list');
  const featureList = page.getByTestId('part-studio-feature-list');
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  console.log(`[boolean] bodies body1=${body1Key} body2=${body2Key}`);

  const openBooleanDialog = async (): Promise<ReturnType<typeof page.getByTestId>> => {
    await page.getByRole('toolbar', { name: '特征工具' })
      .getByRole('button', { name: '布尔运算', exact: true }).click();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: '目标实体' })).toBeVisible({ timeout: 30_000 });
    // 体布尔不渲染遗留结果类型/作用域页签（M4.2a review Minor）。
    await expect(dialog.getByRole('tablist')).toHaveCount(0);
    return dialog;
  };

  const selectBoolean = async (
    dialog: ReturnType<typeof page.getByTestId>,
    targetKey: string,
    toolKey: string,
    operation: 'unite' | 'subtract',
    keepTools: boolean,
  ): Promise<void> => {
    await dialog.getByRole('combobox', { name: '目标实体' }).selectOption(targetKey);
    await dialog.getByTestId(`part-studio-feature-dialog-boolean-tool-${toolKey}`)
      .getByRole('checkbox').click();
    await dialog.getByRole('combobox', { name: '运算' }).selectOption(operation);
    const keep = dialog.getByTestId('part-studio-feature-dialog-boolean-keep-tools').getByRole('checkbox');
    if (keepTools !== (await keep.isChecked())) await keep.click();
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 30_000 });
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(dialog).toBeHidden({ timeout: 90_000 });
  };

  // ── 第一轮：unite（消费 body2）─────────────────────────────────────────────
  let dialog = await openBooleanDialog();
  await selectBoolean(dialog, body1Key, body2Key, 'unite', false);
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(1);
  await expect(featureList.getByRole('button', { name: '布尔 1' })).toBeVisible({ timeout: 90_000 });

  let after = await getBodies();
  const body1After = after.find((b) => b.bodyKey === body1Key);
  const body2After = after.find((b) => b.bodyKey === body2Key);
  expect(body1After?.active, 'target 应保持 active').toBe(true);
  expect(body1After?.sourceFeatureId, 'target 源应前移到布尔').toBeTruthy();
  expect(body2After?.active, 'keepTools=false 应消费 tool').toBe(false);
  expect(body2After?.sourceFeatureId, '消费态不声称源').toBeUndefined();
  expect(body1After?.bodyKey, 'bodyKey 应稳定').toBe(body1Key);
  expect(body2After?.bodyKey, 'bodyKey 应稳定').toBe(body2Key);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).toContain(body2Key);
  console.log(`[boolean] unite → active=1 hidden=${body2Key}`);

  // undo → 两体恢复（源/隐藏均回退）
  const undo = page.getByTestId('part-studio-undo-button');
  await expect(undo).toBeEnabled({ timeout: 90_000 });
  await undo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).not.toContain(body2Key);
  const restored = await getBodies();
  expect(restored.find((b) => b.sourceFeatureId === extrudeA)?.bodyKey, 'undo 后 body1 源恢复').toBe(body1Key);
  expect(restored.find((b) => b.sourceFeatureId === extrudeB)?.bodyKey, 'undo 后 body2 源恢复').toBe(body2Key);
  console.log('[boolean] undo → 两体恢复');

  // redo → 再消费；再 undo 回两体准备 subtract（只等 UI/隐藏，不耗 RPC）
  const redo = page.getByTestId('part-studio-redo-button');
  await expect(redo).toBeEnabled({ timeout: 90_000 });
  await redo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(1);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).toContain(body2Key);
  await expect(undo).toBeEnabled({ timeout: 90_000 });
  await undo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).not.toContain(body2Key);
  console.log('[boolean] redo/undo 往返 OK');

  // ── 第二轮：subtract + keepTools=true（不消费）───────────────────────────
  dialog = await openBooleanDialog();
  await selectBoolean(dialog, body1Key, body2Key, 'subtract', true);
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  await expect(featureList.getByRole('button', { name: '布尔 1' })).toBeVisible({ timeout: 90_000 });
  const treeAtSubtract = await getTree();
  const booleanSubtract = treeAtSubtract.find((r) => r.featureType === 'booleanBodies' && r.status === 0);
  expect(booleanSubtract, 'subtract 布尔应入树').toBeTruthy();
  const bodiesSubtract = await getBodies();
  const subtractTarget = bodiesSubtract.find((b) => b.bodyKey === body1Key);
  const subtractTool = bodiesSubtract.find((b) => b.bodyKey === body2Key);
  expect(subtractTarget?.sourceFeatureId, 'subtract target 源=布尔').toBe(booleanSubtract!.id);
  expect(subtractTool?.active, 'keepTools=true tool 应保持 active').toBe(true);
  expect(subtractTool?.sourceFeatureId, 'keepTools=true tool 源链不变').toBe(extrudeB);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).not.toContain(body2Key);
  console.log('[boolean] subtract + keepTools=true → 两体均 active');

  // I3：保留工具 body 的源链锁定——regular insert 定向 body2 被后端拒收。
  const locked = (await applyFeatureOpRpc(
    ctx,
    {
      kind: 'insertFeature', featureType: 'extrude',
      params: { profile: [], distance: 1, sketchId: sketchA, regions: [0] },
      targetBodyId: body2Key,
    } as unknown as FeatureOp,
    lease,
    accessToken,
  )) as { ok: boolean; error?: string };
  expect(locked.ok, '保留工具 body 应拒绝 regular insert').toBe(false);
  expect(locked.error ?? '', '错误应为 I3 工具链锁').toContain('保留工具');
  console.log(`[boolean] I3 lock OK: ${locked.error}`);

  // ── 连续布尔（C1）：新建 body3，再以 body1（现源=布尔）为 target ──────────
  const sketchC = await insertSketch(rectangleSketch(8, 0, 10, 2), xyPlane(0), '草图 C');
  const extrudeC = await apply({
    kind: 'insertFeature', featureType: 'extrude',
    params: { profile: [], distance: 1, sketchId: sketchC, regions: [0], newBody: true },
  }, 'extrude newBody body3');
  const bodiesFor3 = await getBodies();
  const body3 = bodiesFor3.find((b) => b.sourceFeatureId === extrudeC);
  expect(body3, 'body3 应由 extrudeC 驱动').toBeTruthy();
  const body3Key = body3!.bodyKey;
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(3);

  dialog = await openBooleanDialog();
  await selectBoolean(dialog, body1Key, body3Key, 'unite', false);
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  await expect(featureList.getByRole('button', { name: '布尔 2' })).toBeVisible({ timeout: 90_000 });
  const bodiesAfterSecond = await getBodies();
  const targetAfterSecond = bodiesAfterSecond.find((b) => b.bodyKey === body1Key);
  const tool2AfterSecond = bodiesAfterSecond.find((b) => b.bodyKey === body2Key);
  const tool3AfterSecond = bodiesAfterSecond.find((b) => b.bodyKey === body3Key);
  const treeAfterSecond = await getTree();
  const booleanRows = treeAfterSecond.filter((r) => r.featureType === 'booleanBodies' && r.status === 0);
  expect(booleanRows, '两个布尔特征均应在树').toHaveLength(2);
  const secondBoolean = treeAfterSecond.find((r) => r.id === targetAfterSecond?.sourceFeatureId);
  expect(secondBoolean, '第二个布尔特征应入树').toBeTruthy();
  expect(secondBoolean!.id, '第二个布尔应与 subtract 区分').not.toBe(booleanSubtract!.id);
  expect(targetAfterSecond?.sourceFeatureId, 'C1：body1 源应为第二个布尔').toBe(secondBoolean!.id);
  expect(tool2AfterSecond?.active, '第一轮的保留工具 body2 仍 active').toBe(true);
  expect(tool2AfterSecond?.sourceFeatureId, 'body2 源链不变').toBe(extrudeB);
  expect(tool3AfterSecond?.active, '第二个布尔消费 body3').toBe(false);
  expect(tool3AfterSecond?.bodyKey, 'body3 bodyKey 稳定').toBe(body3Key);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).toContain(body3Key);
  console.log('[boolean] 连续布尔 C1 OK');

  // 第二轮 undo/redo：三体 ↔ 两体
  await expect(undo).toBeEnabled({ timeout: 90_000 });
  await undo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(3);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).not.toContain(body3Key);
  await expect(redo).toBeEnabled({ timeout: 90_000 });
  await redo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  await expect.poll(async () => hiddenElementIds(page), { timeout: 90_000 }).toContain(body3Key);
  console.log('[boolean] 第二轮 undo/redo OK');

  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});
