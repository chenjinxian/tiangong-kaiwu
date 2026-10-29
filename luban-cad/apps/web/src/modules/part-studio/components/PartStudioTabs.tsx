/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioTabs（M3 Task 3；T7 页签管理器接线；M4-T8 和弦热键）：编辑器底部区（os-11 页签条
 * + 状态栏）——
 * - 页签条：适应视图钮（T6 接 viewport 视图命令，壳期可点占位）+ 「+」
 *   （T7 启用：打开页签管理器 TabManagerDialog，os-33「页签=同文档 iModel
 *   列表」跳转的诚实降级）+ 活动页签「Part Studio 1」；
 * - alt+~+t 和弦热键开页签管理器（os-33 底栏标注键位；M4-T8 收 M3 终审
 *   T7-①——Alt+~ 挂弦后击 t，可编辑焦点内不派发）；
 * - 状态栏：连接态（useViewport 相位 + briefcase 相位合并映射——M5-T2 前
 *   briefcase isLoading/error 零消费，连接失败曾呈「已连接+黑屏」）/ 编辑
 *   模式 / 单位 / 视图类型（后三项壳期静态值，T4+ 随工具/视口接线）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import { SvgAdd, SvgFitToView } from '@itwin/itwinui-icons-react';
import type { ViewportPhase } from '@luban-cad/viewer';
import { TabManagerDialog } from '../tabs/TabManagerDialog.js';

export interface PartStudioTabsProps {
  /** 当前 iTwin（页签管理器元素列表数据源寻址）。 */
  iTwinId: string;
  /** 当前 iModel（页签管理器活动元素高亮寻址）。 */
  iModelId: string;
  /** 运行时连接相位（useViewport 出口 → 状态栏连接态）。 */
  connection: ViewportPhase;
  /** briefcase 打开中（M5-T2：isLoading 消费——「正在打开文档…」，优先于 host 相位呈现）。 */
  briefcaseLoading?: boolean;
  /** briefcase 打开失败消息（M5-T2：error 消费——「连接失败」，优先于 host 相位呈现；原文在画布错误面）。 */
  briefcaseError?: string | null;
  /** viewport 创建失败消息（T2 评审：useViewport error 出口——phase 可仍 ready 的子类，不被 host ready 掩盖）。 */
  viewportError?: string | null;
}

/** 相位 → 连接态文案键（M5-T2 合并映射：briefcase 失败/打开中优先于 host 相位
 *——T2-② 缺陷本体即 host ready 相位掩盖 briefcase 失败；viewport 创建失败同族
 *（T2 评审：error 在场即失败，phase 可仍 ready）；briefcase error=连接失败 →
 * briefcase 打开中=正在打开文档 → host error/viewport error=连接失败 →
 * ready=已连接 → 其余=连接中）。 */
function connectionKey(
  connection: ViewportPhase,
  briefcaseLoading: boolean,
  briefcaseError: string | null,
  viewportError: string | null,
): string {
  if (briefcaseError) return 'partStudio.status.connectionFailed';
  if (briefcaseLoading) return 'partStudio.status.openingDocument';
  if (connection === 'error' || viewportError) return 'partStudio.status.connectionFailed';
  if (connection === 'ready') return 'partStudio.status.connected';
  return 'partStudio.status.connecting';
}

export function PartStudioTabs({
  iTwinId,
  iModelId,
  connection,
  briefcaseLoading = false,
  briefcaseError = null,
  viewportError = null,
}: PartStudioTabsProps): React.JSX.Element {
  const { t } = useTranslation();
  const [tabManagerOpen, setTabManagerOpen] = React.useState(false);

  // alt+~+t 和弦热键（os-33 底栏标注键位；M4-T8 收 M3 终审 T7-①）：Alt+~
  // 挂弦，下一击 t 开页签管理器（第二击不要求 Alt 仍按住——和弦语义非三键
  // 同时；任一其他击键解除挂弦）。可编辑焦点内不派发（viewer 键位守卫
  // 同口径：INPUT/TEXTAREA/SELECT/contentEditable）。
  React.useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = (target instanceof Element ? target : document.activeElement) as HTMLElement | null;
      if (!el) return false;
      return (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
        || el.isContentEditable === true
        || el.getAttribute('contenteditable') === 'true'
      );
    };
    let chordArmed = false;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && (event.key === '~' || event.key === '`')) {
        chordArmed = true;
        return;
      }
      if (chordArmed && event.key.toLowerCase() === 't') {
        chordArmed = false;
        if (!isEditableTarget(event.target)) {
          event.preventDefault();
          setTabManagerOpen(true);
        }
        return;
      }
      chordArmed = false;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
            {t(connectionKey(connection, briefcaseLoading, briefcaseError, viewportError))}
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
