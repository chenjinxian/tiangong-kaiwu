/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * RibbonDropdown（M3 Task 4；M3 收口 C2 重构）：「图标 + ▾」飞出菜单（对齐
 * os-11 dropdown / os-20 展开证据）——主钮点击=激活父命令（Onshape 默认变体
 * 语义），箭头钮经 iTwinUI DropdownMenu 开合飞菜单（终审 D1 定夺书：模块内
 * DocumentMenuBar/PartStudioTopBar 同库先例）——
 * - portal 到 body 渲染：ribbon `overflow-x:auto` 双轴滚动容器不再裁剪下沉
 *   菜单（D1 根因）；
 * - 方向键导航/焦点管理/Escape/点外收合由 floating-ui 交互面免费到手（连带
 *   收口终审 T4-③ 飞菜单键盘导航），收合后焦点还到触发钮；
 * - 菜单子项点击=激活该子命令并收合（closeOnItemClick 缺省）；
 * - aria-haspopup/menu 语义由 DropdownMenu 落在触发钮上（aria-expanded 随开合）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, MenuItem } from '@itwin/itwinui-react';
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

  // 菜单子项模型 → iTwinUI MenuItem（点击自动收合：DropdownMenu
  // closeOnItemClick 缺省 true）。F11：disabled 逐子项按 capability 计算，
  // 不继承父工具的只读门（父 full 的飞菜单里可能有 gated 信息面）。
  const menuItems = (tool.dropdownItems ?? []).map((item) => {
    const ItemIcon = item.icon;
    const itemOnshapeIcon = onshapeIconFor(item.id);
    return (
      <MenuItem
        key={item.id}
        icon={itemOnshapeIcon ? <OnshapeIcon name={itemOnshapeIcon} size={18} /> : <ItemIcon />}
        disabled={readOnly && !isGated(item.capability)}
        onClick={() => onActivate(item.id)}
      >
        {t(item.labelKey)}
      </MenuItem>
    );
  });

  const toolClass = [
    'part-studio-ribbon__tool',
    active ? 'part-studio-ribbon__tool--active' : '',
    highlighted ? 'part-studio-ribbon__tool--highlight' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="part-studio-ribbon__dropdown" data-testid={`part-studio-ribbon-dropdown-${tool.id}`}>
      {/* 主钮：激活父命令（默认变体）。title 对齐 os-11「名称 (快捷键)」。 */}
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
      {/* 箭头钮：DropdownMenu 触发（portal 飞菜单 + 键盘导航/焦点管理）。
          aria-label 保留「名称 ▾」可访问名；aria-haspopup/aria-expanded 由
          DropdownMenu 克隆注入。aria-label 经 rest 透传到菜单（role=menu
          的可访问名=工具名）。 */}
      <DropdownMenu
        menuItems={menuItems}
        className="part-studio-ribbon__menu"
        aria-label={label}
        placement="bottom-start"
      >
        <button
          type="button"
          aria-label={`${label} ▾`}
          className="part-studio-ribbon__arrow"
        >
          <OnshapeIcon name="expanded" size={10} />
        </button>
      </DropdownMenu>
    </div>
  );
}
