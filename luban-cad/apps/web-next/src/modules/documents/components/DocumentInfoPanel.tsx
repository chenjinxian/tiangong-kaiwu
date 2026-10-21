/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentInfoPanel（Task 5）：详情侧栏（InformationPanel）——选中行的
 * 大缩略图/名称/所有者/角色/创建·更新时间/描述。描述不在 DocumentSummary
 * 契约内（Task 4 钉死 mapper 形状）——选中时经 ItwinsClient.get 取详情
 * （hub iTwin 实体带 description，防御性宽类型读取），失败/缺席回退「暂无描述」。
 * 查询键 ['documents','detail-raw',id]——与详情页 detail 键异形分离（终审 C1，
 * 两处 queryFn 返回形状不同，同键会缓存混叠）。面板仅在有选中项时挂载
 * （InformationPanel 关闭态仍在 DOM 内渲染 children，条件挂载让「面板出现」
 * 本身成为可断言的选中语义）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  InformationPanel,
  InformationPanelBody,
  InformationPanelHeader,
  Text,
} from '@itwin/itwinui-react';
import { SvgDocument } from '@itwin/itwinui-icons-react';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import type { DocumentSummary } from '../types.js';

/** 官方 ITwin 类型未声明、hub 实际输出的描述字段（防御性宽类型）。 */
type ITwinWithDescription = { description?: string };

export interface DocumentInfoPanelProps {
  doc: DocumentSummary;
  formatDate: (value: string | null) => string;
  onClose: () => void;
}

export function DocumentInfoPanel({
  doc,
  formatDate,
  onClose,
}: DocumentInfoPanelProps): React.JSX.Element {
  const { t } = useTranslation();

  // 键异形分离（终审 C1）：queryFn 返回原始 ITwin（只要 description），与
  // 详情页 useDocumentDetail 的 ['documents','detail',id]（映射后 DocumentDetail）
  // 同键会缓存形状混叠——侧栏独立键 'detail-raw'，零共享零风险；仍属
  // ['documents'] 前缀，页级 invalidate 照常命中。
  const detailQuery = useQuery({
    queryKey: ['documents', 'detail-raw', doc.id],
    queryFn: async () => {
      const client = new ItwinsClient();
      return client.get(doc.id) as Promise<ITwinWithDescription>;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const description = detailQuery.data?.description ?? '';

  return (
    <InformationPanel isOpen orientation="vertical" className="documents-info-panel">
      <InformationPanelHeader onClose={onClose} className="documents-info-panel__header">
        <Text variant="subheading">{t('documents.info.title')}</Text>
      </InformationPanelHeader>
      <InformationPanelBody>
        <div className="documents-info-body">
          <div className="documents-info-thumb">
            {doc.thumbnailUrl ? (
              <img className="documents-info-thumb__img" src={doc.thumbnailUrl} alt="" />
            ) : (
              <SvgDocument className="documents-info-thumb__icon" />
            )}
          </div>
          <Text variant="title" as="h3" className="documents-info-name">
            {doc.name}
          </Text>
          <dl className="documents-info-list">
            <dt>{t('documents.info.owner')}</dt>
            <dd>{doc.owner || '—'}</dd>
            <dt>{t('documents.info.role')}</dt>
            <dd>{doc.role || '—'}</dd>
            <dt>{t('documents.info.createdAt')}</dt>
            <dd>{formatDate(doc.createdAt)}</dd>
            <dt>{t('documents.info.modifiedAt')}</dt>
            <dd>{formatDate(doc.modifiedAt)}</dd>
            <dt>{t('documents.info.description')}</dt>
            <dd>{description || t('documents.info.noDescription')}</dd>
          </dl>
        </div>
      </InformationPanelBody>
    </InformationPanel>
  );
}
