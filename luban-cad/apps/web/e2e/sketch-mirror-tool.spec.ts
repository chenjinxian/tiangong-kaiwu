/**
 * 草图镜像工具（Sketch.Mirror）真栈首切片，2026-11-09。
 *
 * 证据：Onshape Help「Sketch Mirror」——点 Mirror → 选镜像线 → 逐个点实体即时镜像。
 * 本 spec 走真实 ribbon/画布：画镜像线 + 源线 → 激活「镜像」→ 点线 → 点源线 →
 * RPC 读回新 line + mirror 约束（源/镜像/轴线三 refs）。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { getApiToken, getFeatureTreeRpc, getSketchRpc, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import {
  P,
  activate,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  setStandardView,
} from './tutorial2-helpers.js';

type Ctx = Awaited<ReturnType<typeof openSeedImodelEditor>>;
type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;
type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;
type SplineEntity = Extract<SketchEntityDto, { kind: 'spline' }>;

async function latestSketch(ctx: Ctx, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sketch = await getSketchRpc(ctx, id!, token);
  expect(sketch).toBeDefined();
  return sketch!;
}

const inlinePoint = (ref: LineEntity['p1']): { x: number; y: number } => {
  if (typeof ref !== 'object') throw new Error('期望内联端点');
  return ref;
};

test.describe('草图镜像工具（Sketch.Mirror）', () => {
  test('真实 ribbon：选镜像线 → 点源线 → line + mirror 约束 / 完成草图', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const ctx = await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, {
      low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 },
    });
    await disableSnap(page);

    // 镜像线 x=0，源线 x=10（两条独立线；不相接不触发 auto-weld）。
    await activate(page, '线');
    await clickWorld(page, hub, P(0, -20));
    await clickWorld(page, hub, P(0, 20));
    await activate(page, '线');
    await clickWorld(page, hub, P(10, -5));
    await clickWorld(page, hub, P(10, 5));
    await page.waitForTimeout(1_500);
    const before = await latestSketch(ctx, token);
    expect(before.entities.filter((e) => e.kind === 'line')).toHaveLength(2);

    await activate(page, '镜像');
    await clickWorld(page, hub, P(0, 0)); // 镜像线
    await clickWorld(page, hub, P(10, 0)); // 源线 → 即时镜像
    await page.waitForTimeout(1_500);

    const after = await latestSketch(ctx, token);
    const lines = after.entities.filter((e): e is LineEntity => e.kind === 'line');
    expect(lines).toHaveLength(3);
    const sourceLine = lines.find((line) => inlinePoint(line.p1).x > 0);
    expect(sourceLine, '应有 x>0 的源线').toBeTruthy();
    const sourceP1 = inlinePoint(sourceLine!.p1);
    const sourceP2 = inlinePoint(sourceLine!.p2);
    const mirrored = lines.find((line) => {
      const p1 = inlinePoint(line.p1);
      const p2 = inlinePoint(line.p2);
      return Math.abs(p1.x + sourceP1.x) < 1e-6 && Math.abs(p2.x + sourceP2.x) < 1e-6
        && Math.abs(p1.y - sourceP1.y) < 1e-6 && Math.abs(p2.y - sourceP2.y) < 1e-6;
    });
    expect(mirrored, '应生成关于 x=0 对称的镜像线').toBeTruthy();
    const mirror = after.constraints.find((c) => c.kind === 'mirror');
    expect(mirror, '应落 mirror 约束').toBeDefined();
    expect(mirror!.refs).toHaveLength(3);
    expect(mirror!.refs[1]).toBe(mirrored!.id);

    // 整圆镜像：圆心对称 + 等半径（第二条 mirror 约束 + 一条 equal）。
    await activate(page, '中心点圆');
    await clickWorld(page, hub, P(10, 20));
    await clickWorld(page, hub, P(15, 20));
    await page.waitForTimeout(1_500);
    await activate(page, '镜像');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(15, 20));
    await page.waitForTimeout(1_500);
    const withCircle = await latestSketch(ctx, token);
    const circles = withCircle.entities.filter((e) => e.kind === 'circle');
    expect(circles).toHaveLength(2);
    const sourceCircle = circles.find((circle) =>
      typeof circle.center === 'object' && circle.center.x > 0 && circle.center.y > 0);
    expect(sourceCircle, '应有右上方的源圆').toBeTruthy();
    const sourceCenter = sourceCircle!.center as { x: number; y: number };
    const mirroredCircle = circles.find((circle) => {
      if (typeof circle.center !== 'object') return false;
      return Math.abs(circle.center.x + sourceCenter.x) < 1e-6
        && Math.abs(circle.center.y - sourceCenter.y) < 1e-6
        && Math.abs((circle.radius ?? 0) - (sourceCircle!.radius ?? 0)) < 1e-6;
    });
    expect(mirroredCircle, '应生成关于 x=0 对称、等半径的镜像圆').toBeTruthy();
    expect(withCircle.constraints.filter((c) => c.kind === 'mirror')).toHaveLength(2);
    expect(withCircle.constraints.filter((c) => c.kind === 'equal')).toHaveLength(1);

    // 圆弧镜像（v1.61）：圆心/起/终点反射 + mirror(arc,arc,axis)；扫角符号翻转。
    await activate(page, '圆心圆弧');
    await clickWorld(page, hub, P(10, 25));
    await clickWorld(page, hub, P(10, 30));
    await clickWorld(page, hub, P(15, 25));
    await page.waitForTimeout(1_500);
    await activate(page, '镜像');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 30));
    await page.waitForTimeout(1_500);
    const withArc = await latestSketch(ctx, token);
    const arcs = withArc.entities.filter((e): e is ArcEntity => e.kind === 'arc');
    expect(arcs).toHaveLength(2);
    const sourceArc = arcs.find((arc) => {
      const center = arc.center as { x: number; y: number };
      return center.x > 0;
    });
    expect(sourceArc, '应有 x>0 的源弧').toBeTruthy();
    const sourceArcCenter = sourceArc!.center as { x: number; y: number };
    const mirroredArc = arcs.find((arc) => {
      const center = arc.center as { x: number; y: number };
      return Math.abs(center.x + sourceArcCenter.x) < 1e-6
        && Math.abs(center.y - sourceArcCenter.y) < 1e-6
        && Math.abs((arc.radius ?? 0) - (sourceArc!.radius ?? 0)) < 1e-6;
    });
    expect(mirroredArc, '应生成关于 x=0 对称的镜像弧').toBeTruthy();
    expect((mirroredArc!.sweepAngle ?? 0) + (sourceArc!.sweepAngle ?? 0)).toBeCloseTo(0, 6);
    expect(withArc.constraints.filter((c) => c.kind === 'mirror')).toHaveLength(3);

    // 样条镜像：四控制点反射 + mirror(spline,spline,axis)。
    await activate(page, '样条');
    await clickWorld(page, hub, P(-15, 8));
    await clickWorld(page, hub, P(-8, 8));
    await clickWorld(page, hub, P(-12, 11));
    await clickWorld(page, hub, P(-10, 11));
    await page.waitForTimeout(1_500);
    await activate(page, '镜像');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(-15, 8));
    await page.waitForTimeout(1_500);
    const withSpline = await latestSketch(ctx, token);
    const splines = withSpline.entities.filter((e): e is SplineEntity => e.kind === 'spline');
    expect(splines).toHaveLength(2);
    const sourceSpline = splines.find((spline) => spline.controlPoints[0]!.x < 0);
    expect(sourceSpline, '应有 x<0 的源样条').toBeTruthy();
    const mirroredSpline = splines.find((spline) => {
      if (spline.controlPoints.length !== sourceSpline!.controlPoints.length) return false;
      return spline.controlPoints.every((p, i) => {
        const q = sourceSpline!.controlPoints[i]!;
        return Math.abs(p.x + q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
      });
    });
    expect(mirroredSpline, '应生成关于 x=0 对称的镜像样条').toBeTruthy();
    expect(withSpline.constraints.filter((c) => c.kind === 'mirror')).toHaveLength(4);

    await finishSketch(page);
    expect((await getFeatureTreeRpc(ctx, token)).some((row) => row.featureType === 'sketch')).toBe(true);

    // 冷重开持久性：finish 后的 sketch params（含 mirror 约束）仍在。
    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(reopened, token);
    expect(persisted.constraints.filter((c) => c.kind === 'mirror')).toHaveLength(4);
    expect(persisted.entities.filter((e) => e.kind === 'line')).toHaveLength(3);
    expect(persisted.entities.filter((e) => e.kind === 'circle')).toHaveLength(2);
    expect(persisted.entities.filter((e) => e.kind === 'arc')).toHaveLength(2);
    expect(persisted.entities.filter((e) => e.kind === 'spline')).toHaveLength(2);
  });
});
