/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentToolbar（Task 5）：主区标题行——分区标题（当前筛选或搜索态文案）
 * + 计数 + 右侧视图控制（Onshape 式排序菜单 / 网格·列表切换 / 刷新）。
 * 排序为受控态：工具条菜单与 Table 表头共用同一 sort 状态（父组件持有）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DropdownMenu, IconButton, MenuItem, Text } from '@itwin/itwinui-react';
import { SvgGrid, SvgList, SvgRefresh, SvgSortMenu } from '@itwin/itwinui-icons-react';
import type { DocumentSort, DocumentSortId, DocumentsView } from '../types.js';

export interface DocumentToolbarProps {
  /** 分区标题：当前筛选标签或搜索态文案。 */
  title: string;
  count: number;
  showCount: boolean;
  sort: DocumentSort;
  onSortChange: (sort: DocumentSort) => void;
  view: DocumentsView;
  onViewChange: (view: DocumentsView) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/** 排序菜单选项（id → 固定方向：名称升序、时间倒序为缺省）。 */
const SORT_PRESETS: { id: DocumentSortId; desc: boolean }[] = [
  { id: 'name', desc: false },
  { id: 'modifiedAt', desc: true },
  { id: 'createdAt', desc: true },
];

export function DocumentToolbar({
  title,
  count,
  showCount,
  sort,
  onSortChange,
  view,
  onViewChange,
  onRefresh,
  isRefreshing,
}: DocumentToolbarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="documents-toolbar">
      <div className="documents-toolbar__title">
        <Text variant="title" as="h2">
          {title}
        </Text>
        {showCount && (
          <Text variant="small" className="documents-toolbar__count">
            {t('documents.section.count', { count })}
          </Text>
        )}
      </div>
      <div className="documents-toolbar__controls">
        <DropdownMenu
          menuItems={[
            ...SORT_PRESETS.map((preset) => (
              <MenuItem
                key={preset.id}
                isSelected={sort.id === preset.id}
                onClick={() => onSortChange({ id: preset.id, desc: preset.desc })}
              >
                {t(`documents.sort.${preset.id}`)}
              </MenuItem>
            )),
            <MenuItem
              key="direction"
              onClick={() => onSortChange({ ...sort, desc: !sort.desc })}
            >
              {sort.desc ? t('documents.sort.ascending') : t('documents.sort.descending')}
            </MenuItem>,
          ]}
        >
          <Button styleType="borderless" size="small" startIcon={<SvgSortMenu />}>
            {t('documents.sort.label')}
          </Button>
        </DropdownMenu>
        <IconButton
          onClick={() => onViewChange('tile')}
          isActive={view === 'tile'}
          label={t('documents.view.tile')}
          styleType="borderless"
        >
          <SvgGrid />
        </IconButton>
        <IconButton
          onClick={() => onViewChange('table')}
          isActive={view === 'table'}
          label={t('documents.view.table')}
          styleType="borderless"
        >
          <SvgList />
        </IconButton>
        <IconButton
          onClick={onRefresh}
          disabled={isRefreshing}
          label={t('documents.actions.refresh')}
          styleType="borderless"
        >
          <SvgRefresh className={isRefreshing ? 'documents-spin' : undefined} />
        </IconButton>
      </div>
    </div>
  );
}
