/*
 * Helleniq Crude Schedule Optimizer — Top Navigation Bar.
 *
 * Spec reference (lines 27-34):
 *   - Company logo (left)
 *   - Refinery selector (center): Aspropyrgos default; Elefsina & Thessaloniki
 *     greyed out with "Coming Soon" badge
 *   - Planning horizon toggle: 7 / 14 / 30 days
 *   - Last data sync timestamp
 *   - User avatar + notification bell (right)
 */

import React, { useMemo } from 'react';
import { Bell, CircleUser, Droplets } from 'lucide-react';
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
    <header className="hel-topbar" role="banner">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--hel-font-display)',
          fontSize: 16,
          color: 'var(--hel-primary)',
        }}
      >
        <Droplets size={18} color="var(--hel-primary)" />
        Helleniq Energy
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 24 }}>
        <label htmlFor="hel-refinery" style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
          Refinery
        </label>
        <select
          id="hel-refinery"
          value={filters.refineryId}
          onChange={(e) => setRefinery(e.target.value)}
          aria-label="Select refinery"
          style={{
            border: '1px solid var(--hel-border)',
            borderRadius: 8,
            padding: '4px 10px',
            background: 'var(--hel-surface)',
            fontFamily: 'var(--hel-font-body)',
            fontSize: 13,
          }}
        >
          <option value="ASPROPYRGOS">Aspropyrgos</option>
          <option value="ELEFSINA" disabled>
            Elefsina (Coming Soon)
          </option>
          <option value="THESSALONIKI" disabled>
            Thessaloniki (Coming Soon)
          </option>
        </select>
        {filters.refineryId !== 'ASPROPYRGOS' && (
          <span className="hel-badge hel-badge--muted">Coming Soon</span>
        )}
      </div>

      <div className="hel-horizon-toggle" role="group" aria-label="Planning horizon" style={{ marginLeft: 16 }}>
        {HORIZON_OPTIONS.map((h) => (
          <button
            key={h}
            type="button"
            className={filters.horizon === h ? 'hel-active' : ''}
            onClick={() => setHorizon(h)}
            aria-pressed={filters.horizon === h}
          >
            {h}-day
          </button>
        ))}
      </div>

      <div className="hel-topbar__spacer" />

      <div className="hel-topbar__sync" title={formatDateTime(lastSync)}>
        Data last updated: {formatRelative(lastSync)} ({formatDateTime(lastSync)})
      </div>

      <button
        type="button"
        aria-label={`${recs.length} proposed recommendations`}
        title={`${recs.length} proposed recommendations`}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--hel-text-muted)',
        }}
        onClick={() => {
          window.location.hash = '#/recommendations';
        }}
      >
        <Bell size={18} />
        {recs.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              background: 'var(--hel-danger)',
              color: '#fff',
              fontSize: 10,
              borderRadius: 999,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {recs.length}
          </span>
        )}
      </button>

      <span style={{ color: 'var(--hel-text-muted)' }} aria-label="User avatar">
        <CircleUser size={22} />
      </span>
    </header>
  );
}
