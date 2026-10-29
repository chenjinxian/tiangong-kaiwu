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
  onDelete: (imodel: ImodelSummary) => void;
}

export function ImodelCardGrid({
  imodels,
  formatCreated,
  onOpen,
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
          onDelete={() => onDelete(imodel)}
        />
      ))}
    </div>
  );
}
