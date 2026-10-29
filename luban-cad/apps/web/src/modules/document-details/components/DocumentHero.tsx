/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentHero（Task 6）：详情页 hero（对齐 os-01 详情区 / 旧应用
 * ITwinDetail detail-hero）——Surface + 项目大图（image 缺席回退占位图标）+
 * 名称 headline + 状态 Tag + 元信息行（创建/更新时间、iModel 计数、
 * 同步指示）+ 描述 + 操作区（新建 iModel / 分享 / 删除）。
 *
 * 纯展示组件：日期格式化与全部动作回调由父组件（DocumentDetailsPage）注入，
 * 与 DocumentTile 同姿态（os 设计系统钉死的单元拆分）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Surface, Tag, Text } from '@itwin/itwinui-react';
import { SvgAdd, SvgDelete, SvgProject, SvgShare } from '@itwin/itwinui-icons-react';

export interface DocumentHeroProps {
  name: string;
  /** 状态标签（ITwin.status 缺席时父组件回退本地化「活跃」）。 */
  statusLabel: string;
  description: string;
  thumbnailUrl?: string;
  /** 「创建于 …」格式化文案；时间为空时为 null（该段不渲染）。 */
  createdLabel: string | null;
  /** 「更新于 …」格式化文案；与创建时间同值或为空时不渲染（旧应用同口径）。 */
  updatedLabel: string | null;
  imodelCount: number;
  /** 存在未初始化 iModel 时呈现同步指示（列表自动刷新的可视化锚点）。 */
  syncing: boolean;
  onCreateImodel: () => void;
  onShare: () => void;
  onDelete: () => void;
}

export function DocumentHero({
  name,
  statusLabel,
  description,
  thumbnailUrl,
  createdLabel,
  updatedLabel,
  imodelCount,
  syncing,
  onCreateImodel,
  onShare,
  onDelete,
}: DocumentHeroProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Surface className="document-details-hero" elevation={1}>
      <div className="document-details-hero__media" data-testid="document-details-hero-media">
        {thumbnailUrl ? (
          <img className="document-details-hero__image" src={thumbnailUrl} alt="" />
        ) : (
          <div className="document-details-hero__image-fallback">
            <SvgProject />
          </div>
        )}
      </div>
      <div className="document-details-hero__content">
        <Text variant="headline" as="h1" className="document-details-hero__title">
          {name}
        </Text>
        <div className="document-details-hero__meta">
          <Tag>{statusLabel}</Tag>
          {createdLabel && (
            <Text variant="small">{createdLabel}</Text>
          )}
          {updatedLabel && updatedLabel !== createdLabel && (
            <Text variant="small">{updatedLabel}</Text>
          )}
          <Text variant="small">
            {t('documents.detail.imodelCount', { count: imodelCount })}
          </Text>
          {syncing && (
            <span className="document-details-sync" title={t('documents.detail.syncingTitle')}>
              <span className="document-details-sync__dot" />
              {t('documents.detail.syncing')}
            </span>
          )}
        </div>
        {description && (
          <Text className="document-details-hero__description">{description}</Text>
        )}
      </div>
      <div className="document-details-hero__actions">
        <Button
          styleType="high-visibility"
          startIcon={<SvgAdd />}
          onClick={onCreateImodel}
        >
          {t('documents.detail.actions.createIModel')}
        </Button>
        <IconButton
          label={t('documents.actions.share')}
          styleType="default"
          onClick={onShare}
        >
          <SvgShare />
        </IconButton>
        <IconButton
          label={t('documents.actions.delete')}
          styleType="default"
          onClick={onDelete}
        >
          <SvgDelete />
        </IconButton>
      </div>
    </Surface>
  );
}
