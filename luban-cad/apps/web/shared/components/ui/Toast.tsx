/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect } from 'react';
import { Alert } from '@itwin/itwinui-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose?: () => void;
  duration?: number;
}

const typeMap = {
  success: 'positive' as const,
  error: 'negative' as const,
  info: 'informational' as const,
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  onClose,
  duration = 3000
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose || (() => {}), duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <Alert.Wrapper
      type={typeMap[type]}
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 10000,
        maxWidth: 380,
        animation: 'toast-spring-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <Alert.Icon />
      <Alert.Message>{message}</Alert.Message>
      {onClose && <Alert.CloseButton onClick={onClose} />}
    </Alert.Wrapper>
  );
};

export default Toast;
