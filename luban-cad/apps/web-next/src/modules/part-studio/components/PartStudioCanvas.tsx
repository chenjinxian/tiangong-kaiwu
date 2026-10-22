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
 *   closeDialog；edit 模式确认在对话框内已禁用+提示（T6 评审 M-1）；
 * - viewOnly 运行时切换（T6 评审 I-1）：store.viewOnly 置位即 closeDialog
 *   ——打开中的写面对话框整体收口（对话框宿主职责；对话框内另有 viewOnly
 *   提交门兜底，防御纵深）；
 * - store.sketch.isActive 驱动草图模式覆盖层：栅格（aria-hidden 纯视觉层）+
 *   约束（role=note 标签层）；
 * - 连接相位覆盖层（M5-T2）：briefcase 下载中骨架 / 失败错误面（Session 下传
 *   isLoading/error，此前零消费）——绝对定位叠加在 viewport 上（零布局跳动）；
 *   错误面透传 error.message 原文 + 诚实重试路径指引（重开=切页签/重进，
 *   无假重试钮——连接 hook 无重试入口，id 不变不重开）。
 */

import React from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';
import { CanvasContextMenu } from '../canvas/CanvasContextMenu.js';
import { FeatureDialog } from '../dialogs/FeatureDialog.js';
import { SketchDialog } from '../dialogs/SketchDialog.js';
import type { SketchDialogResult } from '../dialogs/SketchDialog.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

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
  /** 写租约在持（Session useFeatureSystem.leaseOk 直通；FeatureDialog 租约警示消费，T6 评审 I-2）。 */
  leaseOk?: boolean;
  /** briefcase 打开中（M5-T2：Session 下传 isLoading——画布骨架覆盖层）。 */
  connectionLoading?: boolean;
  /** briefcase 打开失败消息（M5-T2：Session 下传 error.message 原文——错误面透传；null=无失败）。 */
  connectionError?: string | null;
}

interface MenuAnchor {
  x: number;
  y: number;
}

export function PartStudioCanvas({
  viewportRef,
  viewport,
  applyOp,
  leaseOk,
  connectionLoading = false,
  connectionError = null,
}: PartStudioCanvasProps): React.JSX.Element {
  const { t } = useTranslation();
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);

  // T6：内联非模态对话框宿主（dialog 切片寻址）。
  const dialog = usePartStudioStore((s) => s.dialog);
  const closeDialog = usePartStudioStore((s) => s.closeDialog);
  // T6：草图模式覆盖层开关（os-30 栅格/约束）。
  const sketchActive = usePartStudioStore((s) => s.sketch.isActive);
  // T6 评审 I-1：viewOnly 运行时切换 → 打开中的写面对话框整体收口（宿主职责；
  // FeatureDialog 内另有 viewOnly 提交门兜底，防御纵深）。dialog.active 入参
  // 兼盖「仅查看态下被打开」的对话框（打开即收）。
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);
  React.useEffect(() => {
    if (viewOnly && dialog.active) closeDialog();
  }, [viewOnly, dialog.active, closeDialog]);

  const handleContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setAnchor({ x: event.clientX, y: event.clientY });
  }, []);

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

      {/* 连接相位覆盖层（M5-T2）：briefcase 失败错误面 / 下载中骨架。绝对定位
          叠加（z-index 低于草图覆盖层），viewport 区无重排——零布局跳动。错误
          面透传 error.message 原文 + 诚实重试指引（无假重试钮）；骨架先行占位
          防「已连接+黑屏」。 */}
      {connectionError ? (
        <div
          className="part-studio-canvas__connection-error"
          data-testid="part-studio-connection-error"
          role="alert"
        >
          <p className="part-studio-canvas__connection-error-title">
            {t('partStudio.connection.errorTitle')}
          </p>
          <p className="part-studio-canvas__connection-error-message">{connectionError}</p>
          <p className="part-studio-canvas__connection-error-hint">
            {t('partStudio.connection.errorHint')}
          </p>
        </div>
      ) : connectionLoading ? (
        <div
          className="part-studio-canvas__connection-loading"
          data-testid="part-studio-connection-loading"
        >
          <span className="part-studio-canvas__connection-loading-bar" />
          <span className="part-studio-canvas__connection-loading-bar part-studio-canvas__connection-loading-bar--short" />
          <span className="part-studio-canvas__connection-loading-label">
            {t('partStudio.status.openingDocument')}
          </span>
        </div>
      ) : null}

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
          leaseOk={leaseOk}
          onConfirm={closeDialog}
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
