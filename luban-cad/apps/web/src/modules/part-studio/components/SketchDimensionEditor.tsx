/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图尺寸数值内联编辑（ADR-0018 S1e，2026-11-12 Onshape 对拍）：
 * 草图编辑态（无绘制工具激活）双击视口尺寸数值 → 原位输入框（当前值全选），
 * Enter 提交 `updateSketchConstraint`、Escape/点击别处取消；后端拒收（冲突/
 * 非尺寸约束）保留输入框并标注错误。标签命中区由 viewer 布局纯函数给出
 *（与绘制同源，不复制堆叠避让逻辑）。
 *
 * 仅 distance/radius/diameter/length 可改值（后端 updateSketchConstraint 白名单）；
 * 角度等双击时诚实提示未支持，不弹假编辑框。
 *
 * 2026-11-12（Onshape 约束 glyph 对拍）：非尺寸约束 glyph（⊥/∥/=/—/|/中点/
 * 重合/镜像…）同样可单击选中、Delete 删除——命中区由 viewer 同一布局纯函数
 * 给出，选中高亮浅蓝（live 截图口径），删除走宿主 updateSketch 移除该约束。
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
import './SketchDimensionEditor.css';

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
}

interface EditorState {
  constraintId: number;
  value: string;
  clientX: number;
  clientY: number;
}

/** 后端 updateSketchConstraint 白名单（FeatureService.precomputeSketchConstraint）。 */
const EDITABLE_CONSTRAINT_KINDS = new Set<SketchConstraintDto['kind']>(['distance', 'radius', 'diameter', 'length']);

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
}: SketchDimensionEditorProps): React.JSX.Element | null {
  const [viewVersion, setViewVersion] = React.useState(0);
  const [editor, setEditor] = React.useState<EditorState | null>(null);
  const [failed, setFailed] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
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
      setEditor({
        constraintId,
        value: constraint.value !== undefined ? String(constraint.value) : '',
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };
    window.addEventListener('dblclick', onDoubleClick, true);
    return () => window.removeEventListener('dblclick', onDoubleClick, true);
  }, [viewport]);

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

  React.useEffect(() => {
    if (!editor)
      return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editor]);

  const commit = async (): Promise<void> => {
    const current = editorRef.current;
    if (!current)
      return;
    const value = Number(current.value.trim());
    if (!Number.isFinite(value) || value <= 0) {
      setFailed(true);
      return;
    }
    committingRef.current = true;
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
    }
  };

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
      {editor && (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          data-testid="sketch-dimension-input"
          data-error={failed ? 'true' : 'false'}
          className="part-studio-dimension-editor"
          style={{ left: editor.clientX, top: editor.clientY }}
          value={editor.value}
          onChange={(event) => {
            setEditor({ ...editor, value: event.target.value });
            setFailed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setEditor(null);
              setFailed(false);
            }
          }}
          onBlur={() => {
            // Enter 提交过程中的失焦不打断；点击别处取消（不静默改值）。
            if (!committingRef.current)
              setEditor(null);
          }}
        />
      )}
    </React.Fragment>
  );
}
