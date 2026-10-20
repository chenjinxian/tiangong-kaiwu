/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import { SvgMoon, SvgSun } from '@itwin/itwinui-icons-react';
import { useTheme } from '../../../app/contexts/ThemeContext.js';
import './ThemeToggle.css';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation('editor');
  const label = theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight');

  return (
    <IconButton
      onClick={toggleTheme}
      label={label}
      title={label}
      aria-label={label}
      styleType="borderless"
    >
      {theme === 'light' ? <SvgMoon /> : <SvgSun />}
    </IconButton>
  );
};
