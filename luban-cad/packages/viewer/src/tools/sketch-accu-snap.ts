/**
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *
 * SketchAccuSnap（M6-a T5）：草图绘制向的 AccuSnap 子类——核心机制复用
 * itwinjs-core 标准件（AccuSnap.ts:280-284 `getActiveSnapModes` 钩子：返回
 * 有序 SnapMode 数组，首位最高优先级，首个产出热捕捉的模式生效），把默认
 * 单模式 [NearestKeypoint] 扩为九模式全量优先级表（HitDetail.ts:22-32 的
 * 九种位掩码枚举全员）：
 *
 *   端点/关键点 → 中点 → 圆心 → 交点 → 垂足 → 切点 → 原点 → 最近点 → 角平分
 *
 * 草图闭环焊接（线/弧端点吸附）走 NearestKeypoint 首位；中点/圆心/交点为
 * Tutorial 2 带弧草图链的常用参照。
 *
 * 生效面与边界（诚实登记）：
 * - 经 web-initializer 的 IModelApp.startup 选项 `accuSnap` 注册为**应用级
 *   单例**（IModelApp.ts:470 `opts.accuSnap ?? new AccuSnap()`）——iTwin.js
 *   无按工具换捕捉模式的通道（getActiveSnapModes 调在单例上），故测量/变换
 *   等既有工具的捕捉面同步变宽（加法式 UX，非破坏性变更；若后续要按工具
 *   差异化，再上 ToolAdmin/工具态联动单裁）。
 * - 「草图实体装饰可捕捉」（testDecorationHit/getDecorationGeometry）不适用：
 *   本里程碑预览走 Dynamics 通道（非 Decorator），草图实体是 iModel 真实
 *   几何（后端几何流写回），元素命中即可捕捉，无需装饰命中扩展。
 */

import { AccuSnap, SnapMode } from '@itwin/core-frontend';

export class SketchAccuSnap extends AccuSnap {
  /** 九模式优先级表（首位最高优先级；有序数组语义，非位掩码）。 */
  public override getActiveSnapModes(): SnapMode[] {
    return [
      SnapMode.NearestKeypoint,
      SnapMode.MidPoint,
      SnapMode.Center,
      SnapMode.Intersection,
      SnapMode.PerpendicularPoint,
      SnapMode.TangentPoint,
      SnapMode.Origin,
      SnapMode.Nearest,
      SnapMode.Bisector,
    ];
  }
}
