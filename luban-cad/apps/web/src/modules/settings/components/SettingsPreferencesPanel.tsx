/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SettingsPreferencesPanel（M2 Task 7）：首选项面板——深色模式开关
 * （ToggleSwitch 联动 ThemeContext.toggleTheme）+ 语言选择（zh-CN/en，
 * 走 i18n changeAppLanguage，持久化 localStorage）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, Select, Surface, Text, ToggleSwitch } from '@itwin/itwinui-react';
import { useTheme } from '@app/providers/ThemeContext.js';
import { changeAppLanguage, type AppLanguage } from '@common/i18n/index.js';

const LANGUAGE_OPTIONS: { value: AppLanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

export function SettingsPreferencesPanel(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  return (
    <Surface className="settings-panel">
      <Flex flexDirection="column" gap="var(--iui-size-l)">
        <Text variant="title" as="h2" className="settings-panel__title">
          {t('settings.preferences.title')}
        </Text>

        <Flex flexDirection="row" alignItems="center" justifyContent="space-between">
          <Text>{t('settings.preferences.darkMode')}</Text>
          <ToggleSwitch
            label={t('settings.preferences.darkMode')}
            labelPosition="left"
            checked={theme === 'dark'}
            onChange={toggleTheme}
          />
        </Flex>

        <Flex flexDirection="row" alignItems="center" justifyContent="space-between">
          <Text>{t('settings.preferences.language')}</Text>
          <Select
            className="settings-preferences__language"
            value={i18n.language as AppLanguage}
            onChange={(value) => void changeAppLanguage(value as AppLanguage)}
            options={LANGUAGE_OPTIONS}
            triggerProps={{ 'aria-label': t('settings.preferences.language') }}
          />
        </Flex>
      </Flex>
    </Surface>
  );
}
