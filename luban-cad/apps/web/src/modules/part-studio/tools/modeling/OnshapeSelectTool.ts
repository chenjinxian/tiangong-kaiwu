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
import { BeButton, CoordSource, EventHandled, IModelApp } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { SubEntityType } from '@itwin/editor-common';
import type {
  ElementGeometryCacheFilter,
  SubEntityLocationProps,
  SubEntityProps,
} from '@itwin/editor-common';
import { LocateSubEntityTool, solidModelingIpc } from '@itwin/editor-frontend';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import i18next from 'i18next';
import type { CanvasSelection } from '../../types.js';

export interface OnshapeSelectOptions {
  connectionKey: string;
  onSelectionChanged: (selection: readonly CanvasSelection[]) => void;
  onError: (message: string) => void;
  /**
   * 工具被框架重启（undo/redo 后 BriefcaseConnection 自动 restartPrimitiveTool）
   * 时用于恢复选择的快照源。`onRestartTool` 重建实例后按此重放高亮；
   * 未提供则不恢复（store 选择仍由宿主保留/清理）。
   */
  getSelectionSnapshot?: () => readonly CanvasSelection[];
}

/**
 * 构造函数入参：直接构造传 options；ToolAdmin 默认工具路径传 `[options]`。
 * `ToolAdmin.startDefaultTool()` 调 `IModelApp.tools.create(toolId, defaultToolArgs)`
 * ——只展开一个实参，故 `defaultToolArgs = [options]` 会得到 `new Tool([options])`。
 * 这里两种形态都接受并归一化，避免 `_options.connectionKey`/回调变成 undefined。
 */
export type OnshapeSelectToolArgs = OnshapeSelectOptions | readonly [OnshapeSelectOptions];

function isOptionsTuple(input: OnshapeSelectToolArgs): input is readonly [OnshapeSelectOptions] {
  return Array.isArray(input);
}

const VERTEX_PICK_PX = 10;
const EDGE_PICK_PX = 6;
const FACE_PICK_PX = 12;

/**
 * undo/redo 的 restartPrimitiveTool 重建实例时置位：旧实例 onCleanup 只释放
 * 高亮图形、不清宿主选择，新实例随后按快照恢复。Escape/换工具路径保持 false，
 * onCleanup 正常清空选择（spec §6.7）。
 */
let preserveSelectionOnCleanup = false;

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
  /** protected：单测子类断言暂停/命令挂起状态。 */
  protected _paused = false;
  protected _commandSuspended = false;

  public constructor(input: OnshapeSelectToolArgs) {
    super();
    this._options = isOptionsTuple(input) ? input[0] : input;
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

  /**
   * 原生 locateSubEntities 的**面**定位在 Tutorial 2 实体（旋转+圆角）上会卡死
   * MS（原生调用同步阻塞、内核无返回；内置 OffsetFacesTool 同路径复现）。
   * 面命中改走 getClosestPoint（见 pickFaceUnderCursor），故这里 face=0。
   */
  protected override getMaximumSubEntityHits(type: SubEntityType): number {
    return type === SubEntityType.Face ? 0 : 3;
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

    // 边/点仍走基座原生 locate（Face=0）；面用 getClosestPoint 客户端兜底
    //（原生面定位在该体上卡死 MS，见 getMaximumSubEntityHits 注）。
    const nativeHits = this.resolveNativeHitPoints(await super.doPickSubEntities(id, ev), ev);
    const edgeOrVertex = this.applyHoverPriority(nativeHits, ev);
    if (edgeOrVertex)
      return edgeOrVertex;

    const face = await this.pickFaceUnderCursor(id, ev);
    return face ? [face] : undefined;
  }

  /**
   * 剔除正常着色模式下被前表面遮挡的边/点命中（原生 locate 会沿视线返回后方
   * 子实体，且其屏幕距离为 0，纯 2D 阈值无法区分；细节见函数内注）。
   */
  private resolveNativeHitPoints(
    hits: SubEntityLocationProps[] | undefined,
    ev: BeButtonEvent,
  ): SubEntityLocationProps[] | undefined {
    if (!hits?.length)
      return hits;

    const vp = ev.viewport;
    const front = IModelApp.accuSnap?.currHit?.hitPoint;
    const frontZ = vp && front ? vp.worldToView(front).z : undefined;
    if (!vp || frontZ === undefined || vp.viewFlags.hiddenEdgesVisible())
      return hits;

    // 正常着色模式下原生 locate 仍会返回视线后方的边/点：等轴测中盒体对角线
    // 与视线平行，顶面中心的正后方恰是背棱（原生 hit.point 是背棱真实点，
    // 屏幕距离 0，单靠 2D 阈值无法区分）。用视图深度剔除被前表面遮挡的命中；
    // 隐藏边可见模式保留穿面拾取。
    // 视图 z 是固定深度盒（±32767），用视线距离的 1e-4 作为容差：可见边
    // 与命中面的深度差在舍入噪声量级，背面边/点仍相差数十单位。
    const eyeDistance = vp.view.getOrigin().distance(vp.view.getCenter());
    const depthTolerance = Math.max(eyeDistance * 1e-4, 1e-3);
    return hits.filter((hit) => {
      if (hit.subEntity.type === SubEntityType.Face || !hit.point)
        return true;
      return vp.worldToView(Point3d.fromJSON(hit.point)).z >= frontZ - depthTolerance;
    });
  }

  /**
   * 面命中兜底：以 AccuSnap 的元素命中点为测试点，逐面 getClosestPoint，
   * 取屏幕距离最近（同距取三维最近）的面。Tutorial 2 为 27 面，实测量级
   * 约 50ms/次（含边/点原生调用），满足 hover 帧内更新。
   */
  protected async pickFaceUnderCursor(id: string, ev: BeButtonEvent): Promise<SubEntityLocationProps | undefined> {
    const vp = ev.viewport;
    const hit = IModelApp.accuSnap?.currHit;
    if (undefined === vp || !hit?.isElementHit || hit.sourceId !== id)
      return undefined;

    try {
      const faces = await solidModelingIpc.getBodySubEntities(id, SubEntityType.Face, false);
      if (!faces?.length)
        return undefined;

      const testPoint = hit.hitPoint;
      let best: { location: SubEntityLocationProps; screen: number; distance: number } | undefined;

      for (const face of faces) {
        const location = await solidModelingIpc.getClosestPoint(id, face, testPoint);
        if (undefined === location)
          continue;

        const world = Point3d.fromJSON(location.point);
        const screen = vp.worldToView(world).distanceXY(ev.viewPoint);
        if (screen > FACE_PICK_PX)
          continue;

        const distance = world.distance(testPoint);
        if (undefined === best || screen < best.screen - 1 || (Math.abs(screen - best.screen) <= 1 && distance < best.distance))
          best = { location, screen, distance };
      }

      return best?.location;
    } catch {
      // 几何缓存/命令拆卸竞态：本次 hover 无面命中，下一次鼠标移动重试。
      // 不得把拒绝抛给基座 updateCurrentSubEntity（其 pending 标志无 finally）。
      return undefined;
    }
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

  /**
   * 暂停/命令挂起期间的点击必须在此吞掉。LocateSubEntityTool.gatherInput 依赖
   * `wantAdditionalSubEntities` 才返回 EventHandled.No；暂停时该 getter 为 false，
   * 会落到 ElementSetTool.gatherInput → processDataButton → processAgenda →
   * onProcessComplete → onReinitialize → onRestartTool，在对话框仍打开时装入一个
   * 未暂停的新工具。直接短路为 No（不定位、不处理 agenda、不重启）。
   */
  protected override async gatherInput(ev: BeButtonEvent): Promise<EventHandled | undefined> {
    if (this._paused || this._commandSuspended)
      return EventHandled.No;

    return super.gatherInput(ev);
  }

  /**
   * Onshape 对拍（2026-11-12）：右键拖拽 = 旋转（Ctrl+右键 = 平移），必须交给
   * `OnshapeIdleTool`。返回 No 让 ToolAdmin 把 start-drag 继续下发到 idle；
   * 右键单击（无位移）不触发 start-drag，仍由 onResetButtonUp 交宿主弹菜单。
   */
  public override async onMouseStartDrag(ev: BeButtonEvent): Promise<EventHandled> {
    if (ev.button === BeButton.Reset)
      return EventHandled.No;
    return super.onMouseStartDrag(ev);
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

    // resolve 期间被清空（generation 变化）或被 removeSubEntity 精确移除（key 已
    // 不在 accepted 集合）：高亮已由 clearSelection/removeSubEntity 清理，绝不回插
    // 选择、不发回调；防御性再按 key 撤一次残留。
    if (generation !== this._selectionGeneration || !this._acceptedKeys.includes(key)) {
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
    // 即使工具内没有子实体也要 emit：空白点击/换工具必须清空宿主的整零件
    // 选择（树 + SelectionSet）；早退会让 part 选择永远无法经空白点击清除。
    this._selectionGeneration += 1;
    this.releaseSelectionGraphics();
    this.emitSelection();
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  /** 只释放高亮（不通知宿主/不清 store）：树选中 part 时清掉子实体高亮。 */
  public clearSelectionGraphics(): void {
    this._selectionGeneration += 1;
    this.releaseSelectionGraphics();
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  /** 释放高亮图形与工具内选择映射，但不通知宿主（restart 时 store 选择保留）。 */
  private releaseSelectionGraphics(): void {
    this._selectionGeneration += 1;
    for (const entry of this._acceptedSubEntities)
      entry.cleanupGraphic();
    this._acceptedSubEntities.length = 0;
    this._acceptedKeys.length = 0;
    this._selected.clear();
    this._selectedKeys.length = 0;
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

  /** 等待正在进行中的 hover locate 落定，避免在 native locate 未完成时清缓存/结束命令。 */
  private async waitForHoverSettled(timeoutMs = 1_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this._subEntityGraphicPending && Date.now() < deadline)
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }

  /** 对话框/草图期间暂停：可选清空选择，释放 SolidModeling 命令。 */
  public async pause(clearSelection: boolean): Promise<void> {
    this._paused = true;
    this.changeLocateState(false, false);
    // 先等在途 hover 落定再清 current，避免它在清理后又写回一个残影。
    await this.waitForHoverSettled();
    this.clearCurrentSubEntity();
    if (clearSelection)
      await this.clearSelection();
    await this.releaseCommand();
  }

  public resume(): void {
    if (!this._paused)
      return;
    this._paused = false;
    // 命令仍挂起时恢复不能重开 locate（resumeAfterCommand 才真正恢复）。
    this.initLocateElements(!this._commandSuspended, false);
    this.setupAndPromptForNextAction();
  }

  /** 拓扑读面/子实体删除等命令需要独占命令槽：暂停 hover 但保留选择高亮。 */
  public async suspendForCommand(): Promise<void> {
    if (this._paused || this._commandSuspended)
      return;
    this._commandSuspended = true;
    this.changeLocateState(false, false);
    await this.waitForHoverSettled();
    this.clearCurrentSubEntity();
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
    // 工具被替换/重启时可能仍有 hover locate RPC 在途；先停 locate 并等待落定，
    // 否则基座清缓存/结束命令会与 native locate 并发并卡死 MS（真栈实证）。
    this._paused = true;
    this.clearCurrentSubEntity();
    this.changeLocateState(false, false);
    await this.waitForHoverSettled();
    if (preserveSelectionOnCleanup || (this._acceptedSubEntities.length === 0 && this._selected.size === 0)) {
      // undo/redo 重建只释放图形，新实例按快照恢复；工具内无子实体时（part
      // 选择）也不 emit——Delete/Move 等元素集工具 install 时仍需要 SelectionSet。
      this.releaseSelectionGraphics();
    } else {
      // 有子实体选择且换工具/Escape：清空宿主选择（spec §6.7）。
      await this.clearSelection();
    }
    await super.onCleanup();
  }

  /**
   * 按 store 快照恢复子实体选择（undo/redo 自动 restart 后调用）。
   * 只恢复 face/edge/vertex；part 选择归 SelectionSet/树，不在此重建。
   * 几何缓存随新命令重建；单条失败跳过，不清空其余选择。
   */
  public async restoreSelection(selection: readonly CanvasSelection[]): Promise<void> {
    if (this._paused || selection.length === 0)
      return;

    const owners = new Set<string>();
    for (const entry of selection) {
      if (entry.kind !== 'part' && entry.ownerBodyKey && entry.cacheId !== undefined)
        owners.add(entry.ownerBodyKey);
    }
    if (owners.size === 0)
      return;

    const generation = this._selectionGeneration;
    try {
      for (const owner of owners)
        await this.createElementGeometryCache(owner);

      for (const entry of selection) {
        if (generation !== this._selectionGeneration)
          return;
        if (entry.kind === 'part' || !entry.ownerBodyKey || entry.cacheId === undefined)
          continue;

        const type = entry.kind === 'face' ? SubEntityType.Face
          : entry.kind === 'edge' ? SubEntityType.Edge : SubEntityType.Vertex;
        const props: SubEntityProps = { type, id: entry.cacheId };
        const data = await this.createSubEntityData(entry.ownerBodyKey, {
          subEntity: props,
          point: new Point3d().toJSON(),
        } as SubEntityLocationProps);
        // await 期间清空/新拾取：放弃本条目，避免回插无 store 对应的残留高亮。
        if (generation !== this._selectionGeneration) {
          data.cleanupGraphic();
          return;
        }
        if (!data.hasGraphic) {
          data.cleanupGraphic();
          continue;
        }

        const key = selectionKey(entry.ownerBodyKey, props);
        this._acceptedSubEntities.push(data);
        this._acceptedKeys.push(key);
        if (!this._selected.has(key))
          this._selectedKeys.push(key);
        this._selected.set(key, entry);
      }

      if (this._acceptedSubEntities.length > 0)
        IModelApp.viewManager.invalidateDecorationsAllViews();
    } catch {
      // 恢复失败不回滚 store：保持宿主选择事实，下一次拾取/清空照常收口。
    }
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new OnshapeSelectTool(this._options);
    preserveSelectionOnCleanup = true;
    try {
      if (!(await tool.run())) {
        await this.exitTool();
        return;
      }
    } finally {
      preserveSelectionOnCleanup = false;
    }
    await tool.restoreSelection(this._options.getSelectionSnapshot?.() ?? []);
  }
}
