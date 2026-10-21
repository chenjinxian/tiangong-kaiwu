// src/routes/SettingsRoute.tsx
//
// M2 Task 7：/settings 设置路由——薄包装，页面本体在 modules/settings
//（经 barrel 消费，spec 规则 4）。

import React from 'react';
import { SettingsPage } from '@modules/settings';

export function SettingsRoute(): React.JSX.Element {
  return (
    <div className="settings-route" data-testid="settings-route">
      <SettingsPage />
    </div>
  );
}
