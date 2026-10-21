/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CapabilityDialog（Task 5）：能力引导对话框——创建菜单中 🟠 gated 项
 * （新建文件夹/导入文件/导入来源/标签）点击后的引导面（spec §0 铁律 1
 * 完整 UI 面：gated 照常可点，不灰化不删减；对齐 Onshape 免费版升级提示模式）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Text } from '@itwin/itwinui-react';
import type { GatedCreateAction } from '../types.js';

export interface CapabilityDialogProps {
  action: GatedCreateAction | null;
  onClose: () => void;
}

export function CapabilityDialog({ action, onClose }: CapabilityDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();

  return (
    <Dialog isOpen={!!action} onClose={onClose} portal isDismissible>
      <Dialog.Backdrop />
      <Dialog.Main
        styleType="default"
        title={t('documents.capability.title')}
        className="documents-dialog documents-capability-dialog"
      >
        <Dialog.TitleBar titleText={t('documents.capability.title')} />
        <Dialog.Content>
          {action && <Text>{t(`documents.capability.${action}`)}</Text>}
        </Dialog.Content>
        <Dialog.ButtonBar>
          <Button styleType="high-visibility" onClick={onClose}>
            {t('documents.capability.confirm')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
