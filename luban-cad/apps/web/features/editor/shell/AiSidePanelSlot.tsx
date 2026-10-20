/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@itwin/itwinui-react';

export interface AiSidePanelSlotProps {
  /**
   * AI 面板是否激活。RW4 阶段恒为 false（不渲染、不占布局）；
   * RW3 AI 波次将其接到 agent 面板状态。
   */
  isActive?: boolean;
  /** 面板关闭回调（RW3 接线；当前未启用） */
  onClose?: () => void;
  /** RW3 挂载内容（AI chat/工具结果列表等）；空态渲染预留说明 */
  children?: React.ReactNode;
}

/**
 * AI 侧栏预留位（RW4-P4-T4-2）——EditorShell 与 RW3 AI 波次之间的挂载契约。
 *
 * 契约（RW3 接线时遵守，勿改 Editor 主布局）：
 * 1. 位置：`.editor-main` 右侧、`EditorDockPanel` 之外（停靠面板与 AI 面板可并存，
 *    AI 位固定在 dock 右侧；窄屏时可折叠为覆盖层——由 RW3 决定）。
 * 2. 状态：由 Editor 壳持有 `isActive`；本组件自身不取数、不注册工具。
 * 3. 工具：AI 操作必须复用既有 `toolId`（features/editor/registerTools.ts）与
 *    BriefcaseTxns/saveChanges 事务管道，禁止第二套建模 API（见 luban-cad/CLAUDE.md 铁律 3）。
 * 4. 破坏性操作走 HITL 预览→确认→提交。
 *
 * 当前波次 `isActive=false` → 返回 null，零布局影响（e2e/截图基线不变）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const AiSidePanelSlot: React.FC<AiSidePanelSlotProps> = ({
  isActive = false,
  onClose,
  children,
}) => {
  const { t } = useTranslation('editor');

  if (!isActive) return null;

  return (
    <aside className="ai-side-panel-slot" data-testid="ai-side-panel-slot" aria-label={t('ai.title')}>
      <div className="ai-side-panel-slot-header">
        <Text variant="small" className="ai-side-panel-slot-title">{t('ai.title')}</Text>
        {onClose && (
          <button type="button" className="ai-side-panel-slot-close" onClick={onClose} aria-label={t('dock.close')}>
            ×
          </button>
        )}
      </div>
      <div className="ai-side-panel-slot-body">
        {children ?? <Text variant="small">{t('ai.placeholder')}</Text>}
      </div>
    </aside>
  );
};

AiSidePanelSlot.displayName = 'AiSidePanelSlot';

export default AiSidePanelSlot;
