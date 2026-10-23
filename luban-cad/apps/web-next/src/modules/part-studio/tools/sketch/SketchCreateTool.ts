/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图绘制工具链×4（M6-a T5）：线 / 拐角矩形 / 中心点圆 / 3点圆弧。
 *
 * 语义骨架移植自退役仓 apps/web/features/sketch/tools/SketchCreateTool.ts
 * （M3-b T4，溯源注记）——DTO 提交/乐观整体覆写/拒收回滚 id/maxId+1 播种/
 * 右键两层取消语义原样保留；取点与预览层按架构裁决（.superpowers/sdd/
 * 2026-10-23-tutorial2-sketch-chain/architecture.md §二复用清单）换芯为
 * itwinjs-core 标准件：
 *
 * - 取点：AccuSnap 捕捉优先——`IModelApp.accuSnap.getCurrSnapDetail()` 热捕捉
 *   取 `adjustedPoint`（含 AccuDraw/栅格调整，HitDetail.ts:365-401），回落
 *   `ev.point`（AccuDraw 激活时已被罗盘调整入面）。**禁手写命中测试**。
 *   世界点经草图平面架（sketch-plane.ts）投影为局部 (u,v) 提交——取代 M3-b
 *   的手写 z=0 投影（planeZ=0 恒定假设已废弃，architecture.md §四）。
 * - 平面锁定：AccuDraw HintBuilder 三件套（setOrigin=平面原点世界坐标 /
 *   setNormal=平面法向 / setLockZ=true；AccuDraw.ts:3588-3753），onPostInstall
 *   送 hints 激活罗盘；onCleanup 恢复路径=deactivate()（下一 PrimitiveTool
 *   安装时 AccuDraw 恒 onPrimitiveToolInstall→clearContext+Inactive，
 *   AccuDraw.ts:1979-1993——hints 不残留；deactivate 防罗盘在 Idle/视图
 *   工具下残留显示）。三件套另两件（is3dCompass 子类化 / acsPlaneSnapLock）
 *   属全局面改动，本任务不引入（登记为后续单裁——局部投影已保证提交坐标
 *   恒在草图面上，罗盘锁定是交互辅助层）。
 * - 橡皮筋：**Dynamics 通道**（裁决：弃 M3-b 的 Decorator 自管预览——Dynamics
 *   是 PrimitiveTool 标准预览生命周期（Tool.ts:673-680），帧驱动免手动
 *   invalidateDecorations，且与 AccuDraw 罗盘同帧联动）。onPostInstall
 *   beginDynamics → onDynamicFrame 按已锚点+光标点绘预览 → onCleanup
 *   endDynamics。
 * - 提交：满点 → buildShape 构造草稿 entities/constraints →
 *   `getSketchSystem().applyUpdate([...base, ...draft])` 乐观整体覆写 →
 *   拒收（ok:false）回滚 id 计数 + outputMessage 错误透出（后端拒收文本原样，
 *   含 dof/冲突 id），工具保持存活可立即重画；成功 exitTool。
 * - 实体 id：maxId+1（实体与约束共用一支递增计数器；onPostInstall 与每次
 *   提交前按 activeSketch 重播种）。
 * - 运行依赖：**模块级 accessor**（useSketchSystem.ts 的
 *   registerSketchSystemAccessor/getSketchSystem）——`IModelApp.tools.run(id)`
 *   无参启动无选项注入通道（M3-b 已知坑：AI/键盘路径无 setOptions），宿主
 *   PartStudioSession 挂载 useSketchSystem 时注册。toast 走
 *   IModelApp.notifications.outputMessage（web-next 呈现桥 ViewerNotifications
 *   → iTwinUI toaster）；outputPrompt 仍为官方提示通道但 web-next 呈现面
 *   未接线（桥文件头诚实登记），提示语照常发出待呈现面补齐。
 */

import {
  AccuDrawHintBuilder,
  BeButtonEvent,
  DynamicsContext,
  EventHandled,
  GraphicType,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import type { GraphicBuilder } from '@itwin/core-frontend';
import { Arc3d, Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import i18next from 'i18next';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { sketchPlaneFrameFrom } from './sketch-plane.js';
import type { SketchPlaneFrame, SketchPoint2 } from './sketch-plane.js';

export type SketchCreateKind = 'line' | 'rectangle' | 'circle' | 'arc';

interface SketchShapeDraft {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
}

/** 预览线色（Onshape 草图橙色系前的过渡——M3-b 蓝沿用到 M6-c UI 1:1 再校）。 */
const PREVIEW_COLOR = ColorDef.from(0, 120, 215);

/** 对角两局部点 → 4 角点（A=c1、C=c2；局部 (u,v) 轴对齐——矩形在草图面内轴对齐）。 */
function rectangleCorners(c1: SketchPoint2, c2: SketchPoint2): [SketchPoint2, SketchPoint2, SketchPoint2, SketchPoint2] {
  return [
    { u: c1.u, v: c1.v },
    { u: c2.u, v: c1.v },
    { u: c2.u, v: c2.v },
    { u: c1.u, v: c2.v },
  ];
}

/** 局部点 → 局部 z=0 的 Point3d（core-geometry 曲线构造的输入形态）。 */
function toLocal3d(p: SketchPoint2): Point3d {
  return Point3d.create(p.u, p.v, 0);
}

/**
 * 草图绘制工具抽象基类：N 点形状（线/矩形/圆=2 点，3点弧=3 点）通用流程。
 * 子类提供 toolId/提示语键/实体构造（buildShape）与预览构造（buildPreview）；
 * 退化（零长/零面积/零半径/共线）buildShape 返回 undefined。
 */
export abstract class SketchCreateTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';

  /** 形状种类（测试/诊断面）。 */
  protected abstract readonly sketchKind: SketchCreateKind;
  /** 满点所需锚点数（线/矩形/圆=2，3点弧=3）。 */
  protected abstract readonly requiredPoints: number;
  /** 分阶段提示语 i18n 键（索引=当前已锚点数；调用时翻译，避免语言快照）。 */
  protected abstract readonly promptKeys: readonly string[];
  /** 退化拒收 toast i18n 键（零长/零面积/零半径/共线各自措辞）。 */
  protected abstract readonly degenerateToastKey: string;

  /** 已锚定点（局部 (u,v)，取点时即投影入草图面）。 */
  private _anchors: SketchPoint2[] = [];
  /** 草图平面架（onPostInstall 解析：store 当前活动草图 plane → 缺省 XY@z=0）。 */
  private _plane!: SketchPlaneFrame;
  /**
   * 实体/约束 id 分配计数器（maxId+1 语义；单调不减——提交成功不回退，
   * 失败回滚到形状构造前快照；onPostInstall 与每次提交前按 activeSketch 重播种）。
   */
  private _nextId = 1;
  /** AccuDraw 是否由本工具 hints 激活（onCleanup 恢复面据此精确 deactivate）。 */
  private _accuDrawActivated = false;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    // 草图平面：store 当前活动草图的 plane（SketchDialog 确认链下发——
    // enterSketch 先归零、onConfirm 再落平面，工具启动读到的恒为本会话平面）；
    // null → 契约缺省 XY@z=0（编辑既有草图的平面回显待契约下发，types.ts 注）。
    this._plane = sketchPlaneFrameFrom(usePartStudioStore.getState().sketch.activeSketchPlane);
    // AccuDraw 平面锁定：HintBuilder setOrigin/setNormal/setLockZ + sendHints 激活。
    const hints = new AccuDrawHintBuilder();
    hints.setOrigin(this._plane.origin);
    hints.setNormal(this._plane.normal);
    hints.setLockZ = true;
    this._accuDrawActivated = hints.sendHints();
    // 不 locate 元素（无定位圈）但开启 AccuSnap 吸附——currHit 取点前提；
    // initLocateElements(false) 缺省会 enableSnap(false) 关掉吸附（M3-b 实测注记）。
    this.initLocateElements(false, true);
    this._seedNextId();
    // Dynamics 通道橡皮筋（帧驱动预览；0 锚点时 onDynamicFrame 早退不绘制）。
    this.beginDynamics();
    this._outputStagePrompt();
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    // AccuDraw 恢复（路径裁决见文件头）：仅本工具激活过时 deactivate；
    // 下一 PrimitiveTool 安装恒 clearContext，hints 不跨工具残留。
    if (this._accuDrawActivated) AccuDrawHintBuilder.deactivate();
    this._anchors = [];
    await super.onCleanup();
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this._anchors.push(this._pickLocal(ev));

    if (this._anchors.length < this.requiredPoints) {
      this._outputStagePrompt();
      return EventHandled.No;
    }

    const points = this._anchors;
    this._anchors = [];

    this._seedNextId();
    const idBase = this._nextId;
    const draft = this.buildShape(points);
    if (!draft) {
      this._notify(this._t(this.degenerateToastKey), OutputMessagePriority.Info);
      this._outputStagePrompt();
      return EventHandled.No;
    }

    const sketchSystem = getSketchSystem();
    if (!sketchSystem) {
      // accessor 未注册（宿主未挂载/已卸载）——回滚 id + 错误透出，工具存活。
      this._nextId = idBase;
      this._notify(this._t('partStudio.sketch.create.toasts.systemNotReady'), OutputMessagePriority.Error);
      return EventHandled.No;
    }

    // 乐观提交（整体覆写语义）：既有实体/约束原样在前，草稿追加在后（M3-b 同构）。
    const base = sketchSystem.activeSketch;
    const entities = [...(base?.entities ?? []), ...draft.entities];
    const constraints = [...(base?.constraints ?? []), ...draft.constraints];
    const result = await sketchSystem.applyUpdate(entities, constraints);
    if (!result.ok) {
      // 后端拒收零变更（库侧无写入）——本地回滚 = 丢弃草稿 + id 计数器复原；
      // 拒收文本原样透出，工具保持存活可立即重画。
      this._nextId = idBase;
      this._notify(result.error ?? this._t('partStudio.sketch.create.toasts.updateFailed'), OutputMessagePriority.Error);
      this._outputStagePrompt();
      return EventHandled.No;
    }

    await this.exitTool();
    return EventHandled.No;
  }

  /** Dynamics 帧回调：已锚点 + 当前光标点 → 预览（WorldOverlay，压顶绘制）。 */
  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    if (this._anchors.length === 0) return;
    const cursor = this._pickLocal(ev);
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    this.buildPreview(this._anchors, cursor, builder);
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._anchors.length > 0) {
      // 取消进行中的形状，工具保持存活（再右键退出）——M3-b 两层语义。
      this._anchors = [];
      this._outputStagePrompt();
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /**
   * 构造形状草稿实体/约束（局部 (u,v) 坐标直出 DTO）；退化返回 undefined。
   * id 经 this.nextEntityId() 分配（实体与约束共用计数器）。
   */
  protected abstract buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined;

  /** 预览构造（局部坐标拼曲线→世界化入 builder）；锚点≥1 时被调。 */
  protected abstract buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void;

  /** 分配下一个实体/约束 id（提交成功消耗；失败由基类复原计数器）。 */
  protected nextEntityId(): number {
    return this._nextId++;
  }

  /** PrimitiveTool 抽象槽位：外部事件要求重启时换新实例重挂（accessor 模块级，无选项需透传）。 */
  public override async onRestartTool(): Promise<void> {
    const tool = this.createInstance();
    if (!(await tool.run())) return this.exitTool(); // 新实例拒装不得留旧实例
  }

  /** 重启用实例工厂（子类返回自身类型新实例）。 */
  protected abstract createInstance(): SketchCreateTool;

  /** 取点：AccuSnap 热捕捉 adjustedPoint 优先，回落 ev.point；世界点投影到草图面 (u,v)。 */
  private _pickLocal(ev: BeButtonEvent): SketchPoint2 {
    const snap = IModelApp.accuSnap?.getCurrSnapDetail();
    const world = snap && snap.isHot ? snap.adjustedPoint : ev.point;
    return this._plane.toLocal(world);
  }

  /** 按 activeSketch 现有全部实体/约束 id 重播种（单调不减，防 refresh 前冲突）。 */
  private _seedNextId(): void {
    const sketch = getSketchSystem()?.activeSketch;
    let max = 0;
    if (sketch) {
      for (const e of sketch.entities) max = Math.max(max, e.id);
      for (const c of sketch.constraints) max = Math.max(max, c.id);
    }
    this._nextId = Math.max(this._nextId, max + 1);
  }

  /** 局部曲线世界化（刚体变换，tryTransformInPlace 恒成功）后入 builder 的助手族。 */
  protected addWorldLineString(builder: GraphicBuilder, points: SketchPoint2[]): void {
    builder.addLineString(points.map((p) => this._plane.toWorld(p)));
  }

  protected addWorldArc(builder: GraphicBuilder, localArc: Arc3d): void {
    localArc.tryTransformInPlace(this._plane.localToWorld);
    builder.addArc(localArc, false, false);
  }

  /** 局部 3 点（z=0）→ 世界化 Arc3d；共线/退化返回 undefined（createCircularStartMiddleEnd 共线时退化为 LineString3d）。 */
  protected tryWorldArc3Point(start: SketchPoint2, middle: SketchPoint2, end: SketchPoint2): Arc3d | undefined {
    const curve = Arc3d.createCircularStartMiddleEnd(toLocal3d(start), toLocal3d(middle), toLocal3d(end));
    if (!(curve instanceof Arc3d)) return undefined;
    curve.tryTransformInPlace(this._plane.localToWorld);
    return curve;
  }

  private _outputStagePrompt(): void {
    const key = this.promptKeys[Math.min(this._anchors.length, this.promptKeys.length - 1)];
    if (key) IModelApp.notifications.outputPrompt(this._t(key));
  }

  /** 调用时翻译（i18next 单例直取——与 useFeatureSystem 同口径，回调内不吃闭包旧语）。 */
  protected _t(key: string): string {
    return i18next.t(key);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

/** 直线：2 点 → 2 point + 1 line。 */
export class SketchLineTool extends SketchCreateTool {
  public static override toolId = 'Sketch.Line';
  public static override iconSpec = 'icon-line';
  protected readonly sketchKind = 'line';
  protected readonly requiredPoints = 2;
  protected readonly promptKeys = [
    'partStudio.sketch.create.line.firstPrompt',
    'partStudio.sketch.create.line.nextPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.zeroSize';

  protected createInstance(): SketchCreateTool { return new SketchLineTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [p1, p2] = points;
    if (!p1 || !p2) return undefined; // 点数不足（状态机保证 2 点，防御收窄）
    if (Math.hypot(p1.u - p2.u, p1.v - p2.v) < 1e-12) return undefined; // 零长度

    const id1 = this.nextEntityId();
    const id2 = this.nextEntityId();
    const idLine = this.nextEntityId();
    return {
      entities: [
        { kind: 'point', id: id1, x: p1.u, y: p1.v },
        { kind: 'point', id: id2, x: p2.u, y: p2.v },
        { kind: 'line', id: idLine, p1: id1, p2: id2 },
      ],
      constraints: [],
    };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const a0 = anchors[0];
    if (!a0) return;
    this.addWorldLineString(builder, [a0, cursor]);
  }
}

/**
 * 拐角矩形：对角 2 点 → 8 point（每线独立端点）+ 4 line + 4 coincident 角点焊接
 * （M3-b/SketchFlow fixture 同构拓扑：焊接而非共享端点，与求解器契约一致）。
 * 角点在草图面局部 (u,v) 轴对齐。
 */
export class SketchRectangleTool extends SketchCreateTool {
  public static override toolId = 'Sketch.Rectangle';
  public static override iconSpec = 'icon-rectangle';
  protected readonly sketchKind = 'rectangle';
  protected readonly requiredPoints = 2;
  protected readonly promptKeys = [
    'partStudio.sketch.create.rectangle.firstPrompt',
    'partStudio.sketch.create.rectangle.nextPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.zeroSize';

  protected createInstance(): SketchCreateTool { return new SketchRectangleTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [c1, c2] = points;
    if (!c1 || !c2) return undefined; // 点数不足（状态机保证 2 点，防御收窄）
    const [a, b, c, d] = rectangleCorners(c1, c2);
    if (Math.abs(a.u - b.u) < 1e-12 || Math.abs(b.v - c.v) < 1e-12) return undefined; // 零宽/零高

    // 角点序列（每线一对独立端点）：L1=AB L2=BC L3=CD L4=DA
    // 元组解构（各位类型确定——noUncheckedIndexedAccess 下变量索引会加 undefined，解构不会）。
    const ptIds: [number, number, number, number, number, number, number, number] = [
      this.nextEntityId(), this.nextEntityId(), this.nextEntityId(), this.nextEntityId(),
      this.nextEntityId(), this.nextEntityId(), this.nextEntityId(), this.nextEntityId(),
    ];
    const [pA1, pB1, pB2, pC1, pC2, pD1, pD2, pA2] = ptIds;
    const lnIds: [number, number, number, number] = [
      this.nextEntityId(), this.nextEntityId(), this.nextEntityId(), this.nextEntityId(),
    ];
    const [lAB, lBC, lCD, lDA] = lnIds;

    const entities: SketchEntityDto[] = [
      { kind: 'point', id: pA1, x: a.u, y: a.v },
      { kind: 'point', id: pB1, x: b.u, y: b.v },
      { kind: 'point', id: pB2, x: b.u, y: b.v },
      { kind: 'point', id: pC1, x: c.u, y: c.v },
      { kind: 'point', id: pC2, x: c.u, y: c.v },
      { kind: 'point', id: pD1, x: d.u, y: d.v },
      { kind: 'point', id: pD2, x: d.u, y: d.v },
      { kind: 'point', id: pA2, x: a.u, y: a.v },
      { kind: 'line', id: lAB, p1: pA1, p2: pB1 },
      { kind: 'line', id: lBC, p1: pB2, p2: pC1 },
      { kind: 'line', id: lCD, p1: pC2, p2: pD1 },
      { kind: 'line', id: lDA, p1: pD2, p2: pA2 },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'coincident', id: this.nextEntityId(), refs: [pB1, pB2] }, // B 角
      { kind: 'coincident', id: this.nextEntityId(), refs: [pC1, pC2] }, // C 角
      { kind: 'coincident', id: this.nextEntityId(), refs: [pD1, pD2] }, // D 角
      { kind: 'coincident', id: this.nextEntityId(), refs: [pA2, pA1] }, // A 角
    ];
    return { entities, constraints };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const a0 = anchors[0];
    if (!a0) return;
    const [a, b, c, d] = rectangleCorners(a0, cursor);
    this.addWorldLineString(builder, [a, b, c, d, a]);
  }
}

/** 中心点圆：圆心 + 半径点 → 1 point(center) + 1 circle（radius=拖距初值）。 */
export class SketchCenterCircleTool extends SketchCreateTool {
  public static override toolId = 'Sketch.CenterCircle';
  public static override iconSpec = 'icon-circle';
  protected readonly sketchKind = 'circle';
  protected readonly requiredPoints = 2;
  protected readonly promptKeys = [
    'partStudio.sketch.create.circle.firstPrompt',
    'partStudio.sketch.create.circle.nextPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.zeroSize';

  protected createInstance(): SketchCreateTool { return new SketchCenterCircleTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [center, edge] = points;
    if (!center || !edge) return undefined; // 点数不足（状态机保证 2 点，防御收窄）
    const radius = Math.hypot(center.u - edge.u, center.v - edge.v);
    if (radius < 1e-12) return undefined; // 零半径

    const idCenter = this.nextEntityId();
    const idCircle = this.nextEntityId();
    return {
      entities: [
        { kind: 'point', id: idCenter, x: center.u, y: center.v },
        { kind: 'circle', id: idCircle, center: idCenter, radius },
      ],
      constraints: [],
    };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const [center] = anchors;
    if (!center) return;
    const radius = Math.hypot(center.u - cursor.u, center.v - cursor.v);
    if (radius < 1e-12) return;
    // 局部 z=0 全圆 → 世界化（平面架刚体变换，圆心在草图面上）。
    this.addWorldArc(builder, Arc3d.createXY(toLocal3d(center), radius));
  }
}

/**
 * 3 点圆弧：起点 → 终点 → 弧上点 → 1 point(center) + 1 arc
 * （center/radius/startAngle/sweepAngle 前端三点定圆换算落 DTO——契约 v1.6
 * arc 变体，角度弧度制；换算用 Arc3d.createCircularStartMiddleEnd，
 * 共线时其退化为 LineString3d → 判退拒收）。
 */
export class SketchArc3PointTool extends SketchCreateTool {
  public static override toolId = 'Sketch.Arc3Point';
  public static override iconSpec = 'icon-arc';
  protected readonly sketchKind = 'arc';
  protected readonly requiredPoints = 3;
  protected readonly promptKeys = [
    'partStudio.sketch.create.arc.firstPrompt',
    'partStudio.sketch.create.arc.nextPrompt',
    'partStudio.sketch.create.arc.thirdPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.colinearArc';

  protected createInstance(): SketchCreateTool { return new SketchArc3PointTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [start, end, onArc] = points;
    if (!start || !end || !onArc) return undefined; // 点数不足（状态机保证 3 点，防御收窄）
    const arc = this._arcFrom3Points(start, end, onArc);
    if (!arc) return undefined; // 共线/任两点重合退化

    const idCenter = this.nextEntityId();
    const idArc = this.nextEntityId();
    return {
      entities: [
        { kind: 'point', id: idCenter, x: arc.center.x, y: arc.center.y },
        {
          kind: 'arc',
          id: idArc,
          center: idCenter,
          radius: arc.radius,
          startAngle: arc.startAngle,
          sweepAngle: arc.sweepAngle,
        },
      ],
      constraints: [],
    };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const a0 = anchors[0];
    if (!a0) return;
    if (anchors.length === 1) {
      // 仅有起点：直线段导引（起点→光标）。
      this.addWorldLineString(builder, [a0, cursor]);
      return;
    }
    const a1 = anchors[1];
    if (!a1) return;
    // 起点+终点已锚：弧经起点→光标（弧上点候选）→终点。
    const world = this.tryWorldArc3Point(a0, cursor, a1);
    if (world) {
      builder.addArc(world, false, false);
    } else {
      // 共线候选：三点折线提示（提交时同形判退）。
      this.addWorldLineString(builder, [a0, cursor, a1]);
    }
  }

  /**
   * 三点定圆（局部 z=0 面内）：起点/终点/弧上点 → center/radius/startAngle/sweepAngle。
   * startAngle=圆心→起点向量相对局部 x 轴的方位角（atan2，弧度制）；
   * sweepAngle=经弧上点方向的正向扫角（createCircularStartMiddleEnd 恒归一 [0,2π)）。
   */
  private _arcFrom3Points(
    start: SketchPoint2,
    end: SketchPoint2,
    onArc: SketchPoint2,
  ): { center: { x: number; y: number }; radius: number; startAngle: number; sweepAngle: number } | undefined {
    // 元组化（各位 Point3d 类型确定，索引不再 undefined-able）。
    const pts: [Point3d, Point3d, Point3d] = [toLocal3d(start), toLocal3d(onArc), toLocal3d(end)];
    if (pts[0].isAlmostEqual(pts[1]) || pts[1].isAlmostEqual(pts[2]) || pts[0].isAlmostEqual(pts[2])) {
      return undefined; // 任两点重合退化
    }
    const curve = Arc3d.createCircularStartMiddleEnd(pts[0], pts[1], pts[2]);
    if (!(curve instanceof Arc3d)) return undefined; // 共线 → LineString3d 退化
    const vector0 = curve.vector0; // 圆心→起点（构造保证 sweep 起点=pointA=start）
    return {
      center: { x: curve.center.x, y: curve.center.y },
      radius: vector0.magnitude(),
      startAngle: Math.atan2(vector0.y, vector0.x),
      sweepAngle: curve.sweep.sweepRadians,
    };
  }
}

/**
 * 注册草图绘制 4 工具（M6-a T5；幂等——模块级 flag）。
 * 注册点=PartStudioPage 工具注册编排（ensureEditTools 之后同 try 块，失败同面
 * 呈现）；不放 viewer-next 注册表——viewer-next 不反向依赖 app 模块
 * （register-edit-tools.ts 头注挂账的「鲁班草图链绘制 3 件」由本函数收口，
 * arc 为 M6-a 新增第 4 件）。
 */
let sketchToolsRegistered = false;
export function registerSketchTools(): void {
  if (sketchToolsRegistered) return;
  IModelApp.tools.register(SketchLineTool);
  IModelApp.tools.register(SketchRectangleTool);
  IModelApp.tools.register(SketchCenterCircleTool);
  IModelApp.tools.register(SketchArc3PointTool);
  sketchToolsRegistered = true;
}
