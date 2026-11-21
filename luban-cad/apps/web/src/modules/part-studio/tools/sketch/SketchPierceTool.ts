/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「穿透」约束工具（Sketch.Constraint.Pierce，S2 UI 2026-11-21）。
 *
 * Onshape live 证据：PIERCE 是约束工具（约束飞菜单「穿透」/ shift+g），无独立
 * 对话框/选项；选择草图点 + 活跃草图平面外的图元，非法选择给出通用提示
 * 「一些图元无法使用。」。成功 glyph 未采集——本实现只做最小诚实视觉：阶段
 * 提示 pill（`sketch-tool-feedback`），不做假对话框/假 glyph。
 *
 * 两步拾取（纯决策在 `sketch-pierce-logic.ts`）：
 * 1. 草图点：统一 `pickSketchPlaneLocal` 取局部坐标 + `resolveNearestPick`
 *    就近分辨；只接受**持久非投影 point 实体**（线端点/圆心/隐藏原点拒收）。
 * 2. 模型边：与 Use 覆盖层同一只读 BRep 通道（`readBrepEdgeHandles` +
 *    `resolveEdgeRef`，`loadSketchUseBodyCandidates` 加载，经
 *    `withExclusiveBrepCommand` 串行），仅 line/arc `part="curve"` 候选；
 *    屏幕最邻近 ≤ `HIT_CURVE_PX`（与 Use 覆盖层同一命中半径）。
 *
 * 提交：`buildPierceExternalRefRow`（`kind="pierce"`, `entityIds: []`,
 * `localEntityId`=点实体）→ 既有 `system.applyUpdate(entities, constraints,
 * [...externalRefs, row])`（标准 FeatureOp/RPC 管道，不新增契约）。成功后工具
 * 保持激活继续下一次 PIERCE（约束工具连续语义）；后端拒收/读取失败给本地化
 * 错误 toast，绝不假成功。样条/椭圆等非精确边不参与候选（点击得到通用失败
 * 提示）；读边失败保持工具存活并诚实提示。
 *
 * 运行依赖：模块级 accessor `getSketchSystem()`（`IModelApp.tools.run(id)`
 * 无参启动无选项注入通道）——S2 UI 起 `UseSketchSystem` 同时暴露
 * `connection`/`bodies`（模型边候选来源）。
 */
import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import i18next from 'i18next';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { sketchPlaneFrameFrom } from './sketch-plane.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { pickSketchPlaneLocal } from './sketch-pick.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import { pickPierceEdge, resolvePiercePointPick, toPierceHit } from './sketch-pierce-logic.js';
import { buildPierceExternalRefRow, nextExternalRefId } from '../../internal/sketch-use.js';
import { loadSketchUseBodyCandidates } from '../../internal/sketch-use-candidates.js';
import type { SketchUseBodyCandidate } from '../../internal/sketch-use-candidates.js';

/** 活动草图平面架（store 当前活动草图 plane → 缺省 XY@z=0；与约束工具同源）。 */
function resolveSketchPlaneFrame(): SketchPlaneFrame {
  return sketchPlaneFrameFrom(usePartStudioStore.getState().sketch.activeSketchPlane);
}

export class PierceAddTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';
  public static override toolId = 'Sketch.Constraint.Pierce';
  public static override iconSpec = 'icon-constraint-pierce';

  /** 草图平面架（onPostInstall 解析一次）。 */
  private _plane!: SketchPlaneFrame;
  /** 第一步拾取的持久点实体 id（undefined=等待点拾取）。 */
  private _pointId?: number;
  /** 模型边候选（仅 `part="curve"`；Use 同款只读通道加载）。 */
  private _edges: SketchUseBodyCandidate[] = [];
  private _edgesLoading = true;
  /** 读边成功过（即使 0 条）——body 读面晚到时第二步触发一次补读。 */
  private _edgesLoaded = false;
  /** 读边失败原因（已翻译；到达第二步时诚实提示，不静默 no-op）。 */
  private _edgesError?: string;
  private _cursorView?: { x: number; y: number };
  /** 工具卸载后丢弃迟到候选（不写入已释放实例）。 */
  private _disposed = false;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    // 与约束工具同款：不 locate 元素（无定位圈）但开启 AccuSnap 吸附（点拾取
    // 精确并列；取点仍走统一 `pickSketchPlaneLocal`）。
    this.initLocateElements(false, true);
    this._updatePrompt();
    void this._loadEdgeCandidates();
  }

  public override async onCleanup(): Promise<void> {
    this._disposed = true;
    clearSketchToolFeedback(this.toolId);
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    // 第一步不追踪边（点优先）；第二步随光标高亮并更新提示（不做整幅覆盖层，
    // 不回归既有 Use 覆盖层）。
    if (this._pointId === undefined) {
      this._updatePrompt();
      return;
    }
    this._updatePrompt(this._findEdge(ev) !== undefined);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }

    if (this._pointId === undefined)
      return this._pickPoint(ev, sketch.entities);

    return this._pickEdgeAndCommit(ev, sketch);
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._pointId !== undefined) {
      // 取消进行中的两步拾取，工具保持存活（退出工具用右键菜单/Esc）。
      this._pointId = undefined;
      this._updatePrompt();
      return EventHandled.Yes;
    }
    // Onshape live：右键=画布菜单（首项「退出 <工具>」），不直接退出；Esc 仍退出。
    return EventHandled.Yes;
  }

  /** PrimitiveTool 抽象槽位：外部事件要求重启时换新实例重挂。 */
  public override async onRestartTool(): Promise<void> {
    const tool = new PierceAddTool();
    if (!(await tool.run())) this.exitTool();
  }

  private _pickPoint(
    ev: BeButtonEvent,
    entities: SketchEntityDto[],
  ): EventHandled {
    const hit = pickSketchPlaneLocal(ev, this._plane);
    const result = resolvePiercePointPick(entities, toPierceHit(hit));
    if (!result.ok) {
      // Onshape live：非法选择通用提示（点/边/不支持的边同文案），不消耗点击。
      this._notify(i18next.t('partStudio.sketch.pierce.invalidSelection'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    this._pointId = result.entityId;
    this._updatePrompt();
    return EventHandled.Yes;
  }

  private async _pickEdgeAndCommit(
    ev: BeButtonEvent,
    sketch: SketchDto,
  ): Promise<EventHandled> {
    if (this._edgesError) {
      this._notify(this._edgesError, OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    if (this._edgesLoading) {
      this._notify(i18next.t('partStudio.sketch.pierce.loadingEdges'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    // body 读面晚到（工具安装时 bodies 仍为加载中）：补读一次。
    if (!this._edgesLoaded && this._edges.length === 0
      && (getSketchSystem()?.bodies?.length ?? 0) > 0) {
      void this._loadEdgeCandidates();
      this._notify(i18next.t('partStudio.sketch.pierce.loadingEdges'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const edge = this._findEdge(ev);
    if (!edge) {
      this._notify(i18next.t('partStudio.sketch.pierce.invalidSelection'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    const sketchSystem = getSketchSystem();
    if (!sketchSystem) {
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const externalRefs = sketch.externalRefs ?? [];
    const row = buildPierceExternalRefRow({
      id: nextExternalRefId(externalRefs),
      bodyKey: edge.bodyKey,
      topologyRef: edge.topologyRef,
      localEntityId: this._pointId!,
      entities: sketch.entities,
      externalRefs,
    });
    if ('ok' in row) {
      this._notify(i18next.t('partStudio.sketch.pierce.invalidSelection'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    // 整表提交（既有 FeatureOp/RPC 管道）：投影几何由后端读面合成，前端不写坐标。
    const result = await sketchSystem.applyUpdate(
      sketch.entities,
      sketch.constraints,
      [...externalRefs, row],
    );
    if (!result.ok) {
      this._pointId = undefined;
      this._updatePrompt();
      this._notify(
        i18next.t('partStudio.sketch.pierce.failed', { message: result.error ?? '' }),
        OutputMessagePriority.Error,
      );
      return EventHandled.Yes;
    }

    // 连续约束语义：清空拾取、回到第一步，等待下一次 PIERCE（工具不退出）。
    this._pointId = undefined;
    this._updatePrompt();
    return EventHandled.Yes;
  }

  private _findEdge(ev: BeButtonEvent): SketchUseBodyCandidate | undefined {
    const viewport = ev.viewport;
    if (!viewport || this._edges.length === 0)
      return undefined;
    return pickPierceEdge(this._edges, { x: ev.viewPoint.x, y: ev.viewPoint.y }, (world) => {
      const view = viewport.worldToView(new Point3d(world[0], world[1], world[2]));
      return { x: view.x, y: view.y };
    });
  }

  /** 读模型边候选（Use 同款只读通道；命令槽经 `withExclusiveBrepCommand` 串行）。 */
  private async _loadEdgeCandidates(): Promise<void> {
    const system = getSketchSystem();
    const connectionKey = system?.connection?.key;
    const bodies = system?.bodies ?? [];
    if (!connectionKey) {
      this._edgesLoading = false;
      this._edges = [];
      this._edgesError = i18next.t('partStudio.sketch.pierce.readEdgesFailed');
      return;
    }
    // 无 body = 没有可穿透的模型边（不是读取失败）；body 读面晚到时第二步补读。
    if (bodies.length === 0) {
      this._edgesLoading = false;
      this._edges = [];
      return;
    }
    this._edgesLoading = true;
    try {
      const [{ readBrepEdgeHandles }, { withExclusiveBrepCommand }] = await Promise.all([
        import('../../internal/brep-topology.js'),
        import('../../internal/brep-command-coordinator.js'),
      ]);
      if (this._disposed)
        return;
      const result = await withExclusiveBrepCommand(() => loadSketchUseBodyCandidates({
        iModelKey: connectionKey,
        bodies,
        readEdges: readBrepEdgeHandles,
        resolveEdgeRef: (iModelKey, bodyKey, subEntityId) =>
          LubanFeatureRpcInterface.getClient().resolveEdgeRef(iModelKey, bodyKey, subEntityId),
      }));
      if (this._disposed)
        return;
      this._edges = result.candidates.filter((candidate) => candidate.part === 'curve');
      this._edgesLoading = false;
      this._edgesLoaded = true;
      if (result.errors.includes('read-edges-unavailable'))
        this._edgesError = i18next.t('partStudio.sketch.pierce.readEdgesFailed');
    } catch {
      if (this._disposed)
        return;
      this._edges = [];
      this._edgesLoading = false;
      this._edgesError = i18next.t('partStudio.sketch.pierce.readEdgesFailed');
    }
  }

  private _updatePrompt(edgeHovered = false): void {
    let text: string;
    if (this._pointId === undefined) {
      text = i18next.t('partStudio.sketch.pierce.promptPoint');
    } else if (this._edgesError) {
      text = this._edgesError;
    } else if (this._edgesLoading) {
      text = i18next.t('partStudio.sketch.pierce.loadingEdges');
    } else {
      text = edgeHovered
        ? i18next.t('partStudio.sketch.pierce.promptEdgeHover')
        : i18next.t('partStudio.sketch.pierce.promptEdge');
    }
    IModelApp.notifications.outputPrompt(text);
    // 安装即发布（无光标也能显示阶段提示 pill；约束工具旧行为仅随鼠标发布）。
    publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  /** 错误/信息面走 outputMessage（呈现桥 ViewerNotifications → iTwinUI toaster）。 */
  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}
