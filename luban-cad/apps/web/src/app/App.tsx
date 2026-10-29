import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppProviders } from './providers/AppProviders.js';
import { GlobalErrorBoundary } from './error-boundaries/GlobalErrorBoundary.js';
import { routes } from '@config/routes.js';

const router = createBrowserRouter(routes);

export function App(): React.JSX.Element {
  return (
    <GlobalErrorBoundary>
      <AppProviders>
        <div data-testid="app-root">
          <RouterProvider router={router} />
        </div>
      </AppProviders>
    </GlobalErrorBoundary>
  );
}
