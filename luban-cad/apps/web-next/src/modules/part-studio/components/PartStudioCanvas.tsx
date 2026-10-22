/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioCanvas（M3 Task 3 壳；T5 接管右键交互；T6 接管内联对话框 + 草图
 * 覆盖层）：画布区——viewport 挂载点 + 画布右键宿主 + 非模态对话框宿主 +
 * 草图模式覆盖层。onContextMenu preventDefault 并锚定光标坐标弹
 * CanvasContextMenu（选择驱动：空白态/选中态按 store.canvas.selection 重构）；
 * Escape/外部点击收合（菜单内自治）。
 *
 * T6：
 * - store.dialog 驱动 FeatureDialog（特征编辑，os-31）/ SketchDialog（新建
 *   草图，os-30）在画布左上角内联渲染（非模态——画布持续可交互）；确认/
 *   取消回 closeDialog（变异层未接线 console.warn，RPC 接管后替换）；
 * - store.sketch.isActive 驱动草图模式覆盖层：栅格（aria-hidden 纯视觉层）+
 *   约束（role=note 标签层）。
 */

import React from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenViewport } from '@itwin/core-frontend';
import { CanvasContextMenu } from '../canvas/CanvasContextMenu.js';
import { FeatureDialog } from '../dialogs/FeatureDialog.js';
import type { FeatureDialogResult } from '../dialogs/FeatureDialog.js';
import { SketchDialog } from '../dialogs/SketchDialog.js';
import type { SketchDialogResult } from '../dialogs/SketchDialog.js';
import { usePartStudioStore } from '../stores/part-studio.store.js';

export interface PartStudioCanvasProps {
  /** viewport 宿主 div ref（viewer-next useViewport 出口）。 */
  viewportRef: RefObject<HTMLDivElement>;
  /** ScreenViewport 实例（M4-T2 起 Page 下传；T5 适应视图/T6 内联对话框消费位）。 */
  viewport?: ScreenViewport;
}

interface MenuAnchor {
  x: number;
  y: number;
}

export function PartStudioCanvas({ viewportRef, viewport }: PartStudioCanvasProps): React.JSX.Element {
  const { t } = useTranslation();
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);

  // T6：内联非模态对话框宿主（dialog 切片寻址）。
  const dialog = usePartStudioStore((s) => s.dialog);
  const closeDialog = usePartStudioStore((s) => s.closeDialog);
  // T6：草图模式覆盖层开关（os-30 栅格/约束）。
  const sketchActive = usePartStudioStore((s) => s.sketch.isActive);

  const handleContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setAnchor({ x: event.clientX, y: event.clientY });
  }, []);

  // 变异层接线前：确认收全量载荷打警告（RPC/react-query 接管后替换，FeatureTree 同口径）。
  const handleFeatureConfirm = React.useCallback((result: FeatureDialogResult) => {
    console.warn('[part-studio] 特征对话框确认（onConfirm 未接线——RPC 变异层后续接管）', result);
    closeDialog();
  }, [closeDialog]);

  const handleSketchConfirm = React.useCallback((result: SketchDialogResult) => {
    console.warn('[part-studio] 草图对话框确认（onConfirm 未接线——RPC 变异层后续接管）', result);
    closeDialog();
  }, [closeDialog]);

  // data-viewport-ready：M4-T2 视口下传锚点（结构断言/T5 适应视图接线前的就绪观测位）。
  return (
    <div
      className="part-studio-canvas"
      data-testid="part-studio-canvas"
      data-viewport-ready={viewport ? 'true' : 'false'}
      onContextMenu={handleContextMenu}
    >
      <div ref={viewportRef} className="part-studio-viewport" data-testid="part-studio-viewport" />

      {/* T6 草图模式覆盖层（os-30）：栅格（纯视觉）+ 约束（标签）。 */}
      {sketchActive && (
        <React.Fragment>
          <div className="part-studio-canvas__sketch-grid" data-testid="sketch-grid-overlay" aria-hidden="true" />
          <div
            className="part-studio-canvas__sketch-constraints"
            data-testid="sketch-constraints-overlay"
            role="note"
          >
            {t('partStudio.sketch.constraintsOverlay')}
          </div>
        </React.Fragment>
      )}

      <CanvasContextMenu anchor={anchor} onClose={() => setAnchor(null)} />

      {/* T6 内联非模态对话框（os-30/os-31：画布左上角，不遮罩画布）。 */}
      {dialog.active === 'feature' && (
        <FeatureDialog
          featureName={dialog.featureName}
          onConfirm={handleFeatureConfirm}
          onCancel={closeDialog}
        />
      )}
      {dialog.active === 'sketch' && (
        <SketchDialog
          sketchId={dialog.sketchId ?? undefined}
          onConfirm={handleSketchConfirm}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
