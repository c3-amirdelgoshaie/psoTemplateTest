/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Helleniq Crude Schedule Optimizer — application shell.
 *
 * Renders the fixed layout mandated by the spec: left sidebar + top bar,
 * with the active page rendered inside the content area. All pages read
 * global filters via the GlobalFiltersContext so the layout never changes
 * between routes — only card contents do (spec line 14).
 */

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import SideNav from './components/SideNav/SideNav';
import TopBar from './components/TopBar/TopBar';
import ErrorReporterProvider from './components/ErrorBoundary/ErrorBoundary';

import DashboardPage from './pages/DashboardPage';
import CargoSchedulePage from './pages/CargoSchedulePage';
import FeedstockPlanPage from './pages/FeedstockPlanPage';
import OptimizerPage from './pages/OptimizerPage';
import RegistryPage from './pages/RegistryPage';
import RecommendationsPage from './pages/RecommendationsPage';

if (import.meta.env.MODE === 'development') {
  const authToken = import.meta.env.VITE_C3_AUTH_TOKEN;
  if (authToken) document.cookie = `c3auth=${authToken}`;
}

export default function App() {
  return (
    <ErrorReporterProvider>
      <div className="hel-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <SideNav />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TopBar />
          <main className="hel-scroll" style={{ flex: 1, padding: 20 }}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/schedule" element={<CargoSchedulePage />} />
              <Route path="/feedstock" element={<FeedstockPlanPage />} />
              <Route path="/optimizer" element={<OptimizerPage />} />
              <Route path="/registry" element={<RegistryPage />} />
              <Route path="/recommendations" element={<RecommendationsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </ErrorReporterProvider>
  );
}
