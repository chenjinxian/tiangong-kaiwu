/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentTable（Task 5）：列表视图——iTwinUI Table（react-table v7 列模型），
 * 列 = 名称（缩略图+名）/所有者/角色/创建时间/更新时间/行尾操作菜单。
 * 行点击选中（详情侧栏联动），双击打开详情页；排序受控（manualSortBy，
 * 表头与工具条排序菜单共用父组件 sort 态）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, IconButton, Table, Tag } from '@itwin/itwinui-react';
import { SvgDocument, SvgMoreVertical } from '@itwin/itwinui-icons-react';
import type { Column } from '@itwin/itwinui-react/react-table';
import type { DocumentSort, DocumentSummary } from '../types.js';

/** Table 行数据（type 而非 interface——react-table 泛型约束
 * `T extends Record<string, unknown>` 要求隐式索引签名，见旧应用同口径注记）。
 * 标量字段供 accessor 排序，富内容进 Cell 渲染。 */
export type DocumentRow = {
  id: string;
  name: string;
  owner: string;
  role: string;
  createdAt: number;
  modifiedAt: number;
  doc: DocumentSummary;
};

export interface DocumentTableProps {
  rows: DocumentRow[];
  sort: DocumentSort;
  emptyContent: React.ReactNode;
  formatDate: (value: number) => string;
  buildMenuItems: (doc: DocumentSummary, close: () => void) => React.JSX.Element[];
  onSortChange: (sort: DocumentSort) => void;
  onRowClick: (doc: DocumentSummary) => void;
  onRowOpen: (doc: DocumentSummary) => void;
  isSelected: (id: string) => boolean;
}

export function DocumentTable({
  rows,
  sort,
  emptyContent,
  formatDate,
  buildMenuItems,
  onSortChange,
  onRowClick,
  onRowOpen,
  isSelected,
}: DocumentTableProps): React.JSX.Element {
  const { t } = useTranslation();

  // react-table 的 Column API 要求 PascalCase 键（Header/Cell）——库契约，非本项目命名
  const columns = React.useMemo<Column<DocumentRow>[]>(
    () => [
      {
        id: 'name',
        Header: t('documents.table.name'),
        accessor: 'name',
        Cell: ({ row }) => (
          <span className="documents-name-cell">
            {row.original.doc.thumbnailUrl ? (
              <img className="documents-thumb-img" src={row.original.doc.thumbnailUrl} alt="" />
            ) : (
              <SvgDocument className="documents-thumb-icon" />
            )}
            <span className="documents-name-text">{row.original.name}</span>
          </span>
        ),
      },
      {
        id: 'owner',
        Header: t('documents.table.owner'),
        accessor: 'owner',
      },
      {
        id: 'role',
        Header: t('documents.table.role'),
        accessor: 'role',
        Cell: ({ row }) => <Tag>{row.original.role || t('documents.role.member')}</Tag>,
      },
      {
        id: 'createdAt',
        Header: t('documents.table.createdAt'),
        accessor: 'createdAt',
        Cell: ({ row }) => <>{formatDate(row.original.createdAt)}</>,
      },
      {
        id: 'modifiedAt',
        Header: t('documents.table.modifiedAt'),
        accessor: 'modifiedAt',
        Cell: ({ row }) => <>{formatDate(row.original.modifiedAt)}</>,
      },
      {
        id: 'actions',
        Header: '',
        disableSortBy: true,
        Cell: ({ row }) => (
          // stopPropagation：菜单按钮不触发行选中/双击导航
          <div
            className="documents-row-actions"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu menuItems={(close) => buildMenuItems(row.original.doc, close)}>
              <IconButton label={t('documents.table.rowActions')} styleType="borderless">
                <SvgMoreVertical />
              </IconButton>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [t, formatDate, buildMenuItems],
  );

  // 列头排序回调（manualSortBy 受控态：onSort 回传 react-table 状态）
  const handleSort = React.useCallback(
    (state: { sortBy: ReadonlyArray<{ id?: string; desc?: boolean }> }) => {
      const first = state.sortBy[0];
      if (
        first?.id &&
        (first.id === 'name' || first.id === 'createdAt' || first.id === 'modifiedAt')
      ) {
        onSortChange({ id: first.id, desc: first.desc ?? false });
      }
    },
    [onSortChange],
  );

  return (
    <Table<DocumentRow>
      className="documents-table"
      columns={columns}
      data={rows}
      emptyTableContent={emptyContent}
      isSortable
      manualSortBy
      onSort={handleSort}
      initialState={{ sortBy: [{ id: sort.id, desc: sort.desc }] }}
      onRowClick={(_event, row) => onRowClick(row.original.doc)}
      rowProps={(row) => ({
        className:
          isSelected(row.original.id) === true
            ? 'documents-table-row documents-table-row--selected'
            : 'documents-table-row',
        onDoubleClick: () => onRowOpen(row.original.doc),
      })}
    />
  );
}
