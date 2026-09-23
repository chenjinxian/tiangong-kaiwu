/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react'
import ReactDOM from 'react-dom/client'
// Import iTwinUI styles FIRST (before custom variables that reference them)
import '@itwin/itwinui-react/styles.css'
import '../styles/variables.css'
import '../styles/theme.css'
import App from './App.js'
import '../styles/index.css'
import { initMonitoring } from '../shared/lib/monitoring.js'
import { QueryProvider } from './providers/QueryProvider.js'
import { IModelApp } from '@itwin/core-frontend'
// Initialize performance monitoring
initMonitoring()

// Expose IModelApp to window for debugging
declare global {
  interface Window {
    IModelApp: typeof IModelApp;
  }
}
window.IModelApp = IModelApp

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </React.StrictMode>,
)
