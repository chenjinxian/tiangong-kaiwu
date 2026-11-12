/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * RibbonDropdown（2026-11-05 Onshape live 重做）：工具栏「主图标 + 小箭头」与
 * 180px 飞菜单。live 证据（onshape-parity-data/ui-evidence/ui-polish-20261105）：
 * - 触发组 52×34：主钮 34×34 + 箭头 18×32（chevron 10×10）；
 * - 飞菜单 180px、1px #ccc、radius 3、shadow 0 5px 10px rgba(0,0,0,.2)，
 *   左对齐整个触发组、顶边压住 toolbar 底边 1px；
 * - 首行=父工具（带快捷键 keycap），后续行=变体；行高 34/32，padding 6px，
 *   20px 图标，14px 文本，hover #eaeaea。
 * 菜单 portal 到 body（避开 ribbon overflow 裁剪）；外点/Escape 收合，方向键
 * 在菜单内移动焦点，Enter/Space 激活。
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { isGated } from '../internal/capabilities.js';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import { onshapeIconFor } from './ribbon-registry.js';
import type { RibbonTool } from './ribbon-registry.js';

export interface RibbonDropdownProps {
  tool: RibbonTool;
  /** 主钮/子项激活路由（useToolActivation.activate）。 */
  onActivate: (id: string) => void;
  /** 主钮激活态（store tool.activeToolId === tool.id）。 */
  active: boolean;
  /** 命令搜索亮显（palette 查询命中，os-23「亮显工具栏中的工具」）。 */
  highlighted: boolean;
  /** 主钮只读门（P2.4）：按父 capability 裁决（full 写工具禁用；gated 父保持可点）。 */
  disabled?: boolean;
  /** 只读态（P2.4 F11）：子项按各自 capability 裁决——gated 子项仍可打开能力引导。 */
  readOnly?: boolean;
}

interface MenuRow {
  key: string;
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled: boolean;
  parent: boolean;
}

function ShortcutKeys({ shortcut }: { shortcut: string }): React.JSX.Element {
  const keys = shortcut.split(/[+\s]+/).filter(Boolean);
  return (
    <span className="part-studio-ribbon__shortcut" aria-hidden="true">
      {keys.map((key) => (
        <kbd key={key} className="part-studio-ribbon__shortcut-key">{key}</kbd>
      ))}
    </span>
  );
}

export function RibbonDropdown({
  tool,
  onActivate,
  active,
  highlighted,
  disabled = false,
  readOnly = false,
}: RibbonDropdownProps): React.JSX.Element {
  const { t } = useTranslation();
  const label = t(tool.labelKey);
  const MainIcon = tool.icon;
  const mainOnshapeIcon = onshapeIconFor(tool.id);

  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ left: 0, top: 0 });
  const groupRef = React.useRef<HTMLDivElement>(null);
  const arrowRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const rows: MenuRow[] = React.useMemo(() => {
    const parentRow: MenuRow = {
      key: `parent-${tool.id}`,
      id: tool.id,
      label,
      icon: mainOnshapeIcon ? <OnshapeIcon name={mainOnshapeIcon} size={20} /> : <MainIcon />,
      ...(tool.shortcut ? { shortcut: tool.shortcut } : {}),
      disabled,
      parent: true,
    };
    const children = (tool.dropdownItems ?? []).map((item): MenuRow => {
      const ItemIcon = item.icon;
      const itemOnshapeIcon = onshapeIconFor(item.id);
      return {
        key: item.id,
        id: item.id,
        label: t(item.labelKey),
        icon: itemOnshapeIcon ? <OnshapeIcon name={itemOnshapeIcon} size={20} /> : <ItemIcon />,
        disabled: readOnly && !isGated(item.capability),
        parent: false,
      };
    });
    return [parentRow, ...children];
  }, [tool, label, mainOnshapeIcon, MainIcon, disabled, readOnly, t]);

  const placeMenu = React.useCallback((): void => {
    const rect = groupRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Onshape：菜单左对齐触发组，顶边压住 toolbar 底边 1px；右缘不超出视口。
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - 184));
    setPosition({ left, top: Math.max(0, rect.bottom - 1) });
  }, []);

  const closeMenu = React.useCallback((restoreFocus = false): void => {
    setOpen(false);
    if (restoreFocus) arrowRef.current?.focus();
  }, []);

  const openMenu = React.useCallback((): void => {
    placeMenu();
    setOpen(true);
    // 焦点移到首项（Onshape 菜单键盘可达）。
    window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    }, 0);
  }, [placeMenu]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || groupRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    const onViewportChange = (): void => closeMenu();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, closeMenu]);

  const activate = (row: MenuRow): void => {
    if (row.disabled) return;
    // 激活工具后不把焦点还给箭头按钮：工具接管键盘（数字/Enter），若焦点仍在
    // 箭头，Enter 的默认 click 会在提交后重新展开飞菜单并挡住后续对话框确认
    // （2026-11-09 多边形真栈实测）。
    closeMenu();
    onActivate(row.id);
  };

  const toolClass = [
    'part-studio-ribbon__tool',
    active ? 'part-studio-ribbon__tool--active' : '',
    highlighted ? 'part-studio-ribbon__tool--highlight' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={groupRef}
      className="part-studio-ribbon__dropdown"
      data-testid={`part-studio-ribbon-dropdown-${tool.id}`}
    >
      {/* 主钮：激活父命令（Onshape 默认变体语义）。 */}
      <button
        type="button"
        aria-label={label}
        title={tool.shortcut ? `${label} (${tool.shortcut})` : label}
        aria-pressed={active}
        className={toolClass}
        disabled={disabled}
        onClick={(event) => { event.currentTarget.blur(); onActivate(tool.id); }}
      >
        {mainOnshapeIcon ? <OnshapeIcon name={mainOnshapeIcon} size={20} /> : <MainIcon />}
      </button>
      {/* 只读态（readOnly）箭头仍可点：子项按各自 capability 裁决（P2.4 F11）；
          草图工具栏未激活等非只读禁用才连箭头一起禁用。 */}
      <button
        ref={arrowRef}
        type="button"
        aria-label={`${label} ▾`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="part-studio-ribbon__arrow"
        disabled={disabled && !readOnly}
        title={disabled && !readOnly ? label : undefined}
        onClick={() => (open ? closeMenu(true) : openMenu())}
      >
        <OnshapeIcon name="expanded" size={10} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="part-studio-ribbon__menu"
          role="menu"
          aria-label={label}
          style={{ left: position.left, top: position.top }}
          data-testid={`part-studio-ribbon-menu-${tool.id}`}
        >
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              role="menuitem"
              aria-disabled={row.disabled ? 'true' : undefined}
              disabled={row.disabled}
              className={[
                'part-studio-ribbon__menu-row',
                row.parent ? 'part-studio-ribbon__menu-row--parent' : '',
              ].filter(Boolean).join(' ')}
              data-testid={`part-studio-ribbon-menu-row-${row.id}`}
              onClick={() => activate(row)}
            >
              <span className="part-studio-ribbon__menu-icon" aria-hidden="true">{row.icon}</span>
              <span className="part-studio-ribbon__menu-label">{row.label}</span>
              {row.shortcut && <ShortcutKeys shortcut={row.shortcut} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
