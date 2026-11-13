/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SketchDialog（M3 Task 6）：草图对话框（对齐 os-30）——
 * - 非模态内联面板（同 Extrude 对话框位：画布区左上角，aria-modal=false +
 *   无 backdrop）；
 * - 草图平面选择：下拉（缺省基准面 上视/前视/右视 + 占位项）+ 快速拾取
 *   （仅 `kind='face'` 的 useCanvasSelection 主选择成动态选项并选中；part/
 *   edge/vertex/feature 主选择不是平面——不添选项、不改当前所选，防选中桥
 *   新写入的 body 选择被误当草图平面）；
 * - 四开关勾选组（os-30）：禁用压印/显示约束/显示表达式/显示错误——Onshape
 *   live 默认显示约束/显示表达式/显示错误勾选（禁用压印不勾）；
 * - ✓确认/✗取消 + 缩放到合适大小 + ? 帮助（展开文案）。
 *
 * store 联动（os-30 草图模式变身的数据源）：✓ → enterSketch + onConfirm 载荷；
 * ✗ → exitSketch + onCancel。底栏左钮=缩放到合适大小（真实视图取景）。
 *
 * M6-a T4（insertSketch RPC 接线，F1）：applyOp 在场时 ✓ →
 * `{kind:'insertSketch', entities:[], constraints:[], plane?}`（空草图先建壳）
 * → 成功（{ok:true,featureId}）→ enterSketch(真 sketchId——废 'sketch-active'
 * 占位串)+onConfirm；失败（{ok:false,error}）→ 就地 Alert，不进草图模式、
 * 不关框。plane=平面映射（sketchPlaneFromOption——基准面三向量随 op 下发；
 * 快速拾取面 id 无几何可解析 → 省略 plane 键，契约缺省 XY@z=0 保持 M3-b
 * 语义，拾取面→平面解析归后续单裁）。applyOp 未接线（壳期/纯展示）回退 M3
 * 纯回调语义（同 FeatureDialog 未接线回退）。只读写门禁（B2 同款）：
 * canEdit=false → ✓ 禁用+只读提示，不发起 applyOp（hook 层 useFeatureSystem
 * readonly 前置拒收为第二道防御）。提交中禁重入（✓ 禁用+aria-busy）；卸载
 * 守卫同 FeatureDialog aliveRef。成功不发 toast——进草图模式（ribbon 变身+
 * 覆盖层）即成功反馈（FeatureDialog toast 系关框后树节点不可见的补偿）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Svg2D, SvgCheckmark, SvgClock, SvgClose, SvgFitToView } from '@itwin/itwinui-icons-react';
import { IModelApp } from '@itwin/core-frontend';
import type { FeatureOp, FeatureOpResult, SketchPlaneDto } from '@luban-cad/shared';
import { fitViewToModelRanges } from '@luban-cad/viewer';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { orientCameraToSketchPlane } from '../canvas/sketch-camera.js';
import './SketchDialog.css';

/** 平面选项（下拉项寻址单位）。`plane`（v1.29）：cPlane 等自定义平面的世界快照；
 *  缺省=三基准面，由 sketchPlaneFromOption 按 id 映射（旧行为逐字不变）。 */
export interface SketchPlaneOption {
  id: string;
  label: string;
  plane?: SketchPlaneDto;
}

/** 三基准面选项 id（DEFAULT_PLANES 寻址；平面映射的判别域）。 */
export type SketchDatumPlaneId = 'top' | 'front' | 'right';

/**
 * 平面选项 id → SketchPlaneDto（M6-a T4：世界系米制三向量；origin 恒原点）。
 * 上视=XY 面（normal +Z，xDir +X）；前视=XZ 面（normal +Y，xDir +X）；
 * 右视=YZ 面（normal +X，xDir +Y）。非基准面 id（快速拾取的面/未选）→
 * undefined——op 省略 plane 键，契约缺省 XY@z=0（M3-b 语义；拾取面→平面
 * 解析需 resolveFaceRef+面框提取，归后续单裁）。
 */
export function sketchPlaneFromOption(optionId: string): SketchPlaneDto | undefined {
  const origin = { x: 0, y: 0, z: 0 };
  switch (optionId) {
    case 'top':
      return { origin, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } };
    case 'front':
      return { origin, normal: { x: 0, y: 1, z: 0 }, xDir: { x: 1, y: 0, z: 0 } };
    case 'right':
      return { origin, normal: { x: 1, y: 0, z: 0 }, xDir: { x: 0, y: 1, z: 0 } };
    default:
      return undefined;
  }
}

/** 确认载荷：草图对话框全量本地态回传（新建草图 RPC 接线口）。
 *  `planeDto`（v1.29）：选中项自带的世界平面（cPlane）；缺省时由宿主按 `plane` 映射三基准面。 */
export interface SketchDialogResult {
  plane: string;
  planeDto?: SketchPlaneDto;
  disableImprint: boolean;
  showConstraints: boolean;
  showExpressions: boolean;
  showErrors: boolean;
}

export interface SketchDialogProps {
  /** 草图名（标题=对话框可访问名，os-30「草图 N」；缺省「草图」）。 */
  sketchName?: string;
  /** 活动草图 id（壳期/契约外兜底的 enterSketch 寻址；M6-a T4 起 applyOp 在场时由 RPC 真 featureId 取代）。 */
  sketchId?: string;
  /**
   * 编辑既有草图（Onshape 双击树/创建后保持同一对话框）：✓ = 完成并退出草图，
   * 不再 insertSketch；平面为落库只读值（updateSketch 契约无 plane 键）。
   */
  editing?: boolean;
  /** 平面选项（缺省=缺省基准面 上视/前视/右视；选择主要来自视口/特征树）。 */
  planes?: readonly SketchPlaneOption[];
  /** 受控平面 id（三基准面或 cPlane 特征 id；画布视口拾取/对话框选择驱动）。 */
  planeId?: string | null;
  /** 平面变化出口（选择或清除）。 */
  onPlaneChange?: (plane: string | null) => void;
  /** op 提交面（M6-a T4：Session useFeatureSystem.applyOp 直通；缺省=纯回调壳期语义）。 */
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /**
   * 编辑面总门（B2 只读写门禁，M5-T3 单点合流的下游消费）：false 时 ✓ 禁用+
   * 只读提示，不发起 applyOp（不进租约获取等待环）。缺省 true（壳期/纯展示
   * 语义保持；生产宿主恒显式传参）。
   */
  canEdit?: boolean;
  /** ✓确认出口（enterSketch 之后调用）。 */
  onConfirm?: (result: SketchDialogResult) => void;
  /** ✗取消出口（exitSketch 之后调用）。 */
  onCancel?: () => void;
  /**
   * 适合窗口（ADR-0018 S1f）：编辑态由宿主按草图实体范围取景（Onshape 语义）；
   * 缺省回退全局模型取景。
   */
  onFitToView?: () => void;
  /**
   * ADR-0018 S1g：受控「显示约束」开关（宿主 gate 草图 glyph/尺寸标注覆盖层）。
   * 缺省为内部态；提供该 prop 时以宿主值为准，变更经 onShowConstraintsChange 回传。
   */
  showConstraints?: boolean;
  onShowConstraintsChange?: (visible: boolean) => void;
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
  editing = false,
  planes,
  planeId,
  onPlaneChange,
  applyOp,
  canEdit = true,
  onConfirm,
  onCancel,
  onFitToView,
  showConstraints: showConstraintsProp,
  onShowConstraintsChange,
}: SketchDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const enterSketch = usePartStudioStore((s) => s.enterSketch);
  const exitSketch = usePartStudioStore((s) => s.exitSketch);
  const activeSketchPlane = usePartStudioStore((s) => s.sketch.activeSketchPlane);

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

  const [internalPlane, setInternalPlane] = React.useState('');
  const plane = planeId !== undefined ? (planeId ?? '') : internalPlane;
  /** 下拉选择来源标记：下拉选平面仍走 ✓（既有语义）；视口/树拾取直接进草图。 */
  const dropdownPlaneRef = React.useRef<string | null>(null);
  const setPlane = React.useCallback((next: string) => {
    dropdownPlaneRef.current = next;
    setInternalPlane(next);
    onPlaneChange?.(next || null);
  }, [onPlaneChange]);
  const [planeMenuOpen, setPlaneMenuOpen] = React.useState(false);
  const [disableImprint, setDisableImprint] = React.useState(false);
  // Onshape live（2026-11-12 截图）：显示约束/显示表达式/显示错误默认勾选，
  // 仅「禁用压印」默认不勾。
  const [showConstraintsInternal, setShowConstraintsInternal] = React.useState(true);
  // ADR-0018 S1g：宿主受控（覆盖层 gate）优先；缺省回落内部态（纯展示/壳期）。
  const showConstraints = showConstraintsProp ?? showConstraintsInternal;
  const [showExpressions, setShowExpressions] = React.useState(true);
  const [showErrors, setShowErrors] = React.useState(true);
  const [helpOpen, setHelpOpen] = React.useState(false);
  // 提交态（M6-a T4）：提交中禁重入；错误就地 Alert（对话框不关——FeatureDialog 同款）。
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  // 卸载守卫（FeatureDialog 同款）：pending 期间宿主关闭（✗）后的迟到回包不得再 setState。
  // StrictMode 正确形态（T8 真栈冒烟修正，原 `useEffect(() => () => {...})` 只挂
  // cleanup 不重置——React 18 dev 双挂载（mount→cleanup→mount，ref 持久）后恒
  // false，提交回包永远在 `if (!aliveRef.current) return` 早退：aria-busy 永挂、
  // enterSketch 永不执行（jsdom 单测无双挂载故绿，dev 真栈必挂——M6-a T8 实录）。
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Onshape live：草图对话框底栏左钮 = 缩放到合适大小（真实 fit，不做假历史）。
  const handleFitToView = React.useCallback(() => {
    if (onFitToView) {
      onFitToView();
      return;
    }
    const viewport = IModelApp.viewManager?.selectedView;
    if (viewport) void fitViewToModelRanges(viewport);
  }, [onFitToView]);
  // ADR-0018 S1f：编辑既有草图不自动转正（live），改为显式「正视草图平面」。
  const handleViewNormal = React.useCallback(() => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (viewport) orientCameraToSketchPlane(viewport, activeSketchPlane);
  }, [activeSketchPlane]);

  const selectedOption = planeOptions.find((option) => option.id === plane);
  /** v1.29：选中项自带 plane（cPlane）优先；三基准面回退旧映射。 */
  const resolvedPlane = React.useCallback(
    (): SketchPlaneDto | undefined => selectedOption?.plane ?? sketchPlaneFromOption(plane),
    [selectedOption, plane],
  );

  const buildResult = React.useCallback((): SketchDialogResult => ({
    plane,
    // 仅自定义平面（cPlane）把快照带进确认载荷；三基准面维持旧载荷形状（宿主回退映射）。
    ...(selectedOption?.plane !== undefined ? { planeDto: selectedOption.plane } : {}),
    disableImprint,
    showConstraints,
    showExpressions,
    showErrors,
  }), [plane, selectedOption, disableImprint, showConstraints, showExpressions, showErrors]);

  /**
   * 确认出口（M6-a T4）：applyOp 在场 → insertSketch 直提交（空草图先建壳；
   * 平面映射随 op 下发）——成功 → enterSketch(真 sketchId)+onConfirm；失败 →
   * 就地 Alert，不进草图模式、不关框。applyOp 未接线（壳期/纯展示）回退 M3
   * 纯回调语义（enterSketch 占位寻址，同 FeatureDialog 未接线回退）。
   */
  const handleConfirm = React.useCallback(() => {
    // 编辑既有草图时平面只读且 updateSketch 不携带 plane——偏移/自定义平面
    // 无法映射到三基准面时 plane 为空，但不得因此阻断「完成草图」。
    if (submitting || !canEdit || (plane === '' && !editing)) return; // 禁重入 + 只读门禁 + 新建未选平面
    if (editing) {
      // Onshape：编辑态 ✓ = 完成草图（几何修改已逐 op 提交）。
      onConfirm?.(buildResult());
      return;
    }
    if (!applyOp) {
      // 2026-11-13 Onshape live：进入草图不改相机（用户可随时用「正视草图平面」）。
      enterSketch(sketchId ?? 'sketch-active');
      onConfirm?.(buildResult());
      return;
    }
    setError(undefined);
    setSubmitting(true);
    // 平面映射（M6-a T4；v1.29 cPlane）：选中项自带世界平面优先；三基准面回退旧映射；
    // 非基准面（拾取面/未选）→ 省略 plane 键，契约缺省 XY@z=0。
    const planeDto = resolvedPlane();
    const op: FeatureOp = planeDto
      ? { kind: 'insertSketch', entities: [], constraints: [], plane: planeDto }
      : { kind: 'insertSketch', entities: [], constraints: [] };
    void (async () => {
      let result: FeatureOpResult;
      try {
        result = await applyOp(op);
      } catch (err) {
        // rpc-over-ipc 异常（连接断开等）——与拒收同面呈现，不静默（FeatureDialog 同款）。
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (!aliveRef.current) return;
      setSubmitting(false);
      if (result.ok) {
        // 真 sketchId 入 store（废 'sketch-active' 占位串）；featureId 缺省=
        // 契约外兜底（insertSketch 后端恒返回 featureId），回退壳期寻址。
        enterSketch(result.featureId ?? sketchId ?? 'sketch-active');
        onConfirm?.(buildResult());
      } else {
        setError(result.error);
      }
    })();
  }, [submitting, canEdit, editing, applyOp, enterSketch, sketchId, onConfirm, buildResult, plane, resolvedPlane]);

  // 2026-11-13（用户反馈）：新建草图时**选平面即进入编辑**（Onshape 流程）——
  // 视口拾取/特征树基准面点击（外部 planeId 变化）直接创建并进入草图编辑，
  // 不再需要额外 ✓。下拉选择保留 ✓（既有语义/测试口径；dropdownPlaneRef 标记）。
  // 初始即带平面（如先选模型面再点草图）= 已确认过的选择，不自动再创建。
  const confirmRef = React.useRef(handleConfirm);
  confirmRef.current = handleConfirm;
  const lastAutoPlaneRef = React.useRef(plane);
  React.useEffect(() => {
    const previous = lastAutoPlaneRef.current;
    lastAutoPlaneRef.current = plane;
    if (previous === plane) return;
    if (editing || submitting || !canEdit || plane === '') return;
    if (dropdownPlaneRef.current === plane) {
      dropdownPlaneRef.current = null; // 下拉选择：等待显式 ✓
      return;
    }
    confirmRef.current();
  }, [plane, editing, submitting, canEdit]);

  const handleCancel = React.useCallback(() => {
    exitSketch();
    onCancel?.();
  }, [exitSketch, onCancel]);

  // ADR-0017 Stage D：Onshape Escape = 取消草图工具（红 X 同义）。非模态面板，
  // 焦点可在画布上——监听 window；提交中不取消（等待落位，防半提交）。
  const cancelRef = React.useRef(handleCancel);
  cancelRef.current = handleCancel;
  React.useEffect(() => {
    if (submitting) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // 已被工具栏飞菜单等更内层消费的 Esc 不得再退出草图（Onshape：Esc 只关
      // 菜单；RibbonDropdown 的 document 处理器先 preventDefault）。
      if (event.defaultPrevented) return;
      // Onshape：草图工具激活时 Esc 先结束工具（工具自身处理），不得顺带退出草图。
      // 工具主动退出后 activeTool 会切回选择工具，下一次 Esc 才退出草图。
      const activeTool = (IModelApp.toolAdmin as unknown as { activeTool?: { toolId?: string } } | undefined)?.activeTool;
      const toolId = activeTool?.toolId;
      if (typeof toolId === 'string' && toolId.startsWith('Sketch.')) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      cancelRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [submitting]);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={sketchName ?? t('partStudio.sketchDialog.defaultTitle')}
      aria-busy={submitting || undefined}
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
            disabled={submitting || !canEdit || (plane === '' && !editing)}
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
        </div>
      </header>

      {helpOpen && (
        <p role="note" className="part-studio-sketch-dialog__help-text">
          {t('partStudio.sketchDialog.helpText')}
        </p>
      )}

      <div className="part-studio-sketch-dialog__body">
        {/* 提交错误就地 Alert（M6-a T4；FeatureDialog 同款——失败不关框可改参重试）。 */}
        {error && (
          <p
            role="alert"
            className="part-studio-sketch-dialog__alert"
            data-testid="part-studio-sketch-dialog-error"
          >
            {error}
          </p>
        )}

        {/* 只读权限提示（B2 只读写门禁）：✓ 已禁用时的诚实呈现。 */}
        {!canEdit && (
          <p
            role="note"
            className="part-studio-sketch-dialog__hint"
            data-testid="part-studio-sketch-dialog-readonly-hint"
          >
            {t('partStudio.sketchDialog.readonlyHint')}
          </p>
        )}

        {/* 草图平面字段（Onshape live：字段本身不是下拉框；主场选择是在视口/
            特征树点击基准面。字段点击提供可访问的基准面列表兜底，无箭头）。 */}
        <div className="part-studio-sketch-dialog__plane-row">
          <span className="part-studio-sketch-dialog__plane-label">
            {t('partStudio.sketchDialog.planeLabel')}
          </span>
          <div className="part-studio-sketch-dialog__plane-field" data-testid="sketch-plane-field">
            <button
              type="button"
              role="combobox"
              aria-label={t('partStudio.sketchDialog.planeLabel')}
              aria-expanded={planeMenuOpen}
              aria-controls="part-studio-sketch-plane-menu"
              className="part-studio-sketch-dialog__plane-value"
              data-testid="sketch-plane-field-button"
              disabled={editing}
              onClick={() => {
                if (!editing) setPlaneMenuOpen((open) => !open);
              }}
            >
              {selectedOption
                ? `${selectedOption.label}${
                  selectedOption.id === 'top' || selectedOption.id === 'front' || selectedOption.id === 'right'
                    ? t('partStudio.sketchDialog.planeNameSuffix')
                    : ''
                }`
                : (editing ? t('partStudio.sketchDialog.customPlane') : t('partStudio.sketchDialog.planeFieldPlaceholder'))}
            </button>
            {!editing && plane !== '' && (
              <button
                type="button"
                className="part-studio-sketch-dialog__plane-clear"
                aria-label={t('partStudio.sketchDialog.clearPlane')}
                title={t('partStudio.sketchDialog.clearPlane')}
                onClick={() => {
                  setPlane('');
                  setPlaneMenuOpen(false);
                }}
              >
                ×
              </button>
            )}
            {!editing && planeMenuOpen && (
              <ul
                id="part-studio-sketch-plane-menu"
                role="listbox"
                aria-label={t('partStudio.sketchDialog.planeLabel')}
                className="part-studio-sketch-dialog__plane-menu"
              >
                {planeOptions.map((option) => (
                  <li key={option.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.id === plane}
                      onClick={() => {
                        setPlane(option.id);
                        setPlaneMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Onshape live：历史时钟在字段右侧、字段框之外（装饰；无真实历史面板）。 */}
          {!editing && (
            <span className="part-studio-sketch-dialog__plane-clock" aria-hidden="true">
              <SvgClock />
            </span>
          )}
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
              onChange={(event) => {
                setShowConstraintsInternal(event.target.checked);
                onShowConstraintsChange?.(event.target.checked);
              }}
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
      {/* Onshape live：草图对话框底栏=左侧「缩放到合适大小」图标 + 右侧 ?。 */}
      <footer className="part-studio-sketch-dialog__footer">
        {editing && (
          <button
            type="button"
            aria-label={t('partStudio.sketchDialog.viewNormalToPlane')}
            title={t('partStudio.sketchDialog.viewNormalToPlane')}
            className="part-studio-sketch-dialog__history"
            data-testid="sketch-view-normal"
            onClick={handleViewNormal}
          >
            <Svg2D />
          </button>
        )}
        <button
          type="button"
          aria-label={t('partStudio.sketchDialog.fitToView')}
          title={t('partStudio.sketchDialog.fitToView')}
          className="part-studio-sketch-dialog__history"
          onClick={handleFitToView}
        >
          <SvgFitToView />
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
      </footer>
    </div>
  );
}
