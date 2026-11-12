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
 * - store.sketch.isActive 驱动草图模式覆盖层：约束提示（role=note 标签层）
 *   + 值确认浮层（尺寸/偏移）；Onshape 无「实体/约束/尺寸清单」常驻面板
 *   （2026-11-03 按 live 删除 SketchPanel）；
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
import type { BodyInfo, FeatureOp, FeatureOpResult, FeatureTreeEntry, LubanFeatureType, PreviewResult, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { CanvasContextMenu } from '../canvas/CanvasContextMenu.js';
import { deleteSelectedSubEntity } from '../canvas/subentity-delete.js';
import type { CanvasSelection } from '../types.js';
import { CPlaneDialog } from '../dialogs/CPlaneDialog.js';
import { FeatureDialog } from '../dialogs/FeatureDialog.js';
import { GraphicsPreferencesDialog } from '../dialogs/GraphicsPreferencesDialog.js';
import type { FeatureDialogFeatureOption, FeatureDialogSketchOption } from '../dialogs/FeatureDialog.js';
import { HoleDialog } from '../dialogs/HoleDialog.js';
import { ShellDialog } from '../dialogs/ShellDialog.js';
import { MoveFaceDialog } from '../dialogs/MoveFaceDialog.js';
import { FeaturePatternDialog } from '../dialogs/FeaturePatternDialog.js';
import { TransformDialog } from '../dialogs/TransformDialog.js';
import { SplitPartDialog } from '../dialogs/SplitPartDialog.js';
import { SketchDialog, sketchPlaneFromOption } from '../dialogs/SketchDialog.js';
import { cPlanePlaneOptions } from '../internal/cplane.js';
import type { SketchDialogResult } from '../dialogs/SketchDialog.js';
import { readBrepFaceHandle } from '../internal/brep-topology.js';
import { withExclusiveBrepCommand } from '../internal/brep-command-coordinator.js';
import { sketchPlaneFromFaceHandle } from '../internal/sketch-plane-from-face.js';
import { SketchEntityPicker } from './SketchEntityPicker.js';
import { SketchDimensionEditor } from './SketchDimensionEditor.js';
import type { SketchEntitySelection } from '../internal/sketch-entity-picker.js';
import { deleteSketchEntities } from '../internal/sketch-delete.js';
import { SketchPlanePicker } from './SketchPlanePicker.js';
import { SketchValuePopup } from './SketchValuePopup.js';
import { datumPlaneFromSketch } from '../internal/datum-visibility.js';
import { clearActiveOnshapeHighlight, clearActiveOnshapeSelection } from '../internal/onshape-selection-runtime.js';
import { applyCanvasSelection } from '../internal/selection-authority.js';
import { SketchToolFeedbackOverlay } from './SketchToolFeedbackOverlay.js';
import { fitCameraToSketch } from '../canvas/sketch-camera.js';
import { ViewCube } from './ViewCube.js';
import { readViewCubeMode } from '../internal/viewcube-mode.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import { useDatumPlaneDecorations } from '../hooks/useDatumPlaneDecorations.js';
import { useSketchCurveDecorations } from '../hooks/useSketchCurveDecorations.js';
import { useSketchAnnotations } from '../hooks/useSketchAnnotations.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { mapFeatureEntries } from '../hooks/useFeatureTree.js';
import { fitViewToModelRanges } from '@luban-cad/viewer';

/**
 * 官方 iTwin ViewCube 按需加载：默认模式只加载官方组件 chunk；
 * `?viewcube=onshape` 回退自研模式。官方包不进入自研路径（单测/降级）。
 */
const ItwinViewCube = React.lazy(async () => {
  const mod = await import('./ItwinViewCube.js');
  return { default: mod.ItwinViewCube };
});

export interface PartStudioCanvasProps {
  /** viewport 宿主 div ref（viewer useViewport 出口）。 */
  viewportRef: RefObject<HTMLDivElement>;
  /** ScreenViewport 实例（M4-T2 起 Page 下传；T5 适应视图/T6 内联对话框消费位）。 */
  viewport?: ScreenViewport;
  /**
   * 特征 op 提交面（M4-T6：Session useFeatureSystem.applyOp 直通；
   * FeatureDialog new 模式提交消费；缺省=对话框回退纯回调壳期语义）。
   */
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /** v1.21：预览 op（fillet 首切片返回后端影子求值几何；FeatureDialog 实时预览消费）。 */
  previewOp?: (op: FeatureOp) => Promise<PreviewResult>;
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
   * 草图系统（Session useSketchSystem 直通——值确认浮层/标注读面）。
   * 缺省 undefined = 浮层不渲染（壳期/纯展示语义；生产宿主恒显式传参）。
   */
  sketchSystem?: UseSketchSystem;
  /** 显示/渲染设置（ViewCube 下拉与停靠面板共享状态）。 */
  displaySettings?: UseDisplaySettingsResult;
  /** 特征树条目（2026-11-02：sketch params 自带 entities+plane，供非编辑态虚线叠加）。 */
  featureEntries?: readonly FeatureTreeEntry[];
}

interface MenuAnchor {
  x: number;
  y: number;
}

export function PartStudioCanvas({
  viewportRef,
  viewport,
  applyOp,
  previewOp,
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
  displaySettings,
  featureEntries = [],
}: PartStudioCanvasProps): React.JSX.Element {
  const { t } = useTranslation();
  // 2026-11-05：ViewCube 模式由 URL/sessionStorage 决定（挂载时读取一次；改
  // query 会整页 reload）。默认官方 iTwin（用户裁决手感更好）；?viewcube=onshape
  // 回退自研 Onshape 模式（e2e/演示显式使用）。
  const viewCubeMode = React.useMemo(() => {
    try {
      return readViewCubeMode(window.location.search, window.sessionStorage);
    } catch {
      return readViewCubeMode(window.location.search);
    }
  }, []);
  useDatumPlaneDecorations(viewport);
  const sketchActiveForDecorations = usePartStudioStore((s) => s.sketch.isActive);
  const activeSketchIdForDecorations = usePartStudioStore((s) => s.sketch.activeSketchId);
  // ADR-0018 S1c：拖拽预览（显示层覆盖）与释放提交（一次 updateSketch，可 undo）。
  const [sketchPreviewEntities, setSketchPreviewEntities] = React.useState<readonly SketchEntityDto[] | null>(null);
  React.useEffect(() => {
    if (!sketchActiveForDecorations)
      setSketchPreviewEntities(null);
  }, [sketchActiveForDecorations]);
  const commitSketchDrag = React.useCallback(async (entities: SketchEntityDto[]) => {
    if (!sketchSystem?.activeSketch)
      return;
    const result = await sketchSystem.applyUpdate(entities, sketchSystem.activeSketch.constraints);
    setSketchPreviewEntities(null);
    if (!result.ok) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(
        OutputMessagePriority.Error,
        t('partStudio.sketch.dragFailed', { message: result.error ?? '' }),
      ));
    }
  }, [sketchSystem, t]);
  useSketchCurveDecorations(
    viewport,
    featureEntries,
    sketchActiveForDecorations,
    activeSketchIdForDecorations,
    // Onshape 对拍（2026-11-12）：编辑态用 getSketch 现场解算的实体/DOF 着色并画控制点。
    sketchSystem?.activeSketch,
    // S1c：拖拽预览覆盖显示（事实源不变）。
    sketchPreviewEntities,
  );
  // 2026-11-02 Onshape live：活动草图尺寸标注（长度/距离/半径）视口绘制。
  const { annotations: sketchAnnotations } = useSketchAnnotations(
    viewport,
    sketchSystem?.activeSketch,
    sketchActiveForDecorations && sketchSystem !== undefined,
  );
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);
  /** 新建草图对话框的平面选择（三基准面 id / cPlane 特征 id / 模型面选择 id；关闭即清）。 */
  const [sketchDraftPlane, setSketchDraftPlane] = React.useState<string | null>(null);
  /** ADR-0017 Stage D：视口拾取的平面模型面 → 草图平面快照（随 insertSketch 落 params）。 */
  const [sketchFacePlane, setSketchFacePlane] = React.useState<{ id: string; plane: SketchPlaneDto } | null>(null);
  /** Onshape「图形首选项」左侧非模态面板（与右侧外观面板可同时打开）。 */
  const [graphicsPreferencesOpen, setGraphicsPreferencesOpen] = React.useState(false);

  // T6：内联非模态对话框宿主（dialog 切片寻址）。
  const dialog = usePartStudioStore((s) => s.dialog);
  const closeDialog = usePartStudioStore((s) => s.closeDialog);
  const selectedDatumId = usePartStudioStore((s) => s.datum.selectedId);
  const selectDatum = usePartStudioStore((s) => s.selectDatum);
  const canvasSelectionForSketchPlane = usePartStudioStore((s) => s.canvas.selection);
  const setCanvasSelection = usePartStudioStore((s) => s.setCanvasSelection);
  const activeToolIdForSketchPicker = usePartStudioStore((s) => s.tool.activeToolId);

  // ADR-0018 S1b：草图实体选择并入唯一选择权威；退出草图即清掉草图条目
  //（它们不是 iModel 元素，不得泄漏到建模态菜单/工具输入）。
  const sketchEntitySelection = React.useMemo(() => (
    sketchSystem?.activeSketch
      ? canvasSelectionForSketchPlane
        .filter((entry) => entry.kind === 'sketchEntity' && entry.sketchId === sketchSystem.activeSketch!.id)
        .map((entry) => ({
          sketchId: entry.sketchId!,
          entityId: entry.entityId!,
          part: entry.sketchPart ?? 'curve' as const,
          ...(entry.handleIndex !== undefined ? { handleIndex: entry.handleIndex } : {}),
        }))
      : []
  ), [canvasSelectionForSketchPlane, sketchSystem?.activeSketch]);
  React.useEffect(() => {
    if (sketchActiveForDecorations) return;
    if (!canvasSelectionForSketchPlane.some((entry) => entry.kind === 'sketchEntity')) return;
    setCanvasSelection(canvasSelectionForSketchPlane.filter((entry) => entry.kind !== 'sketchEntity'));
  }, [sketchActiveForDecorations, canvasSelectionForSketchPlane, setCanvasSelection]);

  // ADR-0018 S1d：Delete 删除选中草图曲线 → 一次 updateSketch；附着约束级联移除，
  // 点实体仍被引用时整单诚实拒收（纯逻辑见 internal/sketch-delete.ts）。
  const deleteSelectedSketchEntities = React.useCallback(async (selection: readonly SketchEntitySelection[]) => {
    if (!sketchSystem?.activeSketch || !canEdit)
      return;
    const curveIds = [...new Set(selection.filter((entry) => entry.part === 'curve').map((entry) => entry.entityId))];
    if (curveIds.length === 0)
      return;
    const result = deleteSketchEntities(
      sketchSystem.activeSketch.entities,
      sketchSystem.activeSketch.constraints,
      curveIds,
    );
    if (result.blockedEntities.length > 0) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(
        OutputMessagePriority.Warning,
        t('partStudio.sketch.deleteBlocked'),
      ));
      return;
    }
    if (result.removedEntities.length === 0)
      return;
    const op = await sketchSystem.applyUpdate(result.entities, result.constraints);
    if (!op.ok) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(
        OutputMessagePriority.Error,
        t('partStudio.sketch.deleteFailed', { message: op.error ?? '' }),
      ));
      return;
    }
    const removed = new Set(result.removedEntities);
    setCanvasSelection(canvasSelectionForSketchPlane.filter((entry) =>
      entry.kind !== 'sketchEntity' || !removed.has(entry.entityId ?? -1)));
  }, [sketchSystem, canEdit, canvasSelectionForSketchPlane, setCanvasSelection, t]);

  // ADR-0018 S1d 扩展：尺寸/约束选择（唯一选择权威的 sketchConstraint 条目）与
  // Delete 删除（updateSketch 移除该约束）；与实体选择互斥——选一类清另一类。
  const sketchConstraintSelection = React.useMemo<number | null>(() => {
    const sketch = sketchSystem?.activeSketch;
    if (!sketch)
      return null;
    const entry = canvasSelectionForSketchPlane.find(
      (candidate) => candidate.kind === 'sketchConstraint' && candidate.sketchId === sketch.id,
    );
    return entry?.constraintId ?? null;
  }, [canvasSelectionForSketchPlane, sketchSystem?.activeSketch]);
  const selectSketchConstraint = React.useCallback((constraintId: number | null) => {
    const sketch = sketchSystem?.activeSketch;
    const others = canvasSelectionForSketchPlane.filter(
      (entry) => entry.kind !== 'sketchEntity' && entry.kind !== 'sketchConstraint',
    );
    if (constraintId === null || !sketch) {
      setCanvasSelection(others);
      return;
    }
    setCanvasSelection([
      ...others,
      {
        kind: 'sketchConstraint' as const,
        id: `${sketch.id}:${constraintId}`,
        sketchId: sketch.id,
        constraintId,
      },
    ]);
  }, [canvasSelectionForSketchPlane, sketchSystem?.activeSketch, setCanvasSelection]);
  const deleteSelectedSketchConstraint = React.useCallback(async (constraintId: number) => {
    const sketch = sketchSystem?.activeSketch;
    if (!sketch || !canEdit)
      return;
    const constraints = sketch.constraints.filter((constraint) => constraint.id !== constraintId);
    if (constraints.length === sketch.constraints.length)
      return;
    const op = await sketchSystem.applyUpdate(sketch.entities, constraints);
    if (!op.ok) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(
        OutputMessagePriority.Error,
        t('partStudio.sketch.deleteFailed', { message: op.error ?? '' }),
      ));
      return;
    }
    setCanvasSelection(canvasSelectionForSketchPlane.filter(
      (entry) => entry.kind !== 'sketchConstraint' && entry.kind !== 'sketchEntity',
    ));
  }, [sketchSystem, canEdit, canvasSelectionForSketchPlane, setCanvasSelection, t]);

  // 打开草图对话框重置平面选择；关闭时清空（下一次打开不继承旧面）。
  React.useEffect(() => {
    setSketchDraftPlane(null);
    setSketchFacePlane(null);
  }, [dialog.active]);

  // 特征树 Top/Front/Right 选择 = 草图平面选择（视口拾取同源；Origin 忽略）。
  React.useEffect(() => {
    if (dialog.active !== 'sketch') return;
    const plane = selectedDatumId === 'top'
      ? 'top'
      : selectedDatumId === 'front'
        ? 'front'
        : selectedDatumId === 'right'
          ? 'right'
          : null;
    if (plane) setSketchDraftPlane(plane);
  }, [dialog.active, selectedDatumId]);

  const handleSketchPlaneSelect = React.useCallback((plane: 'top' | 'front' | 'right') => {
    setSketchDraftPlane(plane);
    setSketchFacePlane(null);
    selectDatum(plane);
  }, [selectDatum]);

  /**
   * 草图平面选项（v1.29）：三基准面 + 特征树内成功 cPlane。命名与树一致（「平面 N」）。
   * cPlane 选项自带世界平面快照（SketchDialog 提交时原样下发并附 sourceFeatureId）。
   */
  const featureTypeLabel = React.useCallback((featureType: string): string => {
    const key = `partStudio.tree.featureTypes.${featureType}`;
    const label = t(key);
    return label === key ? featureType : label;
  }, [t]);

  const sketchPlaneOptions = React.useMemo(() => {
    const typeLabel = featureTypeLabel;
    return [
      ...(['top', 'front', 'right'] as const).map((id) => ({
        id,
        label: t(`partStudio.sketchDialog.planes.${id}`),
      })),
      // ADR-0017 Stage D：视口拾取的平面模型面（快照随选项下发，提交即快照入 params）。
      ...(sketchFacePlane
        ? [{ id: sketchFacePlane.id, label: t('partStudio.sketchDialog.facePlane'), plane: sketchFacePlane.plane }]
        : []),
      ...cPlanePlaneOptions(featureEntries, typeLabel),
    ];
  }, [featureEntries, sketchFacePlane, t]);

  // featureMirror 源特征（2026-11-08 live 证据）：后端首版仅 extrude/revolve/hole；
  // 抑制行不作为候选，源 id 直接取树条目 id。
  const mirrorSourceFeatureOptions = React.useMemo<readonly FeatureDialogFeatureOption[]>(
    () => mapFeatureEntries(featureEntries, featureTypeLabel)
      .filter((node) => !node.isSuppressed
        && (node.type === 'extrude' || node.type === 'revolve' || node.type === 'hole'))
      .map((node) => ({ id: node.id, label: node.name, featureType: node.type })),
    [featureEntries, featureTypeLabel],
  );

  /** 新建 cPlane 的默认名（与树命名一致：平面 N，N=现有 cPlane 数+1）。 */
  const newCPlaneName = React.useMemo(() => {
    const count = featureEntries.filter((entry) => entry.featureType === 'cPlane').length;
    return `${t('partStudio.tree.featureTypes.cPlane')} ${count + 1}`;
  }, [featureEntries, t]);

  const handleSketchDialogCancel = React.useCallback(() => {
    setSketchDraftPlane(null);
    setSketchFacePlane(null);
    selectDatum(null);
    closeDialog();
  }, [closeDialog, selectDatum]);
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
  const exitSketch = usePartStudioStore((s) => s.exitSketch);
  const sketchActiveForDialog = usePartStudioStore((s) => s.sketch.isActive);
  const activeSketchIdForDialog = usePartStudioStore((s) => s.sketch.activeSketchId);
  const activeSketchPlaneForDialog = usePartStudioStore((s) => s.sketch.activeSketchPlane);
  const handleSketchConfirm = React.useCallback((result?: SketchDialogResult) => {
    // Onshape：同一个草图对话框既是创建框也是编辑框。创建成功后对话框
    // **不关闭**，切到编辑态；再次 ✓ = 完成并退出草图。
    if (sketchActiveForDialog) {
      exitSketch();
      setActiveSketchPlane(null);
      setSketchDraftPlane(null);
      setSketchFacePlane(null);
      selectDatum(null);
      closeDialog();
      return;
    }
    // v1.29：cPlane 选项自带世界快照（含 sourceFeatureId）；三基准面回退旧映射。
    setActiveSketchPlane(result ? (result.planeDto ?? sketchPlaneFromOption(result.plane) ?? null) : null);
    setSketchDraftPlane(result?.plane || null);
    // 保持 dialog.active='sketch'：下一步渲染为同一对话框的编辑态。
  }, [closeDialog, exitSketch, selectDatum, setActiveSketchPlane, sketchActiveForDialog]);

  /**
   * ADR-0017 Stage D：新建草图期间（选择工具未被暂停）视口拾取单个平面模型面
   * → 读该面缓存几何 → 生成 SketchPlaneDto 快照 → 设为草图平面选项。
   * 仅唯一面选择生效；多选/非面不改平面（不猜）。读取失败/非平面 → Error toast，
   * 绝不编造平面。读取经 BRep 命令协调器串行（hover 暂停→读完恢复）。
   */
  React.useEffect(() => {
    if (dialog.active !== 'sketch' || sketchActiveForDialog || !connection) return;
    const selection = canvasSelectionForSketchPlane;
    if (selection.length !== 1 || selection[0]!.kind !== 'face') return;
    const face = selection[0]!;
    const ownerBodyKey = face.ownerBodyKey;
    const cacheId = face.cacheId;
    if (ownerBodyKey === undefined || cacheId === undefined) return;
    const iModelKey = connection.key;
    let cancelled = false;
    void (async () => {
      let handle;
      try {
        handle = await withExclusiveBrepCommand(() =>
          readBrepFaceHandle(iModelKey, ownerBodyKey, cacheId));
      } catch {
        handle = undefined;
      }
      if (cancelled) return;
      const plane = handle ? sketchPlaneFromFaceHandle(handle) : undefined;
      if (!plane) {
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(
          OutputMessagePriority.Error,
          t('partStudio.sketchDialog.facePlaneFailed'),
        ));
        return;
      }
      setSketchFacePlane({ id: face.id, plane });
      setSketchDraftPlane(face.id);
      selectDatum(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [dialog.active, sketchActiveForDialog, canvasSelectionForSketchPlane, connection, selectDatum, t]);

  // 编辑既有草图（树双击/菜单）时：按落库平面回显到对话框字段。
  // v1.29：自定义平面的来源指针（sourceFeatureId）命中现存 cPlane 选项时显示「平面 N」，
  // 不再一律显示「自定义平面」；来源已删除/不在列表 → 保持自定义平面（诚实降级）。
  React.useEffect(() => {
    if (!sketchActiveForDialog || dialog.active !== 'sketch') return;
    const plane = datumPlaneFromSketch(activeSketchPlaneForDialog);
    if (plane === 'top' || plane === 'front' || plane === 'right') {
      setSketchDraftPlane(plane);
      return;
    }
    const sourceFeatureId = activeSketchPlaneForDialog?.sourceFeatureId;
    if (sourceFeatureId !== undefined
      && sketchPlaneOptions.some((option) => option.id === sourceFeatureId))
      setSketchDraftPlane(sourceFeatureId);
  }, [dialog.active, sketchActiveForDialog, activeSketchIdForDialog, activeSketchPlaneForDialog, sketchPlaneOptions]);

  const dialogSketchId = dialog.active === 'sketch' ? dialog.sketchId : undefined;

  // Onshape live（2026-11-12）：草图对话框标题=草图名（新建时为“草图 N”，
  // 编辑时为树内落库名），不是泛称「草图」。
  const sketchDialogName = React.useMemo(() => {
    const sketchEntries = featureEntries.filter((entry) => entry.featureType === 'sketch');
    const typeLabel = t('partStudio.tree.featureTypes.sketch');
    if (!sketchActiveForDialog) return `${typeLabel} ${sketchEntries.length + 1}`;
    const targetId = dialogSketchId ?? activeSketchIdForDialog;
    const mapped = mapFeatureEntries(sketchEntries, featureTypeLabel).find((node) => node.id === targetId);
    return mapped?.name ?? typeLabel;
  }, [featureEntries, t, sketchActiveForDialog, dialogSketchId, activeSketchIdForDialog, featureTypeLabel]);

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

  /**
   * M-A5.2 T5：面/边「选中所属实体」宿主动作——清空当前子实体选择、树选中
   * owner、SelectionSet 同步 owner。后续画布选择由默认 Onshape 选择工具接管。
   */
  const handleSelectOwner = React.useCallback((bodyKey: string): void => {
    clearActiveOnshapeHighlight();
    const store = usePartStudioStore.getState();
    store.setSelectedNodeIds([bodyKey]);
    // X-03 单一权威：写 store.canvas.selection，再由唯一投影写点同步
    // connection.selectionSet。label 取 body 读面（不可用时缺省回退 id）。
    const body = bodies?.find((candidate) => candidate.bodyKey === bodyKey);
    applyCanvasSelection(connection, [
      { kind: 'part', id: bodyKey, label: body?.name },
    ]);
  }, [connection, bodies]);

  /**
   * M-A5.2 T5：面/边删除（HITL 已确认）——用选择条目的会话级 cacheId 调
   * editor SolidModelingCommand.deleteSubEntities，saveChanges 后清空选择。
   * 失败保持选择（可重拾），Error toast 透出后端/内核原文。
   */
  const handleDeleteSubEntity = React.useCallback(
    async (selection: readonly CanvasSelection[]): Promise<void> => {
      if (!canEdit || !connection) return;
      try {
        await deleteSelectedSubEntity(connection, selection);
        clearActiveOnshapeSelection();
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Success,
            t('partStudio.canvasMenu.subEntityDeleteSuccess'),
          ),
        );
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
    [canEdit, connection, t],
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
      {viewCubeMode === 'itwin' ? (
        <React.Suspense fallback={null}>
          <ItwinViewCube
            viewport={viewport}
            connection={connection}
            displaySettings={displaySettings}
            onOpenGraphicsPreferences={() => setGraphicsPreferencesOpen(true)}
          />
        </React.Suspense>
      ) : (
        <ViewCube
          viewport={viewport}
          displaySettings={displaySettings}
          onOpenGraphicsPreferences={() => setGraphicsPreferencesOpen(true)}
        />
      )}
      {graphicsPreferencesOpen && displaySettings && (
        <GraphicsPreferencesDialog
          displaySettings={displaySettings}
          onClose={() => setGraphicsPreferencesOpen(false)}
        />
      )}

      {/* 新建草图：Onshape 风格平面视口拾取 + 顶部「选择草图平面」提示条。
          监听挂在 iTwin canvas，不阻挡旋转/缩放；树 Top/Front/Right 同样可选。 */}
      {dialog.active === 'sketch' && viewport && (
        <SketchPlanePicker
          viewport={viewport}
          selected={sketchDraftPlane === 'top' || sketchDraftPlane === 'front' || sketchDraftPlane === 'right'
            ? sketchDraftPlane
            : null}
          onSelect={handleSketchPlaneSelect}
          pendingSketchName={sketchActiveForDialog ? undefined : sketchDialogName}
        />
      )}
      {/* ADR-0018 S1b：草图编辑态（无绘制工具激活）实体/控制点拾取与选中强调。 */}
      {sketchActiveForDecorations && sketchSystem?.activeSketch && activeToolIdForSketchPicker == null && (
        <SketchEntityPicker
          viewport={viewport}
          sketch={sketchSystem.activeSketch}
          selected={sketchEntitySelection}
          canEdit={canEdit}
          previewEntities={sketchPreviewEntities}
          onPreviewChange={setSketchPreviewEntities}
          onCommitDrag={commitSketchDrag}
          onDelete={deleteSelectedSketchEntities}
          onSelectionChange={(entries) => {
            const others = canvasSelectionForSketchPlane.filter(
              (entry) => entry.kind !== 'sketchEntity' && entry.kind !== 'sketchConstraint',
            );
            setCanvasSelection([
              ...others,
              ...entries.map((entry) => ({
                kind: 'sketchEntity' as const,
                id: `${entry.sketchId}:${entry.entityId}`,
                sketchId: entry.sketchId,
                entityId: entry.entityId,
                sketchPart: entry.part,
                ...(entry.handleIndex !== undefined ? { handleIndex: entry.handleIndex } : {}),
              })),
            ]);
          }}
        />
      )}
      {/* ADR-0018 S1f：活动草图面域填充观测面（e2e；绘制在 SketchCurvesDecoration）。 */}
      {sketchActiveForDecorations && sketchSystem?.activeSketch && (
        <span
          data-testid="sketch-region-fills"
          data-count={(sketchSystem.activeSketch.regions ?? [])
            .filter((region) => (region.outerBoundary?.length ?? 0) >= 3).length}
          className="part-studio-plane-picker__marker"
          aria-hidden="true"
        />
      )}
      {/* ADR-0018 S1e：双击尺寸数值 → 内联改值（updateSketchConstraint）。 */}
      {sketchActiveForDecorations && sketchSystem?.activeSketch && activeToolIdForSketchPicker == null && canEdit && (
        <SketchDimensionEditor
          viewport={viewport}
          annotations={sketchAnnotations}
          constraints={sketchSystem.activeSketch.constraints}
          onCommit={async (constraintId, value) => {
            const result = await sketchSystem.applyConstraintValue(constraintId, value);
            return result.ok ? { ok: true } : { ok: false, error: result.error };
          }}
          onUnsupported={(kind) => IModelApp.notifications.outputMessage(new NotifyMessageDetails(
            OutputMessagePriority.Info,
            t('partStudio.sketch.dimensionUnsupported', { kind }),
          ))}
          selectedConstraintId={sketchConstraintSelection}
          onSelectConstraint={selectSketchConstraint}
          onDeleteConstraint={deleteSelectedSketchConstraint}
        />
      )}
      {dialog.active === 'sketch' && sketchDraftPlane === null && (
        <div className="part-studio-plane-prompt" data-testid="sketch-plane-prompt" role="note">
          <span>{t('partStudio.sketchDialog.planePrompt')}</span>
          <button
            type="button"
            className="part-studio-plane-prompt__close"
            aria-label={t('partStudio.sketchDialog.cancel')}
            onClick={handleSketchDialogCancel}
          >
            ×
          </button>
        </div>
      )}

      {/* 连接相位覆盖层（M5-T2）：briefcase 失败错误面 / 下载中骨架。绝对定位
          叠加（z-index 低于草图覆盖层），viewport 区无重排——零布局跳动。错误
          面透传 error.message 原文 + 页面级 host 刷新入口（WebSocket/backend 重启
          后无公开重连 API，整页刷新是唯一诚实恢复路径）；骨架先行占位
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
          <button
            type="button"
            className="part-studio-canvas__connection-error-reload"
            data-testid="part-studio-connection-reload"
            onClick={() => window.location.reload()}
          >
            {t('partStudio.connection.reload')}
          </button>
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

      {/* T6 草图模式覆盖层（os-30）：仅约束标签。2026-11-02 渲染对齐：
          Onshape 草图不铺屏幕栅格，删除原纯视觉 24px lattice 覆盖层。 */}
      {sketchActive && (
        <div
          className="part-studio-canvas__sketch-constraints"
          data-testid="sketch-constraints-overlay"
          role="note"
        >
          {t('partStudio.sketch.constraintsOverlay')}
        </div>
      )}

      {/* 2026-11-02 Onshape live：尺寸标注 DOM 观测面（绘制由 viewer 装饰器
          完成；这里只暴露数量/文本给 e2e，视觉隐藏不占布局）。 */}
      {sketchActive && (
        <div
          className="part-studio-canvas__sketch-annotations"
          data-testid="sketch-annotations"
          data-count={sketchAnnotations.length}
          data-labels={sketchAnnotations.map((annotation) => annotation.text).join('|')}
          aria-hidden="true"
        />
      )}

      {/* 2026-11-02 Onshape live：光标旁阶段提示 + 实时尺寸（线长/角度、
          矩形宽高、圆/弧半径）。pointer-events:none，不挡拾取。 */}
      {sketchActive && <SketchToolFeedbackOverlay />}

      {/* Onshape：草图模式没有常驻「实体/约束/尺寸清单」面板。尺寸与偏移的
          值确认改为在标注/定侧位置弹出的浮层。 */}
      {sketchActive && sketchSystem && <SketchValuePopup sketchSystem={sketchSystem} />}

      <CanvasContextMenu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        onDelete={handleCanvasDelete}
        onDeleteSubEntity={handleDeleteSubEntity}
        onSelectOwner={handleSelectOwner}
        canEdit={canEdit}
        connection={connection}
      />

      {/* T6 内联非模态对话框（os-30/os-31：画布左上角，不遮罩画布）。
          M4-T6 T6-①：key 按模式寻址——edit=featureId（跨特征切换重挂，本地态
          不残留）；new='new-'+featureType（同类型连开亦重挂，上一单的距离/页签
          不泄漏进下一单）。 */}
      {dialog.active === 'feature' && (dialog.featureType === 'hole' ? (
        /* ADR-0006 切片 A：孔使用专用对话框（草图点+blind/throughAll），
           提交同走 FeatureService 的 hole op；不套用通用 FeatureDialog。 */
        <HoleDialog
          key={dialog.mode === 'edit' ? dialog.featureId : 'new-hole'}
          featureName={
            dialog.mode === 'edit'
              ? dialog.featureName
              : t(`partStudio.ribbon.tools.${dialog.featureType}.label`)
          }
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          applyOp={applyOp}
          previewOp={previewOp}
          connection={connection}
          viewport={viewport}
          connectionKey={connection?.key}
          sketches={sketches}
          bodies={bodies}
          canEdit={canEdit}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ) : dialog.featureType === 'cPlane' ? (
        /* ADR-0006 切片 B1：cPlane 使用专用对话框（图元/偏移/偏移距离/反转法线），
           提交 insertFeature/updateParams；不套用通用 FeatureDialog。 */
        <CPlaneDialog
          key={dialog.mode === 'edit' ? dialog.featureId : 'new-cPlane'}
          featureName={dialog.mode === 'edit' ? dialog.featureName : newCPlaneName}
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          applyOp={applyOp}
          canEdit={canEdit}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ) : dialog.featureType === 'shell' ? (
        /* T3：参数化抽壳使用专用对话框（面选择来自 store.canvas.selection，
           移除面 + 壁厚 + 方向；Hollow 契约未支持，不渲染假控件）。 */
        <ShellDialog
          key={dialog.mode === 'edit' ? dialog.featureId : 'new-shell'}
          featureName={dialog.mode === 'edit' ? dialog.featureName : t('partStudio.ribbon.tools.shell.label')}
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          applyOp={applyOp}
          previewOp={previewOp}
          connection={connection}
          viewport={viewport}
          bodies={bodies}
          initialFaces={dialog.mode === 'new' ? dialog.inputFaces : undefined}
          canEdit={canEdit}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ) : dialog.featureType === 'moveFace' ? (
        /* ADR-0014 UI 面：面来自唯一选择权威（路由快照 + 打开后存活选择），
           偏移/给定深度 + 距离；「重新应用圆角」后端未支持，禁用并提示。 */
        <MoveFaceDialog
          key={dialog.mode === 'edit' ? dialog.featureId : 'new-moveFace'}
          featureName={dialog.mode === 'edit' ? dialog.featureName : t('partStudio.ribbon.tools.moveFace.label')}
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          applyOp={applyOp}
          previewOp={previewOp}
          connection={connection}
          viewport={viewport}
          bodies={bodies}
          initialFaces={dialog.mode === 'new' ? dialog.inputFaces : undefined}
          canEdit={canEdit}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ) : dialog.featureType === 'transform' ? (
        /* ADR-0010 UI 面：XYZ 平动 / 世界轴旋转 / 均匀缩放 + 复制；
           目标实体插入时选择（编辑模式只读，创建时确定）。 */
        <TransformDialog
          key={dialog.mode === 'edit' ? dialog.featureId : 'new-transform'}
          featureName={
            dialog.mode === 'edit'
              ? dialog.featureName
              : t('partStudio.ribbon.tools.transform.label')
          }
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          applyOp={applyOp}
          previewOp={previewOp}
          connection={connection}
          viewport={viewport}
          bodies={bodies}
          canEdit={canEdit}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ) : dialog.featureType === 'splitPart' ? (
        /* ADR-0012 UI 面：单侧世界平面切分（目标实体 + XY/YZ/XZ + 偏移 +
           保留侧；面/保留工具/修剪/双侧未支持，静态诚实提示）。 */
        <SplitPartDialog
          key={dialog.mode === 'edit' ? dialog.featureId : 'new-splitPart'}
          featureName={
            dialog.mode === 'edit'
              ? dialog.featureName
              : t('partStudio.ribbon.tools.splitPart.label')
          }
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          applyOp={applyOp}
          previewOp={previewOp}
          connection={connection}
          viewport={viewport}
          bodies={bodies}
          canEdit={canEdit}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ) : dialog.featureType === 'featurePattern' ? (
        /* ADR-0007 切片 8：featurePattern 树行双击编辑。源特征/轴是结构引用
           （只读），可改 kind/count/spacing?/angle?；不渲染方向/面拾取等
           产品未支持的假控件。 */
        <FeaturePatternDialog
          key={dialog.mode === 'edit' ? dialog.featureId : 'new-featurePattern'}
          featureName={dialog.mode === 'edit' ? dialog.featureName : t('partStudio.tree.featureTypes.featurePattern')}
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          applyOp={applyOp}
          previewOp={previewOp}
          connection={connection}
          viewport={viewport}
          canEdit={canEdit}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ) : (
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
          featureId={dialog.mode === 'edit' ? dialog.featureId : undefined}
          mode={dialog.mode}
          // 编辑模式也必须知道特征类型（按类型回显/提交 updateParams）。
          featureType={dialog.featureType as LubanFeatureType | undefined}
          initialPatternKind={dialog.mode === 'edit' ? undefined : dialog.patternKind}
          applyOp={applyOp}
          previewOp={previewOp}
          leaseOk={leaseOk}
          canEdit={canEdit}
          sketches={sketches}
          features={mirrorSourceFeatureOptions}
          connection={connection}
          connectionKey={connection?.key}
          hasBodies={hasBodies}
          bodies={bodies}
          bodiesLoading={bodiesLoading}
          initialFaces={dialog.mode === 'new' ? dialog.inputFaces : undefined}
          bodiesError={bodiesError}
          initialParams={dialog.mode === 'edit' ? featureParams : undefined}
          viewport={viewport}
          onConfirm={closeDialog}
          onCancel={closeDialog}
        />
      ))}
      {dialog.active === 'sketch' && (
        <SketchDialog
          sketchName={sketchDialogName}
          sketchId={dialogSketchId ?? activeSketchIdForDialog ?? undefined}
          editing={sketchActiveForDialog}
          planeId={sketchDraftPlane}
          planes={sketchPlaneOptions}
          onPlaneChange={(plane) => {
            setSketchDraftPlane(plane);
            // 非模型面选项（基准面/cPlane/清除）丢弃模型面快照。
            if (plane !== sketchFacePlane?.id) setSketchFacePlane(null);
            // 只有三基准面同步树选中；cPlane 是特征行，不写 datum 选中态。
            selectDatum(plane === 'top' || plane === 'front' || plane === 'right' ? plane : null);
          }}
          applyOp={applyOp}
          canEdit={canEdit}
          onConfirm={handleSketchConfirm}
          onCancel={handleSketchDialogCancel}
          onFitToView={viewport ? () => {
            // ADR-0018 S1f：草图编辑态适合窗口=草图实体范围（Onshape），不是全局模型。
            const sketch = sketchSystem?.activeSketch;
            if (sketch) {
              fitCameraToSketch(viewport, sketch.plane, sketch.entities);
              return;
            }
            void fitViewToModelRanges(viewport);
          } : undefined}
        />
      )}
    </div>
  );
}
