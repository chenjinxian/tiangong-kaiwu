/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图约束创建工具×6（M6-b T5）：coincident / horizontal / vertical /
 * parallel / perpendicular / equal——槽位驱动拾取 + 满槽乐观提交。
 *
 * 语义骨架移植自退役仓 apps/web/features/sketch/tools/SketchAddConstraintTool.ts
 * （M3-b T5，溯源注记）：槽位规则（SolverTypes 冻结契约，槽形表/槽位判定/
 * 就近实体分辨在 sketch-constraint-logic.ts，此处再导出保持 M3-b 引用路径
 * 同构）、满槽构造 `{kind, id:nextConstraintId, refs}` → applyUpdate 乐观
 * 整体覆写 → 拒收（ok:false）清空拾取工具保持存活、右键两层取消语义原样
 * 保留。两层换芯（M6-a T5 SketchCreateTool 先例照搬）：
 *
 * - 取点：**禁手写 z=0 投影**（M3-b planeZ=0 恒定假设已废弃，architecture.md
 *   §四）——AccuSnap 热捕捉 adjustedPoint（含 AccuDraw/栅格调整）优先、回落
 *   ev.point 光标裸点（SketchCreateTool `_pickLocal` 同式），世界点经草图
 *   平面架（sketch-plane.ts，store.sketch.activeSketchPlane → onPostInstall
 *   解析一次）投影为局部 (u,v)，再按解算坐标纯几何就近分辨实体。
 *   **禁手写命中测试**照旧——实体分辨是几何距离，不是视口命中测试。
 * - 运行依赖：**模块级 accessor** getSketchSystem()（M6-a T5 同款——
 *   `IModelApp.tools.run(id)` 无参启动无选项注入通道，宿主 PartStudioSession
 *   挂载 useSketchSystem 时注册）；toast 走 IModelApp.notifications
 *   .outputMessage（web-next 呈现桥 ViewerNotifications → iTwinUI toaster）；
 *   outputPrompt 仍为官方提示通道但 web-next 呈现面未接线（SketchCreateTool
 *   文件头同注记），提示语照常发出待呈现面补齐。
 *
 * 铁律保留（M3-b）：约束满槽**直接提交**（与尺寸工具的「事件桥移交面板」
 * 分立）；v1 单草图假设——命中不校验元素 id（活动草图元素=唯一几何面）。
 */

import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import type { SketchConstraintDto } from '@luban-cad/shared';
import i18next from 'i18next';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { sketchPlaneFrameFrom } from './sketch-plane.js';
import type { SketchPlaneFrame, SketchPoint2 } from './sketch-plane.js';
import {
  acceptPick,
  nextConstraintId,
  pickPrompt,
  resolveNearestEntityId,
} from './sketch-constraint-logic.js';
import type { PickVerdict, SketchConstraintKind, SketchEntityKind } from './sketch-constraint-logic.js';

export { acceptPick, CONSTRAINT_SLOT_SHAPES, nextConstraintId, pickPrompt, resolveNearestEntityId } from './sketch-constraint-logic.js';
export type { PickVerdict, SketchConstraintKind } from './sketch-constraint-logic.js';

/** 活动草图平面架（store 当前活动草图 plane → 缺省 XY@z=0；onPostInstall 解析一次）。 */
export function resolveSketchPlaneFrame(): SketchPlaneFrame {
  return sketchPlaneFrameFrom(usePartStudioStore.getState().sketch.activeSketchPlane);
}

/**
 * 取点（约束/尺寸两工具共用）：AccuSnap 热捕捉 adjustedPoint 优先（含
 * AccuDraw/栅格调整），回落 ev.point 光标裸点；世界点经草图平面架投影为
 * 局部 (u,v)——取代 M3-b 手写 z=0 投影（M6-a T5 SketchCreateTool 同式）。
 */
export function pickHitLocal(ev: BeButtonEvent, plane: SketchPlaneFrame): SketchPoint2 {
  const snap = IModelApp.accuSnap?.getCurrSnapDetail();
  const world = snap && snap.isHot ? snap.adjustedPoint : ev.point;
  return plane.toLocal(world);
}

/**
 * 草图约束创建工具抽象基类：拾取实体入槽 → 满槽即提交（值约束无——
 * distance/radius 在 SketchAddDimensionTool，经事件桥走面板收值）。
 */
export abstract class SketchAddConstraintTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';

  /** 约束种类（子类固定）。 */
  protected abstract readonly constraintKind: SketchConstraintKind;
  public static override iconSpec = 'icon-constraint';

  /** 已拾取实体 id 序（满槽即提交/退出；失败清空重选）。 */
  private _refs: number[] = [];
  /** 已拾取实体种类序（槽位判定输入）。 */
  private _pickedKinds: SketchEntityKind[] = [];
  /** 草图平面架（onPostInstall 解析：store 当前活动草图 plane → 缺省 XY@z=0）。 */
  private _plane!: SketchPlaneFrame;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    // 不 locate 元素（无定位圈）但开启 AccuSnap 吸附——端点吸附精确并列 →
    // point 实体凭 kind 优先获胜（initLocateElements(false) 缺省会关吸附，
    // M6-a T5 实测注记）。
    this.initLocateElements(false, true);
    this._outputPrompt(pickPrompt(this.constraintKind, []));
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }

    // 取点：AccuSnap 热捕捉 adjustedPoint 优先，回落 ev.point；世界点投影入
    // 草图面（局部 (u,v)）。
    const hit = pickHitLocal(ev, this._plane);

    // v1 单草图假设（M3-b 铁律保留）：不校验命中元素 id（活动草图元素=唯一
    // 几何面），光标点到活动草图实体就近分辨。
    const entityId = resolveNearestEntityId(sketch.entities, hit);
    if (entityId === undefined) {
      this._notify(i18next.t('partStudio.sketch.toasts.noSolvedCoords'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const entity = sketch.entities.find((e) => e.id === entityId);
    if (!entity) return EventHandled.Yes;

    if (this._refs.includes(entity.id)) {
      this._notify(i18next.t('partStudio.sketch.toasts.alreadyPicked'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    const verdict: PickVerdict = acceptPick(this.constraintKind, this._pickedKinds, entity.kind);
    if (!verdict.ok) {
      // 拒收不消耗点击：拾取状态原样，继续等待下一次合法输入。
      this._notify(verdict.message ?? i18next.t('partStudio.sketch.constraint.slotMismatch'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    this._refs.push(entity.id);
    this._pickedKinds.push(entity.kind);

    if (!verdict.complete) {
      this._outputPrompt(pickPrompt(this.constraintKind, this._pickedKinds));
      return EventHandled.Yes;
    }

    // 满槽 → 构造约束（id=全局 maxId+1）→ applyUpdate 追加提交（整体覆写
    // 语义；实体原样在前）。约束满槽直接提交——与尺寸工具的事件桥移交分立。
    const newConstraint: SketchConstraintDto = {
      kind: this.constraintKind,
      id: nextConstraintId(sketch),
      refs: [...this._refs],
    };
    const result = await sketchSystem.applyUpdate(sketch.entities, [...sketch.constraints, newConstraint]);
    if (!result.ok) {
      // 后端拒收零变更（库侧无写入）——拾取清空（草稿=参数数组，仅提交时
      // 追加，无本地残留）；拒收文本（含 dof/冲突 id）原样透出，工具保持
      // 存活可立即重选。
      this._clearPicks();
      this._notify(result.error ?? i18next.t('partStudio.sketch.toasts.updateFailed'), OutputMessagePriority.Error);
      this._outputPrompt(pickPrompt(this.constraintKind, []));
      return EventHandled.No;
    }

    await this.exitTool();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._refs.length > 0) {
      // 取消进行中的拾取序列，工具保持存活（再右键退出）——M3-b 两层语义。
      this._clearPicks();
      this._outputPrompt(pickPrompt(this.constraintKind, []));
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** PrimitiveTool 抽象槽位：外部事件要求重启时换新实例重挂（accessor 模块级，无选项需透传）。 */
  public override async onRestartTool(): Promise<void> {
    const tool = this.createInstance();
    if (!(await tool.run())) return this.exitTool(); // 新实例拒装不得留旧实例
  }

  /** 重启用实例工厂（子类返回自身类型新实例）。 */
  protected abstract createInstance(): SketchAddConstraintTool;

  private _clearPicks(): void {
    this._refs = [];
    this._pickedKinds = [];
  }

  private _outputPrompt(prompt: { key: string; params?: Record<string, unknown> }): void {
    IModelApp.notifications.outputPrompt(i18next.t(prompt.key, prompt.params));
  }

  /** 错误/信息面走 outputMessage（呈现桥 ViewerNotifications → iTwinUI toaster）。 */
  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

/** 重合：2 point。 */
export class CoincidentAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.Constraint.Coincident';
  public static override iconSpec = 'icon-constraint-coincident';
  protected readonly constraintKind = 'coincident';
  protected createInstance(): SketchAddConstraintTool { return new CoincidentAddTool(); }
}

/** 水平：1 line 或 2 point。 */
export class HorizontalAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.Constraint.Horizontal';
  public static override iconSpec = 'icon-constraint-horizontal';
  protected readonly constraintKind = 'horizontal';
  protected createInstance(): SketchAddConstraintTool { return new HorizontalAddTool(); }
}

/** 竖直：1 line 或 2 point（M3-b T8 口径：与 perpendicular「垂直」消歧）。 */
export class VerticalAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.Constraint.Vertical';
  public static override iconSpec = 'icon-constraint-vertical';
  protected readonly constraintKind = 'vertical';
  protected createInstance(): SketchAddConstraintTool { return new VerticalAddTool(); }
}

/** 平行：2 line。 */
export class ParallelAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.Constraint.Parallel';
  public static override iconSpec = 'icon-constraint-parallel';
  protected readonly constraintKind = 'parallel';
  protected createInstance(): SketchAddConstraintTool { return new ParallelAddTool(); }
}

/** 垂直（两线）：2 line。 */
export class PerpendicularAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.Constraint.Perpendicular';
  public static override iconSpec = 'icon-constraint-perpendicular';
  protected readonly constraintKind = 'perpendicular';
  protected createInstance(): SketchAddConstraintTool { return new PerpendicularAddTool(); }
}

/** 等长/等半径：2 line 或 2 circle（不得混搭）。 */
export class EqualAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.Constraint.Equal';
  public static override iconSpec = 'icon-constraint-equal';
  protected readonly constraintKind = 'equal';
  protected createInstance(): SketchAddConstraintTool { return new EqualAddTool(); }
}

/**
 * 注册草图约束 6 工具（M6-b T5；幂等——模块级 flag）。注册点=PartStudioPage
 * 工具注册编排（registerSketchTools 之后同 try 块）；懒引与幂等语义见
 * registerSketchTools（SketchCreateTool.ts）。
 */
let constraintToolsRegistered = false;
export function registerSketchConstraintTools(): void {
  if (constraintToolsRegistered) return;
  IModelApp.tools.register(CoincidentAddTool);
  IModelApp.tools.register(HorizontalAddTool);
  IModelApp.tools.register(VerticalAddTool);
  IModelApp.tools.register(ParallelAddTool);
  IModelApp.tools.register(PerpendicularAddTool);
  IModelApp.tools.register(EqualAddTool);
  constraintToolsRegistered = true;
}
