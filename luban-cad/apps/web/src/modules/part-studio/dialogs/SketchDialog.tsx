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
 * - 四开关勾选组（os-30）：禁用压印/显示约束/显示表达式/显示错误——默认
 *   仅「显示错误」勾选；
 * - ✓确认/✗取消 + 历史时钟 + ? 帮助（展开文案）。
 *
 * store 联动（os-30 草图模式变身的数据源）：✓ → enterSketch + onConfirm 载荷；
 * ✗ → exitSketch + onCancel。历史按钮壳期未接线（console.warn，模块惯例）。
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
import { SvgCheckmark, SvgClock, SvgClose } from '@itwin/itwinui-icons-react';
import type { FeatureOp, FeatureOpResult, SketchPlaneDto } from '@luban-cad/shared';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import './SketchDialog.css';

type SketchPlaneDatumId = 'top' | 'front' | 'right';

/** 平面选项（下拉项寻址单位）。 */
export interface SketchPlaneOption {
  id: string;
  label: string;
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
  /** 活动草图 id（壳期/契约外兜底的 enterSketch 寻址；M6-a T4 起 applyOp 在场时由 RPC 真 featureId 取代）。 */
  sketchId?: string;
  /**
   * 编辑既有草图（Onshape 双击树/创建后保持同一对话框）：✓ = 完成并退出草图，
   * 不再 insertSketch；平面为落库只读值（updateSketch 契约无 plane 键）。
   */
  editing?: boolean;
  /** 平面选项（缺省=缺省基准面 上视/前视/右视；选择主要来自视口/特征树）。 */
  planes?: readonly SketchPlaneOption[];
  /** 受控平面 id（画布视口拾取/特征树选择驱动；缺省时对话框内部维护）。 */
  planeId?: SketchPlaneDatumId | null;
  /** 平面变化出口（选择或清除）。 */
  onPlaneChange?: (plane: SketchPlaneDatumId | null) => void;
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
  editing = false,
  planes,
  planeId,
  onPlaneChange,
  applyOp,
  canEdit = true,
  onConfirm,
  onCancel,
  onHistory,
}: SketchDialogProps): React.JSX.Element {
  const { t } = useTranslation();
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

  const [internalPlane, setInternalPlane] = React.useState('');
  const plane = planeId !== undefined ? (planeId ?? '') : internalPlane;
  const setPlane = React.useCallback((next: string) => {
    setInternalPlane(next);
    onPlaneChange?.((next || null) as SketchPlaneDatumId | null);
  }, [onPlaneChange]);
  const [planeMenuOpen, setPlaneMenuOpen] = React.useState(false);
  const [disableImprint, setDisableImprint] = React.useState(false);
  const [showConstraints, setShowConstraints] = React.useState(false);
  const [showExpressions, setShowExpressions] = React.useState(false);
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

  const handleHistory = React.useCallback(() => {
    if (onHistory) {
      onHistory();
    } else {
      console.warn('[part-studio] 草图历史（onHistory 未接线）');
    }
  }, [onHistory]);

  const buildResult = React.useCallback((): SketchDialogResult => ({
    plane,
    disableImprint,
    showConstraints,
    showExpressions,
    showErrors,
  }), [plane, disableImprint, showConstraints, showExpressions, showErrors]);

  /**
   * 确认出口（M6-a T4）：applyOp 在场 → insertSketch 直提交（空草图先建壳；
   * 平面映射随 op 下发）——成功 → enterSketch(真 sketchId)+onConfirm；失败 →
   * 就地 Alert，不进草图模式、不关框。applyOp 未接线（壳期/纯展示）回退 M3
   * 纯回调语义（enterSketch 占位寻址，同 FeatureDialog 未接线回退）。
   */
  const handleConfirm = React.useCallback(() => {
    if (submitting || !canEdit || plane === '') return; // 禁重入 + 只读门禁 + 未选平面
    if (editing) {
      // Onshape：编辑态 ✓ = 完成草图（几何修改已逐 op 提交）。
      onConfirm?.(buildResult());
      return;
    }
    if (!applyOp) {
      enterSketch(sketchId ?? 'sketch-active');
      onConfirm?.(buildResult());
      return;
    }
    setError(undefined);
    setSubmitting(true);
    // 平面映射（M6-a T4）：基准面三向量随 op 下发；非基准面（拾取面/未选）→
    // 省略 plane 键，契约缺省 XY@z=0（见 sketchPlaneFromOption 注）。
    const planeDto = sketchPlaneFromOption(plane);
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
  }, [submitting, canEdit, editing, applyOp, enterSketch, sketchId, onConfirm, buildResult, plane]);

  const handleCancel = React.useCallback(() => {
    exitSketch();
    onCancel?.();
  }, [exitSketch, onCancel]);

  const selectedOption = planeOptions.find((option) => option.id === plane);

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
            disabled={submitting || !canEdit || plane === ''}
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
              {selectedOption?.label ?? t('partStudio.sketchDialog.planeFieldPlaceholder')}
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
        </div>
        {plane === '' && (
          <p className="part-studio-sketch-dialog__hint" data-testid="sketch-plane-hint">
            {t('partStudio.sketchDialog.planeHint')}
          </p>
        )}

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
