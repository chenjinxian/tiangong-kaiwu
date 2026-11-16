/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 绘制中数值标签的纯几何（2026-11-16 E6/S5 Onshape live；W12 扩展直线与圆；
 * W15 扩展三点圆弧；W16 扩展正多边形；W25 复用点标签中点给圆心圆弧）：
 * 矩形拖拽时宽度/高度、直线拖拽时长度的数值贴在对应边旁——边中点、沿边法线
 * 偏移 ~8px，文字随边旋转且保持正立（角度归一到 (−90°, 90°]）；中心点圆与
 * 正多边形（内切/外切）拖拽时直径落在圆心→光标半径段的中点（水平不旋转）；
 * 三点圆弧拖拽时 `R` 半径读数
 * 落在弧角向中点沿「圆心→中点」方向外移 ~8px（水平不旋转）。live 实测蓝字
 * ≈#4a90e2、13.3333px、无底色/描边/引线；产品数值仍沿用既有 mm 两位去尾零格式。
 *
 * 只做显示投影：数值由 sketch-live-measures 产出，边段/点由工具锚点/光标给出；
 * 不碰 IModelApp、RPC、schema 或草图数据（P0-06 派生显示数据只做投影）。
 */
import type { SketchPoint2 } from './sketch-plane.js';

/** 视口坐标点（CSS px；与 BeButtonEvent.viewPoint、反馈总线 cursor 同系）。 */
export interface SketchEdgePoint {
  x: number;
  y: number;
}

/** 一条标注边（草图局部坐标；由工具投影到视口后再进反馈总线）。 */
export interface SketchEdgeSegment {
  start: SketchPoint2;
  end: SketchPoint2;
}

/** 轴对齐矩形拖拽中的两条标注边（宽度边 + 高度边）。 */
export interface SketchRectangleEdgeSegments {
  /** 宽度边（矩形第一条轴 = 草图局部 u 方向；长度=宽）。 */
  width: SketchEdgeSegment;
  /** 高度边（草图局部 v 方向；长度=高）。 */
  height: SketchEdgeSegment;
}

/** 视口坐标边段（CSS px；标签渲染输入）。 */
export interface SketchViewEdgeSegment {
  start: SketchEdgePoint;
  end: SketchEdgePoint;
}

/** 边标签的显示布局（边中点沿法线外移后的中心 + 正立旋转角）。 */
export interface SketchEdgeLabelLayout {
  x: number;
  y: number;
  /** 旋转角（度；值域 (−90°, 90°]，文字不会上下颠倒）。 */
  angleDeg: number;
}

/** 标签距边中点的法向偏移（px；Onshape live 拖拽读数约 8px）。 */
export const SKETCH_EDGE_LABEL_OFFSET_PX = 8;

/**
 * 轴对齐矩形（拐角矩形/中心矩形）拖拽中宽/高两条边（草图局部坐标）：
 * - `rectangle`：首点=角点 A；宽边 A → (cursor.u, A.v)，高边 (cursor.u, A.v) → cursor。
 * - `centerRectangle`：首点=中心 M；可见矩形对角点为 M 的反射点 A=2M−cursor，
 *   边段从 A 起算（宽度值仍等于 2·|cursor.u−M.u|，与 computeSketchLiveMeasures 同口径）。
 * 对齐矩形是 3 点且相对草图轴旋转的状态机，不适用本投影（保持既有白卡片）。
 */
export function sketchRectangleEdgeSegments(
  kind: 'rectangle' | 'centerRectangle',
  anchor: SketchPoint2,
  cursor: SketchPoint2,
): SketchRectangleEdgeSegments {
  const corner: SketchPoint2 = kind === 'centerRectangle'
    ? { u: 2 * anchor.u - cursor.u, v: 2 * anchor.v - cursor.v }
    : anchor;
  const elbow: SketchPoint2 = { u: cursor.u, v: corner.v };
  return {
    width: { start: corner, end: elbow },
    height: { start: elbow, end: cursor },
  };
}

/**
 * 边段 → 标签布局（纯函数）：
 * - 位置 = 边中点沿边法线偏移 offsetPx；法线默认取边向量 +90°（屏幕 y 向下的
 *   画面里即“上侧”）；给了 `interior`（矩形内部任一点）时取背离该点的一侧=外侧；
 * - 旋转角 = 边方向角，归一到 (−90°, 90°]（>90° 或 ≤−90° 加 180°）保持文字正立；
 * - 零长度边返回 undefined（不渲染歧义标签）。
 */
export function layoutSketchEdgeLabel(
  start: SketchEdgePoint,
  end: SketchEdgePoint,
  interior?: SketchEdgePoint,
  offsetPx: number = SKETCH_EDGE_LABEL_OFFSET_PX,
): SketchEdgeLabelLayout | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return undefined;

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  let nx = dy / length;
  let ny = -dx / length;
  if (interior !== undefined && (interior.x - midX) * nx + (interior.y - midY) * ny > 0) {
    // 法线指向矩形内侧 → 翻转取外侧（Onshape live：数值贴在边外）。
    nx = -nx;
    ny = -ny;
  }

  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // 正立区间取 (−90°, 90°]：−90° 也加 180° 归到 +90°，同一竖边向上/向下
  // 拖拽得到同一旋转（文字方向不随绘制方向翻转）。
  if (angleDeg > 90) angleDeg -= 180;
  else if (angleDeg <= -90) angleDeg += 180;

  return { x: midX + nx * offsetPx, y: midY + ny * offsetPx, angleDeg };
}

/**
 * 直线拖拽长度标签的边段（视口坐标；W12）：端点按视口 x 递增规范化（竖线按
 * y 递增）。标签法向取边向量 +90°，规范化后读数稳定落在线的“上方”一侧
 * （live：中点略上方）；交换端点不改变中点，旋转角由覆盖层归一到正立区间。
 * 只对单条边标签有意义——矩形两条边仍由 `sketchRectangleEdgeSegments` +
 * 内部参考点决定外侧。
 */
export function sketchLineEdgeSegment(start: SketchEdgePoint, end: SketchEdgePoint): SketchViewEdgeSegment {
  const flip = start.x > end.x || (start.x === end.x && start.y > end.y);
  return flip ? { start: end, end: start } : { start, end };
}

/**
 * 点标签中心（视口坐标；W12）：两点中点。中心点圆/正多边形的直径读数落在
 * 圆心→光标的半径段中点（live：水平不旋转）；W25 圆心圆弧半径读数同样落在
 * 圆心→半径点（阶段 1 光标 / 阶段 2 起点）的投影中点；W28 相切圆弧半径读数
 * 落在「切点→光标（弧终点）」弦的投影中点。
 */
export function sketchPointLabelCenter(center: SketchEdgePoint, cursor: SketchEdgePoint): SketchEdgePoint {
  return { x: (center.x + cursor.x) / 2, y: (center.y + cursor.y) / 2 };
}

/**
 * 三点圆弧 `R` 半径点标签中心（视口坐标；W15）：弧角向中点沿「圆心→中点」
 * 方向外移 offsetPx（与贴边标签同一偏移，live：读数贴弧外侧）。中心与中点的
 * 视口投影重合（退化弧/极端取景）时回退到中点本身，不产生 NaN 坐标。
 */
export function sketchArcPointLabelCenter(
  center: SketchEdgePoint,
  midpoint: SketchEdgePoint,
  offsetPx: number = SKETCH_EDGE_LABEL_OFFSET_PX,
): SketchEdgePoint {
  const dx = midpoint.x - center.x;
  const dy = midpoint.y - center.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return { x: midpoint.x, y: midpoint.y };
  return { x: midpoint.x + (dx / length) * offsetPx, y: midpoint.y + (dy / length) * offsetPx };
}
