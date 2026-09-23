/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { IconButton } from '@itwin/itwinui-react';
import { SvgMoon, SvgSun } from '@itwin/itwinui-icons-react';
import { useTheme } from '../../../app/contexts/ThemeContext.js';
import './ThemeToggle.css';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <IconButton
      onClick={toggleTheme}
      label={theme === 'light' ? '切换到暗色主题' : '切换到亮色主题'}
      title={theme === 'light' ? '切换到暗色主题' : '切换到亮色主题'}
      aria-label={theme === 'light' ? '切换到暗色主题' : '切换到亮色主题'}
      styleType="borderless"
    >
      {theme === 'light' ? <SvgMoon /> : <SvgSun />}
    </IconButton>
  );
};
