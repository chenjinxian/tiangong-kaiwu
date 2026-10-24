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
 * 持久寻址（M3-a 已知坑）：SubEntityProps.id 是**会话级 cache id**，工具退出
 * （onCleanup 全清元素几何缓存）即失效——拾得后**立即**经 resolveEdgeRef RPC
 * 换持久拓扑 id 对（FilletEdgeRef{faceA,faceB}，私有仓 FeatureRpcImpl M6-d T3
 * 起走邻接通道：getConnectedSubEntities 边→邻面直查，邻接面数==2 才放行换
 * topologyIdFromSubEntity；>2=多面交界边（非流形）、≤1=片体边界边，均在拾取
 * 时诚实拒收——取代旧两两枚举面对启发式的假阳性与 blend 中途整体回滚），
 * 换算成功才回调 onEdgeAdded；失败回调 onError 并摘除高亮（不留「高亮在而
 * chips 无」的裂口）。cache id→ref 映射随拾取会话存活（removeSubEntity 反查
 * 回调 onEdgeRemoved——再点同边=取消该边）。
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

import { EventHandled, IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import { SubEntityType } from '@itwin/editor-common';
import type { ElementGeometryCacheFilter, SubEntityFilter, SubEntityLocationProps, SubEntityProps } from '@itwin/editor-common';
import { LocateSubEntityTool } from '@itwin/editor-frontend';
import i18next from 'i18next';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';

/** 元素 id（core-bentley Id64String 的字符串别名——web-next 未直依 core-bentley，取同构别名）。 */
type ElementId = string;

/** 拾取会话选项（对话框驱动：回调由 FeatureDialog 注入）。 */
export interface FilletEdgePickToolOptions {
  /** iModel key（resolveEdgeRef RPC 寻址键；FeatureDialog connectionKey 直通）。 */
  connectionKey: string;
  /** 每拾得一条边（已换持久拓扑 id 对）——对话框 chips 增行。 */
  onEdgeAdded?: (ref: FilletEdgeRef) => void;
  /** 已拾边被取消（再点同边）——对话框 chips 减行（按 refKey 反查）。 */
  onEdgeRemoved?: (ref: FilletEdgeRef) => void;
  /** 边引用换算失败等错误回报（对话框 toast 呈现；文案已本地化）。 */
  onError?: (message: string) => void;
  /** 拾取会话结束（右键/Esc/宿主 stop 触发工具退出）——对话框回非拾取态。 */
  onEnded?: () => void;
}

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

  constructor(options: FilletEdgePickToolOptions) {
    super();
    this._options = options;
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

  /**
   * 多选累积不设上限（对话框驱动：结束权在右键/Esc/宿主 stop，不在基座
   * requiredSubEntityCount 满槽）——wantAdditionalSubEntities 恒真，每次
   * 数据键拾取一条。
   */
  protected override get requiredSubEntityCount(): number {
    return Number.POSITIVE_INFINITY;
  }

  /** 拾得一条边：高亮先落（拾取反馈不等 RPC），换算成功才回报 chips。 */
  protected override async addSubEntity(id: ElementId, props: SubEntityLocationProps): Promise<void> {
    await super.addSubEntity(id, props);

    const ref = await this.resolvePickedEdge(id, props.subEntity.id);
    if (undefined === ref) {
      // 换算失败：摘除刚加的子实体（高亮回落）——onEdgeRemoved 不触发
      //（失败边从未入映射，见 removeSubEntity 反查）。
      await this.removeSubEntity(id, props);
      return;
    }
    this._pickRefs.set(pickKey(id, props.subEntity.id), ref);
    this._options.onEdgeAdded?.(ref);
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
    this._options.onEdgeRemoved?.(ref);
  }

  /** 右键=结束拾取（对话框驱动裁决；不沿用基座右键换.hit 语义）。 */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** 会话结束（三通道汇合点：右键/Esc→exitTool、宿主 stop、框架替换）：回调对话框。 */
  public override async onCleanup(): Promise<void> {
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
   * 拾得边 → 持久拓扑 id 对（resolveEdgeRef RPC；测试触达面——protected 供测试
   * 子类拓宽，同 SketchCreateTool.test 先例）。失败回调 onError 并返回
   * undefined（RPC 异常与拒收同面，不静默）。
   *
   * 拾取门禁裁决（M6-d T3 定案）：**不加拾取前邻接预检**——resolveEdgeRef 单点
   * 已是诚实门禁（后端邻接通道直判 >2 拒收，文案原样经 onError 透出即 UI 文案），
   * 拾取端再预检一次=双倍 RPC 且两处判定会漂移；拒收的诚实性由后端单点保证。
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
