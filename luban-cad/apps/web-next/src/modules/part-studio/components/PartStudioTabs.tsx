/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioTabs（M3 Task 3；T7 页签管理器接线）：编辑器底部区（os-11 页签条
 * + 状态栏）——
 * - 页签条：适应视图钮（T6 接 viewport 视图命令，壳期可点占位）+ 「+」
 *   （T7 启用：打开页签管理器 TabManagerDialog，os-33「页签=同文档 iModel
 *   列表」跳转的诚实降级）+ 活动页签「Part Studio 1」；
 * - 状态栏：连接态（viewer-next useViewport 相位驱动）/ 编辑模式 / 单位 /
 *   视图类型（后三项壳期静态值，T4+ 随工具/视口接线）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import { SvgAdd, SvgFitToView } from '@itwin/itwinui-icons-react';
import type { ViewportPhase } from '@luban-cad/viewer-next';
import { TabManagerDialog } from '../tabs/TabManagerDialog.js';

export interface PartStudioTabsProps {
  /** 当前 iTwin（页签管理器元素列表数据源寻址）。 */
  iTwinId: string;
  /** 当前 iModel（页签管理器活动元素高亮寻址）。 */
  iModelId: string;
  /** 运行时连接相位（useViewport 出口 → 状态栏连接态）。 */
  connection: ViewportPhase;
}

/** 相位 → 连接态文案键（ready=已连接；error=连接失败；其余=连接中）。 */
function connectionKey(connection: ViewportPhase): string {
  switch (connection) {
    case 'ready':
      return 'partStudio.status.connected';
    case 'error':
      return 'partStudio.status.connectionFailed';
    default:
      return 'partStudio.status.connecting';
  }
}

export function PartStudioTabs({ iTwinId, iModelId, connection }: PartStudioTabsProps): React.JSX.Element {
  const { t } = useTranslation();
  const [tabManagerOpen, setTabManagerOpen] = React.useState(false);

  return (
    <>
      {/* 页签条（os-11 底部）：左操作组 + 页签 */}
      <div className="part-studio-tab-strip" data-testid="part-studio-tab-strip">
        <div className="part-studio-tab-strip__actions">
          {/* 适应视图：壳期可点占位（T6 接 Viewport 视图命令）。 */}
          <IconButton label={t('partStudio.tabs.fitView')} styleType="borderless">
            <SvgFitToView />
          </IconButton>
          {/* 「+」（T7）：打开页签管理器（os-33；同文档 iModel 列表跳转）。 */}
          <IconButton
            label={t('partStudio.tabs.newTab')}
            styleType="borderless"
            onClick={() => setTabManagerOpen(true)}
          >
            <SvgAdd />
          </IconButton>
        </div>
        <div role="tablist" className="part-studio-tab-strip__tabs">
          <button
            type="button"
            role="tab"
            aria-selected
            className="part-studio-tab part-studio-tab--active"
          >
            {t('partStudio.tabs.partStudio')}
          </button>
        </div>
      </div>

      {/* 状态栏：连接态 / 编辑模式 / 单位 / 视图类型 */}
      <div className="part-studio-status-bar" data-testid="part-studio-status-bar">
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.connection')}</span>
          <span className="part-studio-status-bar__value" data-testid="part-studio-status-connection">
            {t(connectionKey(connection))}
          </span>
        </span>
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.editMode')}</span>
          <span className="part-studio-status-bar__value">{t('partStudio.status.editModePart')}</span>
        </span>
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.units')}</span>
          <span className="part-studio-status-bar__value">{t('partStudio.status.unitMm')}</span>
        </span>
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.viewType')}</span>
          <span className="part-studio-status-bar__value">{t('partStudio.status.viewIso')}</span>
        </span>
      </div>

      {/* 页签管理器（os-33）：底部「+」开合；常驻挂载、状态驱动。 */}
      <TabManagerDialog
        iTwinId={iTwinId}
        activeIModelId={iModelId}
        isOpen={tabManagerOpen}
        onClose={() => setTabManagerOpen(false)}
      />
    </>
  );
}
