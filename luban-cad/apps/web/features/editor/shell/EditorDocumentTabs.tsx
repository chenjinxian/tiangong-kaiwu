/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Text } from '@itwin/itwinui-react';
import { SvgAdd, SvgHelpCircularHollow, SvgItem } from '@itwin/itwinui-icons-react';
import './EditorDocumentTabs.css';

export interface EditorDocumentTabsProps {
  /** 当前 iModel 显示名（tab 的 title 提示用） */
  modelName?: string;
  /** 快捷键帮助（Onshape Help > Shortcuts） */
  onHelp: () => void;
}

/**
 * 文档 tab 条（Onshape Part Studio 签名元素）：
 * 顶栏下方一行 tab（当前仅单文档单 tab）+ 禁用「+」。
 *
 * 多 tab = 多 iModel 并行，架构暂不支持（spec §6 已登记）；此处诚实禁用而非假交互。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorDocumentTabs: React.FC<EditorDocumentTabsProps> = ({ modelName, onHelp }) => {
  const { t } = useTranslation('editor');

  return (
    <div className="editor-doc-tabs" role="tablist" aria-label={t('docTabs.label')}>
      <button
        type="button"
        role="tab"
        aria-selected="true"
        className="editor-doc-tab is-active"
        title={modelName}
      >
        {/* Onshape Part Studio 页签为 3D 实体图标，非文档图标 */}
        <SvgItem className="editor-doc-tab-icon" />
        <Text variant="small" className="editor-doc-tab-label">
          {t('docTabs.partStudio')}
        </Text>
      </button>
      <IconButton
        styleType="borderless"
        size="small"
        label={t('docTabs.newTabUnsupported')}
        disabled
      >
        <SvgAdd />
      </IconButton>
      <IconButton
        className="editor-doc-tabs-help"
        styleType="borderless"
        size="small"
        label={t('topbar.help')}
        onClick={onHelp}
      >
        <SvgHelpCircularHollow />
      </IconButton>
    </div>
  );
};

EditorDocumentTabs.displayName = 'EditorDocumentTabs';

export default EditorDocumentTabs;
