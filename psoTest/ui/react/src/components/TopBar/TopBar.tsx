/*
 * PSO Test — Top Navigation Bar.
 * Restyled to use C3 Tailwind design tokens (bg-primary, border-weak, etc.)
 * instead of hel-* BEM classes, while preserving all existing functionality.
 */

import React, { useMemo } from 'react';
import { Bell, CircleUser } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useGlobalFilters } from '../../contexts/GlobalFiltersContext';
import { getInputData, getRecommendations } from '../../shared/crudeApi';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { HorizonDays } from '../../types/crude';

const HORIZON_OPTIONS: HorizonDays[] = [7, 14, 30];

export default function TopBar() {
  const { filters, setHorizon, setRefinery } = useGlobalFilters();

  const { data: input } = useQuery({
    queryKey: ['psoInput'],
    queryFn: getInputData,
    staleTime: 60_000,
  });

  const { data: recs = [] } = useQuery({
    queryKey: ['recs', 'proposed-count'],
    queryFn: () => getRecommendations({ status: ['Proposed'] }, 200),
    staleTime: 30_000,
  });

  const lastSync = useMemo(() => {
    const fresh = input?.dataFreshness ?? {};
    const max = Object.values(fresh).sort().pop();
    return max ?? undefined;
  }, [input]);

  return (
    <header
      className="h-15 flex items-center gap-4 px-5 bg-primary border-b border-weak flex-shrink-0"
      role="banner"
    >
      {/* Refinery selector */}
      <div className="flex items-center gap-2">
        <label htmlFor="topbar-refinery" className="text-xs text-secondary">
          Refinery
        </label>
        <select
          id="topbar-refinery"
          value={filters.refineryId}
          onChange={(e) => setRefinery(e.target.value)}
          aria-label="Select refinery"
          className="text-sm border border-weak rounded-lg px-3 py-1 bg-primary text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="ASPROPYRGOS">Aspropyrgos</option>
          <option value="ELEFSINA" disabled>Elefsina (Coming Soon)</option>
          <option value="THESSALONIKI" disabled>Thessaloniki (Coming Soon)</option>
        </select>
      </div>

      {/* Planning horizon toggle */}
      <div
        className="flex border border-weak rounded-full overflow-hidden bg-primary"
        role="group"
        aria-label="Planning horizon"
      >
        {HORIZON_OPTIONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHorizon(h)}
            aria-pressed={filters.horizon === h}
            className={`px-3 py-1 text-xs transition-colors ${
              filters.horizon === h
                ? 'bg-accent text-white'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {h}-day
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last sync */}
      {lastSync && (
        <span className="text-xs text-secondary" title={formatDateTime(lastSync)}>
          Updated: {formatRelative(lastSync)}
        </span>
      )}

      {/* Notification bell */}
      <button
        type="button"
        aria-label={`${recs.length} proposed recommendations`}
        title={`${recs.length} proposed recommendations`}
        className="relative text-secondary hover:text-primary transition-colors"
        onClick={() => { window.location.hash = '#/recommendations'; }}
      >
        <Bell size={18} />
        {recs.length > 0 && (
          <span className="absolute -top-1 -right-1.5 bg-danger text-white text-xs rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none">
            {recs.length}
          </span>
        )}
      </button>

      {/* User avatar */}
      <span className="text-secondary" aria-label="User avatar">
        <CircleUser size={22} />
      </span>
    </header>
  );
}
