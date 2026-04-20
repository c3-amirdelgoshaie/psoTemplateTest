import React from 'react';
import { useGlobalFilters } from '../../contexts/GlobalFiltersContext';
import type { GradeFamilyFilter, VesselStatusFilter } from '../../types/crude';

/**
 * Per-page secondary filter bar. Rendered immediately below the SectionHeader
 * on every page, so global filters are always visible and immediately mutable
 * without leaving the current view (spec lines 40-45: filters must update all
 * cards/tables/charts on every page).
 */
const GRADE_OPTIONS: GradeFamilyFilter[] = ['All', 'Arab Light', 'Urals', 'CPC Blend', 'Azeri', 'Other'];
const STATUS_OPTIONS: VesselStatusFilter[] = ['All', 'Confirmed', 'Provisional', 'At Risk'];

export default function PageFilterBar({
  showGradeFamily = true,
  showVesselStatus = true,
  extras,
}: {
  showGradeFamily?: boolean;
  showVesselStatus?: boolean;
  extras?: React.ReactNode;
}) {
  const { filters, setGradeFamily, setVesselStatus } = useGlobalFilters();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}
    >
      {showGradeFamily && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--hel-text-muted)' }}>
          Grade
          <select
            value={filters.gradeFamily}
            onChange={(e) => setGradeFamily(e.target.value as GradeFamilyFilter)}
            aria-label="Filter by crude grade family"
            style={{
              border: '1px solid var(--hel-border)', borderRadius: 8,
              padding: '4px 8px', background: 'var(--hel-surface)', fontSize: 13,
            }}
          >
            {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      )}

      {showVesselStatus && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--hel-text-muted)' }}>
          Vessel status
          <select
            value={filters.vesselStatus}
            onChange={(e) => setVesselStatus(e.target.value as VesselStatusFilter)}
            aria-label="Filter by vessel status"
            style={{
              border: '1px solid var(--hel-border)', borderRadius: 8,
              padding: '4px 8px', background: 'var(--hel-surface)', fontSize: 13,
            }}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}

      {extras}
    </div>
  );
}
