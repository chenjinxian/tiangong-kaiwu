/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ProgressRadial } from '@itwin/itwinui-react';
import { useUser } from '../contexts/UserContext.js';

interface PrivateRouteProps {
  children: React.ReactNode;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useUser();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--iui-color-background-backdrop)',
      }}>
        <ProgressRadial indeterminate size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
