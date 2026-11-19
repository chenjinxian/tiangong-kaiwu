/**
 * 草图槽（toolId `Sketch.Slot`，ADR-0022 S2 首切片，2026-11-19 live 探针）。
 *
 * live 交互（私有 `ui-evidence/slot-probe-20261119/`、`slot-chain-20261119/`、
 * `slot-variants-20261120/`）：
 * - 入口在「偏移 ▾」第二项「槽」。
 * - 无预选：直接点击一条直线或圆弧 → 槽预览；Enter 或再次点击提交。
 * - 有预选（框选/Ctrl 叠加）：单条直线/圆弧，或相连直线链 → 工具激活即预览。
 * - 默认宽 Ø20（mm 文档）；原中线保留；宽度尺寸可在提交后双击 Ø 标签修改。
 *
 * 范围（S2 单线 + S2b 链 + S2c 圆弧，ADR-0022 §2.3–§2.5）：**单条直线**、
 * **单条开放圆弧**（同心偏移弧 + 半圆帽 + 单 Ø 驱动）与 **开放、无分支、直线
 * 成员的相连链**。链槽外顶点为圆角弧、内顶点为斜接。
 * **整圆中线**：live 2026-11-20 实测为两条同心圆 + **线性**宽度尺寸；当前
 * solver-neutral 无同心圆径向宽度原语 → blocked-design，工具诚实拒收。
 * 闭合环槽、分支链、多条独立曲线联动槽同样暂不支持。
 *
 * 基建复用 SketchOffsetTool：AccuSnap 取点 + 草图平面架 + Dynamics 预览 +
 * applyUpdate 乐观整体覆写 + id 播种/回滚 + 分阶段提示。
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
} from '@itwin/core-frontend';
import { AngleSweep, Arc3d, Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import type { SketchDto } from '@luban-cad/shared';
import i18next from 'i18next';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { pickHitLocal, resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { resolveNearestOffsetSeedId } from './sketch-offset-logic.js';
import {
  DEFAULT_SLOT_WIDTH,
  SLOT_TOL,
  buildArcSlotDraft,
  buildLineChainSlotDraft,
  buildLineSlotDraft,
  lineChainFromSelection,
} from './sketch-slot-logic.js';
import type { SlotBuildError, SlotDraft } from './sketch-slot-logic.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';

const PREVIEW_COLOR = ColorDef.from(0, 120, 215);

export class SketchSlotTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Slot';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-slot';

  private _phase: 'pick' | 'preview' = 'pick';
  private _draft?: SlotDraft;
  /** 预览/提交共用的选中直线 id（单线或相连链；提交时按同一集合重建）。 */
  private _selectedIds?: number[];
  private _plane!: SketchPlaneFrame;
  private _nextId = 1;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this.initLocateElements(false, true);
    this.beginDynamics();
    // live 2026-11-19/20：链槽/圆弧槽由**预选**驱动（先框选/叠加曲线，再打开
    // 「偏移 ▾ → 槽」，预览直接生成）；无预选时进入单击拾取。
    if (!this._tryPreselection())
      this._outputPrompt('pickCurve');
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    this._draft = undefined;
    this._selectedIds = undefined;
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    if (this._hintText)
      publishSketchToolHint(this.toolId, this._hintText, this._cursorView);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (this._phase === 'preview')
      return this._commit();

    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const hit = pickHitLocal(ev, this._plane);
    const seedId = resolveNearestOffsetSeedId(sketch.entities, hit);
    const seed = seedId === undefined ? undefined : sketch.entities.find((e) => e.id === seedId);
    if (!seed) {
      this._notify(i18next.t('partStudio.sketch.toasts.noSolvedCoords'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    if (seed.kind !== 'line' && seed.kind !== 'arc') {
      // 单击路径支持单条直线/单条圆弧；整圆中线（线性宽度原语缺失）与其它
      // 类型诚实拒收。相连直线链经**预选**进入（live 2026-11-19/20）。
      this._notify(i18next.t('partStudio.sketch.slot.toasts.unsupportedKind'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    const built = this._buildDraft(sketch, [seed.id]);
    if (!built.ok) {
      this._notify(i18next.t(this._buildErrorToastKey(built.error)), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    this._draft = built.draft;
    this._selectedIds = built.selectedIds;
    this._phase = 'preview';
    this._outputPrompt('confirm');
    return EventHandled.Yes;
  }

  public override async onKeyTransition(wentDown: boolean, ev: KeyboardEvent): Promise<EventHandled> {
    if (!wentDown)
      return EventHandled.No;
    if (ev.key === 'Enter' && this._phase === 'preview') {
      ev.preventDefault();
      return this._commit();
    }
    return EventHandled.No;
  }

  /** 提交：一次 updateSketch（既有实体/约束原样在前，槽草稿追加）；失败零变更。 */
  private async _commit(): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || !this._draft || !this._selectedIds) {
      this._notify(i18next.t('partStudio.sketch.create.toasts.systemNotReady'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const built = this._buildDraft(sketch, this._selectedIds);
    if (!built.ok) {
      this._notify(i18next.t(this._buildErrorToastKey(built.error)), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const result = await sketchSystem.applyUpdate(
      [...sketch.entities, ...built.draft.entities],
      [...sketch.constraints, ...built.draft.constraints],
    );
    if (!result.ok) {
      this._notify(result.error ?? i18next.t('partStudio.sketch.create.toasts.updateFailed'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** 预览：槽草稿线/弧直接绘制（点不画；与 live 预览只显轮廓一致）。 */
  public override onDynamicFrame(_ev: BeButtonEvent, context: DynamicsContext): void {
    if (this._phase !== 'preview' || !this._draft) return;
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    const points = new Map<number, { u: number; v: number }>();
    for (const e of this._draft.entities) {
      if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) points.set(e.id, { u: e.x, v: e.y });
    }
    const resolve = (ref: number | { x: number; y: number }): { u: number; v: number } | undefined =>
      typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
    for (const e of this._draft.entities) {
      if (e.kind === 'line') {
        const p1 = resolve(e.p1);
        const p2 = resolve(e.p2);
        if (!p1 || !p2) continue;
        builder.addLineString([this._plane.toWorld(p1), this._plane.toWorld(p2)]);
      } else if (e.kind === 'arc') {
        const c = resolve(e.center);
        if (!c || e.radius === undefined || e.startAngle === undefined || e.sweepAngle === undefined) continue;
        const arc = Arc3d.createXY(
          Point3d.create(c.u, c.v, 0),
          e.radius,
          AngleSweep.createStartSweepRadians(e.startAngle, e.sweepAngle),
        );
        arc.tryTransformInPlace(this._plane.localToWorld);
        builder.addArc(arc, false, false);
      }
    }
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._phase === 'preview') {
      this._phase = 'pick';
      this._draft = undefined;
      this._selectedIds = undefined;
      this._outputPrompt('pickCurve');
    }
    // 右键=画布菜单（首项「退出 <工具>」）；Esc 退出由基类处理。
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SketchSlotTool();
    if (!(await tool.run())) return this.exitTool();
  }

  /**
   * 从当前画布选择读取预选曲线（live 2026-11-19/20：链槽/圆弧槽由预选驱动）。
   * 只认活动草图的曲线选择；无预选返回 false（进入单击拾取）。
   */
  private _tryPreselection(): boolean {
    const sketch = getSketchSystem()?.activeSketch;
    if (!sketch) return false;
    const selection = usePartStudioStore.getState().canvas.selection;
    const ids = [...new Set(selection
      .filter((entry) =>
        entry.kind === 'sketchEntity'
        && entry.sketchId === sketch.id
        && (entry.sketchPart ?? 'curve') === 'curve'
        && entry.entityId !== undefined)
      .map((entry) => entry.entityId!))];
    if (ids.length === 0) return false;
    const built = this._buildDraft(sketch, ids);
    if (!built.ok) {
      this._notify(i18next.t(this._buildErrorToastKey(built.error)), OutputMessagePriority.Info);
      return false;
    }
    this._draft = built.draft;
    this._selectedIds = built.selectedIds;
    this._phase = 'preview';
    this._outputPrompt('confirm');
    return true;
  }

  /** 单线/单弧/相连直线链共用构建入口（预览与提交同源；id 从当前草图最大值重播）。 */
  private _buildDraft(
    sketch: SketchDto,
    selectedIds: readonly number[],
  ): { ok: true; draft: SlotDraft; selectedIds: number[] } | { ok: false; error: SlotBuildError } {
    this._seedNextId();
    const ids = [...new Set(selectedIds)];
    if (ids.length === 1) {
      const seed = sketch.entities.find((e) => e.id === ids[0]);
      if (!seed) return { ok: false, error: 'unsupportedKind' };
      if (seed.kind === 'line') {
        const built = buildLineSlotDraft({
          line: seed, entities: sketch.entities, width: DEFAULT_SLOT_WIDTH, startId: this._nextId,
        });
        return built.ok ? { ok: true, draft: built.draft, selectedIds: ids } : built;
      }
      if (seed.kind === 'arc') {
        const built = buildArcSlotDraft({
          arc: seed, entities: sketch.entities, width: DEFAULT_SLOT_WIDTH, startId: this._nextId,
        });
        return built.ok ? { ok: true, draft: built.draft, selectedIds: ids } : built;
      }
      return { ok: false, error: 'unsupportedKind' }; // 整圆槽 blocked-design
    }
    const members = ids.map((id) => sketch.entities.find((e) => e.id === id));
    if (members.some((e) => e === undefined || e.kind !== 'line'))
      return { ok: false, error: 'unsupportedKind' }; // 链只支持直线成员（live 链证据）
    const chain = lineChainFromSelection(sketch.entities, ids);
    if (!chain) return { ok: false, error: 'unsupportedKind' };
    const built = buildLineChainSlotDraft({
      chain, entities: sketch.entities, width: DEFAULT_SLOT_WIDTH, startId: this._nextId,
    });
    return built.ok ? { ok: true, draft: built.draft, selectedIds: ids } : built;
  }

  private _buildErrorToastKey(error: SlotBuildError): string {
    switch (error) {
      case 'unsupportedChain':
        return 'partStudio.sketch.slot.toasts.unsupportedChain';
      case 'unsupportedKind':
        return 'partStudio.sketch.slot.toasts.unsupportedKind';
      case 'zeroWidth':
        return 'partStudio.sketch.slot.toasts.zeroWidth';
      case 'unsolvedLine':
        return 'partStudio.sketch.slot.toasts.unsolvedLine';
      case 'unsolvedCurve':
        return 'partStudio.sketch.slot.toasts.unsolvedCurve';
      case 'degenerateRadius':
        return 'partStudio.sketch.slot.toasts.degenerateRadius';
    }
  }

  private _seedNextId(): void {
    const sketch = getSketchSystem()?.activeSketch;
    let max = 0;
    if (sketch) {
      for (const e of sketch.entities) max = Math.max(max, e.id);
      for (const c of sketch.constraints) max = Math.max(max, c.id);
    }
    this._nextId = Math.max(this._nextId, max + 1);
  }

  private _outputPrompt(stage: 'pickCurve' | 'confirm'): void {
    const text = i18next.t(`partStudio.sketch.slot.prompts.${stage}`);
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView)
      publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

let sketchSlotToolsRegistered = false;

export function registerSketchSlotTools(): void {
  if (sketchSlotToolsRegistered) return;
  sketchSlotToolsRegistered = true;
  IModelApp.tools.register(SketchSlotTool);
}

// SLOT_TOL 供工具/测试共享（保留导入以钉住容差常量来源）。
export { SLOT_TOL };
