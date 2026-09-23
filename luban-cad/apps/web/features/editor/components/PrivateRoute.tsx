/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../../../app/contexts/UserContext.js';

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
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e0e0e0',
          borderTopColor: '#2196f3',
          borderRadius: '50%',
          animation: 'privateroute-spin 1s linear infinite',
        }} />
        <style>{`
          @keyframes privateroute-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
