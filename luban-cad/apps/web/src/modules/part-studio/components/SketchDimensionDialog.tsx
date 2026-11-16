/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape `dimension-dialog` 共享展示外壳（2026-11-16 W17b live 对拍）：
 * 草图尺寸的**两个**表面——双击内联编辑（SketchDimensionEditor）与工具放置
 * 值弹层（SketchValuePopup）——在 live 是同一个组件；本文件是唯一实现，禁止
 * 第三套视觉变体（偏移值弹层是产品扩展，保留自己的旧外观，不走本外壳）。
 *
 * 结构（live 2026-11-16：可见对话框 209×47）：上方 209×13 拖拽条（白底 +
 * 1px #cccccc、居中三枚 7×7 空心方握把，仅此条可拖）；面板 209×34 白底
 * 0 圆角、阴影 0 5px 10px rgba(0,0,0,0.2)、下内边距 5px；面板自左向右：
 * 禁用展开器 20×20（#d7d7d7 chevron，纯装饰）、输入 100×26（透明无边框、
 * 常显 inset 1px #1651b0 下划线、左内边距 3px）、只读单位后缀、禁用参数状态
 * 切换 20×20（hole-tolerance-precision，rgba(16,16,16,0.3)，不实现菜单）、
 * 按钮组 52×28（✓ 实心 #009400 白勾 / ✗ 白底 1px #cccccc 红 X、22×22、
 * radius 4、4px 间距）。
 *
 * 行为：仅拖拽条可拖（pointerdown 记录起点，move/up 由 window 捕获段监听——
 * 2026-11-16 W17 真栈实测 setPointerCapture 后 React 合成 onPointerMove 不再
 * 派发）；输入框无选区时 ArrowUp/ArrowDown 走 `stepConstraintEditorValue`
 *（长度类 ±1 mm / 角度 ±1°，rawValue 由宿主按显示单位传入；有选区/IME
 * 合成不步进）；Enter/✓ 提交、Escape/✗ 取消（语义由宿主回调决定，外壳不
 * 直接触碰模型）。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SketchConstraintDto } from '@luban-cad/shared';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import { stepConstraintEditorValue } from '../internal/sketch-dimension-value.js';
import './SketchDimensionEditor.css';

/** 可见尺寸对话框宽度（live：拖拽条/面板 209px）。 */
export const DIMENSION_EDITOR_DIALOG_WIDTH = 209;
/** 拖拽条高度（live 13px）。 */
export const DIMENSION_EDITOR_DRAGBAR_HEIGHT = 13;
/** 面板高度（live 34px）。 */
export const DIMENSION_EDITOR_PANEL_HEIGHT = 34;
/** 可见对话框总高 = 拖拽条 + 面板（live 47px）。 */
export const DIMENSION_EDITOR_DIALOG_HEIGHT = DIMENSION_EDITOR_DRAGBAR_HEIGHT + DIMENSION_EDITOR_PANEL_HEIGHT;

/** 两个表面的 data-testid 面（e2e/单测观测面；外壳不发明产品语义）。 */
export interface SketchDimensionDialogTestIds {
  /** 外壳根元素（可见对话框本体）。 */
  dialog: string;
  dragbar: string;
  input: string;
  unit: string;
  expander: string;
  stateToggle: string;
  confirm: string;
  cancel: string;
  /** 错误提示（仅放置弹层用；缺省不渲染错误节点）。 */
  error?: string;
}

/** 拖拽条拖动会话（起点 client 坐标 + 起点可见对话框位置）。 */
interface DialogDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
}

export interface SketchDimensionDialogProps {
  testIds: SketchDimensionDialogTestIds;
  /** 尺寸种类（决定步进资格；单位文本由宿主给出）。 */
  kind: SketchConstraintDto['kind'];
  /** 当前输入文本（受控）。 */
  value: string;
  /** 打开时的初始格式化文本（方向键「未编辑」基线）。 */
  initialValue: string;
  /** 原始值（未编辑时步进基线，保留全精度）。 */
  rawValue?: number;
  /** 只读单位后缀文本（mm / deg；产品口径由宿主决定）。 */
  unit: string;
  /** 错误态：只把下划线转红。 */
  error?: boolean;
  /** 错误文案（放置弹层就地提示；编辑器缺省不渲染）。 */
  errorMessage?: string;
  /** 提交中：两枚按钮禁用。 */
  busy?: boolean;
  /** 可见对话框 CSS 偏移（宿主容器坐标系）。 */
  offset: { left: number; top: number };
  /** 拖动会话的起点（同一坐标系；仅拖拽条可拖）。 */
  dragOrigin: { left: number; top: number };
  /** 拖动位移回调（宿主按容器/视口钳制后回传下一帧 offset）。 */
  onDragPosition: (position: { left: number; top: number }) => void;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  dialogRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** 输入框占位（放置弹层几何不可测时保留旧占位文案）。 */
  inputPlaceholder?: string;
  inputAriaLabel?: string;
  /** 外壳根元素的 aria/观测属性（放置弹层保留 role=dialog + data-kind）。 */
  rootRole?: 'dialog';
  rootAriaLabel?: string;
  rootDataKind?: string;
  /** 堆叠层级（放置弹层绝对定位在画布容器内时高于草图覆盖层）。 */
  zIndex?: number;
}

export function SketchDimensionDialog({
  testIds,
  kind,
  value,
  initialValue,
  rawValue,
  unit,
  error = false,
  errorMessage,
  busy = false,
  offset,
  dragOrigin,
  onDragPosition,
  onValueChange,
  onConfirm,
  onCancel,
  inputRef,
  dialogRef,
  inputPlaceholder,
  inputAriaLabel,
  rootRole,
  rootAriaLabel,
  rootDataKind,
  zIndex,
}: SketchDimensionDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = React.useState(false);
  const dragStateRef = React.useRef<DialogDragState | null>(null);
  const dragOriginRef = React.useRef(dragOrigin);
  dragOriginRef.current = dragOrigin;
  const onDragPositionRef = React.useRef(onDragPosition);
  onDragPositionRef.current = onDragPosition;

  // 拖拽条（仅 13px 条可拖；面板不拖）：pointerdown 记录起点，随后的
  // move/up 由 window 捕获段监听处理（以「起点 + 总位移」计算，非增量——
  // 拖到边缘后回拖立即响应；位置由宿主渲染时按视口钳制）。鼠标左键才启动。
  //
  // 2026-11-16 真栈实测：setPointerCapture 之后浏览器已把 pointermove 回投到
  // 拖拽条（window 捕获段可见 target=拖拽条），但 React 合成事件链不再派发
  // 该节点的 onPointerMove（drag handler 一次都不触发）。改为拖动会话期间
  // window 捕获段监听，指针移出 13px 拖拽条后仍持续跟手；组件卸载时由
  // effect cleanup 收口。
  const startDialogDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0)
      return;
    const origin = dragOriginRef.current;
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: origin.left,
      startTop: origin.top,
    };
    // 指针捕获保持事件目标稳定（触屏/笔走隐式捕获）；移动由 window 捕获段
    // 监听消费（React 合成 onPointerMove 在捕获后不派发，真栈实测）。
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragActive(true);
  }, []);

  React.useEffect(() => {
    if (!dragActive)
      return;
    const end = (): void => {
      dragStateRef.current = null;
      setDragActive(false);
    };
    const onMove = (event: PointerEvent): void => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId)
        return;
      // 丢失 pointerup（窗口失焦/OS 级释放）时按钮已抬起：结束会话，避免
      // 之后的悬停移动拖动对话框。
      if (event.buttons === 0) {
        end();
        return;
      }
      event.stopPropagation();
      onDragPositionRef.current({
        left: drag.startLeft + (event.clientX - drag.startClientX),
        top: drag.startTop + (event.clientY - drag.startClientY),
      });
    };
    const onEnd = (event: PointerEvent): void => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId)
        return;
      end();
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
      window.removeEventListener('blur', end);
    };
  }, [dragActive]);

  return (
    <div
      ref={dialogRef}
      className="part-studio-dimension-editor-dialog"
      data-testid={testIds.dialog}
      data-kind={rootDataKind}
      role={rootRole}
      aria-label={rootAriaLabel}
      style={zIndex === undefined ? { left: offset.left, top: offset.top } : { left: offset.left, top: offset.top, zIndex }}
    >
      <div
        className="part-studio-dimension-editor-dragbar"
        data-testid={testIds.dragbar}
        aria-hidden="true"
        onPointerDown={startDialogDrag}
      >
        {/* live 握把：三枚 7×7 空心方（1px #333 描边、透明填充、1px 间距）。 */}
        <span className="part-studio-dimension-editor-grip" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="part-studio-dimension-editor-panel">
        {/* 禁用展开器（live node-expander-disabled pe-none）：纯装饰，无交互。 */}
        <span
          className="part-studio-dimension-editor-expander"
          data-testid={testIds.expander}
          aria-hidden="true"
        >
          <OnshapeIcon name="collapsed" size={12} />
        </span>
        <span className="part-studio-dimension-editor-field">
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            data-testid={testIds.input}
            data-error={error ? 'true' : 'false'}
            className="part-studio-dimension-editor"
            value={value}
            placeholder={inputPlaceholder}
            aria-label={inputAriaLabel}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                // 输入法合成期间方向键用于候选导航，不步进。
                if (event.nativeEvent.isComposing)
                  return;
                // live：有选区（刚打开时全选）不步进——不拦默认行为，由
                // 浏览器折叠选区；光标态才 ±1（长度 mm / 角度度，W18）。
                const input = event.currentTarget;
                const { selectionStart, selectionEnd } = input;
                if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd)
                  return;
                const next = stepConstraintEditorValue({
                  kind,
                  text: input.value,
                  initialText: initialValue,
                  rawValue,
                  direction: event.key === 'ArrowUp' ? 1 : -1,
                });
                if (next === undefined)
                  return;
                event.preventDefault();
                onValueChange(next);
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                onConfirm();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              }
            }}
          />
          <span
            className="part-studio-dimension-editor-unit"
            data-testid={testIds.unit}
            aria-hidden="true"
          >
            {unit}
          </span>
        </span>
        {/* 禁用参数状态切换（live「dropdown」）：普通数值尺寸不可用。 */}
        <button
          type="button"
          className="part-studio-dimension-editor-state-toggle"
          data-testid={testIds.stateToggle}
          disabled
          aria-hidden="true"
          tabIndex={-1}
        >
          <OnshapeIcon name="hole-tolerance-precision" size={20} />
        </button>
        <span className="part-studio-dimension-editor-buttons">
          <button
            type="button"
            className="part-studio-dimension-editor-confirm"
            aria-label={t('partStudio.sketch.panel.confirm')}
            title={t('partStudio.sketch.panel.confirm')}
            disabled={busy}
            data-testid={testIds.confirm}
            // 按钮按下不夺走输入框焦点（live：对话框保持活动）。
            onMouseDown={(event) => event.preventDefault()}
            onClick={onConfirm}
          >
            <OnshapeIcon name="ok-button" size={14} />
          </button>
          <button
            type="button"
            className="part-studio-dimension-editor-cancel"
            aria-label={t('partStudio.sketch.panel.cancel')}
            title={t('partStudio.sketch.panel.cancel')}
            disabled={busy}
            data-testid={testIds.cancel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCancel}
          >
            <OnshapeIcon name="cancel-button" size={14} />
          </button>
        </span>
      </div>
      {errorMessage !== undefined && (
        <span
          className="part-studio-sketch-value-popup__error"
          role="alert"
          data-testid={testIds.error}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}
