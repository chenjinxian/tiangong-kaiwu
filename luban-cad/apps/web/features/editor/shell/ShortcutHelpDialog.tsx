/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Text } from '@itwin/itwinui-react';
import { keyboardManager, type KeyboardShortcut } from '../../../src/core/shortcuts/KeyboardManager.js';
import './ShortcutHelpDialog.css';

export interface ShortcutHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Ctrl+Shift+Z 形式；Escape 显示 Esc，? 原样 */
function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.modifiers?.ctrl) parts.push('Ctrl');
  if (shortcut.modifiers?.shift) parts.push('Shift');
  if (shortcut.modifiers?.alt) parts.push('Alt');
  if (shortcut.modifiers?.meta) parts.push('Meta');
  const key = shortcut.key === 'escape' ? 'Esc' : shortcut.key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

/**
 * 快捷键速查表（Onshape Help > Shortcuts 对应件；Shift+? 打开）。
 * 数据源 = KeyboardManager 注册表（不维护第二份清单）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ShortcutHelpDialog: React.FC<ShortcutHelpDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('editor');
  const shortcuts = keyboardManager.getShortcuts();

  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main title={t('help.title')} className="shortcut-help-dialog">
        <Dialog.TitleBar titleText={t('help.title')} />
        <Dialog.Content>
          <Text variant="small" className="shortcut-help-description">
            {t('help.description')}
          </Text>
          <ul className="shortcut-help-list">
            {shortcuts.map((shortcut) => (
              <li key={`${formatShortcut(shortcut)}-${shortcut.toolId ?? shortcut.description}`}>
                <kbd className="shortcut-help-key">{formatShortcut(shortcut)}</kbd>
                <span className="shortcut-help-label">
                  {shortcut.descriptionKey ? t(shortcut.descriptionKey) : shortcut.description}
                </span>
              </li>
            ))}
            <li>
              <kbd className="shortcut-help-key">Shift+?</kbd>
              <span className="shortcut-help-label">{t('help.thisDialog')}</span>
            </li>
          </ul>
          <Text variant="small" className="shortcut-help-hint">
            {t('help.hint')}
          </Text>
        </Dialog.Content>
      </Dialog.Main>
    </Dialog>
  );
};

ShortcutHelpDialog.displayName = 'ShortcutHelpDialog';

export default ShortcutHelpDialog;
