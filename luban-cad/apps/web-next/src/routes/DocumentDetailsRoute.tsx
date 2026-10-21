// src/routes/DocumentDetailsRoute.tsx
//
// M2 Task 6：/documents/:iTwinId 文档详情路由——薄包装，页面本体在
// modules/document-details（经 barrel 消费，spec 规则 4）。

import React from 'react';
import { DocumentDetailsPage } from '@modules/document-details';
import './DocumentDetailsRoute.css';

export function DocumentDetailsRoute(): React.JSX.Element {
  return (
    <div className="document-details-route" data-testid="document-details-route">
      <DocumentDetailsPage />
    </div>
  );
}
