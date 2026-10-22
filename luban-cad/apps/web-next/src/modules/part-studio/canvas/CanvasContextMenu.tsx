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
 * - 菜单模型=buildCanvasMenu 纯函数（选中态/空白态切换的测试钉点）。
 *
 * 开合由宿主（PartStudioCanvas）经 anchor 驱动：anchor=null 渲染空（常驻
 * 挂载、右键驱动），Escape/外部 mousedown 收合。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmphasizeElements, IModelApp } from '@itwin/core-frontend';
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
  | { kind: 'delete' };

export interface CanvasMenuItem {
  id: string;
  /** i18n 键（partStudio.canvasMenu.*）。 */
  labelKey: string;
  /** 标签插值 {name}（选中实体显示名）。 */
  usesName: boolean;
  /** 能力键（gated → 能力引导对话框；缺省 full 直执行）。 */
  capability?: string;
  action: CanvasMenuAction;
}

/** 菜单条目 = 菜单项 | 分隔线。 */
export type CanvasMenuEntry = CanvasMenuItem | 'separator';

function item(id: string, labelKey: string, action: CanvasMenuAction, usesName = false, capability?: string): CanvasMenuItem {
  return { id, labelKey: `partStudio.canvasMenu.${labelKey}`, action, usesName, capability };
}

/** 视图命令组（隐藏/缩放/视图垂直于——所有选中态共用）。 */
function viewCommandGroup(): CanvasMenuEntry[] {
  return [
    item('hide', 'hide', { kind: 'hide' }, true),
    item('zoom-to-fit', 'zoomToFit', { kind: 'zoom-to-fit' }),
    item('view-normal-to', 'viewNormalTo', { kind: 'view-normal-to' }),
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
      item('fit-view', 'fitView', { kind: 'fit-view' }),
      'separator',
      item('standard-view-top', 'top', { kind: 'standard-view', view: 'top' }),
      item('standard-view-front', 'front', { kind: 'standard-view', view: 'front' }),
      item('standard-view-right', 'right', { kind: 'standard-view', view: 'right' }),
      item('standard-view-iso', 'iso', { kind: 'standard-view', view: 'iso' }),
      'separator',
      item('open-display-settings', 'displaySettings', { kind: 'open-display-settings' }),
    ];
  }
  switch (primary.kind) {
    case 'feature':
      return [
        item('edit-feature', 'editFeature', { kind: 'edit-feature' }, true),
        item('show-dependencies', 'showDependencies', { kind: 'show-dependencies' }, true, 'dependencies'),
        'separator',
        ...viewCommandGroup(),
        'separator',
        item('delete', 'delete', { kind: 'delete' }, true),
      ];
    case 'part':
      return [
        ...viewCommandGroup(),
        'separator',
        item('assign-material', 'assignMaterial', { kind: 'show-dependencies' }, true, 'material'),
        item('edit-appearance', 'editAppearance', { kind: 'show-dependencies' }, true, 'appearance'),
        item('create-drawing', 'createDrawing', { kind: 'show-dependencies' }, true, 'drawing'),
        'separator',
        item('delete', 'delete', { kind: 'delete' }, true),
      ];
    case 'face':
      return [
        ...viewCommandGroup(),
        'separator',
        item('appearance-for-face', 'appearanceForFace', { kind: 'show-dependencies' }, false, 'appearance'),
        'separator',
        item('delete', 'delete', { kind: 'delete' }, true),
      ];
    case 'edge':
    case 'vertex':
      return [...viewCommandGroup(), 'separator', item('delete', 'delete', { kind: 'delete' }, true)];
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
  /** 删除确认提交（HITL 出口；后端删除接线后接管）。 */
  onDelete?: (selection: readonly CanvasSelection[]) => void;
}

/** 选中实体显示名（label 缺省回退 id）。 */
function selectionName(entry: CanvasSelection): string {
  return entry.label ?? entry.id;
}

export function CanvasContextMenu({ anchor, onClose, onDelete }: CanvasContextMenuProps): React.JSX.Element | null {
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
  React.useEffect(() => {
    if (!anchor) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onClose);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onClose);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor, onClose]);

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
          onClose();
          setPendingDelete(true);
          return;
        case 'show-dependencies':
          // 非 gated 落到此（注册表翻转后）——依赖项面板接线前为 no-op。
          onClose();
          return;
      }
    },
    [hideNodes, onClose, openDock, primary, runAndClose, selection, setDockTab, openFeatureDialog],
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
        {entries.map((entry, index) =>
          entry === 'separator' ? (
            <div key={`sep-${index}`} className="part-studio-canvas-menu__separator" role="separator" />
          ) : (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className="part-studio-canvas-menu__item"
              onClick={() => handleItemClick(entry)}
            >
              {entry.usesName ? t(entry.labelKey, { name }) : t(entry.labelKey)}
            </button>
          ),
        )}
      </div>

      {deleteDialog}

      <CapabilityDialog capability={gatedCapability} onClose={() => setGatedCapability(null)} />
    </>
  );
}
