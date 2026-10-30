/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ImodelCardGrid（Task 6）：iModel 卡片网格——Onshape 式网格排布
 * （responsive auto-fill，卡片最小 260px）+ 空列表由父组件裁决
 * （NonIdealState 引导创建），本组件只负责有数据时的渲染。
 */

import React from 'react';
import type { ImodelSummary } from '../types.js';
import { ImodelCard } from './ImodelCard.js';

export interface ImodelCardGridProps {
  imodels: ImodelSummary[];
  /** 「创建于 …」格式化（父组件按当前语言格式化，卡片直出）。 */
  formatCreated: (imodel: ImodelSummary) => string;
  onOpen: (imodel: ImodelSummary) => void;
  /** B 文档：未 initialized 禁止打开（父组件裁决；A 旧文档不传 = 恒可打开）。 */
  isOpenDisabled?: (imodel: ImodelSummary) => boolean;
  /** 写操作回调（P2.3 B 文档）；全体缺席 = 只读网格（A 旧文档详情）。 */
  onRename?: (imodel: ImodelSummary) => void;
  onToggleFavorite?: (imodel: ImodelSummary) => void;
  isFavorite?: (id: string) => boolean;
  onShare?: (imodel: ImodelSummary) => void;
  onDelete?: (imodel: ImodelSummary) => void;
}

export function ImodelCardGrid({
  imodels,
  formatCreated,
  onOpen,
  isOpenDisabled,
  onRename,
  onToggleFavorite,
  isFavorite,
  onShare,
  onDelete,
}: ImodelCardGridProps): React.JSX.Element {
  return (
    <div className="imodel-card-grid" data-testid="imodel-card-grid">
      {imodels.map((imodel) => (
        <ImodelCard
          key={imodel.id}
          imodel={imodel}
          createdLabel={formatCreated(imodel)}
          onOpen={() => onOpen(imodel)}
          openDisabled={isOpenDisabled?.(imodel) ?? false}
          onRename={onRename ? () => onRename(imodel) : undefined}
          onToggleFavorite={
            onToggleFavorite ? () => onToggleFavorite(imodel) : undefined
          }
          isFavorite={isFavorite?.(imodel.id) ?? false}
          onShare={onShare ? () => onShare(imodel) : undefined}
          onDelete={onDelete ? () => onDelete(imodel) : undefined}
        />
      ))}
    </div>
  );
}
