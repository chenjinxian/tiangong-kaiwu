/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图实体拾取层（ADR-0018 S1b，2026-11-12 Onshape 对拍）：
 * 草图编辑态（无绘制工具激活）在 window capture 阶段监听指针事件（iTwin 工具
 * 可能 setPointerCapture，canvas 级 pointerup 不可靠），按 canvas rect 换算坐标，按屏幕距离
 * 命中控制点（≤6px）或曲线（≤5px），把选择写回唯一选择权威
 * `store.canvas.selection`（kind=sketchEntity，经 selection-authority 不投影
 * 到 connection.selectionSet）。
 *
 * 视觉：选中实体=橙色描边（闭合实体加浅橙填充）；悬停=蓝色加粗；控制点悬停
 * 放大圆环。基础约束着色/控制点由 SketchCurvesDecoration 负责，本层只画强调。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { Point3d } from '@itwin/core-geometry';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import {
  sketchControlPointsToWorld,
  sketchEntitiesToWorldPolylines,
  type SketchEntityPolyline,
} from '../internal/sketch-curves.js';
import { applySketchDrag, screenDeltaToLocal } from '../internal/sketch-drag.js';
import {
  hitTestSketchEntity,
  type ScreenPoint2,
  type SketchEntitySelection,
  type SketchPickerGeometry,
} from '../internal/sketch-entity-picker.js';
import {
  selectSketchEntitiesInScreenBox,
  sketchBoxFromScreenPoints,
  type SketchScreenBox,
} from '../internal/sketch-box-select.js';
import { consumeRightDragMenuSuppression } from '../internal/right-drag-menu.js';
import { hasSketchClipboard } from '../internal/sketch-clipboard.js';
import './SketchPlanePicker.css';

export type { SketchEntitySelection } from '../internal/sketch-entity-picker.js';

export interface SketchEntityPickerProps {
  viewport?: ScreenViewport | null;
  sketch: SketchDto;
  selected: readonly SketchEntitySelection[];
  onSelectionChange: (selection: readonly SketchEntitySelection[]) => void;
  /** 写门禁（只读时仅可选择，不可拖拽）。 */
  canEdit?: boolean;
  /** 交互总门（阵列 gizmo 接管指针时 false：只显示选中/悬停强调）。 */
  interactive?: boolean;
  /** 拖拽预览实体（显示层覆盖；提交成功后由宿主清空）。 */
  previewEntities?: readonly SketchEntityDto[] | null;
  /** 拖拽预览更新（null=取消/结束）。 */
  onPreviewChange?: (entities: SketchEntityDto[] | null) => void;
  /** 释放提交：一次 updateSketch（宿主负责 RPC/失败 toast/刷新）。 */
  onCommitDrag?: (entities: SketchEntityDto[]) => void | Promise<void>;
  /** Delete/Backspace：删除选中草图实体（宿主负责 updateSketch/诚实拒收）。 */
  onDelete?: (selection: readonly SketchEntitySelection[]) => void | Promise<void>;
  /** 右键菜单「建构线/取消建构线」（宿主 updateSketch 翻转 construction）。 */
  onToggleConstruction?: (entityId: number) => void | Promise<void>;
  /** 右键菜单「视图垂直于草图平面」。 */
  onViewNormalToPlane?: () => void;
  /** 右键菜单「缩放到合适大小」（草图实体范围）。 */
  onFitToSketch?: () => void;
  /** 右键菜单「放大选定对象」（该实体范围）。 */
  onZoomToEntity?: (entityId: number) => void;
  /** 右键菜单「拉伸…」：Onshape 退出草图并打开拉伸特征对话框。 */
  onExtrude?: () => void;
  /** 右键菜单「旋转…」：Onshape 退出草图并打开旋转特征对话框。 */
  onRevolve?: () => void;
  /** 右键菜单「复制草图图元」（Onshape 先复制到会话剪贴板，随后菜单出现粘贴）。 */
  onCopy?: (selection: readonly SketchEntitySelection[]) => void;
  /** 右键菜单「粘贴草图图元」（原位粘贴并选中副本）。 */
  onPaste?: () => void;
  /** 当前实体是否已是构造线（菜单标签依据）。 */
  isConstruction?: (entityId: number) => boolean;
  /** 空白右键菜单「确认 草图 N」显示名（Onshape 用落库草图名）。 */
  sketchName?: string;
  /** 空白右键菜单「确认 草图 N」：完成并退出草图编辑。 */
  onFinishSketch?: () => void;
  /** 空白右键菜单「全部显示」：回显会话隐藏实体。 */
  onShowAll?: () => void;
  /** 是否存在可回显的隐藏对象（「全部显示」禁用依据）。 */
  canShowAll?: boolean;
  /**
   * 覆盖层命中（约束 glyph / 尺寸标签）：命中时本层不拾取实体、不清实选择，
   * 由覆盖层自己选中约束（glyph 常叠在实体线上；2026-11-12 实测）。
   */
  isOverlayPoint?: (point: ScreenPoint2) => boolean;
}

const CLICK_SLOP_PX = 4;
const SELECTED_STROKE = '#c88a3c';
const HOVER_STROKE = '#4a90e2';
const SELECTED_FILL = 'rgba(245, 166, 65, 0.18)';

export function SketchEntityPicker({
  viewport,
  sketch,
  selected,
  onSelectionChange,
  canEdit = true,
  interactive = true,
  previewEntities,
  onPreviewChange,
  onCommitDrag,
  onDelete,
  onToggleConstruction,
  onViewNormalToPlane,
  onFitToSketch,
  onZoomToEntity,
  onExtrude,
  onRevolve,
  onCopy,
  onPaste,
  isConstruction,
  isOverlayPoint,
  sketchName,
  onFinishSketch,
  onShowAll,
  canShowAll = false,
}: SketchEntityPickerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = React.useState<SketchEntitySelection | null>(null);
  const hoverRef = React.useRef<SketchEntitySelection | null>(null);
  hoverRef.current = hover;
  const selectedRef = React.useRef(selected);
  selectedRef.current = selected;

  // 拖拽预览期用预览实体（显示与命中都以预览为准）；事实源仍是后端解算 params。
  const displayEntities = previewEntities ?? sketch.entities;
  const geometry = React.useMemo(() => ({
    polylines: sketchEntitiesToWorldPolylines(displayEntities, sketch.plane),
    controlPoints: sketchControlPointsToWorld(displayEntities, sketch.plane),
  }), [displayEntities, sketch.plane]);
  const geometryRef = React.useRef(geometry);
  geometryRef.current = geometry;
  /** 框选覆盖层（client 坐标；pointer-events:none 不拦截视口）。 */
  const [boxRect, setBoxRect] = React.useState<SketchScreenBox | null>(null);

  const toScreen = React.useCallback((viewport2: ScreenViewport, points: readonly Point3d[]): ScreenPoint2[] =>
    points.map((p) => {
      const v = viewport2.worldToView(p);
      return { x: v.x, y: v.y };
    }), []);

  const hitTest = React.useCallback((point: ScreenPoint2): SketchEntitySelection | null => {
    if (!viewport?.viewRect)
      return null;
    const project = (world: Point3d): ScreenPoint2 => {
      const v = viewport.worldToView(world);
      return { x: v.x, y: v.y };
    };
    return hitTestSketchEntity(geometry as SketchPickerGeometry, point, project, sketch.id);
  }, [viewport, geometry, sketch.id]);

  const sameSelection = (a: SketchEntitySelection, b: SketchEntitySelection): boolean =>
    a.entityId === b.entityId && a.part === b.part;

  // 指针监听：window capture 阶段（iTwin 工具可能对 pointer 做 setPointerCapture，
  // canvas 级监听不稳定）；坐标按 canvas rect 换算，等价 offsetX/offsetY。
  // 用 ref 读取最新回调，effect 只随 viewport 重建，避免每次渲染重挂监听。
  const hitTestRef = React.useRef(hitTest);
  hitTestRef.current = hitTest;
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onCopyRef = React.useRef(onCopy);
  onCopyRef.current = onCopy;
  const onPasteRef = React.useRef(onPaste);
  onPasteRef.current = onPaste;
  const sketchRef = React.useRef(sketch);
  sketchRef.current = sketch;
  const canEditRef = React.useRef(canEdit);
  canEditRef.current = canEdit;
  const interactiveRef = React.useRef(interactive);
  interactiveRef.current = interactive;
  React.useEffect(() => {
    if (!interactive)
      setHover(null);
  }, [interactive]);
  const isOverlayPointRef = React.useRef(isOverlayPoint);
  isOverlayPointRef.current = isOverlayPoint;
  const onPreviewChangeRef = React.useRef(onPreviewChange);
  onPreviewChangeRef.current = onPreviewChange;
  const onCommitDragRef = React.useRef(onCommitDrag);
  onCommitDragRef.current = onCommitDrag;
  const onDeleteRef = React.useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onToggleConstructionRef = React.useRef(onToggleConstruction);
  onToggleConstructionRef.current = onToggleConstruction;
  const onViewNormalRef = React.useRef(onViewNormalToPlane);
  onViewNormalRef.current = onViewNormalToPlane;
  const onFitToSketchRef = React.useRef(onFitToSketch);
  onFitToSketchRef.current = onFitToSketch;
  const onZoomToEntityRef = React.useRef(onZoomToEntity);
  onZoomToEntityRef.current = onZoomToEntity;
  const isConstructionRef = React.useRef(isConstruction);
  isConstructionRef.current = isConstruction;
  const [menu, setMenu] = React.useState<{ x: number; y: number; selection: SketchEntitySelection } | null>(null);
  /** 空白右键菜单（Onshape 草图空白菜单面；实体菜单与它互斥）。 */
  const [blankMenu, setBlankMenu] = React.useState<{ x: number; y: number } | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const blankMenuRef = React.useRef<HTMLDivElement | null>(null);
  const menuOpenRef = React.useRef(false);
  menuOpenRef.current = menu !== null || blankMenu !== null;

  React.useEffect(() => {
    const canvas = viewport?.canvas;
    if (!viewport || !canvas)
      return;
    let down: ScreenPoint2 | undefined;
    let drag: { target: SketchEntitySelection; down: ScreenPoint2; dragging: boolean; preview?: SketchEntityDto[] } | undefined;
    /** Onshape 草图框选：空白左键按下起候选，超过 slop 才算拖拽。 */
    let box: { from: ScreenPoint2; to: ScreenPoint2; dragging: boolean } | undefined;
    const local = (event: PointerEvent): ScreenPoint2 => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    /** 只吃画布内指针：ribbon/对话框点击不得被当成空白点击而清空选择。 */
    const inCanvas = (point: ScreenPoint2): boolean => {
      const rect = canvas.getBoundingClientRect();
      return point.x >= 0 && point.y >= 0 && point.x <= rect.width && point.y <= rect.height;
    };
    const project = (world: Point3d): ScreenPoint2 => {
      const v = viewport.worldToView(world);
      return { x: v.x, y: v.y };
    };
    const cancelDrag = (): void => {
      if (!drag)
        return;
      drag = undefined;
      onPreviewChangeRef.current?.(null);
    };
    const cancelBox = (): void => {
      if (!box)
        return;
      box = undefined;
      setBoxRect(null);
    };
    const onDown = (event: PointerEvent): void => {
      if (!interactiveRef.current || event.button !== 0 || menuOpenRef.current)
        return;
      down = local(event);
      if (!inCanvas(down)) {
        down = undefined;
        return;
      }
      if (isOverlayPointRef.current?.(down))
        return;
      const target = hitTestRef.current(down);
      if (target) {
        if (!canEditRef.current)
          return;
        drag = { target, down, dragging: false };
        // 命中实体时不让 iTwin 同时启动相机旋转/工具手势；空按仍交给视口。
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // 空白按下：候选框选（Onshape 草图：左→右窗口、右→左交叉）。
      box = { from: down, to: down, dragging: false };
    };
    const onMove = (event: PointerEvent): void => {
      if (!interactiveRef.current || menuOpenRef.current)
        return;
      if (box && (event.buttons & 1) === 1) {
        const point = local(event);
        const dx = point.x - box.from.x;
        const dy = point.y - box.from.y;
        if (!box.dragging) {
          if (Math.hypot(dx, dy) <= CLICK_SLOP_PX)
            return;
          box.dragging = true;
          setHover(null);
        }
        box.to = point;
        setBoxRect(sketchBoxFromScreenPoints(box.from, point).box);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (drag && (event.buttons & 1) === 1) {
        const point = local(event);
        const dx = point.x - drag.down.x;
        const dy = point.y - drag.down.y;
        if (!drag.dragging) {
          if (Math.hypot(dx, dy) <= CLICK_SLOP_PX)
            return;
          drag.dragging = true;
        }
        const delta = screenDeltaToLocal(viewport, sketchRef.current.plane, dx, dy);
        if (!delta)
          return;
        drag.preview = applySketchDrag(
          sketchRef.current.entities,
          { entityId: drag.target.entityId, part: drag.target.part, handleIndex: drag.target.handleIndex },
          delta.du,
          delta.dv,
        );
        onPreviewChangeRef.current?.(drag.preview);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const hit = hitTestRef.current(local(event));
      const prev = hoverRef.current;
      if (hit === null && prev === null)
        return;
      if (hit && prev && sameSelection(hit, prev))
        return;
      setHover(hit);
    };
    const onUp = (event: PointerEvent): void => {
      if (!interactiveRef.current || event.button !== 0 || !down || menuOpenRef.current)
        return;
      const up = local(event);
      if (box?.dragging) {
        const from = box.from;
        box = undefined;
        down = undefined;
        setBoxRect(null);
        const { box: rect, mode } = sketchBoxFromScreenPoints(from, up);
        const picked = selectSketchEntitiesInScreenBox(
          geometryRef.current,
          project,
          rect,
          mode,
          sketchRef.current.id,
        );
        const current = selectedRef.current;
        if (event.ctrlKey || event.metaKey) {
          const merged = [...current];
          for (const entry of picked) {
            const index = merged.findIndex((candidate) => candidate.entityId === entry.entityId);
            if (index >= 0)
              merged[index] = entry;
            else
              merged.push(entry);
          }
          onSelectionChangeRef.current(merged);
        } else {
          onSelectionChangeRef.current(picked);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      cancelBox();
      const moved = Math.hypot(up.x - down.x, up.y - down.y);
      down = undefined;
      if (drag?.dragging && drag.preview) {
        const preview = drag.preview;
        drag = undefined;
        void onCommitDragRef.current?.(preview);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      drag = undefined;
      // 画布外释放（点 ribbon/对话框）：不当作空白点击清空选中。
      if (!inCanvas(up))
        return;
      // 覆盖层（约束 glyph / 尺寸标签）释放：不拾取实体、不清约束选择。
      if (isOverlayPointRef.current?.(up)) {
        down = undefined;
        return;
      }
      if (moved > CLICK_SLOP_PX)
        return;
      const hit = hitTestRef.current(up);
      const current = selectedRef.current;
      if (!hit) {
        if (current.length > 0)
          onSelectionChangeRef.current([]);
        return;
      }
      const toggle = event.ctrlKey || event.metaKey;
      const exists = current.find((entry) => sameSelection(entry, hit));
      onSelectionChangeRef.current(toggle
        ? (exists ? current.filter((entry) => !sameSelection(entry, hit)) : [...current, hit])
        : [hit]);
    };
    const onCancel = (): void => {
      down = undefined;
      cancelDrag();
      cancelBox();
    };
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement))
        return false;
      if (target.isContentEditable)
        return true;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
    };
    const onContextMenu = (event: MouseEvent): void => {
      if (!interactiveRef.current)
        return;
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height)
        return;
      event.preventDefault();
      event.stopPropagation();
      // Onshape：右键拖拽（旋转/平移）结束不弹菜单；右键单击才弹。
      if (consumeRightDragMenuSuppression())
        return;
      const hit = hitTestRef.current(point);
      if (!hit) {
        setMenu(null);
        setBlankMenu({ x: event.clientX, y: event.clientY });
        return;
      }
      setBlankMenu(null);
      onSelectionChangeRef.current([hit]);
      setMenu({ x: event.clientX, y: event.clientY, selection: hit });
    };
    const onMenuOutside = (event: MouseEvent): void => {
      if (!menuOpenRef.current)
        return;
      if (event.target instanceof Node
        && (menuRef.current?.contains(event.target) || blankMenuRef.current?.contains(event.target)))
        return;
      setMenu(null);
      setBlankMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && menuOpenRef.current) {
        setMenu(null);
        setBlankMenu(null);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === 'Escape' && box?.dragging) {
        cancelBox();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === 'Escape' && drag?.dragging) {
        cancelDrag();
        // 拖拽中的 Esc 只取消拖拽，不触发草图对话框的「退出草图」。
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // ADR-0018 S1d：选中草图实体时 Delete/Backspace = 删除（Onshape live：
      // 选中弧按 Delete 后弧消失、草图保持编辑态）。输入框聚焦时不吃键。
      if ((event.key === 'Delete' || event.key === 'Backspace')
        && !drag?.dragging
        && selectedRef.current.length > 0
        && !isEditableTarget(event.target)
        && onDeleteRef.current) {
        event.preventDefault();
        event.stopPropagation();
        void onDeleteRef.current(selectedRef.current);
        return;
      }
      // Onshape 标准快捷键：Ctrl/Cmd+C 复制选中、Ctrl/Cmd+V 原位粘贴。
      const chord = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      if (!chord || isEditableTarget(event.target))
        return;
      const key = event.key.toLowerCase();
      if (key === 'c' && selectedRef.current.length > 0 && onCopyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCopyRef.current(selectedRef.current);
      } else if (key === 'v' && hasSketchClipboard() && onPasteRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onPasteRef.current();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('mousedown', onMenuOutside, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('mousedown', onMenuOutside, true);
    };
  }, [viewport]);

  const draw = React.useCallback((): void => {
    const overlay = canvasRef.current;
    if (!overlay || !viewport?.viewRect)
      return;
    const rect = viewport.viewRect;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (overlay.width !== Math.round(width * dpr) || overlay.height !== Math.round(height * dpr)) {
      overlay.width = Math.round(width * dpr);
      overlay.height = Math.round(height * dpr);
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
    }
    const ctx = overlay.getContext('2d');
    if (!ctx)
      return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const selectedIds = new Set(selected.map((entry) => entry.entityId));
    const hoverId = hover?.entityId;
    const drawLine = (line: SketchEntityPolyline, style: string, lineWidth: number, fill?: string): void => {
      const pts = toScreen(viewport, line.points);
      if (pts.length < 2)
        return;
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      const closed = pts.length > 3
        && Math.hypot(pts[0]!.x - pts.at(-1)!.x, pts[0]!.y - pts.at(-1)!.y) < 0.5;
      if (closed && fill) {
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([]);
      ctx.stroke();
    };
    for (const line of geometry.polylines) {
      if (!selectedIds.has(line.entityId))
        continue;
      drawLine(line, SELECTED_STROKE, 2, SELECTED_FILL);
    }
    if (hoverId !== undefined && !selectedIds.has(hoverId)) {
      const line = geometry.polylines.find((entry) => entry.entityId === hoverId);
      if (line)
        drawLine(line, HOVER_STROKE, 2);
    }
    // 控制点悬停强调（基础控制点由 SketchCurvesDecoration 绘制）。
    if (hover?.part === 'handle') {
      const cp = geometry.controlPoints.find((entry) => entry.entityId === hover.entityId);
      if (cp) {
        const v = viewport.worldToView(cp.position);
        ctx.beginPath();
        ctx.arc(v.x, v.y, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = HOVER_STROKE;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [viewport, geometry, selected, hover, toScreen]);

  React.useEffect(() => { draw(); }, [draw]);
  React.useEffect(() => {
    if (!viewport?.viewRect)
      return;
    const event = viewport.onViewChanged;
    const refresh = (): void => { draw(); };
    event?.addListener?.(refresh);
    window.addEventListener('resize', refresh);
    return () => {
      event?.removeListener?.(refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [viewport, draw]);

  return (
    <React.Fragment>
      <canvas ref={canvasRef} className="part-studio-plane-picker" aria-hidden="true" />
      <div
        className="part-studio-plane-picker__marker"
        data-testid="sketch-entity-picker"
        data-selected={JSON.stringify(selected.map((entry) => [entry.entityId, entry.part]))}
        data-hover={hover ? `${hover.entityId}:${hover.part}` : ''}
        aria-hidden="true"
      />
      {boxRect && (
        <div
          className="part-studio-sketch-select-box"
          data-testid="sketch-select-box"
          style={{
            left: boxRect.left,
            top: boxRect.top,
            width: boxRect.right - boxRect.left,
            height: boxRect.bottom - boxRect.top,
          }}
          aria-hidden="true"
        />
      )}
      {blankMenu && (() => {
        const width = 240;
        const height = 380;
        const left = Math.min(blankMenu.x, Math.max(8, window.innerWidth - width - 8));
        const top = Math.min(blankMenu.y, Math.max(8, window.innerHeight - height - 8));
        const unsupported = t('partStudio.tree.unsupported');
        const close = (): void => setBlankMenu(null);
        return (
          <div
            ref={blankMenuRef}
            className="part-studio-tree-menu part-studio-sketch-blank-menu"
            role="menu"
            aria-label={t('partStudio.sketch.blankMenuLabel')}
            data-testid="sketch-blank-menu"
            style={{ left, top }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
          >
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-blank-menu-confirm"
              onClick={() => { close(); onFinishSketch?.(); }}
            >
              {t('partStudio.sketch.blankMenuConfirm', { name: sketchName ?? '' })}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              disabled
              title={unsupported}
            >
              {t('partStudio.sketch.blankMenuCopySketch')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-blank-menu-paste"
              disabled={!hasSketchClipboard()}
              title={hasSketchClipboard() ? undefined : unsupported}
              onClick={() => { close(); onPaste?.(); }}
            >
              {t('partStudio.sketch.entityMenuPaste')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-blank-menu-show-all"
              disabled={!canShowAll}
              title={canShowAll ? undefined : t('partStudio.sketch.blankMenuShowAllEmpty')}
              onClick={() => { close(); onShowAll?.(); }}
            >
              {t('partStudio.sketch.blankMenuShowAll')}
            </button>
            <div className="part-studio-tree-menu__separator" role="separator" />
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={unsupported}>
              {t('partStudio.sketch.entityMenuAnalyze')}
            </button>
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={unsupported}>
              {t('partStudio.sketch.blankMenuSelectCreated')}
            </button>
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={unsupported}>
              {t('partStudio.sketch.blankMenuCreateSelection')}
            </button>
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={unsupported}>
              {t('partStudio.sketch.blankMenuSelectOther')}
            </button>
            <div className="part-studio-tree-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-blank-menu-fit"
              onClick={() => { close(); onFitToSketchRef.current?.(); }}
            >
              {t('partStudio.sketch.entityMenuFit')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-blank-menu-view-normal"
              onClick={() => { close(); onViewNormalRef.current?.(); }}
            >
              {t('partStudio.sketch.entityMenuViewNormal')}
            </button>
          </div>
        );
      })()}
      {menu && (() => {
        const width = 220;
        const height = 400;
        const left = Math.min(menu.x, Math.max(8, window.innerWidth - width - 8));
        const top = Math.min(menu.y, Math.max(8, window.innerHeight - height - 8));
        const construction = isConstructionRef.current?.(menu.selection.entityId) ?? false;
        const disabledHint = t('partStudio.tree.unsupported');
        return (
          <div
            ref={menuRef}
            className="part-studio-tree-menu part-studio-sketch-entity-menu"
            role="menu"
            aria-label={t('partStudio.sketch.entityMenuLabel')}
            data-testid="sketch-entity-menu"
            style={{ left, top }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
          >
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item part-studio-tree-menu__item--danger"
              data-testid="sketch-entity-menu-delete"
              onClick={() => {
                const selection = menu.selection;
                setMenu(null);
                void onDeleteRef.current?.([selection]);
              }}
            >
              {t('partStudio.sketch.entityMenuDelete')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-entity-menu-construction"
              onClick={() => {
                const entityId = menu.selection.entityId;
                setMenu(null);
                void onToggleConstructionRef.current?.(entityId);
              }}
            >
              {construction
                ? t('partStudio.sketch.entityMenuNormalGeometry')
                : t('partStudio.sketch.entityMenuConstruction')}
            </button>
            <div className="part-studio-tree-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-entity-menu-copy"
              onClick={() => {
                const base = selectedRef.current;
                const clicked = menu.selection;
                const selection = base.some((entry) => sameSelection(entry, clicked))
                  ? base
                  : [clicked];
                setMenu(null);
                onCopy?.(selection);
              }}
            >
              {t('partStudio.sketch.entityMenuCopy')}
            </button>
            {hasSketchClipboard() && (
              <button
                type="button"
                role="menuitem"
                className="part-studio-tree-menu__item"
                data-testid="sketch-entity-menu-paste"
                onClick={() => {
                  setMenu(null);
                  onPaste?.();
                }}
              >
                {t('partStudio.sketch.entityMenuPaste')}
              </button>
            )}
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={disabledHint}>
              {t('partStudio.sketch.entityMenuTransform')}
            </button>
            <div className="part-studio-tree-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-entity-menu-extrude"
              onClick={() => {
                setMenu(null);
                onExtrude?.();
              }}
            >
              {t('partStudio.sketch.entityMenuExtrude')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-entity-menu-revolve"
              onClick={() => {
                setMenu(null);
                onRevolve?.();
              }}
            >
              {t('partStudio.sketch.entityMenuRevolve')}
            </button>
            <div className="part-studio-tree-menu__separator" role="separator" />
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={disabledHint}>
              {t('partStudio.sketch.entityMenuAnalyze')}
            </button>
            <div className="part-studio-tree-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              onClick={() => {
                setMenu(null);
                onSelectionChangeRef.current([]);
              }}
            >
              {t('partStudio.sketch.entityMenuClearSelection')}
            </button>
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={disabledHint}>
              {t('partStudio.sketch.entityMenuSelect')}
              <span className="part-studio-tree-menu__submenu" aria-hidden="true">›</span>
            </button>
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={disabledHint}>
              {t('partStudio.sketch.entityMenuAddComment')}
            </button>
            <div className="part-studio-tree-menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              onClick={() => {
                setMenu(null);
                onFitToSketchRef.current?.();
              }}
            >
              {t('partStudio.sketch.entityMenuFit')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-entity-menu-zoom"
              onClick={() => {
                const entityId = menu.selection.entityId;
                setMenu(null);
                onZoomToEntityRef.current?.(entityId);
              }}
            >
              {t('partStudio.sketch.entityMenuZoom')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              data-testid="sketch-entity-menu-view-normal"
              onClick={() => {
                setMenu(null);
                onViewNormalRef.current?.();
              }}
            >
              {t('partStudio.sketch.entityMenuViewNormal')}
            </button>
            <button type="button" role="menuitem" className="part-studio-tree-menu__item" disabled title={disabledHint}>
              {t('partStudio.sketch.entityMenuAlignVertical')}
            </button>
          </div>
        );
      })()}
    </React.Fragment>
  );
}
