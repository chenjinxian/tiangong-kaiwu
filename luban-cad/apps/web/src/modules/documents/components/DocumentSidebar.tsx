/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentSidebar（Task 5）：左栏 = 顶部蓝色「创建 ▾」大钮（os-01/os-40）
 * + SideNavigation 五筛选（最近打开过的/收藏/我的文档/已与我共享/公开，
 * 激活项蓝底高亮）。创建菜单五项：新建文档 ✅；新建文件夹/导入文件/
 * 导入来源/标签 🟠（gated——照常可点，交能力引导对话框，spec §0 铁律 1）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DropdownMenu, MenuItem, SideNavigation, SidenavButton } from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgClock,
  SvgFolder,
  SvgGlobe,
  SvgImport,
  SvgShare,
  SvgStar,
  SvgTag,
} from '@itwin/itwinui-icons-react';
import type { DocumentFilter, GatedCreateAction } from '../types.js';

/** 筛选项定义：档位 + 图标（iTwinUI 图标组件引用，渲染时首字母大写局部变量）。 */
const FILTER_ITEMS: { id: DocumentFilter; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'recent', icon: SvgClock },
  { id: 'favorites', icon: SvgStar },
  { id: 'my', icon: SvgFolder },
  { id: 'shared', icon: SvgShare },
  { id: 'public', icon: SvgGlobe },
];

export interface DocumentSidebarProps {
  activeFilter: DocumentFilter;
  onFilterChange: (filter: DocumentFilter) => void;
  onCreateDocument: () => void;
  onGatedAction: (action: GatedCreateAction) => void;
}

export function DocumentSidebar({
  activeFilter,
  onFilterChange,
  onCreateDocument,
  onGatedAction,
}: DocumentSidebarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="documents-sidebar" data-testid="document-sidebar">
      <DropdownMenu
        className="documents-sidebar__create"
        menuItems={[
          <MenuItem key="document" startIcon={<SvgAdd />} onClick={onCreateDocument}>
            {t('documents.createMenu.newDocument')}
          </MenuItem>,
          <MenuItem key="folder" startIcon={<SvgFolder />} onClick={() => onGatedAction('folder')}>
            {t('documents.createMenu.newFolder')}
          </MenuItem>,
          <MenuItem key="import-file" startIcon={<SvgImport />} onClick={() => onGatedAction('importFile')}>
            {t('documents.createMenu.importFile')}
          </MenuItem>,
          <MenuItem key="import-from" startIcon={<SvgImport />} onClick={() => onGatedAction('importFrom')}>
            {t('documents.createMenu.importFrom')}
          </MenuItem>,
          <MenuItem key="label" startIcon={<SvgTag />} onClick={() => onGatedAction('labelTag')}>
            {t('documents.createMenu.labelTag')}
          </MenuItem>,
        ]}
      >
        <Button styleType="high-visibility" startIcon={<SvgAdd />}>
          {t('documents.createMenu.button')}
        </Button>
      </DropdownMenu>

      <SideNavigation
        className="documents-sidebar__nav"
        isExpanded
        items={FILTER_ITEMS.map((item) => {
          const IconComponent = item.icon;
          return (
            <SidenavButton
              key={item.id}
              startIcon={<IconComponent />}
              isActive={activeFilter === item.id}
              onClick={() => onFilterChange(item.id)}
            >
              {t(`documents.filters.${item.id}`)}
            </SidenavButton>
          );
        })}
      />
    </div>
  );
}
