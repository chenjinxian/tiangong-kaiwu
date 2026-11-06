import React from 'react';
import ReactDOM from 'react-dom/client';
import '@itwin/itwinui-react/styles.css';
import './styles/tokens/onshape-skin.css';
import './styles/global.css';
import './styles/onshape-modals.css';
import { App } from './app/App.js';
import { installExampleE2EHooks } from './modules/part-studio/internal/e2e-example-hooks.js';

installExampleE2EHooks();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
