// src/routes/DocumentsRoute.tsx
//
// M2 Task 5：/documents 文档中心路由——薄包装，页面本体在
// modules/documents（经 barrel 消费，spec 规则 4）。

import React from 'react';
import { DocumentsPage } from '@modules/documents';
import './DocumentsRoute.css';

export function DocumentsRoute(): React.JSX.Element {
  return (
    <div className="documents-route" data-testid="documents-route">
      <DocumentsPage />
    </div>
  );
}
