/**
 * ADR-0017 追补：零件读面的「真实体」投影（UI 唯一显示口径）。
 *
 * 后端每个 Part Studio 初始化时都会建一个 **init BodySolid**（占位载体，无
 * FeatureDrive 源、无几何）。Onshape 空 Part Studio 的「零件数」为 0，而
 * 直接透传会让空文档显示 “Body 1 0 mm³”，并把默认基准面误判为「有实体」
 * 而隐藏。本投影只保留：
 * - active ∧ authored body；
 * - 有 sourceFeatureId 的（正常特征驱动体）；
 * - 无源但**确有几何**的（imported/直改副本，需体积证据）；无源且体积为 0/未知
 *   时仅在「树上存在产体特征」时乐观保留（等待体积读数，避免误藏真实副本）。
 */

import type { BodyInfo } from '@luban-cad/shared';
import type { FeatureTreeEntry } from '@luban-cad/shared';

const BODY_PRODUCING_TYPES: ReadonlySet<string> = new Set([
  'extrude', 'revolve', 'booleanAdd', 'booleanSubtract', 'booleanBodies',
  'loft', 'sweep', 'faceExtrude', 'splitPart', 'pattern', 'mirror', 'transform',
  'cPlane', 'hole', 'shell', 'fillet', 'chamfer', 'moveFace',
]);

/** 树内是否存在可能产出/编辑实体的特征（与页面 BODY_PRODUCING_FEATURE_TYPES 同口径子集）。 */
export function treeHasBodyFeature(entries: readonly FeatureTreeEntry[]): boolean {
  return entries.some((entry) => !entry.suppressed && BODY_PRODUCING_TYPES.has(entry.featureType));
}

/**
 * body 读面 → UI 显示体（不含 init 占位体）。
 * @param massByBodyKey 可选逐体质量（已加载时用于识破 0 体积占位体）。
 */
export function bodiesForDisplay(
  bodies: readonly BodyInfo[],
  entries: readonly FeatureTreeEntry[],
  massByBodyKey?: ReadonlyMap<string, { volume: number }>,
): BodyInfo[] {
  const treeProducing = treeHasBodyFeature(entries);
  return bodies.filter((body) => {
    if (!(body.active && body.authored !== false)) return false;
    if (body.sourceFeatureId !== undefined) return true;
    const volume = massByBodyKey?.get(body.bodyKey)?.volume;
    if (typeof volume === 'number' && Number.isFinite(volume)) return volume > 1e-9;
    // 体积未知：有产体特征时乐观保留（真实直改副本），空文档直接隐藏占位体。
    return treeProducing;
  });
}
