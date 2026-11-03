/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 默认几何图元有效可见性（2026-11-02 Onshape 对齐）。
 *
 * 规则（自上而下，后者覆盖前者）：
 * 1. 无 authored body：Origin + 三平面全显；
 * 2. 有 authored body：全部隐藏（含 Origin——与 live Onshape 采集一致）；
 * 3. 活动草图落在默认基准面上：只显示该基准面（其它平面隐藏；Origin 随
 *    第 1/2 条）；
 * 4. 用户眼睛覆盖最后生效（scope 切换时清空覆盖）。
 *
 * 这层只产出可见性布尔值；datum 合成 id 永不进入 tree/canvas 隐藏集。
 */
import type { SketchPlaneDto } from '@luban-cad/shared';
import type { DatumId } from '../types.js';

export type DatumVisibility = Record<DatumId, boolean>;

export interface DatumVisibilityInput {
  /** 已加载/树回退得到的 authored body 是否存在。 */
  hasBodies: boolean;
  /** 草图模式是否活动。 */
  isSketchActive: boolean;
  /** 活动草图平面（null=契约缺省 XY@z=0；undefined=尚未读到）。 */
  activeSketchPlane?: SketchPlaneDto | null;
  /**
   * 新建草图对话框打开中（尚未选定平面）：Onshape 此时把三个基准面露出来
   * 供视口拾取——即使已有 body、平时已自动隐藏。
   */
  isPlanePicking?: boolean;
  /** 用户眼睛覆盖（只写过的项）。 */
  overrides?: Partial<Record<DatumId, boolean>>;
}

const PLANE_EPSILON = 1e-6;

/** 平面法向是否轴对齐且过世界原点；是则映射到对应默认基准面。 */
export function datumPlaneFromSketch(plane: SketchPlaneDto | null | undefined): DatumId | undefined {
  if (plane === null || plane === undefined)
    return 'top';

  const n = plane.normal;
  const len = Math.hypot(n.x, n.y, n.z);
  if (!Number.isFinite(len) || len < PLANE_EPSILON)
    return undefined;

  const nx = n.x / len;
  const ny = n.y / len;
  const nz = n.z / len;
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  const dominant = Math.max(ax, ay, az);
  if (dominant < 0.999)
    return undefined;

  const origin = plane.origin;
  const distance = Math.abs(origin.x * nx + origin.y * ny + origin.z * nz);
  if (distance > PLANE_EPSILON)
    return undefined;

  if (az === dominant) return 'top';
  if (ay === dominant) return 'front';
  return 'right';
}

/** 纯自动规则（不含用户覆盖）。 */
export function autoDatumVisibility(input: Omit<DatumVisibilityInput, 'overrides'>): DatumVisibility {
  if (!input.hasBodies)
    return { origin: true, top: true, front: true, right: true };

  // 新建草图选平面：三面全显（可拾取），Origin 沿用 body 在场时的隐藏规则。
  if (input.isPlanePicking)
    return { origin: false, top: true, front: true, right: true };

  const visibility: DatumVisibility = { origin: false, top: false, front: false, right: false };
  if (!input.isSketchActive)
    return visibility;

  const plane = datumPlaneFromSketch(input.activeSketchPlane);
  if (plane !== 'origin')
    visibility[plane ?? 'top'] = true;
  return visibility;
}

/** 自动规则 + 用户覆盖（覆盖只改对应 id，不影响其它平面）。 */
export function resolveDatumVisibility(input: DatumVisibilityInput): DatumVisibility {
  const auto = autoDatumVisibility(input);
  if (!input.overrides)
    return auto;

  return {
    origin: input.overrides.origin ?? auto.origin,
    top: input.overrides.top ?? auto.top,
    front: input.overrides.front ?? auto.front,
    right: input.overrides.right ?? auto.right,
  };
}

/** 有效可见性相等比较（Session 同步 effect 防自反馈空转）。 */
export function datumVisibilityEqual(a: DatumVisibility, b: DatumVisibility): boolean {
  return a.origin === b.origin && a.top === b.top && a.front === b.front && a.right === b.right;
}
