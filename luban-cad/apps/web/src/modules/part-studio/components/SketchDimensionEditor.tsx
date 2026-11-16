/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图尺寸数值内联编辑（ADR-0018 S1e，2026-11-12 Onshape 对拍）：
 * 草图编辑态（无绘制工具激活）双击视口尺寸数值 → 原位尺寸对话框（当前值全选），
 * Enter/确认按钮提交 `updateSketchConstraint`、Escape/取消按钮丢弃；后端拒收
 *（冲突/非尺寸约束）保留输入框并标注错误。点击画布空白不关闭对话框（live
 * 2026-11-16：输入失焦后对话框仍活动，窗口级 Enter/Escape 继续生效）。标签
 * 命中区由 viewer 布局纯函数给出（与绘制同源，不复制堆叠避让逻辑）。
 *
 * 仅 distance/radius/diameter/length/angle 可改值（后端 updateSketchConstraint 白名单）；
 * 角度在界面上显示度数、提交时换算回弧度（shared 契约为弧度）。
 *
 * 2026-11-12（Onshape 约束 glyph 对拍）：非尺寸约束 glyph（⊥/∥/=/—/|/中点/
 * 重合/镜像…）同样可单击选中、Delete 删除——命中区由 viewer 同一布局纯函数
 * 给出，选中高亮浅蓝（live 截图口径），删除走宿主 updateSketch 移除该约束。
 *
 * 2026-11-15（live 对拍）：输入框贴标签左侧（垂直中心对齐标签中心；无标签
 * 矩形回退双击点）、只读单位后缀（长度类 mm / 角度 deg，仅视觉，解析仍用
 * 数值文本）；选中 glyph 高亮=纯 #e2f0fa 填充（无边框/圆角）。
 *
 * 2026-11-16（W10a live dimension-dialog 对拍）：完整尺寸对话框皮肤——上方
 * 13px 拖拽条 + 34px 白面板（0 圆角、0 5px 10px rgba(0,0,0,0.2) 阴影、下
 * 内边距 5px）；输入 100×26 透明无边框、仅 1px #1651b0 内下划线（错误态
 * #c0392b）、13.3333px；右侧 52×28 按钮组（确认 22×22 实心 #009400 白勾 /
 * 取消 22×22 白底 1px #cccccc 红 X，radius 4，与草图值弹层同一视觉语言）。
 *
 * 2026-11-16（W17 live 尺寸对话框全结构）：可见对话框 209×47——拖拽条 209×13
 *（白底 + 1px #cccccc 边框，居中三枚 7×7 空心方握把）可按住拖动；面板 209×34
 * 自左向右：禁用展开器 20×20（x+1,y+3，#d7d7d7 chevron，纯装饰）、输入
 * 100×26（面板 x+21）、禁用参数状态切换 20×20（rgba(16,16,16,0.3)，普通数值
 * 尺寸不可用，不实现菜单）、按钮组 52×28（padding 5px 0 0 4px、4px 间距）。
 * 放置锚点不变（输入框左缘 + 垂直中心 = 标签中心）；面板向左侧扩展 21px，
 * 可见对话框默认相对输入行偏移 -21/-13，由 `layoutDimensionEditorDialog`
 * 按 209×47 钳制在视口内。拖动只作用于 13px 拖拽条：拖动后的可见位置按
 * 视口 4px 边距钳制，重新打开对话框时复位到锚点默认位置。
 *
 * 输入框内方向键步进（live）：无选区（光标态）时 ArrowUp/ArrowDown 对长度类
 * 约束步进 ±1 mm、对角度约束步进 ±1°（W18：显示单位为度），有选区时不步进
 *（默认行为折叠选区）；步进不提交。
 *
 * 2026-11-16（W17b）：live 的放置值弹层与双击编辑器是同一个 dimension-dialog；
 * 结构与拖拽/方向键行为抽到共享外壳 `SketchDimensionDialog`（本组件只做
 * 标签命中/定位/提交，面板结构与值弹层完全同源，不再有两套视觉）。
 */
import React from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchConstraintDto } from '@luban-cad/shared';
import {
  layoutSketchConstraintGlyphs,
  layoutSketchDimensions,
  sketchDimensionLabels,
} from '@luban-cad/viewer';
import type { SketchConstraintGlyphAnnotation, SketchDimensionAnnotation } from '@luban-cad/viewer';
import {
  constraintIdFromDimensionLabel,
  hitTestSketchConstraintGlyph,
  hitTestSketchDimensionLabel,
} from '../internal/sketch-dimension-picker.js';
import { constraintIdFromGlyphId } from '../internal/sketch-constraint-glyphs.js';
import {
  EDITABLE_CONSTRAINT_KINDS,
  formatConstraintEditorValue,
  parseConstraintEditorValue,
} from '../internal/sketch-dimension-value.js';
import {
  DIMENSION_EDITOR_DIALOG_HEIGHT,
  DIMENSION_EDITOR_DIALOG_WIDTH,
  DIMENSION_EDITOR_DRAGBAR_HEIGHT,
  SketchDimensionDialog,
} from './SketchDimensionDialog.js';
import type { SketchDimensionDialogTestIds } from './SketchDimensionDialog.js';
import './SketchDimensionEditor.css';

/** 对话框几何常量与共享外壳同源（此处再导出，保持既有导入面稳定）。 */
export {
  DIMENSION_EDITOR_DIALOG_HEIGHT,
  DIMENSION_EDITOR_DIALOG_WIDTH,
  DIMENSION_EDITOR_DRAGBAR_HEIGHT,
  DIMENSION_EDITOR_PANEL_HEIGHT,
} from './SketchDimensionDialog.js';

export interface SketchDimensionEditorProps {
  viewport?: ScreenViewport | null;
  annotations: readonly SketchDimensionAnnotation[];
  /** 非尺寸约束 glyph 锚点（与装饰器绘制同源；缺省不渲染/不拾取）。 */
  glyphs?: readonly SketchConstraintGlyphAnnotation[];
  constraints?: readonly SketchConstraintDto[];
  canEdit?: boolean;
  /** 提交（宿主走 sketchSystem.applyConstraintValue）；ok:false 时保留输入框。 */
  onCommit: (constraintId: number, value: number) => void | Promise<{ ok: boolean; error?: string }>;
  /** 双击不可改值尺寸（直径/角度等）。 */
  onUnsupported?: (constraintKind: string) => void;
  /** 当前选中的尺寸约束 id（唯一选择权威 store.canvas.selection 的镜像）。 */
  selectedConstraintId?: number | null;
  /** 单击尺寸数值 → 选中（null=清空约束选择）；宿主写 store。 */
  onSelectConstraint?: (constraintId: number | null) => void;
  /** Delete/Backspace 删除选中尺寸（宿主走 updateSketch 移除约束）。 */
  onDeleteConstraint?: (constraintId: number) => void | Promise<void>;
  /**
   * 覆盖层命中注册（供 SketchEntityPicker 抑制实体拾取/清选择）：glyph/标签
   * 常叠在实体线上，实体层必须让位给覆盖层（2026-11-12 实测）。
   */
  overlayHitTestRef?: React.MutableRefObject<((point: { x: number; y: number }) => boolean) | null>;
  /**
   * W20（2026-11-16）：尺寸标签命中通道（供 SketchEntityPicker 打开尺寸右键
   * 菜单）——命中当前标注标签时返回其约束 id，未命中返回 null；与
   * `overlayHitTestRef` 同一生命周期。缺省不注册。
   */
  dimensionLabelHitTestRef?: React.MutableRefObject<((point: { x: number; y: number }) => number | null) | null>;
  /**
   * 2026-11-15 E5：悬停非尺寸约束 glyph → 其引用实体 id（升序去重；离开/未
   * 命中 glyph 时回调空数组）。仅显示联动，不改变选择。缺省不监听。
   */
  onGlyphHover?: (entityIds: readonly number[]) => void;
}

interface EditorState {
  constraintId: number;
  kind: SketchConstraintDto['kind'];
  value: string;
  /** 打开时的初始格式化文本（方向键步进判断「未编辑」的基线）。 */
  initialValue: string;
  /** 约束原始值（未编辑时步进基线，保留全精度；角度为契约弧度）。 */
  rawValue: number | undefined;
  /** position:fixed 元素的 client 坐标（垂直以 translateY(-50%) 居中）。 */
  left: number;
  top: number;
}

/** 内联输入框尺寸（与 CSS 同值；纯布局计算用）。 */
export const DIMENSION_EDITOR_WIDTH = 100;
/** 输入框高度（live 26px；与 CSS 同值，用于输入框垂直中心换算）。 */
export const DIMENSION_EDITOR_INPUT_HEIGHT = 26;
/** 输入框右缘与标签左缘的间距（px，live 口径「紧贴标签左侧」）。 */
export const DIMENSION_EDITOR_GAP = 4;
/** 面板左缘到输入框左缘的距离（live：展开器 1px + 20px）。 */
export const DIMENSION_EDITOR_DIALOG_INPUT_OFFSET = 21;
/** 视口边缘安全间距（钳制用，px）。 */
export const DIMENSION_EDITOR_VIEWPORT_MARGIN = 4;

export interface ScreenRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ScreenPointLike {
  x: number;
  y: number;
}

/**
 * 内联输入框放置（纯几何，ADR-0018 S1e 2026-11-15 Onshape 对拍）：
 * 有标签矩形时输入框右缘贴标签左缘左侧 gap、垂直中心对齐标签中心；无标签
 * 矩形回退到双击点（水平/垂直居中，与旧行为等价的视觉位置）。返回 client
 * 坐标，CSS 侧 `translateY(-50%)` 完成输入框垂直居中。
 *
 * 2026-11-16 live 更正：可见对话框（209×47，含拖拽条与按钮组）会覆盖标签
 * 区域——不再承诺「标签保持可见」；边缘标签由 `layoutDimensionEditorDialog`
 * 钳制对话框位置，避免按钮/面板被视口裁切。
 */
export function computeDimensionEditorPlacement(input: {
  labelRect?: ScreenRectLike | null;
  /** 画布 getBoundingClientRect()（标签矩形是画布局部坐标）。 */
  canvasRect: { left: number; top: number };
  /** 双击点 client 坐标（回退放置）。 */
  click: ScreenPointLike;
  width?: number;
  gap?: number;
}): { left: number; top: number } {
  const width = input.width ?? DIMENSION_EDITOR_WIDTH;
  const gap = input.gap ?? DIMENSION_EDITOR_GAP;
  const { labelRect, canvasRect, click } = input;
  if (labelRect) {
    return {
      left: canvasRect.left + labelRect.left - gap - width,
      top: canvasRect.top + (labelRect.top + labelRect.bottom) / 2,
    };
  }
  return { left: click.x - width / 2, top: click.y };
}

export interface DimensionEditorDialogPlacement {
  /** 可见对话框（209×47）左上角 client 坐标（钳制后）。 */
  left: number;
  top: number;
  /** 对话框相对锚点包装元素的 CSS 偏移（未钳制时 -21/-13）。 */
  offsetLeft: number;
  offsetTop: number;
}

/**
 * 可见对话框位置钳制（纯几何）：把 209×47 的对话框左上角钳制到
 * [margin, viewport − size − margin]；视口小于对话框时退回 margin，
 * 不产生负坐标。拖拽后的每次渲染都走同一规则。
 */
export function clampDimensionEditorPosition(
  position: { left: number; top: number },
  viewport: { width: number; height: number },
  margin: number = DIMENSION_EDITOR_VIEWPORT_MARGIN,
): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewport.width - DIMENSION_EDITOR_DIALOG_WIDTH - margin);
  const maxTop = Math.max(margin, viewport.height - DIMENSION_EDITOR_DIALOG_HEIGHT - margin);
  return {
    left: Math.min(Math.max(position.left, margin), maxLeft),
    top: Math.min(Math.max(position.top, margin), maxTop),
  };
}

/**
 * 可见尺寸对话框定位 + 视口边缘钳制（纯几何，2026-11-16 W17 live 结构）：
 * 锚点 = 输入框左缘 + 垂直中心（`computeDimensionEditorPlacement` 不变）。
 * 包装元素 `translateY(-50%)`（100×26）后输入行顶部 = anchor.top − 13；
 * 面板向左侧扩展 21px（输入框左缘 = 面板左缘 + 21），对话框顶部再上移
 * 13px（拖拽条）→ 未钳制时对话框 top = anchor.top − 26、
 * left = anchor.left − 21，输入框垂直中心恒等于 anchor.top（标签中心）。
 * 边缘标签把 209×47 对话框钳制到 [margin, viewport − size − margin]：只移动
 * 对话框，保证拖拽条/按钮组完整落在视口内（必要时允许输入框偏离标签中心）。
 */
export function layoutDimensionEditorDialog(input: {
  anchor: ScreenPointLike;
  viewport: { width: number; height: number };
  margin?: number;
}): DimensionEditorDialogPlacement {
  const margin = input.margin ?? DIMENSION_EDITOR_VIEWPORT_MARGIN;
  const wrapLeft = input.anchor.x;
  const wrapTop = input.anchor.y - DIMENSION_EDITOR_INPUT_HEIGHT / 2;
  const desiredLeft = wrapLeft - DIMENSION_EDITOR_DIALOG_INPUT_OFFSET;
  const desiredTop = wrapTop - DIMENSION_EDITOR_DRAGBAR_HEIGHT;
  const { left, top } = clampDimensionEditorPosition(
    { left: desiredLeft, top: desiredTop },
    input.viewport,
    margin,
  );
  return { left, top, offsetLeft: left - wrapLeft, offsetTop: top - wrapTop };
}

/** 只读单位后缀（视觉仅显示；解析/载荷仍是数值文本）：角度 deg（live W18），其余 mm。 */
export function dimensionEditorUnit(kind: SketchConstraintDto['kind']): 'mm' | 'deg' {
  return kind === 'angle' ? 'deg' : 'mm';
}

/**
 * W17b：双击内联编辑与工具放置值弹层共用同一 dimension-dialog 外壳
 * （`SketchDimensionDialog`）；两表面的观测 testid 各自保留既有命名，
 * 避免 e2e/单测因共享实现改选取器。
 */
export const DIMENSION_EDITOR_DIALOG_TEST_IDS: SketchDimensionDialogTestIds = {
  dialog: 'sketch-dimension-dialog',
  dragbar: 'sketch-dimension-dragbar',
  input: 'sketch-dimension-input',
  unit: 'sketch-dimension-unit',
  expander: 'sketch-dimension-expander',
  stateToggle: 'sketch-dimension-state-toggle',
  confirm: 'sketch-dimension-confirm',
  cancel: 'sketch-dimension-cancel',
};

/** 可编辑控件（INPUT/TEXTAREA/SELECT/contentEditable）。 */
function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement
    && (target.isContentEditable
      || target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT');
}

/** 交互控件（按钮/菜单项/下拉/链接…，含本对话框两个按钮）。 */
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="tab"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="searchbox"]',
].join(', ');

/** Enter 聚焦交互控件时必须交给控件自身/浏览器默认激活（不得偷换成提交）。 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(INTERACTIVE_SELECTOR) !== null;
}

/**
 * 可见的打开菜单/弹出层：Escape 先让浮层自行收合，不抢它的取消语义。
 * 只认实际可见的节点（`getClientRects` 为空 = display:none/未布局）。
 */
function hasOpenMenuOrPopover(): boolean {
  const candidates = document.querySelectorAll<HTMLElement>(
    '[role="menu"], [role="listbox"], [role="combobox"][aria-expanded="true"], [aria-haspopup][aria-expanded="true"]',
  );
  for (const candidate of candidates) {
    if (candidate.getClientRects().length > 0 && getComputedStyle(candidate).visibility !== 'hidden')
      return true;
  }
  return false;
}

/**
 * 2026-11-15 E5：约束引用到的草图实体 id（悬停 glyph 高亮联动）。
 * - 数字引用（旧形态）= 实体 id；带 `entity` 的对象引用（start/end/center/
 *   point/handle）= 该实体 id；
 * - `{origin:true}`（原点）与无法识别的非实体引用忽略；
 * - 去重后升序（调用方按数组内容判变化，顺序必须稳定）。
 */
export function constraintEntityIds(constraint: SketchConstraintDto): number[] {
  const refs = Array.isArray(constraint.refs) ? constraint.refs : [];
  const ids = new Set<number>();
  for (const ref of refs) {
    if (typeof ref === 'number') {
      if (Number.isFinite(ref))
        ids.add(ref);
      continue;
    }
    if (ref && typeof ref === 'object' && 'entity' in ref) {
      const entity = (ref as { entity?: unknown }).entity;
      if (typeof entity === 'number' && Number.isFinite(entity))
        ids.add(entity);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

export function SketchDimensionEditor({
  viewport,
  annotations,
  glyphs,
  constraints,
  canEdit = true,
  onCommit,
  onUnsupported,
  selectedConstraintId = null,
  onSelectConstraint,
  onDeleteConstraint,
  overlayHitTestRef,
  dimensionLabelHitTestRef,
  onGlyphHover,
}: SketchDimensionEditorProps): React.JSX.Element | null {
  const [viewVersion, setViewVersion] = React.useState(0);
  const [editor, setEditor] = React.useState<EditorState | null>(null);
  /** 拖拽后的可见对话框 client 位置（null = 从未拖动，使用锚点默认布局）。 */
  const [dragPosition, setDragPosition] = React.useState<{ left: number; top: number } | null>(null);
  const [failed, setFailed] = React.useState(false);
  /** 提交中：确认/取消按钮置灰（committingRef 是同一守卫的同步镜像）。 */
  const [committing, setCommitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const committingRef = React.useRef(false);

  const labels = React.useMemo(
    () => (viewport ? sketchDimensionLabels(layoutSketchDimensions(annotations, viewport)) : []),
    // viewVersion：相机变化后标签屏幕位置重算（marker/e2e 观测面）。
    [annotations, viewport, viewVersion],
  );
  const glyphLayouts = React.useMemo(
    () => (viewport && glyphs ? layoutSketchConstraintGlyphs(glyphs, viewport) : []),
    [glyphs, viewport, viewVersion],
  );

  const labelsRef = React.useRef(labels);
  labelsRef.current = labels;
  const glyphLayoutsRef = React.useRef(glyphLayouts);
  glyphLayoutsRef.current = glyphLayouts;

  // 覆盖层命中注册：实体拾取层在 glyph/标签命中时让位（不拾取线条、不清选择）。
  React.useEffect(() => {
    if (!overlayHitTestRef)
      return;
    overlayHitTestRef.current = (point) =>
      hitTestSketchDimensionLabel(labelsRef.current, point) !== null
      || hitTestSketchConstraintGlyph(glyphLayoutsRef.current, point) !== null;
    return () => {
      if (overlayHitTestRef.current)
        overlayHitTestRef.current = null;
    };
  }, [overlayHitTestRef, labels, glyphLayouts]);

  // W20：尺寸标签命中通道（供实体拾取层打开尺寸右键菜单）。与覆盖层命中
  // 同一生命周期：标签重算即重建；卸载/依赖变化清空，避免命中过期坐标。
  // 只返回约束 id，不改变既有 overlayHitTestRef 的布尔契约。
  React.useEffect(() => {
    if (!dimensionLabelHitTestRef)
      return;
    dimensionLabelHitTestRef.current = (point) => {
      const label = hitTestSketchDimensionLabel(labelsRef.current, point);
      return label ? constraintIdFromDimensionLabel(label.id) : null;
    };
    return () => {
      if (dimensionLabelHitTestRef.current)
        dimensionLabelHitTestRef.current = null;
    };
  }, [dimensionLabelHitTestRef, labels]);
  const constraintsRef = React.useRef(constraints);
  constraintsRef.current = constraints;
  const canEditRef = React.useRef(canEdit);
  canEditRef.current = canEdit;
  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;
  const onUnsupportedRef = React.useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;
  const editorRef = React.useRef(editor);
  editorRef.current = editor;
  const selectedRef = React.useRef(selectedConstraintId);
  selectedRef.current = selectedConstraintId;
  const onSelectConstraintRef = React.useRef(onSelectConstraint);
  onSelectConstraintRef.current = onSelectConstraint;
  const onDeleteConstraintRef = React.useRef(onDeleteConstraint);
  onDeleteConstraintRef.current = onDeleteConstraint;
  const onGlyphHoverRef = React.useRef(onGlyphHover);
  onGlyphHoverRef.current = onGlyphHover;
  /** 上一次发出的悬停实体集（数组内容判变化，避免 mousemove 高频重渲染）。 */
  const glyphHoverRef = React.useRef<readonly number[]>([]);

  // 相机变化 → 重算标签（标记位置可用）。
  React.useEffect(() => {
    if (!viewport?.onViewChanged)
      return;
    const listener = (): void => { setViewVersion((version) => version + 1); };
    viewport.onViewChanged.addListener(listener);
    return () => {
      viewport.onViewChanged.removeListener(listener);
    };
  }, [viewport]);

  // 双击数值标签（window capture：命中标签时阻断 iTwin 的双击默认行为）。
  React.useEffect(() => {
    const canvas = viewport?.canvas;
    if (!viewport || !canvas)
      return;
    const onDoubleClick = (event: MouseEvent): void => {
      if (!canEditRef.current || editorRef.current)
        return;
      const target = event.target;
      if (target instanceof HTMLElement
        && (target.isContentEditable || target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'))
        return;
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const label = hitTestSketchDimensionLabel(labelsRef.current, point);
      if (!label)
        return;
      const constraintId = constraintIdFromDimensionLabel(label.id);
      if (constraintId === null)
        return;
      const constraint = constraintsRef.current?.find((candidate) => candidate.id === constraintId);
      if (!constraint)
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!EDITABLE_CONSTRAINT_KINDS.has(constraint.kind)) {
        onUnsupportedRef.current?.(constraint.kind);
        return;
      }
      setFailed(false);
      onSelectConstraintRef.current?.(constraintId);
      const placement = computeDimensionEditorPlacement({
        labelRect: label.rect,
        canvasRect: rect,
        click: { x: event.clientX, y: event.clientY },
      });
      // 每次新开对话框都复位拖拽位移（live：重新打开回到锚点默认位置）。
      setDragPosition(null);
      const initialValue = formatConstraintEditorValue(constraint);
      setEditor({
        constraintId,
        kind: constraint.kind,
        value: initialValue,
        initialValue,
        rawValue: constraint.value,
        left: placement.left,
        top: placement.top,
      });
    };
    window.addEventListener('dblclick', onDoubleClick, true);
    return () => window.removeEventListener('dblclick', onDoubleClick, true);
  }, [viewport]);

  // 2026-11-15 E5（Onshape live）：悬停非尺寸约束 glyph → 高亮其引用实体。
  // 仅在可编辑时监听；命中 glyph 时按约束 id 反查约束并收集实体 id（升序去重），
  // 与上次相同则不回调（mousemove 高频不驱动重渲染）；未命中/离开画布回调 []。
  // 本层只做显示联动，不拦截事件、不改变选择。
  React.useEffect(() => {
    const canvas = viewport?.canvas;
    // onGlyphHover 缺省（草图工具激活）时不监听/不命中；依赖变化会先跑上一轮
    // cleanup 清掉残留高亮。
    if (!viewport || !canvas || !canEdit || !onGlyphHover)
      return;
    const emit = (entityIds: number[]): void => {
      const previous = glyphHoverRef.current;
      if (previous.length === entityIds.length && previous.every((id, index) => id === entityIds[index]))
        return;
      glyphHoverRef.current = entityIds;
      onGlyphHoverRef.current?.(entityIds);
    };
    const onMouseMove = (event: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const glyph = hitTestSketchConstraintGlyph(glyphLayoutsRef.current, point);
      if (!glyph) {
        emit([]);
        return;
      }
      const constraintId = constraintIdFromGlyphId(glyph.annotation.id);
      const constraint = constraintId === null
        ? undefined
        : constraintsRef.current?.find((candidate) => candidate.id === constraintId);
      emit(constraint ? constraintEntityIds(constraint) : []);
    };
    const onMouseLeave = (): void => { emit([]); };
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      // 卸载/失活时清掉残留高亮（canEdit 翻转 → 本 effect 重订阅）；同时
      // 复位上次发出集，避免新回调下同一 glyph 不再触发。
      const had = glyphHoverRef.current.length > 0;
      glyphHoverRef.current = [];
      if (had)
        onGlyphHoverRef.current?.([]);
    };
    // onGlyphHover 身份变化（工具激活/退出切换回调与 undefined）→ 重订阅并
    // 复位上次发出集，避免「工具期间悬停记录 → 退出后同 glyph 不再回调」。
  }, [viewport, canEdit, onGlyphHover]);

  // 相机变化/约束集变化时清空悬停高亮：glyph 位置随相机/几何移动，旧高亮
  // 会悬在错误实体上（mousemove 才会重建）。
  React.useEffect(() => {
    const clear = (): void => {
      if (glyphHoverRef.current.length === 0)
        return;
      glyphHoverRef.current = [];
      onGlyphHoverRef.current?.([]);
    };
    const viewChanged = viewport?.onViewChanged;
    viewChanged?.addListener(clear);
    return () => {
      viewChanged?.removeListener(clear);
    };
  }, [viewport]);
  React.useEffect(() => {
    if (glyphHoverRef.current.length === 0)
      return;
    glyphHoverRef.current = [];
    onGlyphHoverRef.current?.([]);
  }, [constraints]);

  // 单击尺寸数值 = 选中（Onshape）；点击画布空白清除约束选择。Delete/Backspace
  // 删除选中尺寸（宿主 updateSketch 移除该约束）。输入框聚焦时不吃键。
  React.useEffect(() => {
    const canvas = viewport?.canvas;
    if (!viewport || !canvas)
      return;
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement))
        return false;
      if (target.isContentEditable)
        return true;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
    };
    // 覆盖层命中时把焦点从对话框控件（复选框/输入框）收回画布语境：否则
    // preventDefault 阻止默认聚焦，后续 Delete 会被「输入框不吃键」守卫吞掉。
    const blurActiveInput = (): void => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== canvas && active !== document.body)
        active.blur();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || editorRef.current)
        return;
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const inside = point.x >= 0 && point.y >= 0 && point.x <= rect.width && point.y <= rect.height;
      if (!inside)
        return;
      const label = hitTestSketchDimensionLabel(labelsRef.current, point);
      if (!label) {
        // 非尺寸约束 glyph：单击选中（与尺寸标签同一选择权威）。
        const glyph = hitTestSketchConstraintGlyph(glyphLayoutsRef.current, point);
        if (glyph) {
          const glyphConstraintId = constraintIdFromGlyphId(glyph.annotation.id);
          if (glyphConstraintId !== null) {
            event.preventDefault();
            event.stopPropagation();
            blurActiveInput();
            onSelectConstraintRef.current?.(glyphConstraintId);
            return;
          }
        }
        if (selectedRef.current !== null)
          onSelectConstraintRef.current?.(null);
        return;
      }
      const constraintId = constraintIdFromDimensionLabel(label.id);
      if (constraintId === null)
        return;
      event.preventDefault();
      event.stopPropagation();
      blurActiveInput();
      onSelectConstraintRef.current?.(constraintId);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace')
        return;
      if (editorRef.current || selectedRef.current === null || isEditableTarget(event.target))
        return;
      const constraintId = selectedRef.current;
      event.preventDefault();
      event.stopPropagation();
      void onDeleteConstraintRef.current?.(constraintId);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [viewport]);

  // 打开时聚焦并整段选中当前值（live 行为）；只在「打开」这一次执行——不能
  // 依赖 editor 对象本身（每次 onChange 都是新引用），否则每输入一个字符都会
  // 重新全选，多字符值无法键入。
  const editorConstraintId = editor?.constraintId ?? null;
  React.useEffect(() => {
    if (editorConstraintId === null)
      return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editorConstraintId]);

  /** 取消：关闭对话框并丢弃输入（与 Escape 同语义，不写模型）。 */
  const cancel = React.useCallback((): void => {
    if (committingRef.current)
      return;
    setEditor(null);
    setFailed(false);
  }, []);

  const commit = React.useCallback(async (): Promise<void> => {
    const current = editorRef.current;
    if (!current || committingRef.current)
      return;
    const value = parseConstraintEditorValue(current.kind, current.value);
    if (value === undefined) {
      setFailed(true);
      return;
    }
    committingRef.current = true;
    setCommitting(true);
    try {
      const result = await onCommitRef.current(current.constraintId, value);
      if (result && !result.ok) {
        setFailed(true);
        return;
      }
      setEditor(null);
      setFailed(false);
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
  }, []);

  // 2026-11-16 live：点击画布/其它 UI 不关闭对话框（旧 blur-cancel 已移除），
  // 输入失焦后 Enter/Escape 仍须生效 → 窗口捕获段监听。作用域纪律（评审复核）：
  // - Enter 只在本对话框语境（画布/body）提交；输入框自身处理；按钮/菜单项等
  //   交互控件与外层编辑框一律放行（Enter 聚焦取消按钮=取消，不得偷换成提交）。
  // - Escape 只在输入框（自身处理）/本对话框控件/画布/body 上取消；可见菜单或
  //   弹层打开、焦点在外部可编辑控件时放行，避免吞掉别处的取消语义。
  // - 输入法合成（isComposing）期间不拦任何键。
  // 捕获段先于 React 合成事件触发（defaultPrevented 仍为 false），故按 target
  // 身份跳过输入框，避免双触发；Escape 命中时拦断传播（同输入框内），否则会
  // 连带退出草图模式。
  const editorOpen = editor !== null;

  React.useEffect(() => {
    if (!editorOpen)
      return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.defaultPrevented)
        return;
      if (event.key !== 'Enter' && event.key !== 'Escape')
        return;
      const active = event.target instanceof HTMLElement
        ? event.target
        : (document.activeElement instanceof HTMLElement ? document.activeElement : null);

      if (event.key === 'Enter') {
        if (active === inputRef.current)
          return;
        if (isEditableTarget(active) || isInteractiveTarget(active))
          return;
        if (hasOpenMenuOrPopover())
          return;
        event.preventDefault();
        void commit();
        return;
      }

      if (active === inputRef.current)
        return;
      if (hasOpenMenuOrPopover())
        return;
      const inDialog = active !== null && dialogRef.current?.contains(active) === true;
      const onCanvasOrBody = active === null || active === document.body
        || active === document.documentElement || active === viewport?.canvas;
      if (!inDialog && !onCanvasOrBody)
        return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [editorOpen, commit, cancel, viewport]);

  // 视口尺寸变化 → 重算对话框钳制位置（编辑器打开期间）。
  React.useEffect(() => {
    if (!editorOpen)
      return;
    const onResize = (): void => { setViewVersion((version) => version + 1); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [editorOpen]);

  // 可见对话框（209×47）定位：锚点仍是输入框左缘 + 垂直中心，只做视口钳制。
  const viewportSize = {
    width: typeof window === 'undefined'
      ? DIMENSION_EDITOR_DIALOG_WIDTH + DIMENSION_EDITOR_VIEWPORT_MARGIN * 2
      : window.innerWidth,
    height: typeof window === 'undefined'
      ? DIMENSION_EDITOR_DIALOG_HEIGHT + DIMENSION_EDITOR_VIEWPORT_MARGIN * 2
      : window.innerHeight,
  };
  const dialogPlacement = editor
    ? layoutDimensionEditorDialog({
        anchor: { x: editor.left, y: editor.top },
        viewport: viewportSize,
      })
    : null;
  /**
   * 共享外壳按**显示单位**做方向键步进：角度契约值是弧度，先换算为度
   *（与 `formatConstraintEditorValue` 的初值口径一致；W18 live）。
   */
  const editorRawValue = editor?.kind === 'angle' && editor.rawValue !== undefined
    ? Math.abs(editor.rawValue) * 180 / Math.PI
    : editor?.rawValue;
  /** 拖动后的可见位置每次都按拖拽起点 + 视口 4px 边距重新钳制。 */
  const visibleDialogPosition = dialogPlacement
    ? clampDimensionEditorPosition(
        dragPosition ?? { left: dialogPlacement.left, top: dialogPlacement.top },
        viewportSize,
      )
    : null;
  /** 相对锚点包装元素的 CSS 偏移（包装元素 translateY(-50%)：client top = top − 13）。 */
  const dialogOffset = visibleDialogPosition && editor
    ? {
        left: visibleDialogPosition.left - editor.left,
        top: visibleDialogPosition.top - (editor.top - DIMENSION_EDITOR_INPUT_HEIGHT / 2),
      }
    : null;

  if (labels.length === 0 && glyphLayouts.length === 0 && !editor)
    return null;

  return (
    <React.Fragment>
      {glyphLayouts.map((item) => {
        const constraintId = constraintIdFromGlyphId(item.annotation.id);
        const selected = constraintId !== null && constraintId === selectedConstraintId;
        const width = Math.max(1, item.rect.right - item.rect.left);
        const height = Math.max(1, item.rect.bottom - item.rect.top);
        return (
          <React.Fragment key={item.annotation.id}>
            <span
              data-testid="sketch-constraint-glyph"
              data-constraint-id={constraintId ?? ''}
              data-kind={item.annotation.kind}
              data-center={`${item.center.x},${item.center.y}`}
              data-selected={selected ? 'true' : 'false'}
              className="part-studio-dimension-marker"
              aria-hidden="true"
            />
            {selected && (
              <span
                className="part-studio-constraint-glyph-highlight"
                style={{
                  left: item.rect.left,
                  top: item.rect.top,
                  width,
                  height,
                }}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
      {labels.map((label) => {
        const constraintId = constraintIdFromDimensionLabel(label.id);
        const selected = constraintId !== null && constraintId === selectedConstraintId;
        return (
          <React.Fragment key={label.id}>
            <span
              data-testid="sketch-dimension-label"
              data-constraint-id={constraintId ?? ''}
              data-center={`${label.center.x},${label.center.y}`}
              data-selected={selected ? 'true' : 'false'}
              className="part-studio-dimension-marker"
              aria-hidden="true"
            />
            {selected && (
              <span
                className="part-studio-dimension-highlight"
                style={{
                  left: label.rect.left,
                  top: label.rect.top,
                  width: Math.max(1, label.rect.right - label.rect.left),
                  height: Math.max(1, label.rect.bottom - label.rect.top),
                }}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
      {editor && dialogPlacement && visibleDialogPosition && dialogOffset && (
        <div
          className="part-studio-dimension-editor-wrap"
          style={{ left: editor.left, top: editor.top }}
        >
          {/* live 2026-11-16 dimension-dialog：拖拽条 209×13 + 面板 209×34。
              包装元素 100×26 + translateY(-50%)，输入框垂直中心 = 锚点 top；
              对话框默认偏移 -21/-13（面板向输入行左侧扩展 21px，拖拽条在输入
              行上方），边缘与拖动位置由纯函数钳制。外壳与放置值弹层共用
              `SketchDimensionDialog`（W17b），仅 testid 面不同。 */}
          <SketchDimensionDialog
            testIds={DIMENSION_EDITOR_DIALOG_TEST_IDS}
            kind={editor.kind}
            value={editor.value}
            initialValue={editor.initialValue}
            rawValue={editorRawValue}
            unit={dimensionEditorUnit(editor.kind)}
            error={failed}
            busy={committing}
            offset={dialogOffset}
            dragOrigin={visibleDialogPosition}
            onDragPosition={setDragPosition}
            onValueChange={(value) => {
              setEditor((current) => (current ? { ...current, value } : current));
              setFailed(false);
            }}
            inputRef={inputRef}
            dialogRef={dialogRef}
            onConfirm={() => { void commit(); }}
            onCancel={cancel}
          />
        </div>
      )}
    </React.Fragment>
  );
}
