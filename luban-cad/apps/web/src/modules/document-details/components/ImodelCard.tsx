/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ImodelCard（Task 6）：iModel 网格卡片——缩略图（官方全量表示无缩略图字段，
 * 走模型占位图标，裁决见 internal/imodels.mapper.ts 头注）+ 初始化徽标
 * （四态：已初始化=绿点 / 初始化中=琥珀点 / 失败=红点 / 等待重试=琥珀点 /
 * 未知=灰点，Tile badge 槽；失败/缺文件绝不伪装「初始化中」）+ 名称
 * （点击=打开）+ 描述（空值回退「暂无描述」）+ 创建时间（metadata）+
 * 「打开工作空间」底钮 + 右上更多菜单（删除，危险操作走父组件 HITL 确认框）。
 *
 * e2e 契约锚点沿用旧应用口径：`.imodel-card`。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DropdownMenu, IconButton, MenuItem, Tag, Tile } from '@itwin/itwinui-react';
import { SvgDelete, SvgModel, SvgMoreVertical } from '@itwin/itwinui-icons-react';
import type { ImodelSummary } from '../types.js';

/** 四态徽标文案键（P0 Task 2）：失败/缺文件/等待重试/未知各有独立词条。 */
const STATE_LABEL_KEY: Record<ImodelSummary['state'], string> = {
  initialized: 'documents.detail.card.initialized',
  notInitialized: 'documents.detail.card.initializing',
  initializationFailed: 'documents.detail.card.initializationFailed',
  missingFiles: 'documents.detail.card.missingFiles',
  retryScheduled: 'documents.detail.card.retryScheduled',
  unknown: 'documents.detail.card.unknownState',
};

/** 徽标色点类名（色值在 DocumentDetailsPage.css；失败=红 / 重试=琥珀 / 未知=灰）。 */
const STATE_CLASS: Record<ImodelSummary['state'], string> = {
  initialized: 'initialized',
  notInitialized: 'initializing',
  initializationFailed: 'failed',
  missingFiles: 'failed',
  retryScheduled: 'retry',
  unknown: 'unknown',
};

export interface ImodelCardProps {
  imodel: ImodelSummary;
  /** 「创建于 …」格式化文案（父组件按当前语言格式化）。 */
  createdLabel: string;
  onOpen: () => void;
  /** 更多菜单「删除」——父组件弹确认对话框（HITL 危险操作标准形态）。 */
  onDelete: () => void;
}

export function ImodelCard({
  imodel,
  createdLabel,
  onOpen,
  onDelete,
}: ImodelCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const name = imodel.name || t('documents.detail.card.untitled');
  const stateClass = STATE_CLASS[imodel.state];

  return (
    <Tile
      className="imodel-card"
      name={name}
      description={imodel.description || t('documents.detail.card.noDescription')}
      metadata={createdLabel}
      thumbnail={
        <div className="imodel-card__thumb-fallback">
          <SvgModel />
        </div>
      }
      badge={
        <Tag
          variant="basic"
          className={`imodel-card__badge imodel-card__badge--${stateClass}`}
        >
          <span className={`imodel-card__badge-dot imodel-card__badge-dot--${stateClass}`} />
          {t(STATE_LABEL_KEY[imodel.state])}
        </Tag>
      }
      buttons={[
        <Button key="open" styleType="default" onClick={onOpen}>
          {t('documents.detail.card.open')}
        </Button>,
      ]}
      rightIcon={
        // 快捷操作不触发名称导航（与 DocumentTile 同口径）
        <div
          className="imodel-card__quick-actions"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <DropdownMenu
            menuItems={(close) => [
              <MenuItem
                key="delete"
                className="document-details-menu-item-danger"
                startIcon={<SvgDelete />}
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                {t('documents.actions.delete')}
              </MenuItem>,
            ]}
          >
            <IconButton
              label={t('documents.detail.card.moreActions')}
              styleType="borderless"
              size="small"
            >
              <SvgMoreVertical />
            </IconButton>
          </DropdownMenu>
        </div>
      }
      isActionable
      onClick={onOpen}
    />
  );
}
