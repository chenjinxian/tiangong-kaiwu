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
import { DropdownMenu, MenuItem } from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgChevronDown,
  SvgClock,
  SvgDelete,
  SvgFolder,
  SvgGlobe,
  SvgImport,
  SvgShare,
  SvgStar,
  SvgTag,
  SvgUser,
} from '@itwin/itwinui-icons-react';
import type { DocumentFilter, GatedCreateAction } from '../types.js';

/** 筛选项定义：档位 + 图标（Onshape 左栏顺序：由我所有 → 最近 → 收藏 →
 * 已与我共享 → 公开；收藏为本产品保留的额外筛选）。 */
const FILTER_ITEMS: { id: DocumentFilter; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'my', icon: SvgUser },
  { id: 'recent', icon: SvgClock },
  { id: 'favorites', icon: SvgStar },
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
        <button type="button" className="documents-sidebar__create-button">
          <SvgAdd className="documents-sidebar__create-icon" />
          <span>{t('documents.createMenu.button')}</span>
          <SvgChevronDown className="documents-sidebar__create-caret" />
        </button>
      </DropdownMenu>

      <nav className="documents-sidebar__nav" aria-label={t('documents.sidebar.label')}>
        <button
          type="button"
          className="documents-sidebar__item documents-sidebar__item--explore"
          onClick={() => onGatedAction('importFrom')}
        >
          <SvgGlobe />
          <span>{t('documents.sidebar.explore')}</span>
        </button>
        {FILTER_ITEMS.map((item) => {
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={[
                'documents-sidebar__item',
                activeFilter === item.id ? 'documents-sidebar__item--active' : '',
              ].filter(Boolean).join(' ')}
              aria-current={activeFilter === item.id ? 'page' : undefined}
              onClick={() => onFilterChange(item.id)}
            >
              <IconComponent />
              <span>{t(`documents.filters.${item.id}`)}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="documents-sidebar__item"
          onClick={() => onGatedAction('labelTag')}
        >
          <SvgTag />
          <span>{t('documents.sidebar.labels')}</span>
        </button>
        <button type="button" className="documents-sidebar__item" disabled title={t('documents.sidebar.notImplemented')}>
          <SvgDelete />
          <span>{t('documents.sidebar.trash')}</span>
        </button>
      </nav>

      <div className="documents-sidebar__footer">
        <span className="documents-sidebar__plan">{t('documents.sidebar.freePlan')}</span>
        <button type="button" className="documents-sidebar__pro" onClick={() => onGatedAction('upgrade')}>
          {t('documents.sidebar.tryPro')}
        </button>
        <button type="button" className="documents-sidebar__pricing" onClick={() => onGatedAction('upgrade')}>
          {t('documents.sidebar.plansPricing')}
        </button>
      </div>
    </div>
  );
}
