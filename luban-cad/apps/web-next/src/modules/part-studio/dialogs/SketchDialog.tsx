/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SketchDialog（M3 Task 6）：草图对话框（对齐 os-30）——
 * - 非模态内联面板（同 Extrude 对话框位：画布区左上角，aria-modal=false +
 *   无 backdrop）；
 * - 草图平面选择：下拉（缺省基准面 上视/前视/右视 + 占位项）+ 快速拾取
 *   （useCanvasSelection 主选择成动态选项并选中）；
 * - 四开关勾选组（os-30）：禁用压印/显示约束/显示表达式/显示错误——默认
 *   仅「显示错误」勾选；
 * - ✓确认/✗取消 + 历史时钟 + ? 帮助（展开文案）。
 *
 * store 联动（os-30 草图模式变身的数据源）：✓ → enterSketch（sketchId 缺省
 * 'sketch-active'——宿主未注入时的壳期寻址）+ onConfirm 载荷；✗ → exitSketch
 * + onCancel。历史按钮壳期未接线（console.warn，模块惯例）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SvgCheckmark, SvgClock, SvgClose } from '@itwin/itwinui-icons-react';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import './SketchDialog.css';

/** 平面选项（下拉项寻址单位）。 */
export interface SketchPlaneOption {
  id: string;
  label: string;
}

/** 确认载荷：草图对话框全量本地态回传（新建草图 RPC 接线口）。 */
export interface SketchDialogResult {
  plane: string;
  disableImprint: boolean;
  showConstraints: boolean;
  showExpressions: boolean;
  showErrors: boolean;
}

export interface SketchDialogProps {
  /** 草图名（标题=对话框可访问名，os-30「草图 N」；缺省「草图」）。 */
  sketchName?: string;
  /** 活动草图 id（✓确认 enterSketch 的寻址；缺省 'sketch-active'）。 */
  sketchId?: string;
  /** 平面下拉选项（缺省=缺省基准面 上视/前视/右视）。 */
  planes?: readonly SketchPlaneOption[];
  /** ✓确认出口（enterSketch 之后调用）。 */
  onConfirm?: (result: SketchDialogResult) => void;
  /** ✗取消出口（exitSketch 之后调用）。 */
  onCancel?: () => void;
  /** 历史时钟点击（壳期未接线缺省 console.warn）。 */
  onHistory?: () => void;
}

/** 缺省基准面 id（datun plane 寻址；RPC 接线后由真实平面数据替换）。 */
const DEFAULT_PLANES: readonly SketchPlaneOption[] = [
  { id: 'top', label: 'placeholder:top' },
  { id: 'front', label: 'placeholder:front' },
  { id: 'right', label: 'placeholder:right' },
];

/**
 * 草图对话框（os-30）。✓确认进草图模式（store.sketch 驱动 ribbon 变身/
 * 栅格约束覆盖层/树红显——见 Ribbon.tsx/PartStudioCanvas.tsx/FeatureTree.tsx）。
 */
export function SketchDialog({
  sketchName,
  sketchId,
  planes,
  onConfirm,
  onCancel,
  onHistory,
}: SketchDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { primary } = useCanvasSelection();
  const enterSketch = usePartStudioStore((s) => s.enterSketch);
  const exitSketch = usePartStudioStore((s) => s.exitSketch);

  // 平面选项：props 注入优先；缺省基准面 label 走词库（占位串在渲染前替换）。
  const planeOptions: readonly SketchPlaneOption[] = React.useMemo(
    () =>
      planes ??
      DEFAULT_PLANES.map((plane) => ({
        id: plane.id,
        label: t(`partStudio.sketchDialog.planes.${plane.id}`),
      })),
    [planes, t],
  );

  const [pickedPlanes, setPickedPlanes] = React.useState<SketchPlaneOption[]>([]);
  const [plane, setPlane] = React.useState('');
  const [disableImprint, setDisableImprint] = React.useState(false);
  const [showConstraints, setShowConstraints] = React.useState(false);
  const [showExpressions, setShowExpressions] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(true);
  const [helpOpen, setHelpOpen] = React.useState(false);

  // 快速拾取：画布主选择成动态平面选项并选中（label 缺省回退 id）。
  const handleFastPick = React.useCallback(() => {
    if (!primary) return;
    const picked: SketchPlaneOption = { id: primary.id, label: primary.label ?? primary.id };
    setPickedPlanes((prev) => (prev.some((option) => option.id === picked.id) ? prev : [...prev, picked]));
    setPlane(picked.id);
  }, [primary]);

  const handleHistory = React.useCallback(() => {
    if (onHistory) {
      onHistory();
    } else {
      console.warn('[part-studio] 草图历史（onHistory 未接线）');
    }
  }, [onHistory]);

  const handleConfirm = React.useCallback(() => {
    enterSketch(sketchId ?? 'sketch-active');
    onConfirm?.({
      plane,
      disableImprint,
      showConstraints,
      showExpressions,
      showErrors,
    });
  }, [enterSketch, sketchId, onConfirm, plane, disableImprint, showConstraints, showExpressions, showErrors]);

  const handleCancel = React.useCallback(() => {
    exitSketch();
    onCancel?.();
  }, [exitSketch, onCancel]);

  const allOptions = React.useMemo(
    () => [...planeOptions, ...pickedPlanes],
    [planeOptions, pickedPlanes],
  );

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={sketchName ?? t('partStudio.sketchDialog.defaultTitle')}
      className="part-studio-sketch-dialog"
      data-testid="part-studio-sketch-dialog"
    >
      {/* 顶置标题行：草图名 + ✓/✗ + 历史时钟 + ? 帮助（os-30）。 */}
      <header className="part-studio-sketch-dialog__header">
        <h2 className="part-studio-sketch-dialog__title">
          {sketchName ?? t('partStudio.sketchDialog.defaultTitle')}
        </h2>
        <div className="part-studio-sketch-dialog__header-actions">
          <button
            type="button"
            aria-label={t('partStudio.sketchDialog.confirm')}
            className="part-studio-sketch-dialog__confirm"
            onClick={handleConfirm}
          >
            <SvgCheckmark />
          </button>
          <button
            type="button"
            aria-label={t('partStudio.sketchDialog.cancel')}
            className="part-studio-sketch-dialog__cancel"
            onClick={handleCancel}
          >
            <SvgClose />
          </button>
          <button
            type="button"
            aria-label={t('partStudio.sketchDialog.history')}
            className="part-studio-sketch-dialog__history"
            onClick={handleHistory}
          >
            <SvgClock />
          </button>
          <button
            type="button"
            aria-label={t('partStudio.sketchDialog.help')}
            aria-expanded={helpOpen}
            className="part-studio-sketch-dialog__help"
            onClick={() => setHelpOpen((prev) => !prev)}
          >
            ?
          </button>
        </div>
      </header>

      {helpOpen && (
        <p role="note" className="part-studio-sketch-dialog__help-text">
          {t('partStudio.sketchDialog.helpText')}
        </p>
      )}

      <div className="part-studio-sketch-dialog__body">
        {/* 草图平面选择 + 快速拾取（os-30：蓝框 select + 快速拾取）。 */}
        <div className="part-studio-sketch-dialog__plane-row">
          <select
            aria-label={t('partStudio.sketchDialog.planeLabel')}
            className="part-studio-sketch-dialog__plane-select"
            value={plane}
            onChange={(event) => setPlane(event.target.value)}
          >
            <option value="" disabled>
              {t('partStudio.sketchDialog.planePlaceholder')}
            </option>
            {allOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="part-studio-sketch-dialog__fast-pick"
            onClick={handleFastPick}
          >
            {t('partStudio.sketchDialog.fastPick')}
          </button>
        </div>

        {/* 四开关勾选组（os-30：默认仅「显示错误」勾选）。 */}
        <div
          role="group"
          aria-label={t('partStudio.sketchDialog.optionsGroup')}
          className="part-studio-sketch-dialog__toggles"
        >
          <label className="part-studio-sketch-dialog__toggle">
            <input
              type="checkbox"
              checked={disableImprint}
              onChange={(event) => setDisableImprint(event.target.checked)}
            />
            <span>{t('partStudio.sketchDialog.toggles.disableImprint')}</span>
          </label>
          <label className="part-studio-sketch-dialog__toggle">
            <input
              type="checkbox"
              checked={showConstraints}
              onChange={(event) => setShowConstraints(event.target.checked)}
            />
            <span>{t('partStudio.sketchDialog.toggles.showConstraints')}</span>
          </label>
          <label className="part-studio-sketch-dialog__toggle">
            <input
              type="checkbox"
              checked={showExpressions}
              onChange={(event) => setShowExpressions(event.target.checked)}
            />
            <span>{t('partStudio.sketchDialog.toggles.showExpressions')}</span>
          </label>
          <label className="part-studio-sketch-dialog__toggle">
            <input
              type="checkbox"
              checked={showErrors}
              onChange={(event) => setShowErrors(event.target.checked)}
            />
            <span>{t('partStudio.sketchDialog.toggles.showErrors')}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
