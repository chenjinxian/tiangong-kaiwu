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
 *   取 `adjustedPoint`，回落 `ev.point`。**禁手写命中测试**。世界点经草图
 *   平面架（sketch-plane.ts）投影为局部 (u,v) 提交——取代 M3-b 的手写 z=0
 *   投影（planeZ=0 恒定假设已废弃，architecture.md §四）。
 * - 标注提示（2026-11-02 Onshape live）：不激活 iTwin AccuDraw 罗盘（Onshape
 *   草图没有该 UI），而由 sketch-live-measures + sketch-tool-feedback 发布
 *   「阶段提示 + 线长/角度/矩形宽高/圆与弧半径」；SketchToolFeedbackOverlay
 *   在光标旁呈现。标准 ToolAssistance 同步发出（editor 原工具通道，辅助技术
 *   可用）。提交后的常驻尺寸标注由 SketchDimensionsDecoration 绘制。
 * - 橡皮筋/构造线：**Dynamics 通道**（PrimitiveTool 标准预览生命周期，
 *   Tool.ts:673-680）——onDynamicFrame 同时绘制工作预览与 editor SketchTools
 *   同款构造辅助（弧心连线、样条控制多边形，虚线）。
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
 *   IModelApp.notifications.outputMessage（web 呈现桥 ViewerNotifications
 *   → iTwinUI toaster）。
 */

import {
  BeButtonEvent,
  DynamicsContext,
  EventHandled,
  GraphicType,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
  ToolAssistance,
  ToolAssistanceImage,
  ToolAssistanceInputMethod,
} from '@itwin/core-frontend';
import type { GraphicBuilder, ToolAssistanceInstruction, ToolAssistanceSection } from '@itwin/core-frontend';
import { AngleSweep, Arc3d, BezierCurve3d, Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import i18next from 'i18next';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { sketchPlaneFrameFrom } from './sketch-plane.js';
import { autoWeldConstraints } from './sketch-auto-weld.js';
import { POLYGON_DEFAULT_SIDES, POLYGON_MAX_SIDES, POLYGON_MIN_SIDES, regularPolygonVertices, type PolygonMode } from './sketch-polygon.js';
import { computeSketchLiveMeasures } from './sketch-live-measures.js';
import {
  clearSketchToolFeedback,
  publishSketchToolFeedback,
} from './sketch-tool-feedback.js';
import type { SketchPlaneFrame, SketchPoint2 } from './sketch-plane.js';

export type SketchCreateKind = 'line' | 'rectangle' | 'centerRectangle' | 'alignedRectangle' | 'circle' | 'perimeterCircle' | 'polygonInscribed' | 'polygonCircumscribed' | 'arc' | 'centerArc' | 'spline' | 'bezier';

export interface SketchShapeDraft {
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
/** v1.23（ADR-0004）：构造模式作用于曲线实体；point 不参与面域，保持原样。 */
export function withConstructionMode(draft: SketchShapeDraft, construction: boolean): SketchShapeDraft {
  if (!construction) return draft;
  return {
    ...draft,
    entities: draft.entities.map((e) => (e.kind === 'point' ? e : { ...e, construction: true })),
  };
}

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
  /** 当前光标局部点（Onshape live 尺寸提示；onMouseMotion/onDynamicFrame 更新）。 */
  private _cursorLocal?: SketchPoint2;
  /** 当前光标视口坐标（覆盖层定位；viewPoint 与画布 CSS 像素同系）。 */
  private _cursorView?: { x: number; y: number };
  /** 反馈签名（像素取整）——避免同一位置重复触发 React 渲染。 */
  private _feedbackSignature = '';
  /** ToolAssistance 阶段签名（阶段变化才重发，防每帧通知）。 */
  private _assistanceStage = -1;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    // 草图平面：store 当前活动草图的 plane（SketchDialog 确认链下发——
    // enterSketch 先归零、onConfirm 再落平面，工具启动读到的恒为本会话平面）；
    // null → 契约缺省 XY@z=0（编辑既有草图的平面回显待契约下发，types.ts 注）。
    this._plane = sketchPlaneFrameFrom(usePartStudioStore.getState().sketch.activeSketchPlane);
    // Onshape 草图没有 iTwin 的 AccuDraw 罗盘：不激活罗盘，实时数值由
    // SketchToolFeedbackOverlay（Onshape live 同款光标旁读数）呈现。取点仍
    // 经 AccuSnap hot detail + 平面架投影，平面锁定语义不依赖罗盘。
    // 不 locate 元素（无定位圈）但开启 AccuSnap 吸附——currHit 取点前提；
    // initLocateElements(false) 缺省会 enableSnap(false) 关掉吸附（M3-b 实测注记）。
    this.initLocateElements(false, true);
    this._seedNextId();
    // Dynamics 通道橡皮筋（帧驱动预览；0 锚点时 onDynamicFrame 早退不绘制）。
    this.beginDynamics();
    this._outputStagePrompt();
    this._provideToolAssistance();
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    this._anchors = [];
    await super.onCleanup();
  }

  /**
   * 光标移动：更新实时尺寸提示（Onshape live 光标旁数值）+ ToolAssistance。
   * 只读光标，不改工具状态机。
   */
  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorLocal = this._pickLocal(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    this._publishFeedback();
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this._anchors.push(this._pickLocal(ev));
    this._cursorLocal = this._pickLocal(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };

    if (this._anchors.length < this.requiredPoints) {
      this._publishFeedback();
      this._provideToolAssistance();
      this._outputStagePrompt();
      return EventHandled.No;
    }

    await this.commitAnchors([...this._anchors]);
    return EventHandled.No;
  }

  /** 锚点快照（子类键盘交互/诊断用；只读）。 */
  protected get anchorPoints(): readonly SketchPoint2[] {
    return this._anchors;
  }

  /**
   * 提交当前锚点的形状草稿（基类第三次点击与子类键盘 Enter 共用）。
   * 失败时保持工具存活并回滚 id；成功退出工具。
   */
  protected async commitAnchors(points: SketchPoint2[]): Promise<void> {
    this._anchors = [];

    this._seedNextId();
    const idBase = this._nextId;
    const draft = this.buildShape(points);
    if (!draft) {
      this._notify(this._t(this.degenerateToastKey), OutputMessagePriority.Info);
      this._publishFeedback();
      this._provideToolAssistance();
      this._outputStagePrompt();
      return;
    }

    // v1.23（ADR-0004）：构造模式下新绘曲线带 construction=true；点不参与面域，保持原样。
    const draftWithConstruction = withConstructionMode(draft, Boolean(usePartStudioStore.getState().sketch.constructionMode));

    const sketchSystem = getSketchSystem();
    if (!sketchSystem) {
      // accessor 未注册（宿主未挂载/已卸载）——回滚 id + 错误透出，工具存活。
      this._nextId = idBase;
      this._notify(this._t('partStudio.sketch.create.toasts.systemNotReady'), OutputMessagePriority.Error);
      return;
    }

    // 乐观提交（整体覆写语义）：既有实体/约束原样在前，草稿追加在后（M3-b 同构）。
    // v1.19 自动重合：新端点落在既有端点坐标上 → 补结构化 coincident（Onshape
    // 推断吸附同构；Tutorial 2 [14][16][18][45][46] 来源）。容差见模块头。
    const base = sketchSystem.activeSketch;
    const welds = autoWeldConstraints(draftWithConstruction.entities, base?.entities ?? [], base?.constraints ?? [], {
      startConstraintId: this._nextId,
    });
    this._nextId += welds.length;
    const entities = [...(base?.entities ?? []), ...draftWithConstruction.entities];
    const constraints = [...(base?.constraints ?? []), ...draftWithConstruction.constraints, ...welds];
    const result = await sketchSystem.applyUpdate(entities, constraints);
    if (!result.ok) {
      // 后端拒收零变更（库侧无写入）——本地回滚 = 丢弃草稿 + id 计数器复原；
      // 拒收文本原样透出，工具保持存活可立即重画。
      this._nextId = idBase;
      this._notify(result.error ?? this._t('partStudio.sketch.create.toasts.updateFailed'), OutputMessagePriority.Error);
      this._publishFeedback();
      this._provideToolAssistance();
      this._outputStagePrompt();
      return;
    }

    await this.exitTool();
  }

  /** Dynamics 帧回调：已锚点 + 当前光标点 → 预览（WorldOverlay，压顶绘制）。 */
  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    this._cursorLocal = this._pickLocal(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    this._publishFeedback();
    if (this._anchors.length === 0) return;
    const cursor = this._cursorLocal;
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    this.buildPreview(this._anchors, cursor, builder);
    context.addGraphic(builder.finish());

    // editor SketchTools 同款构造辅助层：弧心连线 / 样条控制多边形（虚线 +
    // 控制点），讲解清楚「正在定义什么」，不是另一套预览。
    const construction = context.createGraphic({ type: GraphicType.WorldOverlay });
    construction.setSymbology(ColorDef.black, ColorDef.black, 1, LinePixels.Code2);
    this.buildConstructionGeometry(this._anchors, cursor, construction);
    context.addGraphic(construction.finish());
  }

  /** 构造辅助线（子类可扩展；0 锚点时由调用方早退）。 */
  protected buildConstructionGeometry(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const first = anchors[0];
    if (!first) return;
    switch (this.sketchKind) {
      case 'circle':
        this.addWorldLineString(builder, [first, cursor]);
        break;
      case 'arc': {
        const second = anchors[1];
        if (!second) {
          this.addWorldLineString(builder, [first, cursor]);
          break;
        }
        // 弦 + 圆心到三点的虚线（让三点定圆关系可见）。
        this.addWorldLineString(builder, [first, second]);
        const pts: [Point3d, Point3d, Point3d] = [toLocal3d(first), toLocal3d(second), toLocal3d(cursor)];
        const arc = Arc3d.createCircularStartMiddleEnd(...pts);
        if (arc instanceof Arc3d) {
          const centerWorld = this._plane.toWorld({ u: arc.center.x, v: arc.center.y });
          builder.addLineString([centerWorld, this._plane.toWorld(first)]);
          builder.addLineString([centerWorld, this._plane.toWorld(second)]);
        }
        break;
      }
      case 'spline': {
        const second = anchors[1];
        if (!second) {
          this.addWorldLineString(builder, [first, cursor]);
          break;
        }
        const c1 = anchors[2];
        if (!c1) {
          this.addWorldLineString(builder, [first, second, cursor]);
          break;
        }
        this.addWorldLineString(builder, [first, second, c1, cursor]);
        break;
      }
      default:
        break;
    }
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._anchors.length > 0) {
      // 取消进行中的形状，工具保持存活（再右键退出）——M3-b 两层语义。
      this._anchors = [];
      this._publishFeedback();
      this._provideToolAssistance();
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

  /** 当前阶段提示文本（i18n 实时翻译）。 */
  protected stageHint(): string {
    const key = this.promptKeys[Math.min(this._anchors.length, this.promptKeys.length - 1)];
    return key ? this._t(key) : '';
  }

  /**
   * 发布光标旁实时反馈（Onshape live）：阶段提示 + 已锚点到光标的尺寸。
   * 签名按像素取整去重——同一位置不重复触发覆盖层渲染。
   */
  private _publishFeedback(): void {
    const hint = this.stageHint();
    const measures = this._cursorLocal && this._anchors.length > 0
      ? computeSketchLiveMeasures(this.sketchKind, this._anchors, this._cursorLocal)
      : [];
    const cx = this._cursorView ? Math.round(this._cursorView.x) : -1;
    const cy = this._cursorView ? Math.round(this._cursorView.y) : -1;
    const signature = `${hint}|${measures.map((m) => `${m.labelKey}:${m.value}`).join('|')}|${cx},${cy}`;
    if (signature === this._feedbackSignature) return;
    this._feedbackSignature = signature;
    publishSketchToolFeedback({
      toolId: this.toolId,
      ...(hint ? { hint } : {}),
      measures,
      ...(this._cursorView ? { cursor: this._cursorView } : {}),
    });
  }

  /**
   * 标准 ToolAssistance（iTwin editor 同款通道）：阶段变化才重发。
   * Web 呈现面由 SketchToolFeedbackOverlay 承接；此通道保留给辅助技术/未来
   * AppUI 挂载（editor 原工具也是这么做的）。
   */
  private _provideToolAssistance(): void {
    const stage = this._anchors.length;
    if (stage === this._assistanceStage) return;
    this._assistanceStage = stage;
    const hint = this.stageHint();
    if (!hint) return;
    const cancel = this._t('partStudio.sketch.create.cancelPrompt');
    const mouseInstructions: ToolAssistanceInstruction[] = [
      ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, hint, false, ToolAssistanceInputMethod.Mouse),
      ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, cancel, false, ToolAssistanceInputMethod.Mouse),
    ];
    const sections: ToolAssistanceSection[] = [
      ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel),
    ];
    IModelApp.notifications.setToolAssistance(ToolAssistance.createInstructions(
      ToolAssistance.createInstruction(this.iconSpec, hint), sections,
    ));
  }

  private _outputStagePrompt(): void {
    IModelApp.notifications.outputPrompt(this.stageHint());
  }

  /** 工具子类在键盘调整参数后刷新覆盖层提示（不改变锚点状态机）。 */
  protected refreshFeedback(): void {
    this._publishFeedback();
    this._outputStagePrompt();
  }

  /** 调用时翻译（i18next 单例直取——与 useFeatureSystem 同口径，回调内不吃闭包旧语）。 */
  protected _t(key: string): string {
    return i18next.t(key);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

/** 直线（v1.19）：2 点 → 1 line（端点为内联隐式子元素，不膨胀可见实体计数）。 */
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

    const idLine = this.nextEntityId();
    return {
      entities: [{
        kind: 'line', id: idLine,
        p1: { x: p1.u, y: p1.v }, p2: { x: p2.u, y: p2.v },
      }],
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
 * 中心矩形（v1.19，Onshape「center rectangle」同构）：对角 2 点 →
 * 4 line（内联端点）+ 1 可见中心 point；自动关系：
 * 4 角 coincident（结构化 start/end）+ 2 parallel + 1 perpendicular + 1 horizontal
 * + 2 对角 midpoint。字面实体计数 5；Onshape 同款自动约束骨架（Tutorial 2 基底）。
 * 角点在草图面局部 (u,v) 轴对齐（矩形工具 v1 无旋转）。
 */
/** 轴对齐矩形草稿（角点 c1/c2 为对角）；供拐角矩形与中心矩形复用。 */
function axisAlignedRectangleDraft(
  c1: SketchPoint2,
  c2: SketchPoint2,
  nextEntityId: () => number,
): SketchShapeDraft | undefined {
  const [a, b, c, d] = rectangleCorners(c1, c2);
  if (Math.abs(a.u - b.u) < 1e-12 || Math.abs(b.v - c.v) < 1e-12) return undefined; // 零宽/零高

  // 角点序列：L1=AB（下） L2=BC（右） L3=CD（上） L4=DA（左）；端点为内联。
  const [lAB, lBC, lCD, lDA] = [
    nextEntityId(), nextEntityId(), nextEntityId(), nextEntityId(),
  ];
  const idCenter = nextEntityId();
  const center = { x: (a.u + c.u) / 2, y: (a.v + c.v) / 2 };
  const entities: SketchEntityDto[] = [
    { kind: 'line', id: lAB, p1: { x: a.u, y: a.v }, p2: { x: b.u, y: b.v } },
    { kind: 'line', id: lBC, p1: { x: b.u, y: b.v }, p2: { x: c.u, y: c.v } },
    { kind: 'line', id: lCD, p1: { x: c.u, y: c.v }, p2: { x: d.u, y: d.v } },
    { kind: 'line', id: lDA, p1: { x: d.u, y: d.v }, p2: { x: a.u, y: a.v } },
    { kind: 'point', id: idCenter, x: center.x, y: center.y },
  ];
  const constraints: SketchConstraintDto[] = [
    { kind: 'coincident', id: nextEntityId(), refs: [{ entity: lAB, part: 'end' }, { entity: lBC, part: 'start' }] },
    { kind: 'coincident', id: nextEntityId(), refs: [{ entity: lBC, part: 'end' }, { entity: lCD, part: 'start' }] },
    { kind: 'coincident', id: nextEntityId(), refs: [{ entity: lCD, part: 'end' }, { entity: lDA, part: 'start' }] },
    { kind: 'coincident', id: nextEntityId(), refs: [{ entity: lDA, part: 'end' }, { entity: lAB, part: 'start' }] },
    { kind: 'parallel', id: nextEntityId(), refs: [lAB, lCD] },
    { kind: 'parallel', id: nextEntityId(), refs: [lBC, lDA] },
    { kind: 'perpendicular', id: nextEntityId(), refs: [lAB, lBC] },
    { kind: 'horizontal', id: nextEntityId(), refs: [lAB] },
    { kind: 'midpoint', id: nextEntityId(), refs: [idCenter, { entity: lAB, part: 'start' }, { entity: lBC, part: 'end' }] },
    { kind: 'midpoint', id: nextEntityId(), refs: [idCenter, { entity: lBC, part: 'start' }, { entity: lCD, part: 'end' }] },
  ];
  return { entities, constraints };
}

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
    return axisAlignedRectangleDraft(c1, c2, () => this.nextEntityId());
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const a0 = anchors[0];
    if (!a0) return;
    const [a, b, c, d] = rectangleCorners(a0, cursor);
    this.addWorldLineString(builder, [a, b, c, d, a]);
  }
}

/** 中心点矩形：第 1 点=中心，第 2 点=一个角点；对角点由中心反射得到。 */
export class SketchCenterRectangleTool extends SketchCreateTool {
  public static override toolId = 'Sketch.CenterRectangle';
  public static override iconSpec = 'icon-center-rectangle';
  protected readonly sketchKind = 'centerRectangle';
  protected readonly requiredPoints = 2;
  protected readonly promptKeys = [
    'partStudio.sketch.create.centerRectangle.firstPrompt',
    'partStudio.sketch.create.centerRectangle.nextPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.zeroSize';

  protected createInstance(): SketchCreateTool { return new SketchCenterRectangleTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [center, corner] = points;
    if (!center || !corner) return undefined;
    const opposite = { u: 2 * center.u - corner.u, v: 2 * center.v - corner.v };
    return axisAlignedRectangleDraft(opposite, corner, () => this.nextEntityId());
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const center = anchors[0];
    if (!center) return;
    const opposite = { u: 2 * center.u - cursor.u, v: 2 * center.v - cursor.v };
    const [a, b, c, d] = rectangleCorners(opposite, cursor);
    this.addWorldLineString(builder, [a, b, c, d, a]);
  }
}

/** 对齐矩形（3 点）：A/B 定第一边，C 定垂直边的有向高度；不强制轴对齐。 */
export class SketchAlignedRectangleTool extends SketchCreateTool {
  public static override toolId = 'Sketch.AlignedRectangle';
  public static override iconSpec = 'icon-aligned-rectangle';
  protected readonly sketchKind = 'alignedRectangle';
  protected readonly requiredPoints = 3;
  protected readonly promptKeys = [
    'partStudio.sketch.create.alignedRectangle.firstPrompt',
    'partStudio.sketch.create.alignedRectangle.secondPrompt',
    'partStudio.sketch.create.alignedRectangle.thirdPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.zeroSize';

  protected createInstance(): SketchCreateTool { return new SketchAlignedRectangleTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [a, b, c] = points;
    if (!a || !b || !c) return undefined;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const length = Math.hypot(dx, dy);
    if (length < 1e-12) return undefined;
    const nx = -dy / length;
    const ny = dx / length;
    const height = (c.u - a.u) * nx + (c.v - a.v) * ny;
    if (Math.abs(height) < 1e-12) return undefined;
    const d = { u: a.u + nx * height, v: a.v + ny * height };
    const e = { u: b.u + nx * height, v: b.v + ny * height };
    const [lAB, lBC, lCD, lDA] = [
      this.nextEntityId(), this.nextEntityId(), this.nextEntityId(), this.nextEntityId(),
    ];
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: lAB, p1: { x: a.u, y: a.v }, p2: { x: b.u, y: b.v } },
      { kind: 'line', id: lBC, p1: { x: b.u, y: b.v }, p2: { x: e.u, y: e.v } },
      { kind: 'line', id: lCD, p1: { x: e.u, y: e.v }, p2: { x: d.u, y: d.v } },
      { kind: 'line', id: lDA, p1: { x: d.u, y: d.v }, p2: { x: a.u, y: a.v } },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: lAB, part: 'end' }, { entity: lBC, part: 'start' }] },
      { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: lBC, part: 'end' }, { entity: lCD, part: 'start' }] },
      { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: lCD, part: 'end' }, { entity: lDA, part: 'start' }] },
      { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: lDA, part: 'end' }, { entity: lAB, part: 'start' }] },
      { kind: 'parallel', id: this.nextEntityId(), refs: [lAB, lCD] },
      { kind: 'parallel', id: this.nextEntityId(), refs: [lBC, lDA] },
      { kind: 'perpendicular', id: this.nextEntityId(), refs: [lAB, lBC] },
    ];
    return { entities, constraints };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const a = anchors[0];
    const b = anchors[1];
    if (!a) return;
    if (!b) {
      this.addWorldLineString(builder, [a, cursor]);
      return;
    }
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const length = Math.hypot(dx, dy);
    if (length < 1e-12) return;
    const nx = -dy / length;
    const ny = dx / length;
    const height = (cursor.u - a.u) * nx + (cursor.v - a.v) * ny;
    const d = { u: a.u + nx * height, v: a.v + ny * height };
    const e = { u: b.u + nx * height, v: b.v + ny * height };
    this.addWorldLineString(builder, [a, b, e, d, a]);
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

    const idCircle = this.nextEntityId();
    return {
      entities: [{ kind: 'circle', id: idCircle, center: { x: center.u, y: center.v }, radius }],
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
 * 周边圆（三点圆，toolId `Sketch.PerimeterCircle`，Onshape 圆飞菜单变体）：
 * 圆上依次拾取三点 → 三点定圆 → 1 circle（不生成圆心点，与 Onshape 三次点样式一致）。
 * 共线/任两点重合 → buildShape undefined（toast 拒收）。
 */
export class SketchPerimeterCircleTool extends SketchCreateTool {
  public static override toolId = 'Sketch.PerimeterCircle';
  public static override iconSpec = 'icon-perimeter-circle';
  protected readonly sketchKind = 'perimeterCircle';
  protected readonly requiredPoints = 3;
  protected readonly promptKeys = [
    'partStudio.sketch.create.perimeterCircle.firstPrompt',
    'partStudio.sketch.create.perimeterCircle.secondPrompt',
    'partStudio.sketch.create.perimeterCircle.thirdPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.colinearCircle';

  protected createInstance(): SketchCreateTool { return new SketchPerimeterCircleTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [a, b, c] = points;
    if (!a || !b || !c) return undefined;
    const circle = this._circleFrom3Points(a, b, c);
    if (!circle) return undefined;
    return {
      entities: [{
        kind: 'circle',
        id: this.nextEntityId(),
        center: { x: circle.center.u, y: circle.center.v },
        radius: circle.radius,
      }],
      constraints: [],
    };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const a = anchors[0];
    if (!a) return;
    if (anchors.length === 1) {
      this.addWorldLineString(builder, [a, cursor]);
      return;
    }
    const b = anchors[1];
    if (!b) return;
    const circle = this._circleFrom3Points(a, b, cursor);
    if (circle) this.addWorldArc(builder, Arc3d.createXY(toLocal3d(circle.center), circle.radius));
    else this.addWorldLineString(builder, [a, b, cursor]); // 共线候选：折线提示（提交同形判退）
  }

  /** 三点定圆（局部 z=0 面内）：任两点重合/共线 → undefined。 */
  private _circleFrom3Points(a: SketchPoint2, b: SketchPoint2, c: SketchPoint2): { center: SketchPoint2; radius: number } | undefined {
    const pa = toLocal3d(a); const pb = toLocal3d(b); const pc = toLocal3d(c);
    if (pa.isAlmostEqual(pb) || pb.isAlmostEqual(pc) || pa.isAlmostEqual(pc)) return undefined;
    const curve = Arc3d.createCircularStartMiddleEnd(pa, pb, pc);
    if (!(curve instanceof Arc3d)) return undefined; // 共线 → LineString3d 退化
    const radius = curve.vector0.magnitude();
    if (radius < 1e-12) return undefined;
    return { center: { u: curve.center.x, v: curve.center.y }, radius };
  }
}

/**
 * 正多边形基类（Onshape 多边形飞菜单两变体共享，2026-11-09）。
 *
 * 交互：圆心 → 构造圆半径点 → （键盘输入边数 3–50）→ Enter 或第三次点击完成。
 * 实体：1 条 construction 构造圆（显示）+ N 条内联端点线；约束：相邻端点
 * coincident + 全边 equal + N 个外角 angle(2π/N)。默认 6 边。
 * 构造圆尚未与多边形建立求解约束（尺寸编辑联动后续切片）。
 */
export abstract class SketchPolygonTool extends SketchCreateTool {
  protected abstract readonly polygonMode: PolygonMode;
  protected readonly requiredPoints = 3;
  protected readonly promptKeys = [
    'partStudio.sketch.create.polygon.firstPrompt',
    'partStudio.sketch.create.polygon.nextPrompt',
    'partStudio.sketch.create.polygon.sidesPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.polygonDegenerate';

  private _sides = POLYGON_DEFAULT_SIDES;
  private _digitBuffer = '';

  protected get sideCount(): number { return this._sides; }

  protected override stageHint(): string {
    const base = super.stageHint();
    return this.anchorPoints.length >= 2 ? `${base} (${this._sides})` : base;
  }

  /**
   * 键盘边数输入（Onshape 帮助页：半径点后直接输入数字；范围 3–50）。
   * Enter 提交；Backspace 复位默认 6。未到半径点时不拦截按键（保留快捷键）。
   */
  public override async onKeyTransition(wentDown: boolean, ev: KeyboardEvent): Promise<EventHandled> {
    if (!wentDown || this.anchorPoints.length < 2) return EventHandled.No;
    if (/^[0-9]$/.test(ev.key)) {
      ev.preventDefault();
      const candidate = (this._digitBuffer + ev.key).slice(-2);
      const parsed = Number(candidate);
      if (Number.isInteger(parsed) && parsed >= POLYGON_MIN_SIDES && parsed <= POLYGON_MAX_SIDES) {
        this._sides = parsed;
        this._digitBuffer = candidate;
      } else {
        this._sides = Math.min(POLYGON_MAX_SIDES, Math.max(POLYGON_MIN_SIDES, Number(ev.key)));
        this._digitBuffer = ev.key;
      }
      this.refreshFeedback();
      return EventHandled.Yes;
    }
    if (ev.key === 'Backspace') {
      ev.preventDefault();
      this._digitBuffer = '';
      this._sides = POLYGON_DEFAULT_SIDES;
      this.refreshFeedback();
      return EventHandled.Yes;
    }
    if (ev.key === 'Enter') {
      // 阻止浏览器把 Enter 变成焦点按钮（飞菜单箭头）的默认 click——否则菜单会
      // 在提交后重新展开并挡住草图完成按钮（2026-11-09 真栈实测）。
      ev.preventDefault();
      await this.commitAnchors([...this.anchorPoints]);
      return EventHandled.Yes;
    }
    return EventHandled.No;
  }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [center, radiusPoint] = points;
    if (!center || !radiusPoint) return undefined;
    const polygon = regularPolygonVertices(center, radiusPoint, this._sides, this.polygonMode);
    if (!polygon) return undefined;

    const circleId = this.nextEntityId();
    const entities: SketchEntityDto[] = [{
      kind: 'circle', id: circleId,
      center: { x: center.u, y: center.v }, radius: polygon.constructionRadius,
      construction: true,
    }];
    const lineIds: number[] = [];
    for (let k = 0; k < this._sides; k++) {
      const lineId = this.nextEntityId();
      lineIds.push(lineId);
      const a = polygon.vertices[k]!;
      const b = polygon.vertices[(k + 1) % this._sides]!;
      entities.push({ kind: 'line', id: lineId, p1: { x: a.u, y: a.v }, p2: { x: b.u, y: b.v } });
    }
    const constraints: SketchConstraintDto[] = [];
    for (let k = 0; k < this._sides; k++) {
      constraints.push({
        kind: 'coincident', id: this.nextEntityId(),
        refs: [
          { entity: lineIds[k]!, part: 'end' },
          { entity: lineIds[(k + 1) % this._sides]!, part: 'start' },
        ],
      });
    }
    for (let k = 1; k < this._sides; k++) {
      constraints.push({ kind: 'equal', id: this.nextEntityId(), refs: [lineIds[0]!, lineIds[k]!] });
    }
    const turn = (2 * Math.PI) / this._sides;
    for (let k = 0; k < this._sides; k++) {
      constraints.push({
        kind: 'angle', id: this.nextEntityId(), value: turn,
        refs: [lineIds[k]!, lineIds[(k + 1) % this._sides]!],
      });
    }
    return { entities, constraints };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const center = anchors[0];
    if (!center) return;
    if (anchors.length === 1) {
      this.addWorldLineString(builder, [center, cursor]);
      return;
    }
    const radiusPoint = anchors[1];
    if (!radiusPoint) return;
    const polygon = regularPolygonVertices(center, radiusPoint, this._sides, this.polygonMode);
    if (!polygon) return;
    const loop = [...polygon.vertices, polygon.vertices[0]!];
    this.addWorldLineString(builder, loop);
    this.addWorldArc(builder, Arc3d.createXY(toLocal3d(center), polygon.constructionRadius));
  }
}

/** Onshape「Inscribed polygon」（内切多边形）：构造圆在多边形内、与各边相切。 */
export class SketchInscribedPolygonTool extends SketchPolygonTool {
  public static override toolId = 'sketchInscribedPolygon';
  public static override iconSpec = 'icon-polygon';
  protected readonly polygonMode = 'inscribed' as const;
  protected override readonly sketchKind = 'polygonInscribed' as const;
  protected createInstance(): SketchCreateTool { return new SketchInscribedPolygonTool(); }
}

/** Onshape「Circumscribed polygon」（外切多边形）：多边形在构造圆内、圆过各顶点。 */
export class SketchCircumscribedPolygonTool extends SketchPolygonTool {
  public static override toolId = 'sketchCircumscribedPolygon';
  public static override iconSpec = 'icon-polygon';
  protected readonly polygonMode = 'circumscribed' as const;
  protected override readonly sketchKind = 'polygonCircumscribed' as const;
  protected createInstance(): SketchCreateTool { return new SketchCircumscribedPolygonTool(); }
}

/** 中心点圆弧：圆心 → 起点（定半径）→ 终点（定扫角）。 */
export class SketchCenterArcTool extends SketchCreateTool {
  public static override toolId = 'Sketch.CenterArc';
  public static override iconSpec = 'icon-center-arc';
  protected readonly sketchKind = 'centerArc';
  protected readonly requiredPoints = 3;
  protected readonly promptKeys = [
    'partStudio.sketch.create.centerArc.firstPrompt',
    'partStudio.sketch.create.centerArc.secondPrompt',
    'partStudio.sketch.create.centerArc.thirdPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.colinearArc';

  protected createInstance(): SketchCreateTool { return new SketchCenterArcTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [center, start, end] = points;
    if (!center || !start || !end) return undefined;
    const radius = Math.hypot(start.u - center.u, start.v - center.v);
    if (radius < 1e-12) return undefined;
    const startAngle = Math.atan2(start.v - center.v, start.u - center.u);
    const endAngle = Math.atan2(end.v - center.v, end.u - center.u);
    let sweep = endAngle - startAngle;
    while (sweep <= -Math.PI) sweep += Math.PI * 2;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    if (Math.abs(sweep) < 1e-9) return undefined;
    return {
      entities: [{
        kind: 'arc',
        id: this.nextEntityId(),
        center: { x: center.u, y: center.v },
        radius,
        startAngle,
        sweepAngle: sweep,
      }],
      constraints: [],
    };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const center = anchors[0];
    if (!center) return;
    if (anchors.length === 1) {
      const radius = Math.hypot(cursor.u - center.u, cursor.v - center.v);
      if (radius > 1e-12) this.addWorldArc(builder, Arc3d.createXY(toLocal3d(center), radius));
      return;
    }
    const start = anchors[1];
    if (!start) return;
    const radius = Math.hypot(start.u - center.u, start.v - center.v);
    if (radius < 1e-12) return;
    const startAngle = Math.atan2(start.v - center.v, start.u - center.u);
    const endAngle = Math.atan2(cursor.v - center.v, cursor.u - center.u);
    let sweep = endAngle - startAngle;
    while (sweep <= -Math.PI) sweep += Math.PI * 2;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    if (Math.abs(sweep) < 1e-9) return;
    this.addWorldArc(builder, Arc3d.createXY(toLocal3d(center), radius, AngleSweep.createStartSweepRadians(startAngle, sweep)));
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

    const idArc = this.nextEntityId();
    return {
      entities: [{
        kind: 'arc',
        id: idArc,
        center: { x: arc.center.x, y: arc.center.y },
        radius: arc.radius,
        startAngle: arc.startAngle,
        sweepAngle: arc.sweepAngle,
      }],
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
 * 精确三次贝塞尔样条（Tutorial 2 v1.19）：4 次确定性拾取——
 * 起点 → 终点 → 起点控制点（P1）→ 终点控制点（P2）。
 * 实体保持 1 条 spline（fitPoints 2 + controlPoints 4，与 Onshape 隐式子元素同计数）；
 * 两条 fit↔endpoint 恒真 coincident 与 Onshape 自动关系同构（不占额外可见实体）。
 * 与相邻曲线的 coincident/tangent 由约束工具补，不在创建时猜测。
 */
export class SketchSplineTool extends SketchCreateTool {
  public static override toolId = 'Sketch.Spline';
  public static override iconSpec = 'icon-spline';
  protected readonly sketchKind = 'spline';
  protected readonly requiredPoints = 4;
  protected readonly promptKeys = [
    'partStudio.sketch.create.spline.firstPrompt',
    'partStudio.sketch.create.spline.secondPrompt',
    'partStudio.sketch.create.spline.thirdPrompt',
    'partStudio.sketch.create.spline.fourthPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.splineDegenerate';

  protected createInstance(): SketchCreateTool { return new SketchSplineTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [p0, p3, c1, c2] = points;
    if (!p0 || !p3 || !c1 || !c2) return undefined;
    if (Math.hypot(p0.u - p3.u, p0.v - p3.v) < 1e-12) return undefined; // 端点重合退化
    if (Math.hypot(p0.u - c1.u, p0.v - c1.v) < 1e-12 || Math.hypot(p3.u - c2.u, p3.v - c2.v) < 1e-12) return undefined; // 零切向退化

    const idSpline = this.nextEntityId();
    return {
      entities: [{
        kind: 'spline', id: idSpline,
        fitPoints: [{ x: p0.u, y: p0.v }, { x: p3.u, y: p3.v }],
        controlPoints: [
          { x: p0.u, y: p0.v },
          { x: c1.u, y: c1.v },
          { x: c2.u, y: c2.v },
          { x: p3.u, y: p3.v },
        ],
        periodic: false,
      }],
      // Onshape 自动关系：样条端点 ≡ 对应拟合点（恒真行，保留可见约束计数）。
      constraints: [
        { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: idSpline, part: 'start' }, { entity: idSpline, part: 'point', index: 0 }] },
        { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: idSpline, part: 'end' }, { entity: idSpline, part: 'point', index: 1 }] },
      ],
    };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const p0 = anchors[0];
    if (!p0) return;
    if (anchors.length === 1) {
      this.addWorldLineString(builder, [p0, cursor]);
      return;
    }
    const p3 = anchors[1];
    if (!p3) return;
    if (anchors.length === 2) {
      this.addWorldLineString(builder, [p0, p3]);
      return;
    }
    const c1 = anchors[2];
    if (!c1) return;
    // 预览用折线采样（非提交几何；提交为精确 Bezier controlPoints）。
    const curve = BezierCurve3d.create([toLocal3d(p0), toLocal3d(c1), toLocal3d(cursor), toLocal3d(p3)]);
    if (!curve) return;
    const pts: SketchPoint2[] = [];
    for (let i = 0; i <= 32; i++) {
      const q = curve.fractionToPoint(i / 32);
      pts.push({ u: q.x, v: q.y });
    }
    this.addWorldLineString(builder, pts);
  }
}

/** 贝塞尔曲线：4 个控制点按 P0→P3 顺序点击（Onshape 样条飞菜单 Bezier）。 */
export class SketchBezierTool extends SketchCreateTool {
  public static override toolId = 'Sketch.Bezier';
  public static override iconSpec = 'icon-bezier';
  protected readonly sketchKind = 'bezier';
  protected readonly requiredPoints = 4;
  protected readonly promptKeys = [
    'partStudio.sketch.create.bezier.firstPrompt',
    'partStudio.sketch.create.bezier.secondPrompt',
    'partStudio.sketch.create.bezier.thirdPrompt',
    'partStudio.sketch.create.bezier.fourthPrompt',
  ] as const;
  protected readonly degenerateToastKey = 'partStudio.sketch.create.toasts.splineDegenerate';

  protected createInstance(): SketchCreateTool { return new SketchBezierTool(); }

  protected buildShape(points: SketchPoint2[]): SketchShapeDraft | undefined {
    const [p0, p1, p2, p3] = points;
    if (!p0 || !p1 || !p2 || !p3) return undefined;
    if (Math.hypot(p0.u - p3.u, p0.v - p3.v) < 1e-12) return undefined; // 端点重合退化
    const idSpline = this.nextEntityId();
    return {
      entities: [{
        kind: 'spline', id: idSpline,
        fitPoints: [{ x: p0.u, y: p0.v }, { x: p3.u, y: p3.v }],
        controlPoints: [
          { x: p0.u, y: p0.v }, { x: p1.u, y: p1.v },
          { x: p2.u, y: p2.v }, { x: p3.u, y: p3.v },
        ],
        periodic: false,
      }],
      constraints: [
        { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: idSpline, part: 'start' }, { entity: idSpline, part: 'point', index: 0 }] },
        { kind: 'coincident', id: this.nextEntityId(), refs: [{ entity: idSpline, part: 'end' }, { entity: idSpline, part: 'point', index: 1 }] },
      ],
    };
  }

  protected buildPreview(anchors: SketchPoint2[], cursor: SketchPoint2, builder: GraphicBuilder): void {
    const p0 = anchors[0];
    if (!p0) return;
    if (anchors.length < 3) {
      this.addWorldLineString(builder, [...anchors, cursor]);
      return;
    }
    const [p1, p2] = [anchors[1]!, anchors[2]!];
    const curve = BezierCurve3d.create([toLocal3d(p0), toLocal3d(p1), toLocal3d(p2), toLocal3d(cursor)]);
    if (!curve) return;
    const pts: SketchPoint2[] = [];
    for (let i = 0; i <= 32; i++) {
      const q = curve.fractionToPoint(i / 32);
      pts.push({ u: q.x, v: q.y });
    }
    this.addWorldLineString(builder, pts);
  }
}

/**
 * 注册草图绘制工具（M6-a T5 + v1.19 spline；幂等——模块级 flag）。
 * 注册点=PartStudioPage 工具注册编排（ensureEditTools 之后同 try 块，失败同面
 * 呈现）；不放 viewer 注册表——viewer 不反向依赖 app 模块
 * （register-edit-tools.ts 头注挂账的「鲁班草图链绘制 3 件」由本函数收口，
 * arc 为 M6-a 新增第 4 件）。
 */
let sketchToolsRegistered = false;
export function registerSketchTools(): void {
  if (sketchToolsRegistered) return;
  IModelApp.tools.register(SketchLineTool);
  IModelApp.tools.register(SketchRectangleTool);
  IModelApp.tools.register(SketchCenterRectangleTool);
  IModelApp.tools.register(SketchAlignedRectangleTool);
  IModelApp.tools.register(SketchCenterCircleTool);
  IModelApp.tools.register(SketchPerimeterCircleTool);
  IModelApp.tools.register(SketchInscribedPolygonTool);
  IModelApp.tools.register(SketchCircumscribedPolygonTool);
  IModelApp.tools.register(SketchArc3PointTool);
  IModelApp.tools.register(SketchCenterArcTool);
  IModelApp.tools.register(SketchSplineTool);
  IModelApp.tools.register(SketchBezierTool);
  sketchToolsRegistered = true;
}
