/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Ribbon（M3 Task 4）：工具条（对齐 os-11 第二行）——27 工具按 RIBBON_GROUP_ORDER
 * 分组渲染（组间分隔条），8 个「图标 + ▾」飞出菜单（RibbonDropdown），右端
 * 命令搜索触发钮（os-11 command-search-trigger）。gated 工具照常可点（完整
 * UI 面：不灰化不删减），点击开能力引导对话框（spec §5）。命令搜索亮显
 * （os-23 勾选）经 store commandPalette.query 驱动命中工具高亮。
 *
 * useToolActivation：ribbon/palette 统一的激活路由——gated → 能力引导；
 * full → IModelApp.tools.run（id 校准见 ribbon-registry 文件头）+
 * 写 store tool.activeToolId（主钮激活态）。CapabilityDialog：gated 引导
 * 面（CAPABILITY_GUIDANCE 文案；documents 模块的 CapabilityDialog 绑定
 * GatedCreateAction + documents 命名空间，不可复用，故 part-studio 自建）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import { SvgSearch } from '@itwin/itwinui-icons-react';
import { IModelApp } from '@itwin/core-frontend';
import { CAPABILITY_GUIDANCE, isGated } from '../internal/capabilities.js';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import {
  RIBBON_GROUP_ORDER,
  RIBBON_TOOLS,
  allRibbonCommands,
  findRibbonCommand,
} from './ribbon-registry.js';
import type { RibbonTool } from './ribbon-registry.js';
import { RibbonDropdown } from './RibbonDropdown.js';

/** useToolActivation 出口：激活路由 + gated 引导对话框状态。 */
export interface ToolActivation {
  /** 激活命令（toolId 或下拉子项 id）：gated → 引导对话框；full → tools.run。 */
  activate: (id: string) => Promise<void>;
  /** 当前待引导的 gated capability（null=对话框关闭）。 */
  gatedCapability: string | null;
  closeGatedDialog: () => void;
}

/**
 * 工具激活路由（ribbon/CommandPalette 共用）：gated capability 开能力引导；
 * 否则写 store 激活态并投 IModelApp.tools.run。未接线命令（id 非真实
 * toolId）由 tools.run 返回 false/抛错打警告——后续里程碑接线。
 */
export function useToolActivation(): ToolActivation {
  const [gatedCapability, setGatedCapability] = React.useState<string | null>(null);
  const setActiveTool = usePartStudioStore((s) => s.setActiveTool);

  const activate = React.useCallback(async (id: string) => {
    const command = findRibbonCommand(id);
    const capability = command?.capability ?? id;
    if (isGated(capability)) {
      setGatedCapability(capability);
      return;
    }
    setActiveTool(id);
    try {
      const started = await IModelApp.tools.run(id);
      if (!started) {
        console.warn(`[part-studio] 命令 ${id} 未启动（尚未接线的工具？）`);
      }
    } catch (err) {
      console.error(`[part-studio] 命令 ${id} 激活失败:`, err);
    }
  }, [setActiveTool]);

  const closeGatedDialog = React.useCallback(() => setGatedCapability(null), []);

  return { activate, gatedCapability, closeGatedDialog };
}

export interface CapabilityDialogProps {
  /** 待引导 capability（null=不渲染）。 */
  capability: string | null;
  onClose: () => void;
}

/** 能力引导对话框（gated 点击后的引导面，文案取 CAPABILITY_GUIDANCE）。 */
export function CapabilityDialog({ capability, onClose }: CapabilityDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!capability) return null;
  const guidance = CAPABILITY_GUIDANCE[capability];
  if (!guidance) return null;
  return (
    <div className="part-studio-dialog-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(guidance.titleKey)}
        className="part-studio-capability-dialog"
      >
        <h2 className="part-studio-capability-dialog__title">{t(guidance.titleKey)}</h2>
        <p className="part-studio-capability-dialog__message">{t(guidance.messageKey)}</p>
        <div className="part-studio-capability-dialog__actions">
          <button type="button" className="part-studio-capability-dialog__confirm" onClick={onClose}>
            {t('partStudio.capability.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 单工具按钮（无下拉变体的工具）。 */
function RibbonToolButton({ tool, onActivate, active, highlighted }: {
  tool: RibbonTool;
  onActivate: (id: string) => void;
  active: boolean;
  highlighted: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const label = t(tool.labelKey);
  const Icon = tool.icon;
  const className = [
    'part-studio-ribbon__tool',
    active ? 'part-studio-ribbon__tool--active' : '',
    highlighted ? 'part-studio-ribbon__tool--highlight' : '',
  ].filter(Boolean).join(' ');
  return (
    <IconButton
      size="small"
      styleType="borderless"
      aria-label={label}
      title={tool.shortcut ? `${label} (${tool.shortcut})` : label}
      aria-pressed={active}
      className={className}
      onClick={() => onActivate(tool.id)}
    >
      <Icon />
    </IconButton>
  );
}

/**
 * 工具 ribbon：分组工具条 + 命令搜索触发钮。激活态/亮显态全 store 驱动。
 */
export function Ribbon(): React.JSX.Element {
  const { t } = useTranslation();
  const { activate, gatedCapability, closeGatedDialog } = useToolActivation();
  const activeToolId = usePartStudioStore((s) => s.tool.activeToolId);
  const palette = usePartStudioStore((s) => s.commandPalette);
  const toggleCommandPalette = usePartStudioStore((s) => s.toggleCommandPalette);

  // os-23「亮显工具栏中的工具」：面板开 + 勾选 + 有查询词 → 命中命令高亮。
  const highlightIds = React.useMemo(() => {
    if (!palette.isOpen || !palette.highlightEnabled) return null;
    const query = palette.query.trim().toLowerCase();
    if (!query) return null;
    return new Set(
      allRibbonCommands()
        .filter((command) => t(command.labelKey).toLowerCase().includes(query))
        .map((command) => command.id),
    );
  }, [palette.isOpen, palette.highlightEnabled, palette.query, t]);

  return (
    <div className="part-studio-ribbon" data-testid="part-studio-ribbon">
      <div className="part-studio-ribbon__groups" role="toolbar" aria-label={t('partStudio.ribbon.toolbarLabel')}>
        {RIBBON_GROUP_ORDER.map((group) => {
          const tools = RIBBON_TOOLS.filter((tool) => tool.group === group);
          if (tools.length === 0) return null;
          return (
            <div
              key={group}
              className="part-studio-ribbon__group"
              role="group"
              aria-label={t(`partStudio.ribbon.groups.${group}`)}
            >
              {tools.map((tool) =>
                tool.dropdownItems ? (
                  <RibbonDropdown
                    key={tool.id}
                    tool={tool}
                    onActivate={activate}
                    active={activeToolId === tool.id}
                    highlighted={highlightIds?.has(tool.id) ?? false}
                  />
                ) : (
                  <RibbonToolButton
                    key={tool.id}
                    tool={tool}
                    onActivate={activate}
                    active={activeToolId === tool.id}
                    highlighted={highlightIds?.has(tool.id) ?? false}
                  />
                ),
              )}
            </div>
          );
        })}
      </div>
      {/* 命令搜索触发钮（os-11 最右：搜索工具… alt+/）。 */}
      <button
        type="button"
        className="part-studio-ribbon__search-trigger"
        onClick={toggleCommandPalette}
      >
        <SvgSearch className="part-studio-ribbon__search-icon" />
        <span>{t('partStudio.ribbon.searchTools')}</span>
        <kbd className="part-studio-ribbon__search-kbd">{t('partStudio.ribbon.searchShortcut')}</kbd>
      </button>
      <CapabilityDialog capability={gatedCapability} onClose={closeGatedDialog} />
    </div>
  );
}
