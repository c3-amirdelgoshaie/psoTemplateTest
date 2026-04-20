/*
 * Cargo & SKU Registry (spec page 5, lines 160-166).
 *
 * Purpose: Fast find and jump to cargo or crude grade detail.
 *
 * Renders:
 *   - Search box (cargo id / vessel name / crude grade)
 *   - Filters: vessel type, crude grade family, status (leverages GlobalFilters)
 *   - Table with performance chips per row — volume, margin, decision, confidence
 *   - Click-through opens a Cargo Detail drawer with full fields,
 *     AIS position, and the linked optimizer recommendation.
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { getInputData, getOutputData, getRecommendations } from '../shared/crudeApi';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import SectionHeader from '../components/hel/SectionHeader';
import PageFilterBar from '../components/TopBar/PageFilterBar';
import Card from '../components/hel/Card';
import EmptyState from '../components/hel/EmptyState';
import Drawer from '../components/hel/Drawer';
import {
  CargoStatusBadge,
  DecisionBadge,
  PriorityBadge,
  StatusBadge,
} from '../components/hel/StatusBadge';
import { formatDate, formatKbbls, formatUsd, gradeFamilyColor } from '../lib/format';
import type { Cargo, CrudeItem, Schedule } from '../types/crude';

type VesselTypeFilter = 'All' | 'VLCC' | 'Suezmax' | 'Aframax';

export default function RegistryPage() {
  const { filters } = useGlobalFilters();
  const [q, setQ] = useState('');
  const [vesselType, setVesselType] = useState<VesselTypeFilter>('All');
  const [selected, setSelected] = useState<Cargo | null>(null);

  const { data: input } = useQuery({ queryKey: ['psoInput'], queryFn: getInputData });
  const { data: output } = useQuery({ queryKey: ['psoOutput'], queryFn: getOutputData });
  const { data: recs = [] } = useQuery({
    queryKey: ['recs', 'all'],
    queryFn: () => getRecommendations(null, 200),
  });

  const items = input?.items ?? [];
  const itemsById = useMemo(() => {
    const m: Record<string, CrudeItem> = {};
    for (const i of items) m[i.itemId] = i;
    return m;
  }, [items]);

  const cargoes: Cargo[] = input?.facilities?.[0]?.cargoes ?? [];
  const schedulesById = useMemo(() => {
    const m: Record<string, Schedule> = {};
    for (const s of output?.schedules ?? []) m[s.cargoId] = s;
    return m;
  }, [output]);
  const recsByCargo = useMemo(() => {
    const m: Record<string, typeof recs> = {};
    for (const r of recs) {
      if (!r.cargoId) continue;
      (m[r.cargoId] ??= []).push(r);
    }
    return m;
  }, [recs]);

  // Apply filters.
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return cargoes.filter((c) => {
      if (query) {
        const hay = `${c.cargoId} ${c.vesselName} ${c.crudeGrade}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (vesselType !== 'All' && c.vesselType !== vesselType) return false;
      if (filters.vesselStatus !== 'All' && c.status !== filters.vesselStatus) return false;
      if (filters.gradeFamily !== 'All') {
        const item = itemsById[c.crudeGrade];
        if (item?.gradeFamily !== filters.gradeFamily) return false;
      }
      return true;
    });
  }, [cargoes, q, vesselType, filters, itemsById]);

  return (
    <div>
      <SectionHeader
        title="Cargo & SKU Registry"
        subtitle={`${cargoes.length} cargoes in scope — search, filter, and jump to detail`}
      />

      <PageFilterBar
        extras={
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--hel-text-muted)' }}>
              Vessel type
              <select
                value={vesselType}
                onChange={(e) => setVesselType(e.target.value as VesselTypeFilter)}
                aria-label="Filter by vessel type"
                style={{
                  border: '1px solid var(--hel-border)', borderRadius: 8,
                  padding: '4px 8px', background: 'var(--hel-surface)', fontSize: 13,
                }}
              >
                {(['All', 'VLCC', 'Suezmax', 'Aframax'] as VesselTypeFilter[]).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>

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
                placeholder="Search cargo id, vessel, grade…"
                aria-label="Search cargoes"
                style={{
                  border: '1px solid var(--hel-border)', borderRadius: 8,
                  padding: '5px 10px 5px 26px', background: 'var(--hel-surface)',
                  fontSize: 13, width: 280,
                }}
              />
            </label>
          </>
        }
      />

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState
            title="No cargoes match"
            message="Adjust the search term or broaden the filters."
          />
        ) : (
          <table className="hel-table">
            <caption style={{ position: 'absolute', left: '-9999px' }}>Cargo registry</caption>
            <thead>
              <tr>
                <th>Cargo ID</th>
                <th>Vessel</th>
                <th>Grade</th>
                <th>Volume</th>
                <th>Margin</th>
                <th>Laycan</th>
                <th>Status</th>
                <th>Decision</th>
                <th>Confidence</th>
                <th aria-hidden></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const item = itemsById[c.crudeGrade];
                const sch = schedulesById[c.cargoId];
                const cargoRecs = recsByCargo[c.cargoId] ?? [];
                const topRec = cargoRecs[0];
                return (
                  <tr
                    key={c.cargoId}
                    onClick={() => setSelected(c)}
                    style={{ cursor: 'pointer' }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(c);
                    }}
                    aria-label={`Open detail for ${c.vesselName}`}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.cargoId}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{c.vesselName}</div>
                      <div style={{ fontSize: 11, color: 'var(--hel-text-muted)' }}>{c.vesselType}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8, height: 8, borderRadius: '50%',
                          background: gradeFamilyColor(item?.gradeFamily),
                          marginRight: 6, verticalAlign: 'middle',
                        }}
                      />
                      {item?.name ?? c.crudeGrade}
                      <div style={{ fontSize: 11, color: 'var(--hel-text-muted)' }}>
                        {item ? `API ${item.apiGravity} / S ${item.sulphurPct}%` : ''}
                      </div>
                    </td>
                    <td>{formatKbbls(c.volumeBbls)}</td>
                    <td>
                      {item?.grmContributionUsdBbl != null
                        ? `$${item.grmContributionUsdBbl.toFixed(2)}/bbl`
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {formatDate(c.laycanStart)} → {formatDate(c.laycanEnd)}
                    </td>
                    <td><CargoStatusBadge status={c.status} /></td>
                    <td>{sch ? <DecisionBadge decision={sch.decision} /> : <StatusBadge kind="muted">—</StatusBadge>}</td>
                    <td>
                      {topRec ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <PriorityBadge priority={topRec.priority} />
                          <span style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
                            {topRec.confidence}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--hel-text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td aria-hidden style={{ color: 'var(--hel-text-muted)' }}>›</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <CargoDetailDrawer
        cargo={selected}
        onClose={() => setSelected(null)}
        item={selected ? itemsById[selected.crudeGrade] : undefined}
        schedule={selected ? schedulesById[selected.cargoId] : undefined}
        recs={selected ? recsByCargo[selected.cargoId] ?? [] : []}
      />
    </div>
  );
}

function CargoDetailDrawer({
  cargo,
  onClose,
  item,
  schedule,
  recs,
}: {
  cargo: Cargo | null;
  onClose: () => void;
  item?: CrudeItem;
  schedule?: Schedule;
  recs: Array<{
    recommendationId?: string;
    title: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence: number;
    decision: string;
    evidence: string[];
  }>;
}) {
  return (
    <Drawer open={!!cargo} onClose={onClose} title={cargo ? `${cargo.vesselName} — ${cargo.cargoId}` : ''}>
      {cargo && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <CargoStatusBadge status={cargo.status} />
            <StatusBadge kind="info">{cargo.vesselType}</StatusBadge>
            {schedule && <DecisionBadge decision={schedule.decision} />}
            {cargo.isFixed && <StatusBadge kind="muted">Fixed (contract)</StatusBadge>}
          </div>

          <Grid>
            <Field label="IMO" value={cargo.imoNumber ?? '—'} />
            <Field label="Grade" value={item?.name ?? cargo.crudeGrade} />
            <Field label="Origin" value={cargo.originRegion ?? '—'} />
            <Field label="Volume" value={formatKbbls(cargo.volumeBbls)} />
            <Field label="Loading port" value={cargo.loadingPort ?? '—'} />
            <Field label="Charter-party" value={cargo.charterPartyRef ?? '—'} />
            <Field label="Laycan start" value={formatDate(cargo.laycanStart)} />
            <Field label="Laycan end" value={formatDate(cargo.laycanEnd)} />
            <Field label="ETA terminal" value={cargo.etaTerminal ?? '—'} />
            <Field label="Destination" value={cargo.destinationTerminal ?? '—'} />
            <Field
              label="AIS position"
              value={
                cargo.currentLat != null && cargo.currentLon != null
                  ? `${cargo.currentLat.toFixed(2)}°, ${cargo.currentLon.toFixed(2)}°`
                  : 'Last known position unavailable'
              }
            />
            <Field
              label="Demurrage risk"
              value={
                <StatusBadge
                  kind={
                    cargo.demurrageRiskLevel === 'High'
                      ? 'danger'
                      : cargo.demurrageRiskLevel === 'Medium'
                        ? 'warning'
                        : cargo.demurrageRiskLevel === 'Low'
                          ? 'info'
                          : 'muted'
                  }
                >
                  {cargo.demurrageRiskLevel ?? 'None'}
                </StatusBadge>
              }
            />
            <Field label="Demurrage rate" value={`${formatUsd(cargo.demurrageRateUsdDay)}/day`} />
            <Field label="Freight cost" value={formatUsd(cargo.freightCostUsd)} />
            {schedule && (
              <>
                <Field label="Berth start (day offset)" value={String(schedule.berthStartDay)} />
                <Field
                  label="Projected demurrage"
                  value={`${schedule.demurrageDays}d / ${formatUsd(schedule.demurrageCostUsd)}`}
                />
              </>
            )}
          </Grid>

          {recs.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 className="hel-card__title">Linked recommendations</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {recs.map((r) => (
                  <li
                    key={r.recommendationId}
                    style={{
                      border: '1px solid var(--hel-border)',
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                      background: 'var(--hel-surface-alt)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <PriorityBadge priority={r.priority} />
                      <DecisionBadge decision={r.decision} />
                      <span style={{ color: 'var(--hel-text-muted)', fontSize: 12 }}>{r.confidence}%</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
                    {r.evidence?.[0] && (
                      <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: 4 }}>
                        {r.evidence[0]}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--hel-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{value}</div>
    </div>
  );
}
