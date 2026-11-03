/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 式统一选择工具（2026-11-03）：
 * - 面/边/点全收，无显式模式；
 * - 悬停按 顶点(≤10px) > 边(≤6px) > 面 就近高亮；
 * - 普通单击替换、Ctrl 切换、空白清除；
 * - 不把 body 加入 ElementSetTool agenda（getCurrentElement 只用 accuSnap.currHit，
 *   修复旧实现第一次拾取后钉死第一个 body 的缺陷）；
 * - 拾取链/几何缓存/高亮全部复用 LocateSubEntityTool。
 */
import { CoordSource, EventHandled, IModelApp } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { SubEntityType } from '@itwin/editor-common';
import type {
  ElementGeometryCacheFilter,
  SubEntityLocationProps,
  SubEntityProps,
} from '@itwin/editor-common';
import { LocateSubEntityTool } from '@itwin/editor-frontend';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import i18next from 'i18next';
import type { CanvasSelection } from '../../types.js';

export interface OnshapeSelectOptions {
  connectionKey: string;
  onSelectionChanged: (selection: readonly CanvasSelection[]) => void;
  onError: (message: string) => void;
}

const VERTEX_PICK_PX = 10;
const EDGE_PICK_PX = 6;

function selectionKey(owner: string, props: SubEntityProps): string {
  return `${owner}:${props.type}:${props.id}:${props.index ?? 0}`;
}

export class OnshapeSelectTool extends LocateSubEntityTool {
  public static override toolId = 'LubanCAD.SelectSubEntity';
  public static override namespace = 'LubanCad';

  private readonly _options: OnshapeSelectOptions;
  /** 选择映射（protected：单测子类断言 owner-aware 增删语义）。 */
  protected readonly _selected = new Map<string, CanvasSelection>();
  protected readonly _selectedKeys: string[] = [];
  /** 与 _acceptedSubEntities 逐项对齐的 owner-aware key（同一 cache id 可属不同 body）。 */
  protected readonly _acceptedKeys: string[] = [];
  /** 选择被清空/工具清理的代数——阻止异步 resolve 在清空后回插选择。 */
  private _selectionGeneration = 0;
  private _paused = false;
  private _commandSuspended = false;

  public constructor(options: OnshapeSelectOptions) {
    super();
    this._options = options;
  }

  public override requireWriteableTarget(): boolean {
    return false;
  }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    if (!this._paused)
      this.initLocateElements(true, false);
    this.setupAndPromptForNextAction();
    IModelApp.notifications.outputPrompt(i18next.t('partStudio.subEntitySelect.prompt'));
  }

  protected override get wantAdditionalElements(): boolean { return false; }
  protected override get shouldEnableLocate(): boolean { return !this._paused && !this._commandSuspended; }
  /**
   * 暂停/命令挂起期间必须为 false：基类 changeLocateState 会据此把 locate circle
   * 重新点亮（`!isLocateCircleOn && wantAdditionalSubEntities`），暂停语义
   * 就会被打破。requiredSubEntityCount=∞ 时基类 getter 恒真，故显式收口。
   */
  protected override get wantAdditionalSubEntities(): boolean {
    return !this._paused && !this._commandSuspended && super.wantAdditionalSubEntities;
  }
  protected override get shouldEnableSnap(): boolean { return false; }

  protected override wantSubEntityType(type: SubEntityType): boolean {
    return type === SubEntityType.Face || type === SubEntityType.Edge || type === SubEntityType.Vertex;
  }

  protected override getMaximumSubEntityHits(type: SubEntityType): number {
    return type === SubEntityType.Face ? 1 : 3;
  }

  protected override get geometryCacheFilter(): ElementGeometryCacheFilter | undefined {
    return { parts: true, curves: false, surfaces: true, solids: true, other: false };
  }

  protected override get requiredSubEntityCount(): number {
    return Number.POSITIVE_INFINITY;
  }

  /** 只认当前光标命中的元素——agenda 不参与，跨 body 拾取。 */
  protected override getCurrentElement(): string | undefined {
    const hit = IModelApp.accuSnap?.currHit;
    return hit?.isElementHit ? hit.sourceId : undefined;
  }

  protected override async doPickSubEntities(
    id: string,
    ev: BeButtonEvent,
  ): Promise<SubEntityLocationProps[] | undefined> {
    if (this._paused || this._commandSuspended)
      return undefined;

    const hits = await super.doPickSubEntities(id, ev);
    return this.applyHoverPriority(hits, ev);
  }

  /**
   * 过滤/排序后的空集必须返回 undefined：基类 updateCurrentSubEntity 把 []
   * 当作有命中并读 current[0].point，异常后 _subEntityGraphicPending 永久挂起
   * （hover 死锁）。
   */
  protected applyHoverPriority(
    hits: SubEntityLocationProps[] | undefined,
    ev: BeButtonEvent,
  ): SubEntityLocationProps[] | undefined {
    if (!hits || hits.length === 0)
      return undefined;

    const ordered = this.orderHits(hits, ev);
    return ordered.length > 0 ? ordered : undefined;
  }

  /** 屏幕距离过滤 + 顶点>边>面排序（protected 供测试触达）。 */
  protected orderHits(hits: SubEntityLocationProps[], ev: BeButtonEvent): SubEntityLocationProps[] {
    const vp = ev.viewport;
    if (!vp)
      return hits;

    const cursor = ev.viewPoint;
    const distance = (hit: SubEntityLocationProps): number =>
      vp.worldToView(Point3d.fromJSON(hit.point)).distanceXY(cursor);

    const vertices = hits
      .filter((hit) => hit.subEntity.type === SubEntityType.Vertex && distance(hit) <= VERTEX_PICK_PX)
      .sort((a, b) => distance(a) - distance(b));
    const edges = hits
      .filter((hit) => hit.subEntity.type === SubEntityType.Edge && distance(hit) <= EDGE_PICK_PX)
      .sort((a, b) => distance(a) - distance(b));
    const faces = hits.filter((hit) => hit.subEntity.type === SubEntityType.Face);

    return [...vertices, ...edges, ...faces];
  }

  protected override async doLocateSubEntity(ev: BeButtonEvent, newSearch: boolean): Promise<boolean> {
    if (this._paused || this._commandSuspended)
      return false;

    const id = this.getCurrentElement();
    const control = ev.isControlKey;

    if (!id) {
      if (!control)
        await this.clearSelection();
      return false;
    }

    if (newSearch) {
      this._locatedSubEntities = await this.doPickSubEntities(id, ev);
      if (!this._locatedSubEntities || this._locatedSubEntities.length === 0) {
        if (!control)
          await this.clearSelection();
        return false;
      }

      const first = this._locatedSubEntities[0];
      if (first && ev.coordsFrom !== CoordSource.ElemSnap) {
        ev.point.setFrom(Point3d.fromJSON(first.point));
        IModelApp.toolAdmin.setAdjustedDataPoint(ev);
      }
    } else {
      await this.removeSubEntity(id);
    }

    const hit = this._locatedSubEntities?.shift();
    if (!hit)
      return false;

    const exists = this._acceptedKeys.includes(selectionKey(id, hit.subEntity));

    if (control) {
      if (exists)
        await this.removeSubEntity(id, hit);
      else
        await this.addSubEntity(id, hit);
    } else if (!(exists && this._acceptedSubEntities.length === 1)) {
      await this.clearSelection();
      await this.addSubEntity(id, hit);
    }

    IModelApp.viewManager.invalidateDecorationsAllViews();
    return true;
  }

  /** 右键保留工具与高亮，由宿主打开 CanvasContextMenu。 */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    return EventHandled.Yes;
  }

  protected override async addSubEntity(id: string, props: SubEntityLocationProps): Promise<void> {
    const key = selectionKey(id, props.subEntity);
    const generation = this._selectionGeneration;
    // 不复用基类 addSubEntity：其 push 在 createSubEntityData await 之后，无法与
    // _acceptedKeys 保持逐项对齐，也无法在 clearSelection 竞态时精确回滚。
    const data = await this.createSubEntityData(id, props);

    if (generation !== this._selectionGeneration) {
      data.cleanupGraphic();
      return;
    }

    if (!data.hasGraphic) {
      data.cleanupGraphic();
      this._options.onError(i18next.t('partStudio.subEntitySelect.highlightFailed'));
      return;
    }

    this._acceptedSubEntities.push(data);
    this._acceptedKeys.push(key);

    const selection = await this.resolveSelection(id, props.subEntity);

    if (generation !== this._selectionGeneration) {
      // 清空发生在 resolve 期间：撤掉先压入的高亮，且不再回插选择。
      this.discardAccepted(key);
      return;
    }

    if (!selection) {
      await this.removeSubEntity(id, props);
      return;
    }

    if (!this._selected.has(key))
      this._selectedKeys.push(key);
    this._selected.set(key, selection);
    this.emitSelection();
  }

  protected override async removeSubEntity(id: string, props?: SubEntityLocationProps): Promise<void> {
    // 基类按 props 过滤（type/id/index），对同一 cache id 的不同 body 会误删——
    // 这里按 owner-aware key 精确定位并同步清理高亮与选择映射。
    if (props) {
      const key = selectionKey(id, props.subEntity);
      this.discardAccepted(key);
      this.removeSelectedKey(key);
    } else {
      const key = this._acceptedKeys.pop();
      this._acceptedSubEntities.pop()?.cleanupGraphic();
      if (key)
        this.removeSelectedKey(key);
    }

    this.emitSelection();
  }

  private discardAccepted(key: string): void {
    const index = this._acceptedKeys.lastIndexOf(key);
    if (index < 0)
      return;

    this._acceptedSubEntities.splice(index, 1)[0]?.cleanupGraphic();
    this._acceptedKeys.splice(index, 1);
  }

  private removeSelectedKey(key: string): void {
    this._selected.delete(key);
    const index = this._selectedKeys.indexOf(key);
    if (index >= 0)
      this._selectedKeys.splice(index, 1);
  }

  public async clearSelection(): Promise<void> {
    // 先递增代数：即使当前为空，也要让进行中的异步 add 在 resolve 后放弃回插。
    this._selectionGeneration += 1;

    if (this._acceptedSubEntities.length === 0 && this._selected.size === 0)
      return;

    for (const entry of this._acceptedSubEntities)
      entry.cleanupGraphic();
    this._acceptedSubEntities.length = 0;
    this._acceptedKeys.length = 0;
    this._selected.clear();
    this._selectedKeys.length = 0;
    this.emitSelection();
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  private emitSelection(): void {
    const selection: CanvasSelection[] = [];
    for (const key of this._selectedKeys) {
      const entry = this._selected.get(key);
      if (entry)
        selection.push(entry);
    }
    this._options.onSelectionChanged(selection);
  }

  protected async resolveSelection(owner: string, subEntity: SubEntityProps): Promise<CanvasSelection | undefined> {
    const fallback = i18next.t('partStudio.subEntitySelect.resolveFailed');
    try {
      if (subEntity.type === SubEntityType.Face) {
        const result = await LubanFeatureRpcInterface.getClient().resolveFaceRef(
          this._options.connectionKey,
          owner,
          subEntity.id,
        );
        if (!result.ok || !result.ref) {
          this._options.onError(result.error ?? fallback);
          return undefined;
        }
        return {
          kind: 'face',
          id: `face:${owner}:${result.ref.nodeId}:${result.ref.entityId}`,
          ownerBodyKey: owner,
          topologyId: result.ref,
          cacheId: subEntity.id,
          label: i18next.t('partStudio.subEntitySelect.faceLabel'),
        };
      }

      if (subEntity.type === SubEntityType.Edge) {
        const result = await LubanFeatureRpcInterface.getClient().resolveEdgeRef(
          this._options.connectionKey,
          owner,
          subEntity.id,
        );
        if (!result.ok || !result.ref) {
          this._options.onError(result.error ?? fallback);
          return undefined;
        }
        return {
          kind: 'edge',
          id: `edge:${owner}:${result.ref.edge.nodeId}:${result.ref.edge.entityId}`,
          ownerBodyKey: owner,
          topologyId: result.ref.edge,
          cacheId: subEntity.id,
          label: i18next.t('partStudio.subEntitySelect.edgeLabel'),
        };
      }

      return {
        kind: 'vertex',
        id: `vertex:${owner}:${subEntity.id}`,
        ownerBodyKey: owner,
        cacheId: subEntity.id,
        label: i18next.t('partStudio.subEntitySelect.vertexLabel'),
      };
    } catch (err) {
      this._options.onError(err instanceof Error ? err.message : fallback);
      return undefined;
    }
  }

  /** 对话框/草图期间暂停：可选清空选择，释放 SolidModeling 命令。 */
  public async pause(clearSelection: boolean): Promise<void> {
    this._paused = true;
    this.clearCurrentSubEntity();
    if (clearSelection)
      await this.clearSelection();
    this.changeLocateState(false, false);
    await this.releaseCommand();
  }

  public resume(): void {
    if (!this._paused)
      return;
    this._paused = false;
    this.initLocateElements(true, false);
    this.setupAndPromptForNextAction();
  }

  /** 拓扑读面/子实体删除等命令需要独占命令槽：暂停 hover 但保留选择高亮。 */
  public async suspendForCommand(): Promise<void> {
    if (this._paused || this._commandSuspended)
      return;
    this._commandSuspended = true;
    this.clearCurrentSubEntity();
    this.changeLocateState(false, false);
    await this.releaseCommand();
  }

  public resumeAfterCommand(): void {
    if (!this._commandSuspended)
      return;
    this._commandSuspended = false;
    if (this._paused)
      return;
    this.initLocateElements(true, false);
    this.setupAndPromptForNextAction();
  }

  private async releaseCommand(): Promise<void> {
    // 复用基座 Task 2 的幂等收口：清几何缓存 → 复位 _startedCmd/_checkedIds → 结束命令。
    await this.finishCommandIfStarted();
  }

  public override async onCleanup(): Promise<void> {
    await this.clearSelection();
    await super.onCleanup();
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new OnshapeSelectTool(this._options);
    if (!(await tool.run()))
      await this.exitTool();
  }
}
