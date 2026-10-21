// src/routes/PartStudioRoute.tsx
//
// M3 Task 3：/documents/:iTwinId/:iModelId Part Studio 编辑器路由——薄包装，
// 页面本体在 modules/part-studio（经相对导入消费，spec 规则 4 针对跨模块）。

import React from 'react';
import { PartStudioPage } from '@modules/part-studio';

export function PartStudioRoute(): React.JSX.Element {
  return <PartStudioPage />;
}
