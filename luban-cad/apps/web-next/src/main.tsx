import React from 'react';
import ReactDOM from 'react-dom/client';
import '@itwin/itwinui-react/styles.css';
import { App } from './app/App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
