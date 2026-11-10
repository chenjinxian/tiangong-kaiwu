// /examples —— 全部 Onshape 示例目录（public，2026-11-10）。
// 页面本体在 modules/examples；路由层只做薄包装。

import React from 'react';
import { ExamplesPage } from '@modules/examples';
import './ExamplesRoute.css';

export function ExamplesRoute(): React.JSX.Element {
  return (
    <div className="examples-route" data-testid="examples-route">
      <ExamplesPage />
    </div>
  );
}
