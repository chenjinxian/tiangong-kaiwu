/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * AccuDraw Status Indicator
 */

import React from 'react';
import { Badge, Tooltip } from '@itwin/itwinui-react';
import { useAccuDrawStatus } from '../hooks/useAccuDrawShortcuts';

export const AccuDrawIndicator: React.FC = () => {
  const { isEnabled, isSuspended } = useAccuDrawStatus();

  if (!isEnabled) {
    return (
      <Tooltip content="AccuDraw 未启用">
        <Badge color="subtle">AccuDraw: 关</Badge>
      </Tooltip>
    );
  }

  if (isSuspended) {
    return (
      <Tooltip content="AccuDraw 已暂停，按 Space 恢复">
        <Badge color="negative">AccuDraw: 暂停</Badge>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="AccuDraw 运行中 - X/Y/Z 锁定轴，Space 智能锁定">
      <Badge color="positive">AccuDraw: 开</Badge>
    </Tooltip>
  );
};
