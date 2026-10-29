/**
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *
 * IModelApp.notifications 呈现桥（review-8 I-2 收口）。
 *
 * 根因：core-frontend 的 NotificationManager 基类 outputMessage 是空实现
 * （itwinjs-core/core/frontend/src/NotificationManager.ts:204），IModelApp.ts:467
 * 缺省即 `new NotificationManager()`——registrationFailed、waitForToolAdmin 超时、
 * FeatureDialog/PushChangesetDialog 消息、工具错误面（NotifyMessageDetails）全部
 * 落入哑通道，真实用户不可见。
 *
 * 两层结构（层位裁决，评审简报问处）：
 *  - {@link ToasterNotificationManager}：经 useViewport → acquireViewer →
 *    IModelApp.startup 的**官方注入点**（IModelAppOptions.notifications）替换
 *    哑通道——outputMessage 转发给已注册 sink，无 sink 回退基类。注入点在
 *    viewer host（本包零 UI 依赖），呈现知识在 app 层；
 *  - {@link ViewerNotificationsBridge}：AppProviders 的 iTwinUI ThemeProvider
 *    内层挂载（useToaster 依赖其内部 ToastProvider context），把 useToaster
 *    注册为 sink。渲染 iTwinUI toast：priority 映射 Error/Fatal→negative、
 *    Warning→warning、其余→informational（评审简报钉死映射；Fatal 与 Error 同
 *    族归 negative），短暂驻留自动消失（Toast 缺省 temporary 7s）。
 *
 * 诚实登记：outputPrompt（prompt 面）与 openMessageBox（模态 MessageBox 面）
 * 未接线——现有调用面只走 outputMessage；启用时在本桥补出口，勿静默。
 * DevViewerRoute（dev 冒烟 harness）未传 notifications 选项，维持哑通道。
 */

import React, { useEffect } from 'react';
import { useToaster } from '@itwin/itwinui-react';
import { NotificationManager, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';

/** iTwinUI toast 类别（negative/warning/informational 三态；positive 不在映射）。 */
export type ViewerToastCategory = 'negative' | 'warning' | 'informational';

/** sink 契约：ToasterNotificationManager 的转发目标（bridge 注册，测试可注替身）。 */
export type ViewerNotificationSink = (message: NotifyMessageDetails) => void;

let sink: ViewerNotificationSink | undefined;

/** 注册/注销 sink（bridge 卸载传 undefined；单槽——同一时刻至多一个呈现面）。 */
export function setViewerNotificationSink(next: ViewerNotificationSink | undefined): void {
  sink = next;
}

/** priority → iTwinUI toast 类别（Error/Fatal→negative、Warning→warning、其余→
 * informational）。枚举值序非 severity 序（Error=10 < Warning=11 < Info=12 <
 * Debug=13 < Fatal=17），不可数值比较——逐一 case。 */
export function toastCategoryOf(priority: OutputMessagePriority): ViewerToastCategory {
  switch (priority) {
    case OutputMessagePriority.Error:
    case OutputMessagePriority.Fatal:
      return 'negative';
    case OutputMessagePriority.Warning:
      return 'warning';
    default:
      return 'informational';
  }
}

/** briefMessage/detailedMessage 的 string|HTMLElement 双形态取文本（core 契约
 * 允许两种形态，HTMLElement 走 textContent——不经 innerHTML，零注入面）。 */
function messageText(value: HTMLElement | string | undefined): string {
  if (typeof value === 'string') return value;
  return value?.textContent ?? '';
}

/** 哑通道替换件（官方注入点换入的 NotificationManager 子类）：有 sink 转发，
 * 无 sink 回退基类；sink 异常吞掉 + console.warn——通知面故障不得反噬工具链。 */
export class ToasterNotificationManager extends NotificationManager {
  public override outputMessage(message: NotifyMessageDetails): void {
    const deliver = sink;
    if (!deliver) {
      super.outputMessage(message);
      return;
    }
    try {
      deliver(message);
    } catch (err) {
      console.warn('[ViewerNotifications] toast sink error:', err);
    }
  }
}

/** app 生命期单例（PartStudioPage 经 useViewport.notifications 注入 startup；
 * 实例无状态、sink 晚绑定——注入先于 bridge 注册的启动间隙消息落 sink 缺席
 * 路径=基类哑通道，可接受）。 */
export const viewerNotifications = new ToasterNotificationManager();

/** sink 注册桥（AppProviders 挂载；渲染 null）。须在 iTwinUI ThemeProvider 内层
 * ——useToaster 经 useSafeContext 取其内部 ToastProvider，缺席即抛。 */
export function ViewerNotificationsBridge(): null {
  const toaster = useToaster();
  useEffect(() => {
    setViewerNotificationSink((message) => {
      // brief 优先，brief 空回退 detailed（core 消息两段式）；全空不产空 toast。
      const text = messageText(message.briefMessage) || messageText(message.detailedMessage);
      if (!text) return;
      const category = toastCategoryOf(message.priority);
      if (category === 'negative') toaster.negative(text);
      else if (category === 'warning') toaster.warning(text);
      else toaster.informational(text);
    });
    return () => setViewerNotificationSink(undefined);
  }, [toaster]);
  return null;
}
