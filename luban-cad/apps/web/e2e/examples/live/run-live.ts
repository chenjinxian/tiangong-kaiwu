/**
 * Live spec → luban-cad Part Studio 构建器（首切片：sketch + extrude）。
 */
import type { Page, APIRequestContext } from '@playwright/test';
import type { BodyInfo, FeatureTreeEntry, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  getSketchRpc,
} from '../../helpers.js';
import { ensureExampleImodel, openExampleEditor } from '../imodel.js';
import { resolveLiveEdgeRefs } from './edge-select.js';
import { resolveLiveShellFaceRefs } from './face-select.js';
import type { LiveSpec } from './live-spec.js';

export interface LiveRunResult {
  token: string;
  ids: Awaited<ReturnType<typeof ensureExampleImodel>>;
  ctx: Awaited<ReturnType<typeof openExampleEditor>>;
  tree: FeatureTreeEntry[];
  bodies: BodyInfo[];
  mass: Awaited<ReturnType<typeof getMassPropertiesRpc>>;
  notes: string[];
}

export async function runLiveSpec(
  page: Page,
  request: APIRequestContext,
  spec: LiveSpec,
): Promise<LiveRunResult> {
  const token = await getApiToken();
  const ids = await ensureExampleImodel(request, token, spec.imodelName, { reset: true });
  const ctx = await openExampleEditor(page, ids);
  const lease = await borrowWriteLease(ctx, token, `live-${spec.id}`);
  const sketchIdByName = new Map<string, string>();
  const featureIdByName = new Map<string, string>();
  const bodyKeysByFeatureName = new Map<string, string[]>();
  const cplaneByName = new Map<string, { featureId: string; plane?: SketchPlaneDto }>();
  // 只对后续步骤显式引用的特征读 body（每次读都是 1 个 MS RPC；全量逐拉伸读
  // 会在大 spec 上逼近 100 req/15min 限流，2026-11-11 Crank 实测 429）。
  const trackedFeatureNames = new Set<string>();
  for (const step of spec.steps) {
    if (step.kind === 'extrude') for (const name of step.targetBodyFeatureNames ?? []) trackedFeatureNames.add(name);
    if (step.kind === 'hole' && step.targetBodyFeatureName) trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'featurePattern' && step.targetBodyFeatureName) trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'featureMirror' && step.targetBodyFeatureName) trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'shell' && step.targetBodyFeatureName) trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'faceExtrude') trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'moveFace' && step.targetBodyFeatureName) trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'transform' && step.targetBodyFeatureName) trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'splitPart' && step.targetBodyFeatureName) trackedFeatureNames.add(step.targetBodyFeatureName);
    if (step.kind === 'booleanBodies') {
      for (const name of [...step.targetBodyFeatureNames, ...step.toolBodyFeatureNames]) trackedFeatureNames.add(name);
    }
  }
  const notes: string[] = [];

  const apply = async (op: Parameters<typeof applyFeatureOpRpc>[1], label: string): Promise<string> => {
    const result = await applyFeatureOpRpc(ctx, op, lease, token);
    assertFeatureOpOk(result, `${spec.id}/${label}`);
    if (!result.featureId) throw new Error(`${spec.id}/${label} 未返回 featureId`);
    return result.featureId;
  };

  for (const step of spec.steps) {
    if (step.kind === 'skipped') {
      notes.push(`${step.name} skipped：${step.reason}`);
      continue;
    }
    if (step.kind === 'cPlane') {
      const params = {
        reference: step.reference,
        ...(step.offsetMm !== undefined ? { offsetMm: step.offsetMm } : {}),
        ...(step.origin ? { origin: step.origin } : {}),
        ...(step.flipNormal !== undefined ? { flipNormal: step.flipNormal } : {}),
        ...(step.line ? { line: step.line } : {}),
        ...(step.angleDeg !== undefined ? { angleDeg: step.angleDeg } : {}),
        ...(step.point ? { point: step.point } : {}),
        ...(step.threePoints ? { threePoints: step.threePoints } : {}),
      };
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'cPlane',
        params,
      }, step.name);
      featureIdByName.set(step.name, featureId);
      cplaneByName.set(step.name, { featureId, plane: step.plane });
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'sketch') {
      if (sketchIdByName.has(step.name)) throw new Error(`${spec.id}: 草图名重复 ${step.name}`);
      let plane = step.plane;
      if (step.planeFeatureName) {
        const entry = cplaneByName.get(step.planeFeatureName);
        if (!entry) throw new Error(`${spec.id}/${step.name}: 找不到基准面 ${step.planeFeatureName}`);
        if (!entry.plane)
          throw new Error(`${spec.id}/${step.name}: 基准面 ${step.planeFeatureName} 缺平面快照`);
        plane = { ...entry.plane, sourceFeatureId: entry.featureId };
      }
      if (!plane)
        throw new Error(`${spec.id}/${step.name}: 须提供 plane 或 planeFeatureName`);
      const id = await apply({
        kind: 'insertSketch',
        entities: step.entities,
        constraints: spec.skipConstraints === true ? [] : step.constraints,
        plane,
      }, step.name);
      sketchIdByName.set(step.name, id);
      featureIdByName.set(step.name, id);
      if (process.env.LIVE_DEBUG === '1') {
        const sketch = await getSketchRpc(ctx, id, token);
        console.log(
          `[live-debug] ${spec.id}/${step.name} regions=` +
          JSON.stringify(sketch?.regions?.map((region) => ({
            area: Number(region.area.toFixed(6)),
            outer: region.outerEntityIds,
            holes: region.holeEntityIds ?? [],
          }))),
        );
      }
      if (spec.skipConstraints === true) notes.push('constraints=dropped（live-spec skipConstraints）');
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'extrude') {
      const sketchId = sketchIdByName.get(step.sketchName);
      if (!sketchId) throw new Error(`${spec.id}/${step.name}: 找不到草图 ${step.sketchName}`);
      let targetBodyIds: string[] | undefined;
      let targetBodyId: string | undefined;
      if ((step.targetBodyFeatureNames?.length ?? 0) > 0) {
        const keys: string[] = [];
        for (const featureName of step.targetBodyFeatureNames ?? []) {
          const bodyKeys = bodyKeysByFeatureName.get(featureName);
          if (!bodyKeys || bodyKeys.length !== 1)
            throw new Error(
              `${spec.id}/${step.name}: 目标特征 ${featureName} 的新 body 数=${bodyKeys?.length ?? 0}，须恰 1`,
            );
          keys.push(bodyKeys[0]!);
        }
        const unique = [...new Set(keys)];
        if (unique.length !== keys.length)
          throw new Error(`${spec.id}/${step.name}: 目标特征指向重复 body`);
        // v1.68 契约：单目标走旧 targetBodyId；targetBodyIds 至少 2 个。
        if (unique.length === 1) targetBodyId = unique[0]!;
        else targetBodyIds = unique;
      }
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'extrude',
        params: {
          profile: [],
          distance: step.depthMm,
          sketchId,
          regions: step.regions ?? [0],
          ...(step.operation ? { operation: step.operation } : {}),
          ...(step.extraParams ?? {}),
        },
        ...(targetBodyId ? { targetBodyId } : {}),
        ...(targetBodyIds ? { targetBodyIds } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (trackedFeatureNames.has(step.name)) {
        // bodyKey 在重建中可能复用；以 sourceFeatureId=本特征 id 识别该特征创建的体。
        const afterBodies = await getBodiesRpc(ctx, token);
        console.log(
          `[live] ${spec.id}/${step.name} feature=${featureId} bodies=` +
          JSON.stringify(afterBodies.map((body) => [body.bodyKey, body.sourceFeatureId])),
        );
        const newKeys = afterBodies
          .filter((body) => body.sourceFeatureId === featureId)
          .map((body) => body.bodyKey);
        bodyKeysByFeatureName.set(step.name, newKeys);
      }
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'revolve') {
      const sketchId = sketchIdByName.get(step.sketchName);
      if (!sketchId) throw new Error(`${spec.id}/${step.name}: 找不到草图 ${step.sketchName}`);
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'revolve',
        params: {
          sketchId,
          regions: step.regions ?? [0],
          axis: { sketchEntityId: step.axisSketchEntityId },
          fullRevolve: step.fullRevolve !== false,
          ...(step.angleRad !== undefined ? { angle: step.angleRad } : {}),
          operation: step.operation ?? 'new',
        },
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (trackedFeatureNames.has(step.name)) {
        const afterBodies = await getBodiesRpc(ctx, token);
        const newKeys = afterBodies
          .filter((body) => body.sourceFeatureId === featureId)
          .map((body) => body.bodyKey);
        bodyKeysByFeatureName.set(step.name, newKeys);
      }
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'loft') {
      const ids = step.sketchNames.map((name) => {
        const id = sketchIdByName.get(name);
        if (!id) throw new Error(`${spec.id}/${step.name}: 找不到草图 ${name}`);
        return id;
      }) as [string, string];
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'loft',
        params: {
          sketchIds: ids,
          ...(step.sections !== undefined ? { sections: step.sections } : {}),
          bodyType: 'SOLID',
        },
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'sweep') {
      const profileSketchId = sketchIdByName.get(step.profileSketchName);
      if (!profileSketchId)
        throw new Error(`${spec.id}/${step.name}: 找不到轮廓草图 ${step.profileSketchName}`);
      const pathSketchId = sketchIdByName.get(step.pathSketchName);
      if (!pathSketchId)
        throw new Error(`${spec.id}/${step.name}: 找不到路径草图 ${step.pathSketchName}`);
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'sweep',
        params: { profileSketchId, pathSketchId, bodyType: 'SOLID' },
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'hole') {
      const sketchId = sketchIdByName.get(step.sketchName);
      if (!sketchId) throw new Error(`${spec.id}/${step.name}: 找不到草图 ${step.sketchName}`);
      if (step.pointEntityIds.length === 0)
        throw new Error(`${spec.id}/${step.name}: 孔位为空`);
      let targetBodyId: string | undefined;
      if (step.targetBodyFeatureName) {
        const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
        if (!keys || keys.length !== 1)
          throw new Error(
            `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
          );
        targetBodyId = keys[0];
      }
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'hole',
        params: {
          sketchId,
          pointIds: step.pointEntityIds,
          diameterMm: step.diameterMm,
          endBound: step.endBound,
          ...(step.holeStyle ? { holeStyle: step.holeStyle } : {}),
          ...(step.counterboreDiameterMm !== undefined
            ? { counterboreDiameterMm: step.counterboreDiameterMm }
            : {}),
          ...(step.counterboreDepthMm !== undefined
            ? { counterboreDepthMm: step.counterboreDepthMm }
            : {}),
          ...(step.countersinkDiameterMm !== undefined
            ? { countersinkDiameterMm: step.countersinkDiameterMm }
            : {}),
          ...(step.countersinkAngleDeg !== undefined
            ? { countersinkAngleDeg: step.countersinkAngleDeg }
            : {}),
          ...(step.tipAngleDeg !== undefined ? { tipAngleDeg: step.tipAngleDeg } : {}),
          ...(step.endBound === 'blind' ? { depthMm: step.depthMm } : {}),
          ...(step.direction ? { direction: step.direction } : {}),
        },
        ...(targetBodyId ? { targetBodyId } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'featureMirror') {
      const sourceFeatureId = featureIdByName.get(step.sourceFeatureName);
      if (!sourceFeatureId)
        throw new Error(`${spec.id}/${step.name}: 找不到源特征 ${step.sourceFeatureName}`);
      let targetBodyId: string | undefined;
      if (step.targetBodyFeatureName) {
        const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
        if (!keys || keys.length !== 1)
          throw new Error(
            `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
          );
        targetBodyId = keys[0]!;
      }
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'featureMirror',
        params: { sourceFeatureId, planeLine: step.planeLine },
        ...(targetBodyId ? { targetBodyId } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'featurePattern') {
      const sourceFeatureId = featureIdByName.get(step.sourceFeatureName);
      if (!sourceFeatureId)
        throw new Error(`${spec.id}/${step.name}: 找不到源特征 ${step.sourceFeatureName}`);
      let targetBodyId: string | undefined;
      if (step.targetBodyFeatureName) {
        const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
        if (!keys || keys.length !== 1)
          throw new Error(
            `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
          );
        targetBodyId = keys[0]!;
      }
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'featurePattern',
        params: {
          sourceFeatureId,
          kind: step.patternKind,
          count: step.count,
          ...(step.spacingMm !== undefined ? { spacing: step.spacingMm } : {}),
          ...(step.angleDeg !== undefined ? { angle: step.angleDeg } : {}),
          axis: step.axis,
          ...(step.secondDirection
            ? {
              secondDirection: {
                count: step.secondDirection.count,
                spacing: step.secondDirection.spacingMm,
                axis: step.secondDirection.axis,
              },
            }
            : {}),
        },
        ...(targetBodyId ? { targetBodyId } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'fillet' || step.kind === 'chamfer') {
      const resolved = await resolveLiveEdgeRefs(page, ctx, token, step.edges);
      if (resolved.bodyKeys.length !== 1)
        throw new Error(`${spec.id}/${step.name}: 边跨 ${resolved.bodyKeys.length} 个 body，须恰 1`);
      notes.push(`${step.name}: ${resolved.notes.join('; ')}`);
      const params = step.kind === 'fillet'
        ? {
          radius: step.radiusMm,
          propagateSmooth: step.propagateSmooth ?? true,
          edges: resolved.refs,
        }
        : {
          mode: step.mode ?? 2,
          propagateSmooth: step.propagateSmooth ?? true,
          edges: resolved.refs,
          values1: step.values1 ?? step.distanceMm,
          values2: step.values2 ?? step.values1 ?? step.distanceMm,
        };
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: step.kind,
        params,
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'booleanBodies') {
      const resolveKeys = (names: string[], label: string): string[] => {
        const keys: string[] = [];
        for (const name of names) {
          const bodyKeys = bodyKeysByFeatureName.get(name);
          if (!bodyKeys || bodyKeys.length !== 1)
            throw new Error(
              `${spec.id}/${step.name}: ${label} ${name} 的新 body 数=${bodyKeys?.length ?? 0}，须恰 1`,
            );
          keys.push(bodyKeys[0]!);
        }
        const unique = [...new Set(keys)];
        if (unique.length !== keys.length)
          throw new Error(`${spec.id}/${step.name}: ${label} 指向重复 body`);
        return unique;
      };
      const targets = resolveKeys(step.targetBodyFeatureNames, 'target');
      const tools = resolveKeys(step.toolBodyFeatureNames, 'tool');
      if (targets.length === 0 || tools.length === 0)
        throw new Error(`${spec.id}/${step.name}: targets/tools 不能为空`);
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'booleanBodies',
        params: {
          targets: targets.map((bodyKey) => ({ bodyKey })),
          tools: tools.map((bodyKey) => ({ bodyKey })),
          operation: step.operation,
          keepTools: step.keepTools ?? false,
        },
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'transform') {
      let targetBodyId: string | undefined;
      if (step.targetBodyFeatureName) {
        const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
        if (!keys || keys.length !== 1)
          throw new Error(
            `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
          );
        targetBodyId = keys[0]!;
      }
      if (
        !step.translation && !step.rotation
        && step.scale === undefined && !step.scaleAxes
      )
        throw new Error(`${spec.id}/${step.name}: transform 至少一个平移/旋转/缩放`);
      const params = {
        ...(step.translation ? { translation: step.translation } : {}),
        ...(step.rotation ? { rotation: step.rotation } : {}),
        ...(step.scale !== undefined ? { scale: step.scale } : {}),
        ...(step.scaleAxes ? { scaleAxes: step.scaleAxes } : {}),
        ...(step.scaleOrigin ? { scaleOrigin: step.scaleOrigin } : {}),
        ...(step.copy !== undefined ? { copy: step.copy } : {}),
      };
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'transform',
        params,
        ...(targetBodyId ? { targetBodyId } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'splitPart') {
      let targetBodyId: string | undefined;
      if (step.targetBodyFeatureName) {
        const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
        if (!keys || keys.length !== 1)
          throw new Error(
            `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
          );
        targetBodyId = keys[0]!;
      }
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'splitPart',
        params: {
          plane: step.plane,
          ...(step.offsetMm !== undefined ? { offsetMm: step.offsetMm } : {}),
          keepSide: step.keepSide,
        },
        ...(targetBodyId ? { targetBodyId } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'faceExtrude') {
      const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
      if (!keys || keys.length !== 1)
        throw new Error(
          `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
        );
      const bodyId = keys[0]!;
      const resolved = await resolveLiveShellFaceRefs(page, ctx, token, [step.face], bodyId);
      if (resolved.refs.length !== 1)
        throw new Error(`${spec.id}/${step.name}: faceExtrude 首版须恰 1 个面`);
      notes.push(`${step.name}: ${resolved.notes.join('; ')}`);
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'faceExtrude',
        params: {
          bodyId,
          faceRef: resolved.refs[0]!,
          operation: step.operation,
          endBound: step.endBound,
          ...(step.depthMm !== undefined ? { depthMm: step.depthMm } : {}),
          ...(step.direction ? { direction: step.direction } : {}),
          ...(step.startOffsetMm !== undefined ? { startOffsetMm: step.startOffsetMm } : {}),
          ...(step.draftAngleDeg !== undefined ? { draftAngleDeg: step.draftAngleDeg } : {}),
          ...(step.draftPullDirection !== undefined
            ? { draftPullDirection: step.draftPullDirection }
            : {}),
        },
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'moveFace') {
      let targetBodyId: string | undefined;
      if (step.targetBodyFeatureName) {
        const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
        if (!keys || keys.length !== 1)
          throw new Error(
            `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
          );
        targetBodyId = keys[0]!;
      }
      if ((step.distanceMm === undefined) === (step.distancesMm === undefined))
        throw new Error(`${spec.id}/${step.name}: distanceMm/distancesMm 须恰一`);
      const resolved = await resolveLiveShellFaceRefs(page, ctx, token, step.faces, targetBodyId);
      if (resolved.bodyKeys.length !== 1)
        throw new Error(`${spec.id}/${step.name}: 面跨 ${resolved.bodyKeys.length} 个 body，须恰 1`);
      notes.push(`${step.name}: ${resolved.notes.join('; ')}`);
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'moveFace',
        params: {
          faces: resolved.refs,
          ...(step.distanceMm !== undefined ? { distanceMm: step.distanceMm } : {}),
          ...(step.distancesMm ? { distancesMm: step.distancesMm } : {}),
        },
        ...(targetBodyId ? { targetBodyId } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    if (step.kind === 'shell') {
      let targetBodyId: string | undefined;
      if (step.targetBodyFeatureName) {
        const keys = bodyKeysByFeatureName.get(step.targetBodyFeatureName);
        if (!keys || keys.length !== 1)
          throw new Error(
            `${spec.id}/${step.name}: 目标特征 ${step.targetBodyFeatureName} 的新 body 数=${keys?.length ?? 0}，须恰 1`,
          );
        targetBodyId = keys[0]!;
      }
      const resolved = await resolveLiveShellFaceRefs(page, ctx, token, step.faces, targetBodyId);
      if (resolved.bodyKeys.length !== 1)
        throw new Error(`${spec.id}/${step.name}: 面跨 ${resolved.bodyKeys.length} 个 body，须恰 1`);
      notes.push(`${step.name}: ${resolved.notes.join('; ')}`);
      const featureId = await apply({
        kind: 'insertFeature',
        featureType: 'shell',
        params: {
          defaultDistance: step.oppositeDirection ? step.thicknessMm : -step.thicknessMm,
          distances: 0,
          faces: resolved.refs,
        },
        ...(targetBodyId ? { targetBodyId } : {}),
      }, step.name);
      featureIdByName.set(step.name, featureId);
      if (step.note) notes.push(`${step.name}: ${step.note}`);
      continue;
    }
    // 类型级兜底：新增 LiveStep 变体必须先在此实现，否则诚实阻塞。
    throw new Error(`${spec.id}: 未支持的 live step ${(step as { kind: string }).kind}`);
  }

  const tree = await getFeatureTreeRpc(ctx, token);
  if (process.env.LIVE_DEBUG === '1')
    console.log(`[live-debug] ${spec.id}/tree=` + JSON.stringify(tree));
  const bodies = await getBodiesRpc(ctx, token);
  const mass = await getMassPropertiesRpc(ctx, token);
  if (process.env.LIVE_DEBUG === '1')
    console.log(`[live-debug] ${spec.id}/mass=` + JSON.stringify(mass));
  return { token, ids, ctx, tree, bodies, mass, notes };
}
