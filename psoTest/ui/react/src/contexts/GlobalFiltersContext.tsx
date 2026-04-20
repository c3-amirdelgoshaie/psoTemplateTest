/*
 * Global filters context — planning horizon, refinery, grade family,
 * vessel status. Per spec lines 40-45: filters must update all cards,
 * tables, and charts on every page.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';
import type { GlobalFilters, HorizonDays, GradeFamilyFilter, VesselStatusFilter } from '../types/crude';

interface Ctx {
  filters: GlobalFilters;
  setHorizon: (h: HorizonDays) => void;
  setRefinery: (id: string) => void;
  setGradeFamily: (g: GradeFamilyFilter) => void;
  setVesselStatus: (v: VesselStatusFilter) => void;
}

const defaultFilters: GlobalFilters = {
  horizon: 14,
  refineryId: 'ASPROPYRGOS',
  gradeFamily: 'All',
  vesselStatus: 'All',
};

const GlobalFiltersContext = createContext<Ctx | undefined>(undefined);

export function GlobalFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(defaultFilters);

  const value = useMemo<Ctx>(
    () => ({
      filters,
      setHorizon: (h) => setFilters((f) => ({ ...f, horizon: h })),
      setRefinery: (id) => setFilters((f) => ({ ...f, refineryId: id })),
      setGradeFamily: (g) => setFilters((f) => ({ ...f, gradeFamily: g })),
      setVesselStatus: (v) => setFilters((f) => ({ ...f, vesselStatus: v })),
    }),
    [filters]
  );

  return <GlobalFiltersContext.Provider value={value}>{children}</GlobalFiltersContext.Provider>;
}

export function useGlobalFilters(): Ctx {
  const ctx = useContext(GlobalFiltersContext);
  if (!ctx) throw new Error('useGlobalFilters must be used within GlobalFiltersProvider');
  return ctx;
}
