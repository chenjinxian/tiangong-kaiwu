/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 面/边选择工具（B6 M-A5.2 T2）：显式选择模式下的子实体拾取。
 * 复用 LocateSubEntityTool 的元素几何缓存/拾取链/装饰；拾得后立即把会话级
 * cache id 换成持久拓扑 id（resolveFaceRef/resolveEdgeRef），工具清理后仍可寻址。
 * 边仅接受 resolveEdgeRef 放行的流形边；边界/非流形边原样透出后端错误。
 * 右键不退出（CanvasContextMenu 用）；Esc/宿主 stop 才结束。
 *
 * 启动通道：直构 + run()（同 FilletEdgePickTool；无注册表选项注入面）。
 */
import { EventHandled, IModelApp } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import { SubEntityType } from '@itwin/editor-common';
import type { ElementGeometryCacheFilter, SubEntityLocationProps } from '@itwin/editor-common';
import { LocateSubEntityTool } from '@itwin/editor-frontend';
import i18next from 'i18next';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import type { CanvasSelection, CanvasSelectionMode } from '../../types.js';

export interface SubEntitySelectOptions {
  kind: Extract<CanvasSelectionMode, 'face' | 'edge'>;
  /** iModel key（resolveFaceRef/resolveEdgeRef RPC 寻址键）。 */
  connectionKey: string;
  /** 每拾得一个子实体（已换持久拓扑 id）——宿主写入 store.canvas.selection。 */
  onPicked?: (selection: CanvasSelection) => void;
  /** 换算失败等错误回报（文案已本地化或后端原文）。 */
  onError?: (message: string) => void;
  /** 工具结束（Esc/宿主 stop/框架替换）——宿主退出子实体选择模式。 */
  onEnded?: () => void;
}

export class SubEntitySelectTool extends LocateSubEntityTool {
  public static override toolId = 'LubanCAD.SelectSubEntity';
  public static override namespace = 'LubanCad';

  private readonly _options: SubEntitySelectOptions;

  public constructor(options: SubEntitySelectOptions) {
    super();
    this._options = options;
  }

  /** 只读拾取（无写入面——不进 requireWriteableTarget 检查）。 */
  public override requireWriteableTarget(): boolean {
    return false;
  }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, false);
    IModelApp.notifications.outputPrompt(i18next.t('partStudio.subEntitySelect.prompt'));
  }

  /** 面模式只认 Face，边模式只认 Edge。 */
  protected override wantSubEntityType(type: SubEntityType): boolean {
    return this._options.kind === 'face'
      ? SubEntityType.Face === type
      : SubEntityType.Edge === type;
  }

  /** BRep 实体几何缓存过滤（FilletEdgePickTool/BlendEdgesTool 同款）。 */
  protected override get geometryCacheFilter(): ElementGeometryCacheFilter | undefined {
    return { parts: true, curves: false, surfaces: true, solids: true, other: false };
  }

  /** 多选累积不设上限；结束权在右键（保留菜单）/Esc/宿主 stop。 */
  protected override get requiredSubEntityCount(): number {
    return Number.POSITIVE_INFINITY;
  }

  /** 右键保留工具与子实体装饰——宿主 onContextMenu 据此打开 owner 菜单。 */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    return EventHandled.Yes;
  }

  /** 拾得子实体：高亮先落；换算成功才回调 onPicked，失败摘除高亮。 */
  protected override async addSubEntity(id: string, props: SubEntityLocationProps): Promise<void> {
    await super.addSubEntity(id, props);

    const selection = await this.resolvePicked(id, props.subEntity.id);
    if (undefined === selection) {
      await this.removeSubEntity(id, props);
      return;
    }

    this._options.onPicked?.(selection);
  }

  /**
   * 会话级 cache id → 持久拓扑 id（测试触达面——protected 供测试子类拓宽）。
   * 面返回 resolveFaceRef.ref；边返回 resolveEdgeRef.ref.edge。失败/异常一律
   * onError 并返回 undefined（不静默）。
   */
  protected async resolvePicked(ownerBodyKey: string, cacheId: number): Promise<CanvasSelection | undefined> {
    const fallback = i18next.t('partStudio.subEntitySelect.resolveFailed');
    try {
      if (this._options.kind === 'face') {
        const result = await LubanFeatureRpcInterface.getClient().resolveFaceRef(
          this._options.connectionKey,
          ownerBodyKey,
          cacheId,
        );
        if (!result.ok || !result.ref) {
          this._options.onError?.(result.error ?? fallback);
          return undefined;
        }
        return {
          kind: 'face',
          id: `face:${result.ref.nodeId}:${result.ref.entityId}`,
          ownerBodyKey,
          topologyId: result.ref,
          cacheId,
          label: i18next.t('partStudio.subEntitySelect.faceLabel'),
        };
      }

      const result = await LubanFeatureRpcInterface.getClient().resolveEdgeRef(
        this._options.connectionKey,
        ownerBodyKey,
        cacheId,
      );
      if (!result.ok || !result.ref) {
        this._options.onError?.(result.error ?? fallback);
        return undefined;
      }
      return {
        kind: 'edge',
        id: `edge:${result.ref.edge.nodeId}:${result.ref.edge.entityId}`,
        ownerBodyKey,
        topologyId: result.ref.edge,
        cacheId,
        label: i18next.t('partStudio.subEntitySelect.edgeLabel'),
      };
    } catch (err) {
      this._options.onError?.(err instanceof Error ? err.message : fallback);
      return undefined;
    }
  }

  /** 工具结束回调（测试可经子类拓宽触达；onCleanup 是唯一生产调用点）。 */
  protected notifyEnded(): void {
    this._options.onEnded?.();
  }

  public override async onCleanup(): Promise<void> {
    await super.onCleanup();
    this.notifyEnded();
  }

  /** 框架重启：携原 options 重挂新实例（直构通道无注册表查回）。 */
  public override async onRestartTool(): Promise<void> {
    const tool = new SubEntitySelectTool(this._options);
    if (!(await tool.run())) {
      await this.exitTool();
    }
  }
}

/** 启动面/边选择会话（宿主选择模式消费；直构+run）。 */
export async function startSubEntitySelect(
  options: SubEntitySelectOptions,
): Promise<SubEntitySelectTool | undefined> {
  const tool = new SubEntitySelectTool(options);
  return (await tool.run()) ? tool : undefined;
}
