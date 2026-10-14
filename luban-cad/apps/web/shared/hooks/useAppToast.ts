/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * itwinui useToaster 的 showToast 适配器（P0 Task5）。
 * 签名与退役自研 ToastContainer 的 useToast().showToast 逐字兼容，
 * 使 useVersionControl/useSolidModelingDialogs 等以参数接收 showToast 的 hooks 零改动。
 */
import { useCallback } from 'react';
import { useToaster } from '@itwin/itwinui-react';

export type ToastType = 'success' | 'error' | 'info';

export function useAppToast(): { showToast: (message: string, type?: ToastType) => void } {
  const toaster = useToaster();
  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (type === 'success') toaster.positive(message);
      else if (type === 'error') toaster.negative(message);
      else toaster.informational(message);
    },
    [toaster],
  );
  return { showToast };
}
