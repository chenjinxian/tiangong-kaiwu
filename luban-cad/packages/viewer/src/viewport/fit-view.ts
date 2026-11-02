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

export interface FitViewToModelRangesOptions {
  /** 晚到结果守卫（scope 切换/卸载后不落相机）；默认恒真。 */
  isCurrent?: () => boolean;
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
    if (union.isNull) return false;
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
