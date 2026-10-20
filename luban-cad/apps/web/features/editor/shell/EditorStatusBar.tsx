/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Text } from '@itwin/itwinui-react';
import { getStoredLengthUnit } from '../../../shared/constants/lengthUnit.js';

export interface EditorStatusBarProps {
  isEditable: boolean;
  isSketchMode: boolean;
  connectionLoading: boolean;
  connectionError: Error | null;
  isProcessing: boolean;
  opStatus: string;
  selectionCount: number;
  iTwinName?: string;
  iModelName?: string;
  iTwinId?: string;
  iModelId?: string;
}

/**
 * 底部状态栏（RW4-P4-T4-1 从 Editor.tsx 842-890 切出）。
 *
 * 契约：`.statusbar` 必须含「已连接」「公制单位」「编辑模式|只读模式」（editor.spec /
 * demo-flow 断言）；`data-testid="sketch-mode-hint"` 为草图模式提示锚点（sketch.spec /
 * Editor.test 依赖）。
 *
 * 色值已 token 化（P4 债务清零）：成功=--iui-color-text-success、
 * 进行中=--iui-color-text-warning、错误=--iui-color-text-negative、
 * 草图案=--iui-color-text-informational（原 #f90/#c00/#0c0/#0066cc/#666 全部下线）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  isEditable,
  isSketchMode,
  connectionLoading,
  connectionError,
  isProcessing,
  opStatus,
  selectionCount,
  iTwinName,
  iModelName,
  iTwinId,
  iModelId,
}) => {
  const { t } = useTranslation('editor');
  // Settings 偏好（默认公制）；展示偏好，不改建模/导出单位
  const unitLabel = getStoredLengthUnit() === 'inch'
    ? t('statusbar.imperial')
    : t('statusbar.metric');

  const modeIndicatorClass = connectionLoading || isProcessing
    ? 'status-indicator--warning'
    : connectionError
      ? 'status-indicator--danger'
      : 'status-indicator--success';

  const modeText = connectionLoading
    ? t('statusbar.loadingBriefcase')
    : isProcessing
      ? t('statusbar.processing')
      : connectionError
        ? t('statusbar.editError', { message: connectionError.message })
        : opStatus || t('statusbar.editMode');

  return (
    <div className="statusbar">
      <div className="status-left">
        <div className="status-item">
          <span className="status-indicator" />
          <Text variant="small">{t('statusbar.connected')}</Text>
        </div>
        {isEditable && (
          <>
            <Text className="status-sep">|</Text>
            <div className="status-item">
              <span className={`status-indicator ${modeIndicatorClass}`} />
              <Text variant="small">{modeText}</Text>
            </div>
            {isSketchMode && (
              <>
                <Text className="status-sep">|</Text>
                <div className="status-item" data-testid="sketch-mode-hint">
                  <span className="status-indicator status-indicator--info" />
                  <Text variant="small">{t('statusbar.sketchMode')}</Text>
                </div>
              </>
            )}
            {selectionCount > 0 && (
              <>
                <Text className="status-sep">|</Text>
                <Badge backgroundColor="positive">
                  {t('statusbar.selectionCount', { count: selectionCount })}
                </Badge>
              </>
            )}
          </>
        )}
        {!isEditable && (
          <>
            <Text className="status-sep">|</Text>
            <Badge backgroundColor="informational">{t('statusbar.readonly')}</Badge>
          </>
        )}
        <Text className="status-sep">|</Text>
        <Text variant="small">{unitLabel}</Text>
        <Text className="status-sep">|</Text>
        <Text variant="small">{t('statusbar.perspective')}</Text>
      </div>
      <div className="status-right">
        <Text variant="small">{iTwinName || iTwinId?.slice(0, 8)}</Text>
        <Text className="status-sep">|</Text>
        <Text variant="small">{iModelName || iModelId?.slice(0, 8)}</Text>
      </div>
    </div>
  );
};

EditorStatusBar.displayName = 'EditorStatusBar';

export default EditorStatusBar;
