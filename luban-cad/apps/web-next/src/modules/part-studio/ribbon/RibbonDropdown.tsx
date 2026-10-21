/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * RibbonDropdown（M3 Task 4）：「图标 + ▾」飞出菜单（对齐 os-11 dropdown /
 * os-20 展开证据）——主钮点击=激活父命令（Onshape 默认变体语义），箭头钮
 * 开合飞菜单，菜单子项点击=激活该子命令并收合。键盘/点外收合（Escape /
 * document mousedown）；aria-haspopup/menu 语义全配。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import { SvgChevronDown } from '@itwin/itwinui-icons-react';
import type { RibbonTool } from './ribbon-registry.js';

export interface RibbonDropdownProps {
  tool: RibbonTool;
  /** 主钮/子项激活路由（useToolActivation.activate）。 */
  onActivate: (id: string) => void;
  /** 主钮激活态（store tool.activeToolId === tool.id）。 */
  active: boolean;
  /** 命令搜索亮显（palette 查询命中，os-23「亮显工具栏中的工具」）。 */
  highlighted: boolean;
}

export function RibbonDropdown({ tool, onActivate, active, highlighted }: RibbonDropdownProps): React.JSX.Element {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const label = t(tool.labelKey);
  const MainIcon = tool.icon;

  // 点外收合（os-20 飞菜单交互基线）。
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const toolClass = [
    'part-studio-ribbon__tool',
    active ? 'part-studio-ribbon__tool--active' : '',
    highlighted ? 'part-studio-ribbon__tool--highlight' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="part-studio-ribbon__dropdown" ref={containerRef} data-testid={`part-studio-ribbon-dropdown-${tool.id}`}>
      {/* 主钮：激活父命令（默认变体）。title 对齐 os-11「名称 (快捷键)」。 */}
      <IconButton
        size="small"
        styleType="borderless"
        aria-label={label}
        title={tool.shortcut ? `${label} (${tool.shortcut})` : label}
        aria-pressed={active}
        className={toolClass}
        onClick={() => onActivate(tool.id)}
      >
        <MainIcon />
      </IconButton>
      {/* 箭头钮：开合飞菜单。 */}
      <IconButton
        size="small"
        styleType="borderless"
        aria-label={`${label} ▾`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="part-studio-ribbon__arrow"
        onClick={() => setIsOpen((open) => !open)}
      >
        <SvgChevronDown />
      </IconButton>
      {isOpen && (
        <div className="part-studio-ribbon__menu" role="menu" aria-label={label}>
          {(tool.dropdownItems ?? []).map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="part-studio-ribbon__menu-item"
                onClick={() => {
                  setIsOpen(false);
                  onActivate(item.id);
                }}
              >
                <span className="part-studio-ribbon__menu-icon" aria-hidden>
                  <ItemIcon />
                </span>
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
