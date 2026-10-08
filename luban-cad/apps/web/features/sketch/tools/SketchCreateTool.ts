/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 草图绘制工具链（M3-b T4）：线 / 矩形 / 圆。
 *
 * - 取点：`IModelApp.accuSnap.currHit` 吸附点优先，回落 `ev.point`；一律投影 z=0
 *   （草图面固定 XY，E-2 裁决）。
 * - 橡皮筋：`wantDynamics=false` + Decorator（FenceDecorator 先例，
 *   src/core/tools/SelectionTools.ts:209-263）——onMouseMotion 更新预览点 +
 *   `vp.invalidateDecorations()` 触发重绘，不重建场景。
 * - 提交：形状完成 → 草稿实体/约束追加到 activeSketch → `applyUpdate` 乐观提交
 *   （整体覆写语义）；ok:false → 回滚草稿（id 计数器复原）+ error toast，工具保持
 *   存活可立即重画；ok:true → exitTool。
 * - 实体 id：maxId+1（实体与约束共用一支递增计数器，全局唯一；含 activeSketch
 *   现有全部 id）；后端锚定首点实体，实体数组内首建点在前。
 * - 矩形拓扑：SketchFlow fixture 同构——每线独立 2 端点（8 点 4 线）+ 4 个
 *   coincident 角点焊接约束。
 * - 运行依赖（sketchSystem/onToast）经 `setOptions` 注入（SelectSubEntityTool
 *   同构）；`runSketchCreateTool(kind, options)` 为面板启动入口。
 */

import {
  BeButtonEvent,
  DecorateContext,
  Decorator,
  EventHandled,
  GraphicType,
  IModelApp,
  PrimitiveTool,
} from '@itwin/core-frontend';
import { Arc3d, Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';

export type SketchCreateKind = 'line' | 'rectangle' | 'circle';
export type SketchCreateToast = (message: string, type: 'success' | 'error' | 'info') => void;

export interface SketchCreateToolOptions {
  /** Task 3 草图数据 hook（activeSketch 读面 + applyUpdate 提交管道） */
  sketchSystem: UseSketchSystem;
  /** 面板 toast 通道（FeaturePanel 同款签名） */
  onToast?: SketchCreateToast;
}

interface SketchShapeDraft {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
}

/** 对角两点 → 4 角点（A=c1、C=c2，z=0）；预览与实体构造共用 */
function rectangleCorners(c1: Point3d, c2: Point3d): [Point3d, Point3d, Point3d, Point3d] {
  return [
    Point3d.create(c1.x, c1.y, 0),
    Point3d.create(c2.x, c1.y, 0),
    Point3d.create(c2.x, c2.y, 0),
    Point3d.create(c1.x, c2.y, 0),
  ];
}

/**
 * 橡皮筋预览 Decorator：持有「锚点 + 当前点」，decorate 时按形状绘制。
 * 状态由工具推送（setPreview/clearPreview），自身不监听事件。
 */
export class SketchPreviewDecorator implements Decorator {
  private _kind?: SketchCreateKind;
  private _anchor?: Point3d;
  private _current?: Point3d;

  public setPreview(kind: SketchCreateKind, anchor: Point3d, current: Point3d): void {
    this._kind = kind;
    this._anchor = anchor.clone();
    this._current = current.clone();
  }

  public clearPreview(): void {
    this._kind = undefined;
    this._anchor = undefined;
    this._current = undefined;
  }

  public decorate(context: DecorateContext): void {
    if (!this._kind || !this._anchor || !this._current) return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const color = ColorDef.from(0, 120, 215);
    builder.setSymbology(color, color, 2, LinePixels.Solid);

    switch (this._kind) {
      case 'line':
        builder.addLineString([this._anchor, this._current]);
        break;
      case 'rectangle': {
        const [a, b, c, d] = rectangleCorners(this._anchor, this._current);
        builder.addLineString([a, b, c, d, a]);
        break;
      }
      case 'circle': {
        const radius = this._anchor.distance(this._current);
        if (radius > 0) {
          builder.addArc(Arc3d.createXY(this._anchor, radius), false, false);
        }
        break;
      }
    }

    const graphic = builder.finish();
    if (graphic) {
      context.addDecoration(GraphicType.WorldDecoration, graphic);
    }
  }
}

/**
 * 草图绘制工具抽象基类：两点形状（起点点击 + 终点点击）通用流程。
 * 子类提供形状种类、提示语与实体构造（buildShape；退化返回 undefined）。
 */
export abstract class SketchCreateTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';

  /** 形状种类（预览绘制分派用） */
  protected abstract readonly sketchKind: SketchCreateKind;
  /** 首点提示语 */
  protected abstract readonly firstPrompt: string;
  /** 次点提示语 */
  protected abstract readonly nextPrompt: string;

  private _sketchSystem?: UseSketchSystem;
  private _onToast?: SketchCreateToast;
  private _decorator?: SketchPreviewDecorator;
  /** 已锚定点击点（z=0 投影后）；两点形状长度至多 1（满 2 即构造提交） */
  private _anchorPoints: Point3d[] = [];
  /**
   * 实体/约束 id 分配计数器（maxId+1 语义；单调不减——提交成功不回退，
   * 失败回滚到形状构造前快照；onPostInstall 与每次提交前按 activeSketch 重播种）。
   */
  private _nextId = 1;

  /** 注入运行依赖（runSketchCreateTool / 面板启动路径） */
  public setOptions(options: SketchCreateToolOptions): void {
    this._sketchSystem = options.sketchSystem;
    this._onToast = options.onToast;
  }

  public override requireWriteableTarget(): boolean { return true; }

  // 本版 iTwin.js 中 wantDynamics/wantAccuSnap 为 ElementSetTool 与 editor-frontend
  // CreateElementTool 族成员，PrimitiveTool 链无此槽位：
  // - 橡皮筋不调用 beginDynamics（动力学保持关闭，等效 wantDynamics=false），预览走 Decorator；
  // - AccuSnap 经 initLocateElements(false, true) 开启（editor-frontend CreateElementTool 的
  //   accuSnap.enableSnap(wantAccuSnap) 同效——见下 onPostInstall）。

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._decorator = new SketchPreviewDecorator();
    IModelApp.viewManager.addDecorator(this._decorator);
    // 不 locate 元素（无定位圈）但开启 AccuSnap 吸附——accuSnap.currHit 取点前提；
    // 注意 initLocateElements(false) 缺省会 enableSnap(false) 关掉吸附。
    this.initLocateElements(false, true);
    this._seedNextId();
    IModelApp.notifications.outputPrompt(this.firstPrompt);
  }

  public override async onCleanup(): Promise<void> {
    if (this._decorator) {
      IModelApp.viewManager.dropDecorator(this._decorator);
      this._decorator = undefined;
    }
    this._anchorPoints = [];
    await super.onCleanup();
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const point = this._pickPoint(ev);
    this._anchorPoints.push(point);
    this._decorator?.clearPreview();

    if (this._anchorPoints.length < 2) {
      IModelApp.notifications.outputPrompt(this.nextPrompt);
      return EventHandled.No;
    }

    const points = this._anchorPoints;
    this._anchorPoints = [];
    ev.viewport?.invalidateDecorations(); // 清掉橡皮筋残影

    this._seedNextId();
    const idBase = this._nextId;
    const draft = this.buildShape(points);
    if (!draft) {
      this._toast('形状尺寸为零，请重新绘制', 'info');
      IModelApp.notifications.outputPrompt(this.firstPrompt);
      return EventHandled.No;
    }

    const sketchSystem = this._sketchSystem;
    if (!sketchSystem) {
      this._nextId = idBase;
      this._toast('草图系统未就绪', 'error');
      return EventHandled.No;
    }

    // 乐观提交（整体覆写语义）：既有实体/约束原样在前，草稿追加在后
    const base = sketchSystem.activeSketch;
    const entities = [...(base?.entities ?? []), ...draft.entities];
    const constraints = [...(base?.constraints ?? []), ...draft.constraints];
    const result = await sketchSystem.applyUpdate(entities, constraints);
    if (!result.ok) {
      // 后端拒收零变更（库侧无写入）——本地回滚 = 丢弃草稿 + id 计数器复原；
      // 拒收文本（含 dof/冲突 id）原样透出，工具保持存活可立即重画。
      this._nextId = idBase;
      this._toast(result.error ?? '草图更新失败', 'error');
      IModelApp.notifications.outputPrompt(this.firstPrompt);
      return EventHandled.No;
    }

    await this.exitTool();
    return EventHandled.No;
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    const anchor = this._anchorPoints[0];
    if (!anchor || !ev.viewport) return;
    this._decorator?.setPreview(this.sketchKind, anchor, this._pickPoint(ev));
    ev.viewport.invalidateDecorations();
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._anchorPoints.length > 0) {
      // 取消进行中的形状，工具保持存活（再右键退出）
      this._anchorPoints = [];
      this._decorator?.clearPreview();
      IModelApp.viewManager.invalidateDecorationsAllViews();
      IModelApp.notifications.outputPrompt(this.firstPrompt);
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /**
   * 构造形状草稿实体/约束；退化（零长/零面积/零半径）返回 undefined。
   * id 经 this.nextEntityId() 分配（实体与约束共用计数器）。
   */
  protected abstract buildShape(points: Point3d[]): SketchShapeDraft | undefined;

  /** 分配下一个实体/约束 id（提交成功消耗；失败由基类复原计数器） */
  protected nextEntityId(): number {
    return this._nextId++;
  }

  /** PrimitiveTool 抽象槽位：外部事件（视图切换/undo 失效）要求重启时换新实例重挂 */
  public override async onRestartTool(): Promise<void> {
    const tool = this.createInstance();
    if (this._sketchSystem) {
      tool.setOptions({ sketchSystem: this._sketchSystem, onToast: this._onToast });
    }
    if (!(await tool.run())) return this.exitTool(); // 新实例拒装不得留旧实例
  }

  /** 重启用实例工厂（子类返回自身类型新实例） */
  protected abstract createInstance(): SketchCreateTool;

  /** 取点：AccuSnap 吸附点优先，投影 z=0（草图面固定 XY，E-2 裁决） */
  private _pickPoint(ev: BeButtonEvent): Point3d {
    const hit = IModelApp.accuSnap?.currHit;
    const raw = hit ? hit.hitPoint : ev.point;
    return Point3d.create(raw.x, raw.y, 0);
  }

  /** 按 activeSketch 现有全部实体/约束 id 重播种（单调不减，防 refresh 前冲突） */
  private _seedNextId(): void {
    const sketch = this._sketchSystem?.activeSketch;
    let max = 0;
    if (sketch) {
      for (const e of sketch.entities) max = Math.max(max, e.id);
      for (const c of sketch.constraints) max = Math.max(max, c.id);
    }
    this._nextId = Math.max(this._nextId, max + 1);
  }

  private _toast(message: string, type: 'success' | 'error' | 'info'): void {
    this._onToast?.(message, type);
  }
}

/** 直线：两点 → 2 point + 1 line */
export class SketchLineTool extends SketchCreateTool {
  public static override toolId = 'Sketch.CreateLine';
  public static override iconSpec = 'icon-line';
  protected readonly sketchKind = 'line';
  protected readonly firstPrompt = '点击放置直线起点';
  protected readonly nextPrompt = '点击放置直线终点';

  protected createInstance(): SketchCreateTool { return new SketchLineTool(); }

  protected buildShape(points: Point3d[]): SketchShapeDraft | undefined {
    const [p1, p2] = points;
    if (p1.isAlmostEqual(p2)) return undefined; // 零长度

    const id1 = this.nextEntityId();
    const id2 = this.nextEntityId();
    const idLine = this.nextEntityId();
    return {
      entities: [
        { kind: 'point', id: id1, x: p1.x, y: p1.y },
        { kind: 'point', id: id2, x: p2.x, y: p2.y },
        { kind: 'line', id: idLine, p1: id1, p2: id2 },
      ],
      constraints: [],
    };
  }
}

/**
 * 矩形：对角两点 → 8 point（每线独立端点）+ 4 line + 4 coincident 角点焊接
 * （SketchFlow fixture 同构拓扑：焊接而非共享端点，与求解器契约一致）。
 */
export class SketchRectangleTool extends SketchCreateTool {
  public static override toolId = 'Sketch.CreateRectangle';
  public static override iconSpec = 'icon-rectangle';
  protected readonly sketchKind = 'rectangle';
  protected readonly firstPrompt = '点击放置矩形第一个角点';
  protected readonly nextPrompt = '点击放置矩形对角点';

  protected createInstance(): SketchCreateTool { return new SketchRectangleTool(); }

  protected buildShape(points: Point3d[]): SketchShapeDraft | undefined {
    const [c1, c2] = points;
    const [a, b, c, d] = rectangleCorners(c1, c2);
    if (a.isAlmostEqual(b) || b.isAlmostEqual(c)) return undefined; // 零宽/零高

    // 角点序列（每线一对独立端点）：L1=AB L2=BC L3=CD L4=DA
    const cornerPts = [a, b, b, c, c, d, d, a];
    const pointIds = cornerPts.map(() => this.nextEntityId());
    const lineIds = [0, 1, 2, 3].map(() => this.nextEntityId());

    const entities: SketchEntityDto[] = [
      ...cornerPts.map((pt, i): SketchEntityDto => ({ kind: 'point', id: pointIds[i], x: pt.x, y: pt.y })),
      { kind: 'line', id: lineIds[0], p1: pointIds[0], p2: pointIds[1] },
      { kind: 'line', id: lineIds[1], p1: pointIds[2], p2: pointIds[3] },
      { kind: 'line', id: lineIds[2], p1: pointIds[4], p2: pointIds[5] },
      { kind: 'line', id: lineIds[3], p1: pointIds[6], p2: pointIds[7] },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'coincident', id: this.nextEntityId(), refs: [pointIds[1], pointIds[2]] }, // B 角
      { kind: 'coincident', id: this.nextEntityId(), refs: [pointIds[3], pointIds[4]] }, // C 角
      { kind: 'coincident', id: this.nextEntityId(), refs: [pointIds[5], pointIds[6]] }, // D 角
      { kind: 'coincident', id: this.nextEntityId(), refs: [pointIds[7], pointIds[0]] }, // A 角
    ];
    return { entities, constraints };
  }
}

/** 圆：圆心 + 半径点 → point + circle（radius=拖距初值） */
export class SketchCircleTool extends SketchCreateTool {
  public static override toolId = 'Sketch.CreateCircle';
  public static override iconSpec = 'icon-circle';
  protected readonly sketchKind = 'circle';
  protected readonly firstPrompt = '点击放置圆心';
  protected readonly nextPrompt = '点击确定半径';

  protected createInstance(): SketchCreateTool { return new SketchCircleTool(); }

  protected buildShape(points: Point3d[]): SketchShapeDraft | undefined {
    const [center, edge] = points;
    if (center.isAlmostEqual(edge)) return undefined; // 零半径

    const radius = center.distance(edge);
    const idCenter = this.nextEntityId();
    const idCircle = this.nextEntityId();
    return {
      entities: [
        { kind: 'point', id: idCenter, x: center.x, y: center.y },
        { kind: 'circle', id: idCircle, center: idCenter, radius },
      ],
      constraints: [],
    };
  }
}

/**
 * 面板启动入口（SelectSubEntityTool 的 run 助手同构）：
 * 构造工具 → 注入依赖 → run。AI/键盘路径经注册表 toolId 启动时无选项注入，
 * 提交将以「草图系统未就绪」toast 失败——M3-b 内绘制入口以面板为准。
 */
export async function runSketchCreateTool(kind: SketchCreateKind, options: SketchCreateToolOptions): Promise<void> {
  const tool =
    kind === 'line' ? new SketchLineTool()
      : kind === 'rectangle' ? new SketchRectangleTool()
        : new SketchCircleTool();
  tool.setOptions(options);
  await tool.run();
}
