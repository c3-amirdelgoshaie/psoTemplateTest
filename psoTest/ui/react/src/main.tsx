/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Helleniq Crude Schedule Optimizer — entry point.
 *
 * Providers (order matters, outer → inner):
 *   - QueryClientProvider  (react-query cache for the whole app)
 *   - HashRouter
 *   - GlobalFiltersProvider (horizon / refinery / grade family / status)
 *   - ToastProvider        (optimizer-complete, blend-violation, etc.)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import queryClient from './clientProvider/clientProvider';
import { GlobalFiltersProvider } from './contexts/GlobalFiltersContext';
import { ToastProvider } from './contexts/ToastContext';
import './globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <GlobalFiltersProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </GlobalFiltersProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
