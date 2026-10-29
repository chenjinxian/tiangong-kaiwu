// ViewerNotifications（review-8 I-2 收口）：IModelApp.notifications 呈现桥验收——
//  1) ToasterNotificationManager.outputMessage → 已注册 sink 转发（同一 details
//     实例）；无 sink 回退基类（哑通道语义）；sink 异常不反噬工具链；
//  2) priority → iTwinUI toast 类别映射：Error/Fatal→negative、Warning→warning、
//     其余（None/Success/Info/Debug）→informational（brief 钉死口径）；
//  3) ViewerNotificationsBridge 端到端：真实 iTwinUI ThemeProvider（内部挂
//     ToastProvider+Toaster）下 outputMessage → toast 落 DOM（类别类名+文本），
//     HTMLElement briefMessage 取 textContent，空消息不产 toast，卸载注销 sink。
//
// mock 口径：零模块 mock——@itwin/core-frontend 取真实模块（NotifyMessageDetails/
// OutputMessagePriority/NotificationManager 即被测物基类，同 useUndoRedo.test 的
// 「真实 core 参与」口径）；@itwin/itwinui-react 真实组件（AppProviders 同款）。

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider as IuiThemeProvider } from '@itwin/itwinui-react';
import { NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import {
  setViewerNotificationSink,
  toastCategoryOf,
  viewerNotifications,
  ViewerNotificationsBridge,
} from '../ViewerNotifications.js';

afterEach(() => {
  // sink 是模块级单槽——用例间显式清空，防 spies 渗漏到后续用例。
  setViewerNotificationSink(undefined);
  cleanup();
});

describe('toastCategoryOf（priority → iTwinUI toast 类别映射）', () => {
  it('Error/Fatal → negative；Warning → warning；其余 → informational', () => {
    expect(toastCategoryOf(OutputMessagePriority.Error)).toBe('negative');
    expect(toastCategoryOf(OutputMessagePriority.Fatal)).toBe('negative');
    expect(toastCategoryOf(OutputMessagePriority.Warning)).toBe('warning');
    expect(toastCategoryOf(OutputMessagePriority.None)).toBe('informational');
    expect(toastCategoryOf(OutputMessagePriority.Success)).toBe('informational');
    expect(toastCategoryOf(OutputMessagePriority.Info)).toBe('informational');
    expect(toastCategoryOf(OutputMessagePriority.Debug)).toBe('informational');
  });
});

describe('ToasterNotificationManager.outputMessage（sink 转发契约）', () => {
  it('已注册 sink → 同一 details 实例转发', () => {
    const sink = vi.fn();
    setViewerNotificationSink(sink);
    const details = new NotifyMessageDetails(OutputMessagePriority.Error, '工具注册失败: host not ready');
    viewerNotifications.outputMessage(details);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(details);
  });

  it('无 sink → 回退基类哑通道（不抛错、不派发）', () => {
    setViewerNotificationSink(undefined);
    expect(() =>
      viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, '孤消息')),
    ).not.toThrow();
  });

  it('sink 异常不反噬工具链（吞掉 + console.warn）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setViewerNotificationSink(() => {
      throw new Error('toaster broken');
    });
    try {
      expect(() =>
        viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, '消息')),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('ViewerNotificationsBridge（真实 iTwinUI toaster 端到端）', () => {
  /** 由消息文本节点向上取 toast 根：closest 命中最近祖先（toast-all/wrapper
   * 在更上层不会先中）。iTwinUI 3.22 dev 构建把类名 token 哈希化（iui-toast →
   * _iui3220-toast，SettingsPage.test 同款实测），生产构建为字面量——属性含
   * 选择器双兼容。 */
  function toastRootOf(el: HTMLElement): Element | null {
    return el.closest('[class*="toast"]');
  }

  function renderBridge(): void {
    render(
      <IuiThemeProvider>
        <ViewerNotificationsBridge />
      </IuiThemeProvider>,
    );
  }

  it('outputMessage(Error) → negative toast 落 DOM（消息文本在场）', async () => {
    renderBridge();
    act(() => {
      viewerNotifications.outputMessage(
        new NotifyMessageDetails(OutputMessagePriority.Error, '工具注册失败: host not ready'),
      );
    });
    const toast = await screen.findByText('工具注册失败: host not ready');
    // 类别映射在 DOM 可观测：toast 根节点携 negative 类别类（哈希前后同含 token）。
    expect(toastRootOf(toast)).not.toBeNull();
    expect(toastRootOf(toast)?.className).toContain('negative');
  });

  it('outputMessage(Warning) → warning toast；outputMessage(Info) → informational toast', async () => {
    renderBridge();
    act(() => {
      viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, '写租约即将到期'));
      viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, '打孔完成'));
    });
    const warningToast = await screen.findByText('写租约即将到期');
    const infoToast = await screen.findByText('打孔完成');
    expect(toastRootOf(warningToast)?.className).toContain('warning');
    expect(toastRootOf(infoToast)?.className).toContain('informational');
  });

  it('HTMLElement briefMessage → 取 textContent 呈现', async () => {
    renderBridge();
    const el = document.createElement('div');
    el.textContent = '元素形态的失败消息';
    act(() => {
      viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, el));
    });
    expect(await screen.findByText('元素形态的失败消息')).toBeDefined();
  });

  it('brief/detailed 全空 → 不产 toast（无内容可呈现实话）', () => {
    renderBridge();
    act(() => {
      viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, ''));
    });
    // 裸 ThemeProvider 树内无其它 negative 元素——类别类缺席即未产 toast。
    expect(document.querySelector('[class*="negative"]')).toBeNull();
  });

  it('卸载注销 sink：卸载后的 outputMessage 不再产 toast', async () => {
    const { unmount } = render(
      <IuiThemeProvider>
        <ViewerNotificationsBridge />
      </IuiThemeProvider>,
    );
    act(() => {
      viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, '卸载前消息'));
    });
    expect(await screen.findByText('卸载前消息')).toBeDefined();
    unmount();
    act(() => {
      viewerNotifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, '卸载后消息'));
    });
    expect(screen.queryByText('卸载后消息')).toBeNull();
  });
});
