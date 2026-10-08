/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 草图约束创建工具（M3-b T5）：槽位驱动拾取 + 乐观提交。
 *
 * - 拾取：locate 命中草图元素（草图是单一 GeometricElement3d，整元素命中），
 *   由 hitPoint（投影 z=0）按几何就近解析**实体**——v1 简化裁决：
 *   point=命中点到点坐标距；line=命中点到线段 (p1,p2) 距；circle=到圆周距
 *   （| |P-C| - r |）。并列规则：距离相等时点实体优先（kind 优先序
 *   point < circle < line，同 kind 按数组序）——线端点处「点距=线段端点距」
 *   精确并列，故端点附近的 POINT 实体获胜（distance 尺寸因此拾端点即拾点）。
 *   无解算坐标的实体（x/y/radius 缺省）不参与分辨。
 * - 槽位规则与后端 SolverTypes.ts 冻结契约逐字对应：
 *   coincident=2 point；horizontal/vertical=1 line 或 2 point；
 *   parallel/perpendicular=2 line；equal=2 line 或 2 circle（不得混搭）。
 *   槽位错误 → info toast + 保持拾取（不消耗本次点击）。
 * - 满槽 → 构造约束（id=maxId+1，实体与约束全局最大——Task 4 同式）→
 *   applyUpdate 追加提交（整体覆写语义）；ok:false → 拒收文本 error toast +
 *   拾取清空、工具保持存活可立即重选（草稿即参数数组，仅提交时追加）。
 * - 右键：有拾取 → 清空；无拾取 → 退出。
 * - 运行依赖经 setOptions 注入（Task 4 同构）；AI/注册表路径无选项注入时
 *   提交以「草图系统未就绪」toast 失败。
 */

import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
  PrimitiveTool,
} from '@itwin/core-frontend';
import { Geometry, Point3d } from '@itwin/core-geometry';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';

/** v1 约束种类（SolverTypes 冻结联合中无值的 6 种；tangent/concentric 等不存在） */
export type SketchConstraintKind =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'equal';

type EntityKind = SketchEntityDto['kind'];

export type SketchToolToast = (message: string, type: 'success' | 'error' | 'info') => void;

export interface SketchAddConstraintToolOptions {
  /** Task 3 草图数据 hook（activeSketch 读面 + applyUpdate 提交管道） */
  sketchSystem: UseSketchSystem;
  /** 面板 toast 通道（FeaturePanel 同款签名） */
  onToast?: SketchToolToast;
}

const CONSTRAINT_LABELS: Record<SketchConstraintKind, string> = {
  coincident: '重合',
  horizontal: '水平',
  // M3-b T8：vertical 用「竖直」——与 perpendicular「垂直」消歧（CAD 中文惯例）
  vertical: '竖直',
  parallel: '平行',
  perpendicular: '垂直',
  equal: '等长/等半径',
};

const KIND_NAMES: Record<EntityKind, string> = { point: '点', line: '线', circle: '圆' };

interface PickVerdict {
  ok: boolean;
  complete: boolean;
  message?: string;
}

/**
 * 槽位接收判定（SolverTypes 冻结契约的逐字转写；picked=已拾取实体种类序）。
 * complete=true 表示拾取序列已满槽，可构造约束提交。
 */
function acceptPick(kind: SketchConstraintKind, picked: EntityKind[], next: EntityKind): PickVerdict {
  const reject = (message: string): PickVerdict => ({ ok: false, complete: false, message });
  switch (kind) {
    case 'coincident':
      if (next !== 'point') return reject(`重合约束需要拾取点（拾取到${KIND_NAMES[next]}）`);
      return picked.length === 0
        ? { ok: true, complete: false }
        : { ok: true, complete: true };
    case 'horizontal':
    case 'vertical':
      if (picked.length === 0) {
        if (next === 'line') return { ok: true, complete: true }; // 单线槽
        if (next === 'point') return { ok: true, complete: false }; // 点对式起槽
        return reject(`${CONSTRAINT_LABELS[kind]}约束需要线或点（拾取到${KIND_NAMES[next]}）`);
      }
      // 已进入点对式：第二槽只收 point（SolverTypes：恰 2 个 point）
      if (next !== 'point') return reject(`${CONSTRAINT_LABELS[kind]}约束（点对式）第二个槽位需要点（拾取到${KIND_NAMES[next]}）`);
      return { ok: true, complete: true };
    case 'parallel':
    case 'perpendicular': {
      const label = CONSTRAINT_LABELS[kind];
      if (next !== 'line') return reject(`${label}约束需要拾取线（拾取到${KIND_NAMES[next]}）`);
      return picked.length === 0
        ? { ok: true, complete: false }
        : { ok: true, complete: true };
    }
    case 'equal': {
      if (picked.length === 0) {
        if (next === 'line' || next === 'circle') return { ok: true, complete: false };
        return reject('等长/等半径约束需要线或圆（拾取到点）');
      }
      // SolverTypes：2 line 或 2 circle，不得混搭——首槽种类锁定后续槽位
      if (next !== picked[0]) return reject('等长/等半径约束不得混搭（线对线或圆对圆）');
      return { ok: true, complete: true };
    }
  }
}

/** 首槽提示语（满槽语义随槽形变化，提示在每次点击后刷新） */
function pickPrompt(kind: SketchConstraintKind, picked: EntityKind[]): string {
  const label = CONSTRAINT_LABELS[kind];
  switch (kind) {
    case 'coincident':
      return picked.length === 0 ? `${label}约束：拾取第一个点` : `${label}约束：拾取第二个点`;
    case 'horizontal':
    case 'vertical':
      if (picked.length === 0) return `${label}约束：拾取一条线或一个点`;
      return `${label}约束（点对式）：拾取第二个点`;
    case 'parallel':
    case 'perpendicular':
      return picked.length === 0 ? `${label}约束：拾取第一条线` : `${label}约束：拾取第二条线`;
    case 'equal':
      if (picked.length === 0) return `${label}约束：拾取第一条线或圆`;
      return `${label}约束：拾取同类的第二个${KIND_NAMES[picked[0]]}`;
  }
}

// ---------------------------------------------------------------------------
// 就近实体分辨（v1 简化；两工具共用——尺寸工具经此导入）
// ---------------------------------------------------------------------------

interface SolvedCoord { x: number; y: number }

/** 实体解算坐标索引：point id → (x,y)；circle id → {center, radius}（缺省即无解算值） */
function indexSolvedCoords(entities: SketchEntityDto[]): {
  points: Map<number, SolvedCoord>;
  circles: Map<number, { center: SolvedCoord; radius: number }>;
} {
  const points = new Map<number, SolvedCoord>();
  const circles = new Map<number, { center: SolvedCoord; radius: number }>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) {
      points.set(e.id, { x: e.x, y: e.y });
    }
  }
  for (const e of entities) {
    if (e.kind === 'circle' && e.radius !== undefined) {
      const center = points.get(e.center);
      if (center) circles.set(e.id, { center, radius: e.radius });
    }
  }
  return { points, circles };
}

/** 点到线段距（投影夹取到端点） */
function distToSegment(p: SolvedCoord, a: SolvedCoord, b: SolvedCoord): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Geometry.hypotenuseXY(p.x - cx, p.y - cy);
}

/**
 * hitPoint（z=0 投影后）→ 就近实体 id；无解算坐标可分辨时返回 undefined。
 * 并列序：距离 → kind 优先（point < circle < line）→ 数组序。
 * 端点规则：线段的最近点即端点时，线段距与端点 point 实体距精确相等，
 * 点实体凭 kind 优先获胜——故线端附近永远拾到 POINT 实体（而非线）。
 */
export function resolveNearestEntityId(entities: SketchEntityDto[], hit: SolvedCoord): number | undefined {
  const { points, circles } = indexSolvedCoords(entities);
  // kind 优先序：point=0、circle=1、line=2
  const kindPriority = (kind: EntityKind): number => (kind === 'point' ? 0 : kind === 'circle' ? 1 : 2);
  let best: { id: number; dist: number; prio: number; index: number } | undefined;

  const consider = (id: number, dist: number, kind: EntityKind, index: number): void => {
    const prio = kindPriority(kind);
    if (!best || dist < best.dist
      || (dist === best.dist && (prio < best.prio || (prio === best.prio && index < best.index)))) {
      best = { id, dist, prio, index };
    }
  };

  entities.forEach((e, index) => {
    if (e.kind === 'point') {
      const c = points.get(e.id);
      if (c) consider(e.id, Geometry.hypotenuseXY(hit.x - c.x, hit.y - c.y), 'point', index);
    } else if (e.kind === 'line') {
      const p1 = points.get(e.p1);
      const p2 = points.get(e.p2);
      if (p1 && p2) consider(e.id, distToSegment(hit, p1, p2), 'line', index);
    } else {
      const c = circles.get(e.id);
      if (c) consider(e.id, Math.abs(Geometry.hypotenuseXY(hit.x - c.center.x, hit.y - c.center.y) - c.radius), 'circle', index);
    }
  });

  return best?.id;
}

/** locate 命中点：locateManager.currHit 优先，回落 accuSnap.currHit；均缺省返回 undefined */
export function pickHitPoint(): Point3d | undefined {
  const locateHit = IModelApp.locateManager?.currHit;
  if (locateHit?.isElementHit && locateHit.hitPoint) {
    return Point3d.create(locateHit.hitPoint.x, locateHit.hitPoint.y, 0); // 草图面 XY@z=0（E-2 裁决）
  }
  const snapHit = IModelApp.accuSnap?.currHit;
  if (snapHit?.hitPoint) {
    return Point3d.create(snapHit.hitPoint.x, snapHit.hitPoint.y, 0);
  }
  return undefined;
}

/** 下一个约束 id：实体与约束全局最大 +1（Task 4 同式，保证草图内 id 唯一） */
export function nextConstraintId(sketch: { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] }): number {
  let max = 0;
  for (const e of sketch.entities) max = Math.max(max, e.id);
  for (const c of sketch.constraints) max = Math.max(max, c.id);
  return max + 1;
}

/**
 * 草图约束创建工具抽象基类：拾取实体入槽 → 满槽即提交（值约束无——
 * distance/radius 在 SketchAddDimensionTool，经事件桥走面板收值）。
 */
export abstract class SketchAddConstraintTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';

  /** 约束种类（子类固定） */
  protected abstract readonly constraintKind: SketchConstraintKind;
  /** 图标（子类提供） */
  public static override iconSpec = 'icon-constraint';

  private _sketchSystem?: UseSketchSystem;
  private _onToast?: SketchToolToast;
  /** 已拾取实体 id 序（满槽即提交/退出；失败清空重选） */
  private _refs: number[] = [];
  /** 已拾取实体种类序（槽位判定输入） */
  private _pickedKinds: EntityKind[] = [];

  /** 注入运行依赖（runSketchAddConstraintTool / 面板启动路径） */
  public setOptions(options: SketchAddConstraintToolOptions): void {
    this._sketchSystem = options.sketchSystem;
    this._onToast = options.onToast;
  }

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    // locate 草图元素（整元素命中）+ AccuSnap 吸附（端点吸附精确并列 → point 获胜）
    this.initLocateElements(true, true);
    IModelApp.notifications.outputPrompt(pickPrompt(this.constraintKind, []));
  }

  public override async onDataButtonDown(_ev: BeButtonEvent): Promise<EventHandled> {
    const hit = pickHitPoint();
    if (!hit) return EventHandled.No; // 无 locate 命中：不消费，交回工具管线

    const sketchSystem = this._sketchSystem;
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._toast('未打开草图或草图无实体', 'error');
      return EventHandled.Yes;
    }

    // v1 单草图假设：不校验命中元素 id（草图元素=唯一 GeometricElement3d）
    const entityId = resolveNearestEntityId(sketch.entities, { x: hit.x, y: hit.y });
    if (entityId === undefined) {
      this._toast('草图实体无可用解算坐标', 'info');
      return EventHandled.Yes;
    }
    const entity = sketch.entities.find((e) => e.id === entityId);
    if (!entity) return EventHandled.Yes;

    if (this._refs.includes(entity.id)) {
      this._toast('该实体已拾取，请选择另一个', 'info');
      return EventHandled.Yes;
    }

    const verdict = acceptPick(this.constraintKind, this._pickedKinds, entity.kind);
    if (!verdict.ok) {
      this._toast(verdict.message ?? '槽位类型不匹配', 'info'); // 拒收不消耗点击，继续拾取
      return EventHandled.Yes;
    }

    this._refs.push(entity.id);
    this._pickedKinds.push(entity.kind);

    if (!verdict.complete) {
      IModelApp.notifications.outputPrompt(pickPrompt(this.constraintKind, this._pickedKinds));
      return EventHandled.Yes;
    }

    // 满槽 → 构造约束 → applyUpdate 追加提交（整体覆写语义；实体原样在前）
    const newConstraint: SketchConstraintDto = {
      kind: this.constraintKind,
      id: nextConstraintId(sketch),
      refs: [...this._refs],
    };
    const result = await sketchSystem.applyUpdate(sketch.entities, [...sketch.constraints, newConstraint]);
    if (!result.ok) {
      // 后端拒收零变更——拾取清空（草稿=参数数组，仅提交时追加，无本地残留）；
      // 拒收文本（含 dof/冲突 id）原样透出，工具保持存活可立即重选。
      this._clearPicks();
      this._toast(result.error ?? '草图更新失败', 'error');
      IModelApp.notifications.outputPrompt(pickPrompt(this.constraintKind, []));
      return EventHandled.No;
    }

    await this.exitTool();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._refs.length > 0) {
      // 取消进行中的拾取序列，工具保持存活（再右键退出）
      this._clearPicks();
      IModelApp.notifications.outputPrompt(pickPrompt(this.constraintKind, []));
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** PrimitiveTool 抽象槽位：外部事件要求重启时换新实例重挂（选项随迁） */
  public override async onRestartTool(): Promise<void> {
    const tool = this.createInstance();
    if (this._sketchSystem) {
      tool.setOptions({ sketchSystem: this._sketchSystem, onToast: this._onToast });
    }
    if (!(await tool.run())) return this.exitTool();
  }

  /** 重启用实例工厂（子类返回自身类型新实例） */
  protected abstract createInstance(): SketchAddConstraintTool;

  private _clearPicks(): void {
    this._refs = [];
    this._pickedKinds = [];
  }

  private _toast(message: string, type: 'success' | 'error' | 'info'): void {
    this._onToast?.(message, type);
  }
}

/** 重合：2 point */
export class CoincidentAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.AddConstraint.Coincident';
  public static override iconSpec = 'icon-constraint-coincident';
  protected readonly constraintKind = 'coincident';
  protected createInstance(): SketchAddConstraintTool { return new CoincidentAddTool(); }
}

/** 水平：1 line 或 2 point */
export class HorizontalAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.AddConstraint.Horizontal';
  public static override iconSpec = 'icon-constraint-horizontal';
  protected readonly constraintKind = 'horizontal';
  protected createInstance(): SketchAddConstraintTool { return new HorizontalAddTool(); }
}

/** 垂直：1 line 或 2 point */
export class VerticalAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.AddConstraint.Vertical';
  public static override iconSpec = 'icon-constraint-vertical';
  protected readonly constraintKind = 'vertical';
  protected createInstance(): SketchAddConstraintTool { return new VerticalAddTool(); }
}

/** 平行：2 line */
export class ParallelAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.AddConstraint.Parallel';
  public static override iconSpec = 'icon-constraint-parallel';
  protected readonly constraintKind = 'parallel';
  protected createInstance(): SketchAddConstraintTool { return new ParallelAddTool(); }
}

/** 垂直（两线）：2 line */
export class PerpendicularAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.AddConstraint.Perpendicular';
  public static override iconSpec = 'icon-constraint-perpendicular';
  protected readonly constraintKind = 'perpendicular';
  protected createInstance(): SketchAddConstraintTool { return new PerpendicularAddTool(); }
}

/** 等长/等半径：2 line 或 2 circle（不得混搭） */
export class EqualAddTool extends SketchAddConstraintTool {
  public static override toolId = 'Sketch.AddConstraint.Equal';
  public static override iconSpec = 'icon-constraint-equal';
  protected readonly constraintKind = 'equal';
  protected createInstance(): SketchAddConstraintTool { return new EqualAddTool(); }
}

/**
 * 面板启动入口（runSketchCreateTool 同构）：
 * 构造工具 → 注入依赖 → run。AI/键盘路径经注册表 toolId 启动时无选项注入，
 * 提交将以「未打开草图」toast 失败——M3-b 内约束入口以面板为准。
 */
export async function runSketchAddConstraintTool(
  kind: SketchConstraintKind,
  options: SketchAddConstraintToolOptions,
): Promise<void> {
  const tool =
    kind === 'coincident' ? new CoincidentAddTool()
      : kind === 'horizontal' ? new HorizontalAddTool()
        : kind === 'vertical' ? new VerticalAddTool()
          : kind === 'parallel' ? new ParallelAddTool()
            : kind === 'perpendicular' ? new PerpendicularAddTool()
              : new EqualAddTool();
  tool.setOptions(options);
  await tool.run();
}
