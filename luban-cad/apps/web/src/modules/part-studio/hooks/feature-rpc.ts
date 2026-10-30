/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * feature-rpc（B-model P2.4 抽出）：特征 RPC 特征级超时兜底的最小共享件。
 * M5-T1 起 `withOpTimeout` 原居 useFeatureSystem；P2.4 把写租约生命周期上提
 * 到 useEditorSession（注册表写方法与 op 提交共用同一 session/租约），两处都
 * 需要同一 15s 超时口径——单点收在此文件，useFeatureSystem 保留同名导出以
 * 兼容既有测试/消费方。
 */

import i18next from 'i18next';

/**
 * 特征 RPC 特征级超时（M5-T1，清偿 T5 评审 Minor-4 挂账）：rpc-over-ipc 悬挂
 * 零反馈的兜底口径——getFeatureTree / applyFeatureOp（含 op 路租约预取）均套；
 * 参照旧应用 RESOLVE_*_TIMEOUT_MS（15s）量级。
 */
export const FEATURE_OP_TIMEOUT_MS = 15_000;

/**
 * 特征 RPC 超时包装：悬挂 15s 即以 i18n 超时错误 reject（经既有 error 通道
 * 呈现），不再永久 busy；正常落定/先期失败照常透传并撤钟。
 */
export function withOpTimeout<T>(invoke: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(i18next.t('partStudio.featureSystem.opTimeout', { seconds: FEATURE_OP_TIMEOUT_MS / 1000 })));
    }, FEATURE_OP_TIMEOUT_MS);
    invoke.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
