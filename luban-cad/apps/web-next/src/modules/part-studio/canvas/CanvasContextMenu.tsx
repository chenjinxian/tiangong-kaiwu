/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CanvasContextMenu（M3 Task 5）：画布右键菜单（对齐 os-12 + 旧应用空白态
 * 口径）——选择驱动重构的落地组件：
 * - 空白态：适应视图/顶/前/右/等轴测/显示设置（沿袭旧应用 EditorViewport
 *   空白态菜单；显示设置 → store dock display 页签展开）；
 * - 选中态按 primary.kind 重构（part/face/edge/feature/vertex）——os-12
 *   可落地子集：编辑特征（M4-T6 起 edit 模式 FeatureDialog 宿主路由）/显示依赖（gated）/隐藏
 *   （store.hiddenIds + viewport 隐藏）/缩放到合适大小/视图垂直于/删除
 *   （HITL 确认）；零件/面附加材料·外观·工程图 gated 项（完整 UI 面：照常
 *   可点 → 能力引导对话框）；
 * - 每项带左置图标（os-12 V18；M4-T8 D5 收口，aria-hidden 纯装饰）；
 * - 菜单模型=buildCanvasMenu 纯函数（选中态/空白态切换的测试钉点）；
 * - 监听一次注册（M4-T8 收 M3 终审 T5-⑤：Escape/外部 mousedown 监听挂载期
 *   一次到位，anchor/onClose 经 ref 取用——不再随每次右键重挂）。
 *
 * 开合由宿主（PartStudioCanvas）经 anchor 驱动：anchor=null 渲染空（常驻
 * 挂载、右键驱动），Escape/外部 mousedown 收合。
 *
 * 【gated→full 翻转检查单】（能力注册表翻转时逐项过，防静默 no-op）：
 * 1. 占位 kind 清零——assign-material/edit-appearance/create-drawing/
 *    appearance-for-face 四项今日为专名 kind + 诚实占位动作（注册表翻转后
 *    reachable），翻转时必须同步接真实动作实现并从占位 case 组移出；
 * 2. 每项 action 路由与后端面对齐（dependencies 面板、材料/外观/工程图
 *    后端能力）；
 * 3. capabilities.test.ts EXPECTED_GATED_IDS 与 i18n capabilities 文案同步
 *    删改。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmphasizeElements, IModelApp } from '@itwin/core-frontend';
import {
  SvgAlignLeft,
  SvgAlignRight,
  SvgAlignTop,
  SvgDelete,
  SvgDocumentation,
  SvgEdit,
  SvgFitToView,
  SvgHierarchyTree,
  SvgLayers,
  SvgModel,
  SvgObjectRotate,
  SvgPalette,
  SvgSettings,
  SvgVisibilityHide,
  SvgWindowZoomIn,
} from '@itwin/itwinui-icons-react';
import { isGated } from '../internal/capabilities.js';
import {
  fitView,
  standardView,
  viewNormalToSelection,
  zoomToSelection,
} from '../internal/viewport-actions.js';
import type { StandardViewKind } from '../internal/viewport-actions.js';
import { CapabilityDialog } from '../ribbon/Ribbon.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { CanvasSelection } from '../types.js';

/** 画布菜单动作（组件层路由到 viewport/store/HITL/能力引导）。 */
export type CanvasMenuAction =
  | { kind: 'fit-view' }
  | { kind: 'standard-view'; view: StandardViewKind }
  | { kind: 'open-display-settings' }
  | { kind: 'edit-feature' }
  | { kind: 'show-dependencies' }
  | { kind: 'hide' }
  | { kind: 'zoom-to-fit' }
  | { kind: 'view-normal-to' }
  | { kind: 'delete' }
  // M4-T8 T5-⑥：材料/外观/工程图四项各持专名 kind（不再借道
  // show-dependencies）——gated 翻转后可达；真实动作随后端面接线（头注
  // 「翻转检查单」第 1 条）。
  | { kind: 'assign-material' }
  | { kind: 'edit-appearance' }
  | { kind: 'create-drawing' }
  | { kind: 'appearance-for-face' };

export interface CanvasMenuItem {
  id: string;
  /** i18n 键（partStudio.canvasMenu.*）。 */
  labelKey: string;
  /** 标签插值 {name}（选中实体显示名）。 */
  usesName: boolean;
  /** 能力键（gated → 能力引导对话框；缺省 full 直执行）。 */
  capability?: string;
  /** 左置图标（os-12 V18；aria-hidden 纯装饰）。 */
  icon: React.ComponentType;
  action: CanvasMenuAction;
}

/** 菜单条目 = 菜单项 | 分隔线。 */
export type CanvasMenuEntry = CanvasMenuItem | 'separator';

function item(id: string, labelKey: string, icon: React.ComponentType, action: CanvasMenuAction, usesName = false, capability?: string): CanvasMenuItem {
  return { id, labelKey: `partStudio.canvasMenu.${labelKey}`, icon, action, usesName, capability };
}

/** 视图命令组（隐藏/缩放/视图垂直于——所有选中态共用）。 */
function viewCommandGroup(): CanvasMenuEntry[] {
  return [
    item('hide', 'hide', SvgVisibilityHide, { kind: 'hide' }, true),
    item('zoom-to-fit', 'zoomToFit', SvgWindowZoomIn, { kind: 'zoom-to-fit' }),
    item('view-normal-to', 'viewNormalTo', SvgObjectRotate, { kind: 'view-normal-to' }),
  ];
}

/**
 * 画布右键菜单模型（纯函数）——按选择集重构：
 * 空=空白态菜单；非空按 primary.kind 分派（多选以主选择为准，os-12 同口径）。
 */
export function buildCanvasMenu(selection: readonly CanvasSelection[]): CanvasMenuEntry[] {
  const primary = selection.length > 0 ? selection[selection.length - 1] : undefined;
  if (!primary) {
    return [
      item('fit-view', 'fitView', SvgFitToView, { kind: 'fit-view' }),
      'separator',
      item('standard-view-top', 'top', SvgAlignTop, { kind: 'standard-view', view: 'top' }),
      item('standard-view-front', 'front', SvgAlignLeft, { kind: 'standard-view', view: 'front' }),
      item('standard-view-right', 'right', SvgAlignRight, { kind: 'standard-view', view: 'right' }),
      item('standard-view-iso', 'iso', SvgModel, { kind: 'standard-view', view: 'iso' }),
      'separator',
      item('open-display-settings', 'displaySettings', SvgSettings, { kind: 'open-display-settings' }),
    ];
  }
  switch (primary.kind) {
    case 'feature':
      return [
        item('edit-feature', 'editFeature', SvgEdit, { kind: 'edit-feature' }, true),
        item('show-dependencies', 'showDependencies', SvgHierarchyTree, { kind: 'show-dependencies' }, true, 'dependencies'),
        'separator',
        ...viewCommandGroup(),
        'separator',
        item('delete', 'delete', SvgDelete, { kind: 'delete' }, true),
      ];
    case 'part':
      return [
        ...viewCommandGroup(),
        'separator',
        // M4-T8 T5-⑥：四项 gated 占位各持专名 kind（真实动作随后端面接线，
        // 头注「gated→full 翻转检查单：占位 kind 清零」）。
        item('assign-material', 'assignMaterial', SvgLayers, { kind: 'assign-material' }, true, 'material'),
        item('edit-appearance', 'editAppearance', SvgPalette, { kind: 'edit-appearance' }, true, 'appearance'),
        item('create-drawing', 'createDrawing', SvgDocumentation, { kind: 'create-drawing' }, true, 'drawing'),
        'separator',
        item('delete', 'delete', SvgDelete, { kind: 'delete' }, true),
      ];
    case 'face':
      return [
        ...viewCommandGroup(),
        'separator',
        item('appearance-for-face', 'appearanceForFace', SvgPalette, { kind: 'appearance-for-face' }, false, 'appearance'),
        'separator',
        item('delete', 'delete', SvgDelete, { kind: 'delete' }, true),
      ];
    case 'edge':
    case 'vertex':
      return [...viewCommandGroup(), 'separator', item('delete', 'delete', SvgDelete, { kind: 'delete' }, true)];
  }
}

/** 视口边缘钳制 margin（px）——菜单贴边仍留出可抓握的呼吸位。 */
const MENU_VIEWPORT_MARGIN = 8;

/**
 * 菜单视口边缘钳制（终审 T5-④ 收口，纯函数）——右/下溢出时向内收到
 * `视口 - 菜单尺寸 - margin`；左/上负坐标钳到 margin；菜单大于视口时钳到
 * margin（不追求完整可见，只保证不越界）。坐标=client 坐标（菜单
 * `position:fixed`）。
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number = MENU_VIEWPORT_MARGIN,
): { x: number; y: number } {
  return {
    x: Math.max(margin, Math.min(x, viewportWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(y, viewportHeight - menuHeight - margin)),
  };
}

export interface CanvasContextMenuProps {
  /** 菜单锚点（视口 client 坐标）；null=关闭（常驻挂载，右键驱动开合）。 */
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  /**
   * 删除确认提交（HITL 出口；B6 M-A5 T2 起 PartStudioCanvas 接 body 删除）。
   * 守卫注记：画布 body 删除接线当前只处理 `kind='part'` 选择——face/edge/
   * vertex 选择落进本回调后不产生删除动作。未来面/边删除需各自的 owner 映射
   *（面→所属体、边→相邻体），不得复用 body 删除通道（F3 终审注记，无行为
   * 变更）。
   */
  onDelete?: (selection: readonly CanvasSelection[]) => void;
  /**
   * B6 M-A5 T2：编辑面总门（canEdit 单点合流直通）。false 时「删除」项保持
   * 渲染但 disabled（可见 title 提示），点击不打开 HITL；其余菜单项
   * （视图/隐藏/gated 引导）不受影响。缺省 true（测试/壳期语义）。
   */
  canEdit?: boolean;
}

/** 选中实体显示名（label 缺省回退 id）。 */
function selectionName(entry: CanvasSelection): string {
  return entry.label ?? entry.id;
}

export function CanvasContextMenu({
  anchor,
  onClose,
  onDelete,
  canEdit = true,
}: CanvasContextMenuProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const selection = usePartStudioStore((s) => s.canvas.selection);
  const hideNodes = usePartStudioStore((s) => s.hideNodes);
  const setCanvasSelection = usePartStudioStore((s) => s.setCanvasSelection);
  const setDockTab = usePartStudioStore((s) => s.setDockTab);
  const openDock = usePartStudioStore((s) => s.openDock);
  const openFeatureDialog = usePartStudioStore((s) => s.openFeatureDialog);
  const [gatedCapability, setGatedCapability] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState(false);
  // 视口边缘钳制（终审 T5-④）：anchor 落在右/下边缘时菜单被截出视口外——
  // 渲染后实测菜单尺寸，layout effect（绘制前）钳制到视口内，无闪现。
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState<{ x: number; y: number }>({ x: anchor?.x ?? 0, y: anchor?.y ?? 0 });
  React.useLayoutEffect(() => {
    if (!anchor) return;
    const el = menuRef.current;
    setPosition({ x: anchor.x, y: anchor.y });
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition(clampMenuPosition(anchor.x, anchor.y, rect.width, rect.height, window.innerWidth, window.innerHeight));
  }, [anchor]);

  // Escape/外部 mousedown 收合（旧应用 EditorViewport 同口径）。
  // M4-T8 收 M3 终审 T5-⑤：监听一次注册——挂载期一次到位，anchor/onClose
  // 经 ref 取用，不再随每次右键（anchor 变化）重挂一对监听（效率债收口）。
  const anchorRef = React.useRef(anchor);
  anchorRef.current = anchor;
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    const handleMouseDown = () => {
      if (anchorRef.current) onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && anchorRef.current) onCloseRef.current();
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
    // 监听终身一次挂载；闭包内一律走 ref（意图在此注记，非遗漏依赖）。
  }, []);

  const primary = selection.length > 0 ? selection[selection.length - 1]! : null;

  const runAndClose = React.useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose],
  );

  const handleItemClick = React.useCallback(
    (menuItem: CanvasMenuItem) => {
      const action = menuItem.action;
      // gated 项照常可点 → 能力引导对话框（不灰化不删减）。
      if (menuItem.capability && isGated(menuItem.capability)) {
        runAndClose(() => setGatedCapability(menuItem.capability!));
        return;
      }
      switch (action.kind) {
        case 'fit-view':
          runAndClose(fitView);
          return;
        case 'standard-view':
          runAndClose(() => standardView(action.view));
          return;
        case 'open-display-settings':
          runAndClose(() => {
            setDockTab('display');
            openDock();
          });
          return;
        case 'edit-feature': {
          // M4-T6：画布拾取的特征=既有特征——编辑路由走 edit 模式对话框（树上
          // 「编辑…」同宿主同 key 寻址），不经 ribbon 的 new 路由（那是创建
          // 语义，activate('extrude') 已改道 FeatureDialog new/extrude），
          // 亦不经 tools.run（未接线伪 toolId）。
          const picked = primary;
          if (!picked?.featureType) {
            console.warn('[part-studio] 编辑特征缺少 featureType（选择集元数据不全）');
            onClose();
            return;
          }
          runAndClose(() => {
            openFeatureDialog({
              mode: 'edit',
              featureId: picked.id,
              featureName: selectionName(picked),
              featureType: picked.featureType!,
            });
          });
          return;
        }
        case 'hide':
          runAndClose(() => {
            const ids = selection.map((s) => s.id);
            hideNodes(ids);
            const viewport = IModelApp.viewManager?.selectedView;
            if (viewport) {
              try {
                EmphasizeElements.getOrCreate(viewport).hideElements(ids, viewport, true);
              } catch (err) {
                console.warn('[part-studio] viewport 隐藏应用失败（无真实视口？）', err);
              }
            }
          });
          return;
        case 'zoom-to-fit':
          runAndClose(zoomToSelection);
          return;
        case 'view-normal-to':
          runAndClose(viewNormalToSelection);
          return;
        case 'delete':
          // B6 M-A5 T2：canEdit=false 防御性拒收（菜单项已禁用，此处兜底——
          // HITL 不打开，删除回调不可能发起）。
          if (!canEdit) return;
          onClose();
          setPendingDelete(true);
          return;
        case 'show-dependencies':
          // 非 gated 落到此（注册表翻转后）——依赖项面板接线前为 no-op。
          onClose();
          return;
        case 'assign-material':
        case 'edit-appearance':
        case 'create-drawing':
        case 'appearance-for-face':
          // T5-⑥ 治理后的专名 kind（注册表翻转后 reachable）——材料/外观/
          // 工程图后端面接线前为诚实占位（不再借道 show-dependencies 静默
          // no-op；头注「翻转检查单」第 1 条）。
          runAndClose(() => console.warn(`[part-studio] 菜单动作 ${action.kind} 未接线（后端面缺失，诚实占位）`));
          return;
      }
    },
    [canEdit, hideNodes, onClose, openDock, primary, runAndClose, selection, setDockTab, openFeatureDialog],
  );

  const name = primary ? selectionName(primary) : '';

  // 删除 HITL：预览=目标具名提示；确认 → onDelete + 选择集清空。
  // 注意：anchor 关闭（宿主收合菜单）后对话框仍须独存（CommandPalette 同口径）。
  const deleteDialog = pendingDelete && primary ? (
    <div className="part-studio-dialog-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('partStudio.canvasMenu.deleteTitle', { name })}
        className="part-studio-capability-dialog"
      >
        <h2 className="part-studio-capability-dialog__title">
          {t('partStudio.canvasMenu.deleteTitle', { name })}
        </h2>
        <p className="part-studio-capability-dialog__message">
          {t('partStudio.canvasMenu.deleteMessage', { name })}
        </p>
        <div className="part-studio-capability-dialog__actions part-studio-capability-dialog__actions--split">
          <button
            type="button"
            className="part-studio-capability-dialog__secondary"
            onClick={() => setPendingDelete(false)}
          >
            {t('partStudio.canvasMenu.cancel')}
          </button>
          <button
            type="button"
            className="part-studio-capability-dialog__danger"
            onClick={() => {
              setPendingDelete(false);
              // B6 M-A5 T2：canEdit=false 防御性拒收（HITL 本不应打开；兜底
              // 程序化路径），不发删除回调。
              if (!canEdit) return;
              if (onDelete) {
                onDelete(selection);
              } else {
                console.warn(`[part-studio] 删除 ${name}（onDelete 未接线）`);
              }
              setCanvasSelection([]);
            }}
          >
            {t('partStudio.canvasMenu.confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (!anchor) {
    return (
      <>
        {deleteDialog}
        <CapabilityDialog capability={gatedCapability} onClose={() => setGatedCapability(null)} />
      </>
    );
  }

  const entries = buildCanvasMenu(selection);

  return (
    <>
      <div
        ref={menuRef}
        className="part-studio-canvas-menu"
        role="menu"
        aria-label={t('partStudio.canvasMenu.menuLabel')}
        style={{ left: position.x, top: position.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {entries.map((entry, index) => {
          if (entry === 'separator') {
            return <div key={`sep-${index}`} className="part-studio-canvas-menu__separator" role="separator" />;
          }
          // B6 M-A5 T2：canEdit=false 时「删除」保持渲染但禁用（可见 title
          // 提示）；其余项（视图/隐藏/gated 引导）不受写门限制。
          const deleteDisabled = entry.action.kind === 'delete' && !canEdit;
          return (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className="part-studio-canvas-menu__item"
              disabled={deleteDisabled}
              title={deleteDisabled ? t('partStudio.canvasMenu.readonlyHint') : undefined}
              onClick={() => handleItemClick(entry)}
            >
              <span className="part-studio-menu-item-icon" aria-hidden="true">
                <entry.icon />
              </span>
              {entry.usesName ? t(entry.labelKey, { name }) : t(entry.labelKey)}
            </button>
          );
        })}
      </div>

      {deleteDialog}

      <CapabilityDialog capability={gatedCapability} onClose={() => setGatedCapability(null)} />
    </>
  );
}
