/*
 * Recommendations page (spec page 4, lines 168-176).
 *
 * Lists every optimizer recommendation with rich filters and a table. Click a
 * row to open the shared EvidenceDrawer (full strict-JSON rendering with
 * Accept/Reject/Modify/Note actions + feedback loop).
 *
 * Filters:
 *   - Status multi-select (Proposed / Accepted / Rejected / Modified / Completed)
 *   - Decision multi-select (HOLD / REORDER / SUBSTITUTE / DEFER / DROP / RETIME / NOMINATE_TANK)
 *   - Date range (createdAt)
 *   - Crude grade (pulls from input.items)
 *   - Vessel (pulls from input.facilities[*].cargoes, via cargoId)
 *   - Free-text search (title / summary / id)
 *   - GlobalFilters.gradeFamily also applied when each rec has a crudeGrade
 *
 * Table columns:
 *   createdAt | Priority | Decision | Title | Crude / Cargo | Confidence |
 *   Impact | Realized | Status | Actor
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';

import { getInputData, getRecommendations } from '../shared/crudeApi';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import SectionHeader from '../components/hel/SectionHeader';
import PageFilterBar from '../components/TopBar/PageFilterBar';
import Card from '../components/hel/Card';
import EmptyState from '../components/hel/EmptyState';
import HelButton from '../components/hel/HelButton';
import EvidenceDrawer from '../components/hel/EvidenceDrawer';
import {
  CargoStatusBadge,
  DecisionBadge,
  PriorityBadge,
  StatusBadge,
} from '../components/hel/StatusBadge';
import {
  formatDateTime,
  formatRelative,
  formatUsdCompact,
  gradeFamilyColor,
} from '../lib/format';
import type {
  Cargo,
  CrudeItem,
  DecisionKind,
  PersistedRecommendation,
  RecommendationStatus,
} from '../types/crude';

const ALL_STATUSES: RecommendationStatus[] = [
  'Proposed',
  'Accepted',
  'Rejected',
  'Modified',
  'Completed',
];
const ALL_DECISIONS: DecisionKind[] = [
  'HOLD',
  'REORDER',
  'SUBSTITUTE',
  'DEFER',
  'DROP',
  'RETIME',
  'NOMINATE_TANK',
];

export default function RecommendationsPage() {
  const { filters } = useGlobalFilters();

  // Filter state.
  const [statuses, setStatuses] = useState<RecommendationStatus[]>([
    'Proposed',
    'Accepted',
    'Modified',
  ]);
  const [decisions, setDecisions] = useState<DecisionKind[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>('All');
  const [cargoFilter, setCargoFilter] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [q, setQ] = useState<string>('');

  const [selected, setSelected] = useState<PersistedRecommendation | null>(null);

  // Data fetch — pull all recs; filtering happens client-side so
  // status/decision checkboxes feel instant.
  const { data: recs = [], isLoading } = useQuery({
    queryKey: ['recs', 'all'],
    queryFn: () => getRecommendations(null, 500),
  });
  const { data: input } = useQuery({ queryKey: ['psoInput'], queryFn: getInputData });

  const items: CrudeItem[] = input?.items ?? [];
  const itemsById = useMemo(() => {
    const m: Record<string, CrudeItem> = {};
    for (const i of items) m[i.itemId] = i;
    return m;
  }, [items]);
  const cargoes: Cargo[] = input?.facilities?.[0]?.cargoes ?? [];
  const cargoesById = useMemo(() => {
    const m: Record<string, Cargo> = {};
    for (const c of cargoes) m[c.cargoId] = c;
    return m;
  }, [cargoes]);

  // Grade options sourced from the items master.
  const gradeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of recs) if (r.crudeGrade) set.add(r.crudeGrade);
    for (const i of items) set.add(i.itemId);
    return ['All', ...Array.from(set).sort()];
  }, [recs, items]);

  const cargoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of recs) if (r.cargoId) set.add(r.cargoId);
    return ['All', ...Array.from(set).sort()];
  }, [recs]);

  // Apply all filters.
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
    return recs
      .filter((r) => {
        if (statuses.length > 0 && !statuses.includes(r.status)) return false;
        if (decisions.length > 0 && !decisions.includes(r.decision)) return false;
        if (gradeFilter !== 'All' && r.crudeGrade !== gradeFilter) return false;
        if (cargoFilter !== 'All' && r.cargoId !== cargoFilter) return false;

        const ts = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        if (ts < fromTs || ts > toTs) return false;

        if (query) {
          const hay = `${r.id} ${r.title ?? ''} ${r.summary ?? ''} ${r.crudeGrade ?? ''} ${r.cargoId ?? ''}`
            .toLowerCase();
          if (!hay.includes(query)) return false;
        }

        if (filters.gradeFamily !== 'All') {
          const item = r.crudeGrade ? itemsById[r.crudeGrade] : undefined;
          if (item && item.gradeFamily !== filters.gradeFamily) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // HIGH > MEDIUM > LOW, then createdAt desc.
        const pr = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
        const dp = pr[a.priority] - pr[b.priority];
        if (dp !== 0) return dp;
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      });
  }, [recs, statuses, decisions, gradeFilter, cargoFilter, dateFrom, dateTo, q, filters.gradeFamily, itemsById]);

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const clearAll = () => {
    setStatuses([]);
    setDecisions([]);
    setGradeFilter('All');
    setCargoFilter('All');
    setDateFrom('');
    setDateTo('');
    setQ('');
  };

  const filtersActive =
    statuses.length > 0 ||
    decisions.length > 0 ||
    gradeFilter !== 'All' ||
    cargoFilter !== 'All' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    q.trim() !== '';

  return (
    <div>
      <SectionHeader
        title="Recommendations"
        subtitle={
          isLoading
            ? 'Loading…'
            : `${rows.length} of ${recs.length} recommendation${recs.length === 1 ? '' : 's'} in view`
        }
        action={
          filtersActive ? (
            <HelButton variant="ghost" size="sm" onClick={clearAll} icon={<X size={14} />}>
              Clear filters
            </HelButton>
          ) : null
        }
      />

      <PageFilterBar
        extras={
          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Search
              size={14}
              color="var(--hel-text-muted)"
              style={{ position: 'absolute', left: 8, pointerEvents: 'none' }}
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, summary, id…"
              aria-label="Search recommendations"
              style={{
                border: '1px solid var(--hel-border)',
                borderRadius: 8,
                padding: '5px 10px 5px 26px',
                background: 'var(--hel-surface)',
                fontSize: 13,
                width: 280,
              }}
            />
          </label>
        }
      />

      {/* Secondary filter card: checkboxes + selects + date range */}
      <Card compact>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          <CheckGroup
            label="Status"
            options={ALL_STATUSES}
            selected={statuses}
            onToggle={(v) => setStatuses((s) => toggle(s, v as RecommendationStatus))}
          />
          <CheckGroup
            label="Decision"
            options={ALL_DECISIONS}
            selected={decisions}
            onToggle={(v) => setDecisions((s) => toggle(s, v as DecisionKind))}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <LabeledSelect
              label="Crude grade"
              value={gradeFilter}
              options={gradeOptions}
              onChange={setGradeFilter}
              renderOption={(o) => {
                const item = itemsById[o];
                return item ? `${item.name}` : o;
              }}
            />
            <LabeledSelect
              label="Cargo"
              value={cargoFilter}
              options={cargoOptions}
              onChange={setCargoFilter}
              renderOption={(o) => {
                const c = cargoesById[o];
                return c ? `${c.cargoId} — ${c.vesselName}` : o;
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
              <DateInput label="To" value={dateTo} onChange={setDateTo} />
            </div>
          </div>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState
            title={recs.length === 0 ? 'No recommendations yet' : 'No recommendations match'}
            message={
              recs.length === 0
                ? 'Run the optimizer to generate recommendations.'
                : 'Adjust the filters or clear the search to see more.'
            }
          />
        ) : (
          <table className="hel-table">
            <caption style={{ position: 'absolute', left: '-9999px' }}>Recommendations</caption>
            <thead>
              <tr>
                <th>Created</th>
                <th>Priority</th>
                <th>Decision</th>
                <th>Title</th>
                <th>Crude / Cargo</th>
                <th style={{ textAlign: 'right' }}>Confidence</th>
                <th style={{ textAlign: 'right' }}>Impact</th>
                <th style={{ textAlign: 'right' }}>Realized</th>
                <th>Status</th>
                <th>Actor</th>
                <th aria-hidden></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const item = r.crudeGrade ? itemsById[r.crudeGrade] : undefined;
                const cargo = r.cargoId ? cargoesById[r.cargoId] : undefined;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{ cursor: 'pointer' }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(r);
                    }}
                    aria-label={`Open recommendation ${r.title}`}
                  >
                    <td style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
                      <div>{formatRelative(r.createdAt)}</div>
                      <div style={{ fontSize: 11 }}>{formatDateTime(r.createdAt)}</div>
                    </td>
                    <td>
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td>
                      <DecisionBadge decision={r.decision} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.title}</div>
                      {r.summary && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--hel-text-muted)',
                            marginTop: 2,
                            maxWidth: 480,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.summary}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.crudeGrade && (
                        <div>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: gradeFamilyColor(item?.gradeFamily),
                              marginRight: 6,
                              verticalAlign: 'middle',
                            }}
                          />
                          {item?.name ?? r.crudeGrade}
                        </div>
                      )}
                      {cargo && (
                        <div style={{ fontSize: 11, color: 'var(--hel-text-muted)' }}>
                          {cargo.cargoId} · {cargo.vesselName}{' '}
                          <CargoStatusBadge status={cargo.status} />
                        </div>
                      )}
                      {!r.crudeGrade && !cargo && (
                        <span style={{ color: 'var(--hel-text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <ConfidenceBar value={r.confidence} />
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatUsdCompact(r.expectedImpactUsd)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {r.realizedOutcomeUsd != null ? (
                        <RealizedCell
                          projected={r.expectedImpactUsd}
                          realized={r.realizedOutcomeUsd}
                        />
                      ) : (
                        <span style={{ color: 'var(--hel-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge kind={statusKind(r.status)}>{r.status}</StatusBadge>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
                      {r.actedOnBy ?? '—'}
                    </td>
                    <td aria-hidden style={{ color: 'var(--hel-text-muted)' }}>
                      ›
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <EvidenceDrawer rec={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ------------------------- small local primitives ------------------------ */

function statusKind(
  status: RecommendationStatus
): 'success' | 'danger' | 'warning' | 'info' | 'muted' {
  switch (status) {
    case 'Accepted':
      return 'success';
    case 'Rejected':
      return 'danger';
    case 'Modified':
      return 'warning';
    case 'Completed':
      return 'muted';
    default:
      return 'info';
  }
}

function CheckGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const isOn = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              aria-pressed={isOn}
              className="hel-btn hel-btn--sm"
              style={{
                background: isOn ? 'var(--hel-primary)' : 'var(--hel-surface)',
                color: isOn ? '#fff' : 'var(--hel-text)',
                border: `1px solid ${isOn ? 'var(--hel-primary)' : 'var(--hel-border)'}`,
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
  renderOption,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  renderOption?: (v: string) => string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          border: '1px solid var(--hel-border)',
          borderRadius: 8,
          padding: '5px 8px',
          background: 'var(--hel-surface)',
          fontSize: 13,
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {renderOption ? renderOption(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} date`}
        style={{
          border: '1px solid var(--hel-border)',
          borderRadius: 8,
          padding: '5px 8px',
          background: 'var(--hel-surface)',
          fontSize: 13,
        }}
      />
    </label>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    v >= 80 ? 'var(--hel-success)' : v >= 60 ? 'var(--hel-warning)' : 'var(--hel-danger)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>
        {v}%
      </span>
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 48,
          height: 6,
          borderRadius: 4,
          background: 'var(--hel-border)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${v}%`,
            height: '100%',
            background: color,
          }}
        />
      </span>
    </div>
  );
}

function RealizedCell({
  projected,
  realized,
}: {
  projected?: number;
  realized: number;
}) {
  const delta = projected != null ? realized - projected : 0;
  const sign = delta > 0 ? '+' : '';
  const color =
    delta > 0 ? 'var(--hel-success)' : delta < 0 ? 'var(--hel-danger)' : 'var(--hel-text-muted)';
  return (
    <div>
      <div>{formatUsdCompact(realized)}</div>
      {projected != null && (
        <div style={{ fontSize: 11, color }}>
          {sign}
          {formatUsdCompact(delta)}
        </div>
      )}
    </div>
  );
}
