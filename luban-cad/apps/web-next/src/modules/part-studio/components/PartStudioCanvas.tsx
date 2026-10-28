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
 * - FeatureDialog 挂 `key={mode==='edit' ? featureId : 'new-'+featureType+
 *   (patternKind ? '-'+patternKind : '')}`（M3-T6 台账①根治：不同特征切换即重挂，
 *   本地态不跨特征残留；B5：pattern 的 kind 参与寻址——linear/circular 两入口互切
 *   须重挂，否则对话框 useState 初值不随 props 变化）；
 * - 提交链（M4-T6 拉伸闭环）：new 模式 ✓ → FeatureDialog 内部构 insertFeature
 *   op 经 applyOp（Session useFeatureSystem 直通）提交，成功回 onConfirm →
 *   closeDialog；edit 模式确认在对话框内已禁用+提示（T6 评审 M-1）；
 *   M6-a T4 起 SketchDialog 同款接线（内部构 insertSketch op——真 sketchId
 *   入 store，宿主 onConfirm=收合透传）；
 *   M6-a T6 起 FeatureDialog 拉伸走草图通道——Session 下传 sketches（树内
 *   sketch 节点映射）+ connection（取 key 供 getSketch 面域读面），此处纯
 *   透传（数据源裁决与门禁语义见 FeatureDialog 头注）；
 * - B6 M-A5 T2 画布 body 删除接线：Task 1 选中桥（kind='part'）落地后画布
 *   删除不再是死路——onDelete 仅接受命中 active authored body 的 part 选择项，
 *   以 sourceFeatureId 走 deleteFeature（targetBodyId=bodyKey）；无源 → Error
 *   toast「实体无驱动源，无法删除」；未命中 active authored body（陈旧/被消费
 *   id）→ Error toast「实体已不可用，无法删除」（F1 终审修复，不再静默 no-op）；
 *   !canEdit → 菜单删除项禁用 + 回调拒收；
 * - viewOnly 运行时切换（T6 评审 I-1）：store.viewOnly 置位即 closeDialog
 *   ——打开中的写面对话框整体收口（对话框宿主职责；「仅查看模式」是用户
 *   主动切换，收口语义保持 viewOnly 直读）；写动作门另走 canEdit（B2 只读
 *   写门禁：Session 单点下传直通 FeatureDialog，权限只读下 ✓ 禁用+诚实提示，
 *   提交不进租约环——两条语义线切分，勿在下游混读）；
 * - store.sketch.isActive 驱动草图模式覆盖层：栅格（aria-hidden 纯视觉层）+
 *   约束（role=note 标签层）；M6-b T5 起并挂 SketchPanel（草图模式面板：
 *   DOF 徽标/三清单/尺寸内联编辑/级联删除——Session 下传 sketchSystem，
 *   挂载位裁决见 SketchPanel 文件头）；
 * - 连接相位覆盖层（M5-T2）：briefcase 下载中骨架 / 失败错误面（Session 下传
 *   isLoading/error，此前零消费）——绝对定位叠加在 viewport 上（零布局跳动）；
 *   错误面透传 error.message 原文 + 诚实重试路径指引（重开=切页签/重进，
 *   无假重试钮——连接 hook 无重试入口，id 不变不重开）。
 */

import React from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
} from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import type { BodyInfo, FeatureOp, FeatureOpResult } from '@luban-cad/shared';
import { CanvasContextMenu } from '../canvas/CanvasContextMenu.js';
import type { CanvasSelection } from '../types.js';
import { FeatureDialog } from '../dialogs/FeatureDialog.js';
import type { FeatureDialogSketchOption } from '../dialogs/FeatureDialog.js';
import { SketchDialog, sketchPlaneFromOption } from '../dialogs/SketchDialog.js';
import type { SketchDialogResult } from '../dialogs/SketchDialog.js';
import { SketchPanel } from './SketchPanel.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
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
  /**
   * 编辑面总门（B2 只读写门禁，M5-T3 单点合流）：Session 直通 FeatureDialog——
   * false 时 ✓ 禁用 + 只读提示，提交入口不发起 applyOp。B6 M-A5 T2 起同门直通
   * CanvasContextMenu（「删除」项 disabled + title，HITL 不打开）与画布 body
   * 删除回调（防御性拒收）。缺省 true（测试/壳期语义保持；生产宿主 Session
   * 恒显式传参）。
   */
  canEdit?: boolean;
  /**
   * 可选草图集（M6-a T6 拉伸草图通道）：Session 自 useFeatureSystem.tree 过滤
   * sketch 节点映射下传（数据源裁决见 FeatureDialog 头注）；直通 FeatureDialog。
   */
  sketches?: readonly FeatureDialogSketchOption[];
  /**
   * briefcase 连接（M6-a T6 面域读面）：取 key 下传 FeatureDialog
   * （getSketch RPC 的寻址键）；缺省 undefined = 面域不可读（提交禁用）。
   */
  connection?: BriefcaseConnection;
  /**
   * 库内已有实体（M6-b T6 fillet 通道诚实降级门）：Session 自特征树判
   * （body 产出型条目在场）下传 FeatureDialog；缺省 true（壳期/测试语义保持）。
   */
  hasBodies?: boolean;
  /**
   * B6 M-A3.2a：body 读面（Session useFeatureSystem.bodies 直通，仅成功读取后
   * 下传）——FeatureDialog 的 N>1 目标实体选择/newBody 决策数据源。
   */
  bodies?: readonly BodyInfo[];
  /** body 读面刷新中（FeatureDialog 提交通道挂起 + 诚实提示）。 */
  bodiesLoading?: boolean;
  /** body 读面失败（FeatureDialog 读面不可用时禁用 insert + 诚实提示）。 */
  bodiesError?: string;
  /**
   * B6 M-A3.2a：edit 模式既有特征落库 params（Session 自特征树行反查）——
   * FeatureDialog 回显结构键 newBody（不可翻转）。
   */
  featureParams?: unknown;
  /** briefcase 打开中（M5-T2：Session 下传 isLoading——画布骨架覆盖层）。 */
  connectionLoading?: boolean;
  /** 连接失败消息（M5-T2：Session 合流下传——briefcase error 优先，viewport 创建失败兜底（T2 评审）；原文透传，null=无失败）。 */
  connectionError?: string | null;
  /**
   * 草图系统（M6-b T5：Session useSketchSystem 直通——SketchPanel 数据面）。
   * 缺省 undefined = 面板不渲染（壳期/纯展示语义；生产宿主 Session 恒显式
   * 传参）。挂载位裁决见 SketchPanel 文件头。
   */
  sketchSystem?: UseSketchSystem;
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
  canEdit = true,
  sketches,
  connection,
  hasBodies = true,
  bodies,
  bodiesLoading,
  bodiesError,
  featureParams,
  connectionLoading = false,
  connectionError = null,
  sketchSystem,
}: PartStudioCanvasProps): React.JSX.Element {
  const { t } = useTranslation();
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);

  // T6：内联非模态对话框宿主（dialog 切片寻址）。
  const dialog = usePartStudioStore((s) => s.dialog);
  const closeDialog = usePartStudioStore((s) => s.closeDialog);
  // T6：草图模式覆盖层开关（os-30 栅格/约束）。
  const sketchActive = usePartStudioStore((s) => s.sketch.isActive);
  // T6 评审 I-1：viewOnly 运行时切换 → 打开中的写面对话框整体收口（宿主职责）。
  // 语义线切分（B2 只读写门禁）：此处保持 store.viewOnly 直读——「仅查看模式」
  // 是用户主动切换，收口/菜单态语义不吃权限；写动作门走 canEdit prop（下方
  // 直通 FeatureDialog）。dialog.active 入参兼容盖「仅查看态下被打开」的对话框
  //（打开即收）。
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);
  React.useEffect(() => {
    if (viewOnly && dialog.active) closeDialog();
  }, [viewOnly, dialog.active, closeDialog]);

  const handleContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setAnchor({ x: event.clientX, y: event.clientY });
  }, []);

  // M6-a T4：SketchDialog 内部接线 insertSketch RPC（applyOp/canEdit 直通——
  // 提交态/就地错误/只读门禁归对话框自治，同 FeatureDialog 职责边界）；宿主
  // 回调=确认成功后的收合透传。
  // M6-a T5：确认链顺带下发草图平面——result.plane 选项 id 经
  // sketchPlaneFromOption 映射为世界系三向量入 store.sketch.activeSketchPlane
  //（绘制工具的取点投影/AccuDraw 锁定数据源；非基准面 id → undefined → null=
  // 契约缺省 XY@z=0）。SketchDialog 已收口不改——平面经 onConfirm 载荷带出，
  // 宿主此处接线。
  const setActiveSketchPlane = usePartStudioStore((s) => s.setActiveSketchPlane);
  const handleSketchConfirm = React.useCallback((result?: SketchDialogResult) => {
    setActiveSketchPlane(result ? sketchPlaneFromOption(result.plane) ?? null : null);
    closeDialog();
  }, [closeDialog, setActiveSketchPlane]);

  /**
   * B6 M-A5 T2：画布 body 删除接线（Task 1 选中桥落地后不留死路）。删除回调
   * 仅接受 `kind='part'` 且 id 命中 active authored body 的选择项：
   * - 取 BodyInfo.sourceFeatureId，applyOp(deleteFeature{featureId=源, targetBodyId=bodyKey})；
   * - 无 sourceFeatureId → Error toast「实体无驱动源，无法删除」，不发 op；
   * - 未命中 active authored body（陈旧/已被消费的选择 id）→ Error toast
   *   「实体已不可用，无法删除」，不发 op（不猜测，但也不静默——F1 终审修复）；
   * - 非 part 选择项不进入 body 删除（feature 选择不来自画布桥；保持既有未接线语义）；
   * - !canEdit → 防御性拒收（菜单「删除」已禁用，HITL 不打开）；
   * - 成功/失败 toast 与树删除同口径；不乐观改树（refresh 归 applyOp 内 onCommitted）。
   */
  const handleCanvasDelete = React.useCallback(
    async (selection: readonly CanvasSelection[]): Promise<void> => {
      if (!canEdit) return;
      // 主选择在尾（菜单模型同口径：selection[selection.length-1]）——仅 part
      // 主选择进入 body 删除；feature/face/edge 选择保持既有未接线语义。
      const primary = selection[selection.length - 1];
      if (!primary || primary.kind !== 'part') return;
      const body = bodies?.find(
        (candidate) => candidate.bodyKey === primary.id && candidate.active && candidate.authored !== false,
      );
      if (!body) {
        // 未命中 active authored body（选择桥残留的陈旧 id / body 已被消费）：
        // 不猜测，但也不静默——诚实 Error toast（F1 终审修复；此前的静默
        // no-op 让用户看到「删除无反应」的死路）。
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(OutputMessagePriority.Error, t('partStudio.canvasMenu.deleteUnavailable')),
        );
        return;
      }
      if (!body.sourceFeatureId) {
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(OutputMessagePriority.Error, t('partStudio.tree.noSourceFeature')),
        );
        return;
      }
      if (!applyOp) {
        console.warn(`[part-studio] 删除实体 ${primary.id}（applyOp 未接线）`);
        return;
      }
      const name = body.name ?? primary.label ?? primary.id;
      try {
        const result = await applyOp({
          kind: 'deleteFeature',
          featureId: body.sourceFeatureId,
          targetBodyId: body.bodyKey,
        });
        if (result.ok) {
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(OutputMessagePriority.Success, t('partStudio.tree.deleteSuccess', { name })),
          );
        } else {
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(OutputMessagePriority.Error, t('partStudio.tree.deleteFailed', { message: result.error })),
          );
        }
      } catch (err) {
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Error,
            t('partStudio.tree.deleteFailed', {
              message: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
      }
    },
    [applyOp, bodies, canEdit, t],
  );

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

      {/* M6-b T5：草图模式面板（DOF 徽标/三清单/尺寸内联编辑/级联删除）——
          画布左上覆盖层（挂载位裁决见 SketchPanel 文件头）。sketchSystem
          缺省（壳期/纯展示）不渲染。 */}
      {sketchActive && sketchSystem && <SketchPanel sketchSystem={sketchSystem} />}

      <CanvasContextMenu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        onDelete={handleCanvasDelete}
        canEdit={canEdit}
      />

      {/* T6 内联非模态对话框（os-30/os-31：画布左上角，不遮罩画布）。
          M4-T6 T6-①：key 按模式寻址——edit=featureId（跨特征切换重挂，本地态
          不残留）；new='new-'+featureType（同类型连开亦重挂，上一单的距离/页签
          不泄漏进下一单）。 */}
      {dialog.active === 'feature' && (
        <FeatureDialog
          key={
            dialog.mode === 'edit'
              ? dialog.featureId
              // B5：pattern 的 kind 参与寻址——同 featureType 的 linear/circular 两入口
              // 互切须重挂（否则 useState 初值不随 props 变化，仍停留旧 kind）。
              : `new-${dialog.featureType}${dialog.patternKind !== undefined ? `-${dialog.patternKind}` : ''}`
          }
          featureName={
            dialog.mode === 'edit'
              ? dialog.featureName
              : t(`partStudio.ribbon.tools.${dialog.featureType}.label`)
          }
          mode={dialog.mode}
          featureType={dialog.mode === 'edit' ? undefined : dialog.featureType}
          initialPatternKind={dialog.mode === 'edit' ? undefined : dialog.patternKind}
          applyOp={applyOp}
          leaseOk={leaseOk}
          canEdit={canEdit}
          sketches={sketches}
          connectionKey={connection?.key}
          hasBodies={hasBodies}
          bodies={bodies}
          bodiesLoading={bodiesLoading}
          bodiesError={bodiesError}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      )}
      {dialog.active === 'sketch' && (
        <SketchDialog
          sketchId={dialog.sketchId ?? undefined}
          applyOp={applyOp}
          canEdit={canEdit}
          onConfirm={handleSketchConfirm}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
