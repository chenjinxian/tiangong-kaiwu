/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentTile（Task 5）：网格卡片（Onshape 文档中心 1:1）——缩略图
 * （thumbnailUrl 字符串走 iTwinUI 铺满图；缺席回退文档占位图标）+
 * 名称 + 修改时间（主行）+ 所有者（meta）+ 缩略图右上 quick-action
 * 星标（收藏/取消收藏，收藏态常驻可见）与更多菜单（行操作入口）。
 * 名称点击 = 打开（导航详情页，isActionable TileAction）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, IconButton, Tile } from '@itwin/itwinui-react';
import { SvgDocument, SvgMoreVertical, SvgStar, SvgStarHollow } from '@itwin/itwinui-icons-react';
import { DocumentThumbnail } from './DocumentThumbnail.js';
import type { DocumentSummary } from '../types.js';

export interface DocumentTileProps {
  doc: DocumentSummary;
  isFavorite: boolean;
  isSelected: boolean;
  /** 「修改于 …」格式化文案（父组件按当前语言格式化）。 */
  modifiedLabel: string;
  /** 行操作菜单构建（父组件统一构建，Table/Tile 共用）。 */
  menuItems: (close: () => void) => React.JSX.Element[];
  onOpen: () => void;
  onToggleFavorite: () => void;
}

export function DocumentTile({
  doc,
  isFavorite,
  isSelected,
  modifiedLabel,
  menuItems,
  onOpen,
  onToggleFavorite,
}: DocumentTileProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Tile
      className="document-tile"
      name={doc.name}
      // Onshape 卡片口径：主行=修改时间，meta=所有者
      description={modifiedLabel}
      metadata={doc.owner}
      thumbnail={
        <DocumentThumbnail
          url={doc.thumbnailUrl}
          className="document-tile__thumb-img"
          fallback={<SvgDocument className="document-tile__placeholder" />}
        />
      }
      rightIcon={
        // 快捷操作不触发名称导航
        <div
          className="document-tile__quick-actions"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <IconButton
            className={isFavorite ? 'document-tile__star document-tile__star--favorite' : 'document-tile__star'}
            data-favorite={isFavorite ? 'true' : 'false'}
            styleType="borderless"
            size="small"
            label={isFavorite ? t('documents.actions.unfavorite') : t('documents.actions.favorite')}
            onClick={onToggleFavorite}
          >
            {/* 状态语义：收藏=实心星，未收藏=空心星（与 Onshape 一致） */}
            {isFavorite ? <SvgStar /> : <SvgStarHollow />}
          </IconButton>
          <DropdownMenu menuItems={menuItems}>
            <IconButton label={t('documents.table.rowActions')} styleType="borderless" size="small">
              <SvgMoreVertical />
            </IconButton>
          </DropdownMenu>
        </div>
      }
      isActionable
      isSelected={isSelected}
      onClick={onOpen}
    />
  );
}
