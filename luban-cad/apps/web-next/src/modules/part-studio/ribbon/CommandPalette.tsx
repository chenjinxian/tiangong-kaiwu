/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * CommandPalette（M3 Task 4）：命令搜索面板（对齐 os-23）——alt+/ 全局热键
 * 开合（挂载即监听，页面级常驻组件，store commandPalette.isOpen 驱动显隐）；
 * 输入过滤全部可寻址命令（27 工具 + 44 下拉子项，数据源=ribbon-registry）；
 * Enter 激活选中项（走 useToolActivation：gated → 能力引导对话框，full →
 * IModelApp.tools.run），Escape/关闭钮收合；查询词回写 store（ribbon「亮显
 * 工具栏中的工具」勾选后的高亮数据源，os-23 勾选默认开）。
 * T6：os-30「search 框禁用」——草图模式（store.sketch.isActive）alt+/ 热键
 * 不响应，且进入草图模式时强制收合面板。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SvgCloseSmall } from '@itwin/itwinui-icons-react';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import { allRibbonCommands } from './ribbon-registry.js';
import type { RibbonCommand } from './ribbon-registry.js';
import { CapabilityDialog, useToolActivation } from './Ribbon.js';

export function CommandPalette(): React.JSX.Element | null {
  const { t } = useTranslation();
  const palette = usePartStudioStore((s) => s.commandPalette);
  const closeCommandPalette = usePartStudioStore((s) => s.closeCommandPalette);
  const setCommandPaletteQuery = usePartStudioStore((s) => s.setCommandPaletteQuery);
  const setPaletteHighlight = usePartStudioStore((s) => s.setPaletteHighlight);
  const sketchActive = usePartStudioStore((s) => s.sketch.isActive);
  const { activate, gatedCapability, closeGatedDialog } = useToolActivation();
  const [activeIndex, setActiveIndex] = React.useState(0);

  // os-30「search 框禁用」：进入草图模式强制收合命令搜索。
  React.useEffect(() => {
    if (sketchActive) closeCommandPalette();
  }, [sketchActive, closeCommandPalette]);

  // alt+/ 热键 + Escape 收合（面板关闭时仅监听不渲染，开合全走 store）。
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && event.altKey) {
        event.preventDefault();
        // os-30：草图模式命令搜索禁用。
        if (usePartStudioStore.getState().sketch.isActive) return;
        usePartStudioStore.getState().toggleCommandPalette();
        return;
      }
      if (event.key === 'Escape' && usePartStudioStore.getState().commandPalette.isOpen) {
        closeCommandPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCommandPalette]);

  const query = palette.query.trim().toLowerCase();
  const results = React.useMemo(() => {
    if (!query) return [];
    return allRibbonCommands().filter((command) => t(command.labelKey).toLowerCase().includes(query));
  }, [query, t]);

  const handleChoose = React.useCallback(async (command: RibbonCommand) => {
    closeCommandPalette();
    await activate(command.id);
  }, [activate, closeCommandPalette]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      void handleChoose(results[activeIndex]);
    } else if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
  };

  // 面板关闭时仅渲染能力引导对话框（gated 激活后面板已收合、引导面独存）。
  if (!palette.isOpen) {
    return <CapabilityDialog capability={gatedCapability} onClose={closeGatedDialog} />;
  }

  return (
    <div className="part-studio-palette">
      <div
        role="dialog"
        aria-label={t('partStudio.palette.title')}
        className="part-studio-palette__panel"
      >
        <div className="part-studio-palette__bar">
          <input
            autoFocus
            type="text"
            className="part-studio-palette__input"
            placeholder={t('partStudio.palette.placeholder')}
            aria-label={t('partStudio.palette.title')}
            value={palette.query}
            onChange={(event) => {
              setCommandPaletteQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="part-studio-palette__close"
            aria-label={t('partStudio.palette.close')}
            onClick={closeCommandPalette}
          >
            <SvgCloseSmall />
            <span>{t('partStudio.palette.close')}</span>
          </button>
        </div>

        {query === '' && (
          <p className="part-studio-palette__hint">{t('partStudio.palette.hint')}</p>
        )}
        {query === '' && (
          <p className="part-studio-palette__hint part-studio-palette__hint--secondary">
            {t('partStudio.palette.returnHint')}
          </p>
        )}

        {results.length > 0 && (
          <ul className="part-studio-palette__list" role="list">
            {results.map((command, index) => {
              const Icon = command.icon;
              return (
                <li key={command.id} className="part-studio-palette__item">
                  <button
                    type="button"
                    className={
                      index === activeIndex
                        ? 'part-studio-palette__result part-studio-palette__result--active'
                        : 'part-studio-palette__result'
                    }
                    aria-current={index === activeIndex}
                    onClick={() => void handleChoose(command)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="part-studio-palette__result-icon" aria-hidden>
                      <Icon />
                    </span>
                    <span className="part-studio-palette__result-label">{t(command.labelKey)}</span>
                    {'shortcut' in command && command.shortcut && (
                      <kbd aria-hidden className="part-studio-palette__result-kbd">{command.shortcut}</kbd>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {query !== '' && results.length === 0 && (
          <p className="part-studio-palette__empty">{t('partStudio.palette.empty')}</p>
        )}

        <label className="part-studio-palette__highlight">
          <input
            type="checkbox"
            checked={palette.highlightEnabled}
            onChange={(event) => setPaletteHighlight(event.target.checked)}
          />
          <span>{t('partStudio.palette.highlight')}</span>
        </label>

        <CapabilityDialog capability={gatedCapability} onClose={closeGatedDialog} />
      </div>
    </div>
  );
}
