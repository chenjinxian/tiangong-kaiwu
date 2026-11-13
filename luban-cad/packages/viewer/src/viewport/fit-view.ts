/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 内容感知取景公开出口（从 use-viewport 私有实现提升，2026-11-02）：
 * 按物理模型联合范围（后端 ECSQL，不依赖 tile 时序）调用 `lookAtVolume`。
 * 特征提交后自动取景与页签条「适应视图」共用。
 *
 * 注意：模型范围是世界坐标，必须走 `lookAtVolume`（内部旋转到 view-aligned）；
 * 直接喂 `lookAtViewAlignedVolume` 会在非轴对齐视图中错位/裁切。
 */

import type { IModelConnection, ScreenViewport } from '@itwin/core-frontend';
import { Range3d } from '@itwin/core-geometry';
import { datumPlanesRange, lookAtDatumPlanes } from './empty-datum-view.js';
import { datumPlaneHalfSize } from './decorations/datum-planes-decoration.js';

export interface FitViewToModelRangesOptions {
  /** 晚到结果守卫（scope 切换/卸载后不落相机）；默认恒真。 */
  isCurrent?: () => boolean;
}

/** 屏幕留白（与 core-frontend lookAtVolume 的 paddingPercent 同义）。 */
export interface FitVisibleContentPadding {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/**
 * 「缩放到合适大小」输入（2026-11-13 Onshape live）：
 * - modelIds：视口实际展示的模型（B=当前 scope；undefined=A legacy 全部）。
 * - sketchRange：活动草图的世界范围（草图编辑时装饰可见，参与取景）。
 * - datumPlanesVisible：无任何模型/草图范围时，基准面装饰是否可见（空 PS）。
 * 绝不回退 projectExtents；无可见内容时 no-op（保持相机）。
 */
export interface FitVisibleContentOptions {
  modelIds?: readonly string[];
  sketchRange?: Range3d;
  datumPlanesVisible?: boolean;
  paddingPercent?: number | FitVisibleContentPadding;
  /** 晚到结果守卫（scope 切换/卸载后不落相机）；默认恒真。 */
  isCurrent?: () => boolean;
}

/**
 * Onshape 语义的「缩放到合适大小」：只取视口中**可见**内容（模型几何 ∪
 * 活动草图），空场景才用基准面装饰范围兜底；不改旋转（lookAtVolume 按当前
 * 旋转投影），不出现 projectExtents。返回 false = 无可见内容/查询失败。
 */
export async function fitViewToVisibleContent(
  viewport: ScreenViewport | undefined,
  options: FitVisibleContentOptions = {},
): Promise<boolean> {
  if (!viewport)
    return false;
  const ids = options.modelIds
    ?? (await queryAllPhysicalModelIds(viewport.iModel));
  if (options.isCurrent && !options.isCurrent())
    return false;
  const union = new Range3d();
  if (ids && ids.length > 0) {
    try {
      const ranges = await viewport.iModel.models.queryModelRanges([...ids]);
      if (options.isCurrent && !options.isCurrent())
        return false;
      for (const r of ranges)
        union.extendRange(Range3d.fromJSON(r));
    } catch {
      // 模型范围查询失败不阻断草图/基准面取景（几何可能尚未落定）。
    }
  }
  if (options.sketchRange)
    union.extendRange(options.sketchRange);
  // 基准面只是空场景的可见内容兜底；有模型/草图时按 live 证据不并入
  //（Onshape f 键取景草图实体，基准面边框可越过视口边缘）。
  if (union.isNull && options.datumPlanesVisible)
    union.extendRange(datumPlanesRange(datumPlaneHalfSize(viewport)));
  if (union.isNull)
    return false;
  viewport.view.lookAtVolume(union, viewport.viewRect.aspect,
    options.paddingPercent !== undefined ? { paddingPercent: options.paddingPercent } : undefined);
  viewport.synchWithView({});
  return true;
}

/** 全部 PhysicalModel id；查询失败返回 undefined（与空集区分）。 */
export async function queryAllPhysicalModelIds(iModel: IModelConnection): Promise<string[] | undefined> {
  try {
    const query = 'SELECT ECInstanceId FROM BisCore.PhysicalModel';
    const rows: string[] = [];
    for await (const row of iModel.createQueryReader(query))
      rows.push(row[0] as string);
    return rows;
  } catch {
    return undefined;
  }
}

/**
 * 使给定模型（缺省=全部 PhysicalModel）联合范围充满视口。
 * 无模型/范围为空/查询失败 → no-op 返回 false（调用方可静默）。
 * @param modelIds 显式白名单（B active scope）；undefined = 查询全部（A legacy）。
 */
export async function fitViewToModelRanges(
  viewport: ScreenViewport | undefined,
  modelIds?: readonly string[],
  options?: FitViewToModelRangesOptions,
): Promise<boolean> {
  if (!viewport) return false;
  const ids = modelIds ? [...modelIds] : await queryAllPhysicalModelIds(viewport.iModel);
  if (!ids || ids.length === 0) return false;
  if (options?.isCurrent && !options.isCurrent()) return false;
  try {
    const ranges = await viewport.iModel.models.queryModelRanges(ids);
    if (options?.isCurrent && !options.isCurrent()) return false;
    const union = new Range3d();
    for (const r of ranges) union.extendRange(Range3d.fromJSON(r));
    // ADR-0017 追补：空 Part Studio 没有几何范围——按 Onshape Home 取景三基准面
    //（「适应视图」在空文档上也有可见结果，而不是 no-op）。
    if (union.isNull) return lookAtDatumPlanes(viewport);
    // 留白：避免取景贴边（演示时更接近 Onshape 的「适应视图」观感）。
    viewport.view.lookAtVolume(union, viewport.viewRect.aspect, {
      paddingPercent: { left: 0.06, right: 0.06, top: 0.08, bottom: 0.08 },
    });
    viewport.synchWithView({});
    return true;
  } catch {
    return false;
  }
}
