/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 圆角边拾取工具（M6-b T6，F8）：**对话框驱动**的视口多选边——FeatureDialog
 * fillet 通道「添加边」钮启动本工具，每拾一条边回调对话框 chips 增行，右键/Esc
 * 结束拾取回对话框。
 *
 * 架构依据（.superpowers/sdd/2026-10-23-tutorial2-sketch-chain/architecture.md
 * §二 L2 复用件）：继承 editor 基座 **LocateSubEntityTool**（裁决：子类化而非
 * 组合直调 solidModelingIpc.locateSubEntities——基座承担元素几何缓存建/过滤
 * （ElementGeometryCacheTool.acceptElementForOperation）、光瞳/射线/透视裁剪
 * 拾取链（doPickSubEntities）、子实体高亮（SubEntityData/createSubEntityGraphic）
 * 与工具提示全链；组合式须全部重写，违「复用优先」铁律）。边拾取形态与
 * BlendEdgesTool 同款：wantSubEntityType=Edge + {laminarEdges, smoothEdges}
 * 过滤（M3-a 圆角选边三层链的基座）。
 *
 * 持久寻址（M3-a 已知坑 → M6-d v1.9 换代）：SubEntityProps.id 是**会话级 cache
 * id**，工具退出（onCleanup 全清元素几何缓存）即失效——拾得后**立即**经
 * resolveEdgeRef RPC 换持久引用（FilletEdgeRef{edge}=边自身持久 id 单引用，
 * shared v1.9 纯换；私有仓 FeatureRpcImpl 走邻接通道门禁：getConnectedSubEntities
 * 边→邻面直查，邻接面数==2 才放行 op31 topologyIdFromSubEntity 换**边自身 id**
 * 〔T1 起边创建即赋号，布尔分裂子边继承〕；>2=多面交界边（非流形）、≤1=片体
 * 边界边，均在拾取时诚实拒收），换算成功才回调 onEdgeAdded（含父元素 id——
 * Critical 1 的 fillet target 自动推导依据）；失败回调 onError
 * 并摘除高亮（不留「高亮在而 chips 无」的裂口）。cache id→ref 映射随拾取会话
 * 存活（removeSubEntity 反查回调 onEdgeRemoved——再点同边=取消该边）。
 *
 * 启动通道：**直构 + run()**（`new FilletEdgePickTool(options).run()`）——不走
 * IModelApp.tools.run(toolId)（无选项注入通道，M3-b 已知坑；旧应用
 * runSelectSubEntityTool 同姿态），故无需注册表；onRestartTool 携原 options 重挂。
 * i18n 经 i18next 单例直取（useFeatureSystem 同口径，回调内不吃闭包旧语）。
 *
 * 自动化可测性（诚实登记）：视口拾取链（boresite/命中/高亮）依赖真实 ToolAdmin
 * +briefcase 渲染面，jsdom 不可达——本文件单测只覆盖换算管道与键控纯函数
 * （子类拓宽 protected 触达，SketchCreateTool.test 先例）；真栈验证归 T7。
 */

import { ColorDef, ElementGeometry, RgbColor } from '@itwin/core-common';
import type { CurveCollection } from '@itwin/core-geometry';
import { EventHandled, GraphicType, IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BeButtonEvent, DecorateContext } from '@itwin/core-frontend';
import { SubEntityType } from '@itwin/editor-common';
import type { ElementGeometryCacheFilter, SubEntityFilter, SubEntityLocationProps, SubEntityProps } from '@itwin/editor-common';
import { LocateSubEntityTool } from '@itwin/editor-frontend';
import type { SubEntityData } from '@itwin/editor-frontend';
import i18next from 'i18next';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';

/** 元素 id（core-bentley Id64String 的字符串别名——web 未直依 core-bentley，取同构别名）。 */
type ElementId = string;

/** 拾取会话选项（对话框驱动：回调由 FeatureDialog 注入）。 */
export interface FilletEdgePickToolOptions {
  /** iModel key（resolveEdgeRef RPC 寻址键；FeatureDialog connectionKey 直通）。 */
  connectionKey: string;
  /**
   * 每拾得一条边（已换持久拓扑 id 对）+ 父元素 id（=getBodies.bodyKey）——
   * 对话框 chips 增行，并按 owner 自动推导 fillet 的 targetBodyId（Critical 1）。
   */
  onEdgeAdded?: (ref: FilletEdgeRef, ownerElementId: ElementId) => void;
  /** 已拾边被取消（再点同边）——对话框 chips 减行（按 refKey 反查）+ owner 同步移除。 */
  onEdgeRemoved?: (ref: FilletEdgeRef, ownerElementId: ElementId) => void;
  /** 边引用换算失败等错误回报（对话框 toast 呈现；文案已本地化）。 */
  onError?: (message: string) => void;
  /** 主动结束拾取（右键/再点「结束拾取」）：工具仍驻留，已选边高亮保留到对话框关闭。 */
  onPickingSuspended?: () => void;
  /** 从挂起态恢复拾取（再次「添加边」）。 */
  onPickingResumed?: () => void;
  /** 拾取会话真正销毁（对话框关闭/宿主 stop）——高亮随之清除。 */
  onEnded?: () => void;
}

/**
 * Onshape 圆角选择高亮橙（live 截图实测核心 ≈ #EBA93D；取品牌橙 #F5A623，
 * 与预览选中面域同色）——不是通用选择的品牌蓝，圆角工具内覆盖。
 */
const FILLET_EDGE_ORANGE = RgbColor.fromColorDef(ColorDef.from(0xf5, 0xa6, 0x23));
/**
 * 已选边高亮朝相机的屏幕偏移；实心圆角结果预览与源体共面，需要大于基座缺省
 * 3px 才能保持橙色可见（2026-11-02 演示反馈）。
 */
const FILLET_EDGE_HIGHLIGHT_OFFSET_PX = 10;

/** 拾取键（elementId:cacheSubEntityId）→ 已换算 ref 的会话映射（removeSubEntity 反查）。 */
type PickRefMap = Map<string, FilletEdgeRef>;

/** 拾取键构造（cache id 短命——本键只在拾取会话内存活，退出即整表作废）。 */
function pickKey(elementId: ElementId, subEntityId: number): string {
  return `${elementId}:${subEntityId}`;
}

/**
 * 圆角边拾取工具（多选累积；右键/Esc 结束）。
 * @see 文件头注（架构裁决/持久寻址/启动通道）。
 */
export class FilletEdgePickTool extends LocateSubEntityTool {
  public static override toolId = 'Fillet.PickEdges';
  public static override iconSpec = 'icon-move'; // TODO: 待官方图标字形补齐（RoundEdgesTool 同姿态）
  public static override namespace = 'LubanCad';

  private readonly _options: FilletEdgePickToolOptions;
  private readonly _pickRefs: PickRefMap = new Map();
  /** false=已结束拾取但工具仍驻留，保留 accepted 边高亮直到对话框关闭。 */
  private _picking = true;

  constructor(options: FilletEdgePickToolOptions) {
    super();
    this._options = options;
  }

  /** 挂起拾取（右键/结束拾取钮）：清 hover，保留已选边高亮与几何缓存。 */
  public suspendPicking(): void {
    if (!this._picking) return;
    this._picking = false;
    this.clearCurrentSubEntity();
    IModelApp.viewManager.invalidateDecorationsAllViews();
    this._options.onPickingSuspended?.();
  }

  /** 恢复拾取（对话框「添加边」再点）；沿用既有缓存与已选边。 */
  public resumePicking(): void {
    if (this._picking) return;
    this._picking = true;
    this.initLocateElements(true, false);
    this.setupAndPromptForNextAction();
    IModelApp.notifications.outputPrompt(i18next.t('partStudio.filletPick.prompt'));
    IModelApp.viewManager.invalidateDecorationsAllViews();
    this._options.onPickingResumed?.();
  }

  /** 挂起态不更新 hover 命中；已选边仍由基座 decorate 绘制。 */
  protected override async updateGraphic(ev: BeButtonEvent, isDynamics: boolean): Promise<void> {
    if (!this._picking) {
      this.clearCurrentSubEntity();
      return;
    }
    return super.updateGraphic(ev, isDynamics);
  }

  /** 挂起态点击画布不增加边（对话框仍可编辑参数）。 */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (!this._picking) return EventHandled.Yes;
    return super.onDataButtonDown(ev);
  }

  /** 只读拾取（无写入面——不进 requireWriteableTarget 检查；旧 SelectSubEntityTool 同口径）。 */
  public override requireWriteableTarget(): boolean {
    return false;
  }

  /**
   * BRep 子实体定位前提（M3-a 2026-10-09 实测定界）：缺 initLocateElements(true)
   * 点击无命中（不 locate 元素 → 无 sub-entity 定位）；不开吸附（wantAccuSnap
   * 缺省 false——子实体命中走拾取链非捕捉链）。
   */
  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, false);
    IModelApp.notifications.outputPrompt(i18next.t('partStudio.filletPick.prompt'));
  }

  /** 只认边（BlendEdgesTool 同款）。 */
  protected override wantSubEntityType(type: SubEntityType): boolean {
    return SubEntityType.Edge === type;
  }

  /** laminar/smooth 过滤（BlendEdgesTool 同款——圆角只吃凸/凹刚性边，滤网格线）。 */
  protected override getSubEntityFilter(): SubEntityFilter | undefined {
    return { laminarEdges: true, smoothEdges: true };
  }

  /** BRep 实体几何缓存过滤（BlendEdgesTool 同款：体+曲面，拒曲线/其他）。 */
  protected override get geometryCacheFilter(): ElementGeometryCacheFilter | undefined {
    return { parts: true, curves: false, surfaces: true, solids: true, other: false };
  }

  /** 橙色 x-ray 选边覆盖层需要精确世界几何。 */
  protected override get wantSubEntityGeometry(): boolean { return true; }

  /**
   * 多选累积不设上限（对话框驱动：结束权在右键/Esc/宿主 stop，不在基座
   * requiredSubEntityCount 满槽）——wantAdditionalSubEntities 恒真，每次
   * 数据键拾取一条。
   */
  protected override get requiredSubEntityCount(): number {
    return Number.POSITIVE_INFINITY;
  }

  /**
   * 圆角选边橙色覆盖层（2026-11-02）：基座高亮图形挂在源元素 id 上，源体为
   * 实心结果预览而透明/隐藏时橙色会一并消失。这里直接把缓存的子实体几何
   * （世界系 ElementGeometryDataEntry）重画为 WorldOverlay 橙线——x-ray，
   * 不受源体显隐/深度影响，和 Onshape 已选边高亮同姿态。
   */
  protected override drawSubEntity(context: DecorateContext, subEntity: SubEntityData, accepted: boolean): void {
    if (this.drawEdgeOverlay(context, subEntity)) return;
    super.drawSubEntity(context, subEntity, accepted);
  }

  private drawEdgeOverlay(context: DecorateContext, subEntity: SubEntityData): boolean {
    const entry = subEntity.geometry?.geometry;
    if (!entry) return false;
    try {
      const iterator = new ElementGeometry.Iterator({ entryArray: [entry] });
      const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
      const orange = ColorDef.from(0xf5, 0xa6, 0x23);
      builder.setSymbology(orange, orange, 3);
      let added = false;
      for (const item of iterator) {
        const geometry = item.toGeometryQuery();
        if (!geometry) continue;
        type CurveArg = Parameters<typeof builder.addCurvePrimitive>[0];
        if (geometry.geometryCategory === 'curvePrimitive') {
          builder.addCurvePrimitive(geometry as unknown as CurveArg);
          added = true;
        } else if (geometry.geometryCategory === 'curveCollection') {
          const children = (geometry as CurveCollection).children ?? [];
          for (const child of children)
            builder.addCurvePrimitive(child as unknown as CurveArg);
          added = children.length > 0;
        }
      }
      if (!added) return false;
      context.addDecorationFromBuilder(builder);
      return true;
    } catch {
      return false;
    }
  }

  /** Onshape 圆角规则：悬停/已选边均为橙色（不是通用选择的品牌蓝）。 */
  protected override async setCurrentSubEntity(
    id: ElementId,
    hit: SubEntityLocationProps,
    chordTolerance?: number,
  ): Promise<boolean> {
    const result = await super.setCurrentSubEntity(id, hit, chordTolerance);
    if (this._currentSubEntity) {
      this._currentSubEntity.highlightRgb = FILLET_EDGE_ORANGE;
      this._currentSubEntity.displayOffsetPixels = FILLET_EDGE_HIGHLIGHT_OFFSET_PX;
    }
    return result;
  }

  /** 拾得一条边：高亮先落（拾取反馈不等 RPC），换算成功才回报 chips。 */
  protected override async addSubEntity(id: ElementId, props: SubEntityLocationProps): Promise<void> {
    await super.addSubEntity(id, props);
    // 已选边橙显（基座把刚拾的边追加到 _acceptedSubEntities 尾部）。
    const accepted = this.getAcceptedSubEntityData(-1);
    if (accepted) {
      accepted.highlightRgb = FILLET_EDGE_ORANGE;
      accepted.displayOffsetPixels = FILLET_EDGE_HIGHLIGHT_OFFSET_PX;
    }

    const ref = await this.resolvePickedEdge(id, props.subEntity.id);
    if (undefined === ref) {
      // 换算失败：摘除刚加的子实体（高亮回落）——onEdgeRemoved 不触发
      //（失败边从未入映射，见 removeSubEntity 反查）。
      await this.removeSubEntity(id, props);
      return;
    }
    this._pickRefs.set(pickKey(id, props.subEntity.id), ref);
    // Critical 1：owner=拾取元素 id（体元素；getBodies.bodyKey 同值）。
    this._options.onEdgeAdded?.(ref, id);
  }

  /** 移除一条已拾边（再点同边）：反查映射回报 onEdgeRemoved（chips 减行）。 */
  protected override async removeSubEntity(id: ElementId, props?: SubEntityLocationProps): Promise<void> {
    // 摘除前先取目标子实体（super 会把条目滤出 _acceptedSubEntities）：显式
    // 定位载荷的 subEntity 优先，无载荷（pop-last 变体）回落最后一条已拾。
    const targetProps: SubEntityProps | undefined = props?.subEntity ?? this.getAcceptedSubEntityData()?.props;
    await super.removeSubEntity(id, props);

    if (undefined === targetProps) return;
    const key = pickKey(id, targetProps.id);
    const ref = this._pickRefs.get(key);
    if (undefined === ref) return; // 外来移除/失败回退路径——无可减行
    this._pickRefs.delete(key);
    this._options.onEdgeRemoved?.(ref, id);
  }

  /** 右键=结束拾取但保留高亮（Onshape：对话框开着时已选边持续蓝显）。 */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.suspendPicking();
    return EventHandled.Yes;
  }

  /** 会话真正结束（对话框关闭/宿主 stop/框架替换）：清高亮并回调。 */
  public override async onCleanup(): Promise<void> {
    this._picking = false;
    await super.onCleanup(); // 基座清元素几何缓存+高亮——cache id 全失效（换算已即时落袋）
    this._pickRefs.clear();
    this._options.onEnded?.();
  }

  /** 框架重启（挂起恢复等）：携原 options 重挂新实例（直构通道无注册表查回）。 */
  public override async onRestartTool(): Promise<void> {
    const tool = new FilletEdgePickTool(this._options);
    if (!(await tool.run())) return this.exitTool();
  }

  /**
   * 拾得边 → 边自身持久 id 单引用（resolveEdgeRef RPC；测试触达面——protected 供
   * 测试子类拓宽，同 SketchCreateTool.test 先例）。失败回调 onError 并返回
   * undefined（RPC 异常与拒收同面，不静默）。
   *
   * 拾取门禁裁决（M6-d T3 定案，v1.9 纯换后沿用）：**不加拾取前邻接预检**——
   * resolveEdgeRef 单点已是诚实门禁（后端邻接通道直判 >2 拒收，文案原样经
   * onError 透出即 UI 文案），拾取端再预检一次=双倍 RPC 且两处判定会漂移；
   * 拒收的诚实性由后端单点保证。
   */
  protected async resolvePickedEdge(elementId: ElementId, subEntityId: number): Promise<FilletEdgeRef | undefined> {
    const fallbackError = i18next.t('partStudio.filletPick.resolveFailed');
    try {
      const result = await LubanFeatureRpcInterface.getClient().resolveEdgeRef(
        this._options.connectionKey,
        elementId,
        subEntityId,
      );
      if (result.ok && result.ref) return result.ref;
      this._options.onError?.(result.error ?? fallbackError);
      return undefined;
    } catch (err) {
      this._options.onError?.(err instanceof Error ? err.message : fallbackError);
      return undefined;
    }
  }
}

/**
 * 启动圆角边拾取会话（FeatureDialog「添加边」钮消费；直构+run——见文件头注
 * 启动通道）。启动失败（视口不适配/宿主未就绪）返回 undefined，调用方按
 * 未进入拾取态处理。
 */
export async function startFilletEdgePick(options: FilletEdgePickToolOptions): Promise<FilletEdgePickTool | undefined> {
  const tool = new FilletEdgePickTool(options);
  return (await tool.run()) ? tool : undefined;
}
