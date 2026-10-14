import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeProvider as ITwinThemeProvider, ProgressRadial } from '@itwin/itwinui-react';
import { UserProvider } from './contexts/UserContext.js';
import { ThemeProvider, useTheme } from './contexts/ThemeContext.js';
import { PrivateRoute } from './components/PrivateRoute.js';
import { ErrorBoundary } from '../shared/components/index.js';
import { DialogProvider } from '../src/core/components/DialogProvider.js';

// Lazy load pages for better performance
// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/naming-convention
const Login = lazy(() => import('../src/pages/Login/Login.js'));
// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/naming-convention
const Register = lazy(() => import('../src/pages/Register/Register.js'));
// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/naming-convention
const ForgotPassword = lazy(() => import('../src/pages/ForgotPassword/ForgotPassword.js'));
// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/naming-convention
const Documents = lazy(() => import('../src/pages/Documents/Documents.js'));
// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/naming-convention
const ITwinDetail = lazy(() => import('../src/pages/ITwinDetail/ITwinDetail.js'));
// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/naming-convention
const Editor = lazy(() => import('../src/pages/Editor/Editor.js'));
// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/naming-convention
const Settings = lazy(() => import('../src/pages/Settings/Settings.js'));

// Loading component for suspense fallback using iTwinUI
// eslint-disable-next-line @typescript-eslint/naming-convention
const PageLoader: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh'
  }}>
    <ProgressRadial indeterminate size="large" />
  </div>
);

/**
 * Legacy route redirects: /itwins/* → /documents/*
 * (Onshape-style /documents route family; old URLs stay shareable/bookmarkable.)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const LegacyITwinRedirect: React.FC = () => {
  const { iTwinId } = useParams();
  return <Navigate to={`/documents/${iTwinId}`} replace />;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const LegacyWorkspaceRedirect: React.FC = () => {
  const { iTwinId, iModelId } = useParams();
  return <Navigate to={`/documents/${iTwinId}/${iModelId}`} replace />;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
const NotFoundPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h1>{t('notFound.title')}</h1>
      <a href="/documents">{t('notFound.goDocuments')}</a>
    </div>
  );
};

/**
 * App routes with theme integration
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const AppRoutes: React.FC = () => {
  const { theme } = useTheme();

  return (
    <ITwinThemeProvider theme={theme}>
      <UserProvider>
        <DialogProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes with ErrorBoundary */}
                <Route path="/login" element={
                  <ErrorBoundary>
                    <Login />
                  </ErrorBoundary>
                } />
                <Route path="/register" element={
                  <ErrorBoundary>
                    <Register />
                  </ErrorBoundary>
                } />
                <Route path="/forgot-password" element={
                  <ErrorBoundary>
                    <ForgotPassword />
                  </ErrorBoundary>
                } />

                {/* Protected routes with ErrorBoundary */}
                <Route
                  path="/documents"
                  element={
                    <PrivateRoute>
                      <ErrorBoundary>
                        <Documents />
                      </ErrorBoundary>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/documents/:iTwinId"
                  element={
                    <PrivateRoute>
                      <ErrorBoundary>
                        <ITwinDetail />
                      </ErrorBoundary>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/documents/:iTwinId/:iModelId"
                  element={
                    <PrivateRoute>
                      <ErrorBoundary>
                        <Editor />
                      </ErrorBoundary>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <PrivateRoute>
                      <ErrorBoundary>
                        <Settings />
                      </ErrorBoundary>
                    </PrivateRoute>
                  }
                />

                {/* Legacy route compatibility redirects */}
                <Route path="/itwins" element={<Navigate to="/documents" replace />} />
                <Route path="/itwins/:iTwinId" element={<LegacyITwinRedirect />} />
                <Route path="/workspace/:iTwinId/:iModelId" element={<LegacyWorkspaceRedirect />} />

                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/documents" replace />} />

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </DialogProvider>
      </UserProvider>
    </ITwinThemeProvider>
  );
};

/**
 * LubanCAD Web Application
 *
 * Architecture:
 * - UserProvider: Global authentication state
 * - ThemeProvider: iTwinUI theme
 * - React Router: Client-side routing
 * - Suspense: Lazy loading for code splitting
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  );
};

export default App;
