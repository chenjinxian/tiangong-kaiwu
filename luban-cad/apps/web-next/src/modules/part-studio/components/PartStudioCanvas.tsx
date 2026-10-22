/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioCanvas（M3 Task 3 壳；T5 接管右键交互；T6 接管内联对话框 + 草图
 * 覆盖层；M4-T6 FeatureDialog 提交接线 + T6-① key 必办）：画布区——viewport
 * 挂载点 + 画布右键宿主 + 非模态对话框宿主 + 草图模式覆盖层。
 * onContextMenu preventDefault 并锚定光标坐标弹 CanvasContextMenu（选择驱动：
 * 空白态/选中态按 store.canvas.selection 重构）；Escape/外部点击收合（菜单内
 * 自治）。
 *
 * T6：
 * - store.dialog 驱动 FeatureDialog（特征编辑，os-31）/ SketchDialog（新建
 *   草图，os-30）在画布左上角内联渲染（非模态——画布持续可交互）；
 * - FeatureDialog 挂 `key={mode==='edit' ? featureId : 'new-'+featureType}`
 *  （M3-T6 台账①根治：不同特征切换即重挂，本地态不跨特征残留）；
 * - 提交链（M4-T6 拉伸闭环）：new 模式 ✓ → FeatureDialog 内部构 insertFeature
 *   op 经 applyOp（Session useFeatureSystem 直通）提交，成功回 onConfirm →
 *   closeDialog；edit 模式确认仍壳期 console.warn（updateParams 归特征对话
 *   框增强 backlog）；
 * - store.sketch.isActive 驱动草图模式覆盖层：栅格（aria-hidden 纯视觉层）+
 *   约束（role=note 标签层）。
 */

import React from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';
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
  /**
   * 特征 op 提交面（M4-T6：Session useFeatureSystem.applyOp 直通；
   * FeatureDialog new 模式提交消费；缺省=对话框回退纯回调壳期语义）。
   */
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
}

interface MenuAnchor {
  x: number;
  y: number;
}

export function PartStudioCanvas({ viewportRef, viewport, applyOp }: PartStudioCanvasProps): React.JSX.Element {
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

  // M4-T6：new 模式提交成功回 here（FeatureDialog 内部已 toast）；edit 模式
  // 本版不提交（updateParams 归特征对话框增强 backlog）——壳期口径收全量载荷。
  const handleFeatureConfirm = React.useCallback(
    (result: FeatureDialogResult, payload: { mode: 'new' | 'edit' }) => {
      if (payload.mode === 'edit') {
        console.warn('[part-studio] 特征编辑确认（updateParams 未接线——特征对话框增强 backlog）', result);
      }
      closeDialog();
    },
    [closeDialog],
  );

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

      {/* T6 内联非模态对话框（os-30/os-31：画布左上角，不遮罩画布）。
          M4-T6 T6-①：key 按模式寻址——edit=featureId（跨特征切换重挂，本地态
          不残留）；new='new-'+featureType（同类型连开亦重挂，上一单的距离/页签
          不泄漏进下一单）。 */}
      {dialog.active === 'feature' && (
        <FeatureDialog
          key={dialog.mode === 'edit' ? dialog.featureId : `new-${dialog.featureType}`}
          featureName={
            dialog.mode === 'edit'
              ? dialog.featureName
              : t(`partStudio.ribbon.tools.${dialog.featureType}.label`)
          }
          mode={dialog.mode}
          featureType={dialog.mode === 'edit' ? undefined : dialog.featureType}
          applyOp={applyOp}
          onConfirm={(result) =>
            handleFeatureConfirm(result, { mode: dialog.mode })
          }
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
