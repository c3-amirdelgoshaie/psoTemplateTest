/*
 * Dashboard page (spec page 1, lines 52-87).
 *
 * Purpose: Answer "Am I on plan? What must I do now?" in under 30 seconds.
 *
 * Layout (top → bottom):
 *   1. KPI strip — 6 cards (throughput, DOF, arrivals 14d, demurrage $, GRM vs LP, opportunity)
 *   2. Two-column main content:
 *        Left  : Top Recommendations card (inline Accept / Dismiss / Open)
 *        Right : Alerts & Anomalies card (demurrage + stockout + blend risk flags)
 *   3. Inventory heatmap — tanks grouped by HS / LS with fill-level colour bands
 *   4. 14-day Vessel Arrivals Gantt — per-berth rows, status-coloured bars
 *
 * Everything uses the shared `hel-*` utility classes so layout and visual
 * rhythm match the other pages. Click a top rec → EvidenceDrawer; inline
 * Accept / Dismiss mutate via crudeApi and emit toasts.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, ChevronRight, X } from 'lucide-react';

import {
  acceptRecommendation,
  getInputData,
  getOutputData,
  getRecommendations,
  rejectRecommendation,
} from '../shared/crudeApi';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import { useToast } from '../contexts/ToastContext';

import SectionHeader from '../components/hel/SectionHeader';
import PageFilterBar from '../components/TopBar/PageFilterBar';
import Card from '../components/hel/Card';
import KpiCard from '../components/hel/KpiCard';
import HelButton from '../components/hel/HelButton';
import EmptyState from '../components/hel/EmptyState';
import EvidenceDrawer from '../components/hel/EvidenceDrawer';
import {
  CargoStatusBadge,
  DecisionBadge,
  PriorityBadge,
  StatusBadge,
} from '../components/hel/StatusBadge';
import {
  formatDate,
  formatKbbls,
  formatPct,
  formatRelative,
  formatUsdCompact,
  gradeFamilyColor,
  severityLabel,
} from '../lib/format';
import type {
  Cargo,
  CrudeItem,
  PersistedRecommendation,
  PsoOutput,
  RiskFlag,
  Tank,
} from '../types/crude';

export default function DashboardPage() {
  const { filters } = useGlobalFilters();
  const navigate = useNavigate();
  const { push } = useToast();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<PersistedRecommendation | null>(null);

  const { data: input } = useQuery({ queryKey: ['psoInput'], queryFn: getInputData });
  const { data: output } = useQuery({ queryKey: ['psoOutput'], queryFn: getOutputData });
  const { data: recs = [] } = useQuery({
    queryKey: ['recs', 'all'],
    queryFn: () => getRecommendations(null, 200),
  });

  const accept = useMutation({
    mutationFn: (id: string) => acceptRecommendation(id, 'Accepted from dashboard'),
    onSuccess: () => {
      push({ kind: 'success', title: 'Accepted', message: 'Recommendation accepted.' });
      qc.invalidateQueries({ queryKey: ['recs'] });
    },
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => rejectRecommendation(id, 'Dismissed from dashboard'),
    onSuccess: () => {
      push({ kind: 'warning', title: 'Dismissed', message: 'Recommendation dismissed.' });
      qc.invalidateQueries({ queryKey: ['recs'] });
    },
  });

  // ----------- Derivations for each dashboard block -----------

  const facility = input?.facilities?.[0];
  const items: CrudeItem[] = input?.items ?? [];
  const itemsById = useMemo(() => {
    const m: Record<string, CrudeItem> = {};
    for (const i of items) m[i.itemId] = i;
    return m;
  }, [items]);

  const cargoes: Cargo[] = facility?.cargoes ?? [];

  // Apply global grade-family filter when computing KPIs / gantt so the
  // "filters update everything" rule holds.
  const cargoesInScope = useMemo(
    () =>
      cargoes.filter((c) => {
        if (filters.vesselStatus !== 'All' && c.status !== filters.vesselStatus) return false;
        if (filters.gradeFamily !== 'All') {
          const it = itemsById[c.crudeGrade];
          if (it?.gradeFamily !== filters.gradeFamily) return false;
        }
        return true;
      }),
    [cargoes, filters, itemsById]
  );

  // KPIs: start from the solver output, but derive arrivals within horizon
  // so the top-bar horizon toggle affects the card.
  const kpis = output?.kpis;
  const horizonDays = filters.horizon;
  const startMs = input ? new Date(input.startDate).getTime() : Date.now();
  const arrivalsInHorizon = useMemo(
    () =>
      cargoesInScope.filter((c) => {
        const dayIdx = (new Date(c.laycanStart).getTime() - startMs) / 86400000;
        return dayIdx >= 0 && dayIdx < horizonDays;
      }).length,
    [cargoesInScope, horizonDays, startMs]
  );

  // Top 5 Proposed recs (HIGH > MEDIUM > LOW, then confidence desc).
  const topRecs = useMemo(() => {
    const pr = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    return [...recs]
      .filter((r) => r.status === 'Proposed')
      .sort((a, b) => {
        const dp = pr[a.priority] - pr[b.priority];
        if (dp !== 0) return dp;
        return b.confidence - a.confidence;
      })
      .slice(0, 5);
  }, [recs]);

  // Alert buckets from the output risk flags.
  const { demurrageFlags, stockoutFlags, otherFlags } = useMemo(
    () => splitRiskFlags(output ?? null),
    [output]
  );

  // ── Proactive toasts ─────────────────────────────────────────────────────

  // Berth-conflict toast: fire when >= 1 cargo with status "At Risk" has an
  // ETA within 6 hours of the plan start (or is already overdue).
  const berthConflictToastKey = useRef('');
  useEffect(() => {
    if (!input) return;
    const now = Date.now();
    const conflict = (facility?.cargoes ?? []).find((c) => {
      if (!c.etaTerminal) return false;
      const etaMs = new Date(c.etaTerminal).getTime();
      const hoursAway = (etaMs - now) / 3600000;
      return hoursAway >= -1 && hoursAway <= 6;
    });
    if (conflict) {
      const key = conflict.cargoId;
      if (berthConflictToastKey.current !== key) {
        berthConflictToastKey.current = key;
        push({
          kind: 'warning',
          title: 'Berth Conflict Alert',
          message: `${conflict.vesselName} (${conflict.cargoId}) ETA within 6h — verify berth availability.`,
        });
      }
    }
  }, [facility, input, push]);

  return (
    <div>
      <SectionHeader
        title="Operations Dashboard"
        subtitle={`Aspropyrgos refinery · ${horizonDays}-day horizon · solved ${formatRelative(
          output?.solvedAt
        )}`}
        action={
          <HelButton
            variant="secondary"
            size="sm"
            onClick={() => navigate('/optimizer')}
            icon={<ChevronRight size={14} />}
          >
            Run optimizer
          </HelButton>
        }
      />

      <PageFilterBar />

      {/* ---------- KPI row ---------- */}
      <div className="hel-grid hel-grid--kpi" style={{ marginBottom: 16 }}>
        <KpiCard
          label="Throughput"
          value={kpis ? kbpdLabel(kpis.throughputBpd) : '—'}
          unit="kbpd"
          small={`Target ${facility ? kbpdLabel(sumPlannedBpd(facility.cdus)) : '—'} kbpd`}
          accent={
            kpis && facility && kpis.throughputBpd < sumPlannedBpd(facility.cdus) * 0.95
              ? 'warning'
              : 'default'
          }
        />
        <KpiCard
          label="Days of cover"
          value={kpis ? `HS ${kpis.daysOfCoverHs.toFixed(1)}` : '—'}
          small={kpis ? `LS ${kpis.daysOfCoverLs.toFixed(1)} days` : undefined}
          accent={kpis && Math.min(kpis.daysOfCoverHs, kpis.daysOfCoverLs) < 7 ? 'danger' : 'success'}
        />
        <KpiCard
          label={`Arrivals (next ${horizonDays}d)`}
          value={arrivalsInHorizon}
          small={`${cargoesInScope.length} cargoes in scope`}
        />
        <KpiCard
          label="Open demurrage"
          value={kpis ? formatUsdCompact(kpis.openDemurrageRiskUsd) : '—'}
          accent={kpis && kpis.openDemurrageRiskUsd > 100_000 ? 'warning' : 'default'}
          small={
            demurrageFlags.length > 0
              ? `${demurrageFlags.length} vessels at risk`
              : 'No demurrage flags'
          }
        />
        <KpiCard
          label="GRM vs LP"
          value={kpis ? `$${kpis.grmUsdPerBbl.toFixed(2)}` : '—'}
          unit="/bbl"
          small={kpis ? `$${kpis.grmUsdAnnualizedMM.toFixed(0)}M annualised` : undefined}
        />
        <KpiCard
          label="Opportunity"
          value={kpis ? `$${kpis.opportunityUsdAnnualizedMM.toFixed(1)}M` : '—'}
          accent="success"
          small={
            kpis && kpis.blendViolationCount > 0
              ? `${kpis.blendViolationCount} blend violation${kpis.blendViolationCount === 1 ? '' : 's'}`
              : 'Within operating envelope'
          }
        />
      </div>

      {/* ---------- Two-column: Top Recs | Alerts ---------- */}
      <div
        className="hel-grid"
        style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', marginBottom: 16 }}
      >
        <Card
          title="Top recommendations"
          subtitle={`${topRecs.length} open action${topRecs.length === 1 ? '' : 's'}`}
          action={
            <HelButton variant="ghost" size="sm" onClick={() => navigate('/recommendations')}>
              View all →
            </HelButton>
          }
        >
          {topRecs.length === 0 ? (
            <EmptyState
              title="Nothing to action"
              message="All recommendations are accepted or there are no open items."
            />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, minWidth: 0 }}>
              {topRecs.map((r) => {
                const item = r.crudeGrade ? itemsById[r.crudeGrade] : undefined;
                return (
                   // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
                   <li
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{
                      border: '1px solid var(--hel-border)',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                      cursor: 'pointer',
                      background: 'var(--hel-surface)',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(r);
                    }}
                    aria-label={`Open recommendation ${r.title}`}
                   >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                          marginBottom: 4,
                          flexWrap: 'wrap',
                        }}
                      >
                        <PriorityBadge priority={r.priority} />
                        <DecisionBadge decision={r.decision} />
                        <span style={{ fontSize: 12, color: 'var(--hel-text-muted)' }}>
                          {r.confidence}% confidence
                        </span>
                        {r.expectedImpactUsd != null && (
                          <span style={{ fontSize: 12, color: 'var(--hel-success)' }}>
                            {formatUsdCompact(r.expectedImpactUsd)} impact
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 500 }}>{r.title}</div>
                      {r.summary && (
                        <div
                          style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: 2 }}
                        >
                          {r.summary}
                        </div>
                      )}
                      {item && (
                        <div
                          style={{ fontSize: 11, color: 'var(--hel-text-muted)', marginTop: 4 }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: gradeFamilyColor(item.gradeFamily),
                              marginRight: 6,
                              verticalAlign: 'middle',
                            }}
                          />
                          {item.name} · API {item.apiGravity} · S {item.sulphurPct}%
                        </div>
                      )}
                      {Array.isArray(r.metadata?.missingFields) &&
                        (r.metadata!.missingFields as string[]).length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <StatusBadge kind="warning">
                              Missing: {(r.metadata!.missingFields as string[]).join(', ')}
                            </StatusBadge>
                          </div>
                        )}
                    </div>
                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}
                    >
                      <HelButton
                        variant="primary"
                        size="sm"
                        icon={<Check size={12} />}
                        onClick={() => accept.mutate(r.id)}
                      >
                        Accept
                      </HelButton>
                      <HelButton
                        variant="ghost"
                        size="sm"
                        icon={<X size={12} />}
                        onClick={() => dismiss.mutate(r.id)}
                      >
                        Dismiss
                      </HelButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Alerts & anomalies"
          subtitle={`${demurrageFlags.length + stockoutFlags.length + otherFlags.length} active flags`}
        >
          {demurrageFlags.length === 0 && stockoutFlags.length === 0 && otherFlags.length === 0 ? (
            <EmptyState title="All clear" message="No risk flags in the current solve." />
          ) : (
            <>
              <AlertGroup
                title="Demurrage risk"
                icon={<AlertTriangle size={14} color="var(--hel-warning)" />}
                flags={demurrageFlags.slice(0, 5)}
              />
              <AlertGroup
                title="Stockout risk"
                icon={<AlertTriangle size={14} color="var(--hel-danger)" />}
                flags={stockoutFlags.slice(0, 5)}
              />
              {otherFlags.length > 0 && (
                <AlertGroup title="Other" icon={null} flags={otherFlags.slice(0, 5)} />
              )}
            </>
          )}
        </Card>
      </div>

      {/* ---------- Inventory heatmap ---------- */}
      <Card
        title="Tank inventory"
        subtitle={facility ? `${facility.tanks.length} tanks · grouped by service` : undefined}
      >
        {facility ? (
          <TankHeatmap tanks={facility.tanks} itemsById={itemsById} />
        ) : (
          <EmptyState title="No tank data" message="Input data unavailable." />
        )}
      </Card>

      <div style={{ height: 16 }} />

      {/* ---------- Vessel Gantt ---------- */}
      <Card
        title={`Vessel arrivals — next ${horizonDays} days`}
        subtitle={
          input
            ? `Starting ${formatDate(input.startDate)} · ${input.berthCount} berths`
            : undefined
        }
        action={
          <HelButton variant="ghost" size="sm" onClick={() => navigate('/schedule')}>
            Open schedule →
          </HelButton>
        }
      >
        {input && cargoesInScope.length > 0 ? (
          <VesselGantt
            start={input.startDate}
            horizon={horizonDays}
            berthCount={input.berthCount}
            cargoes={cargoesInScope}
            itemsById={itemsById}
          />
        ) : (
          <EmptyState
            title="No arrivals in scope"
            message="Adjust filters to see vessel arrivals."
          />
        )}
      </Card>

      <EvidenceDrawer rec={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ------------------------- helpers & sub-components ------------------------ */

function kbpdLabel(bpd: number): string {
  return (bpd / 1000).toFixed(0);
}

function sumPlannedBpd(cdus: { plannedThroughputBpd: number }[]): number {
  return cdus.reduce((s, u) => s + u.plannedThroughputBpd, 0);
}

function splitRiskFlags(output: PsoOutput | null): {
  demurrageFlags: RiskFlag[];
  stockoutFlags: RiskFlag[];
  otherFlags: RiskFlag[];
} {
  const flags = output?.riskFlags ?? [];
  const demurrageFlags = flags.filter((f) => f.flagType === 'DEMURRAGE_RISK');
  const stockoutFlags = flags.filter((f) => f.flagType === 'STOCKOUT_RISK');
  const otherFlags = flags.filter(
    (f) => f.flagType !== 'DEMURRAGE_RISK' && f.flagType !== 'STOCKOUT_RISK'
  );
  return { demurrageFlags, stockoutFlags, otherFlags };
}

function AlertGroup({
  title,
  icon,
  flags,
}: {
  title: string;
  icon: React.ReactNode;
  flags: RiskFlag[];
}) {
  if (flags.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {icon}
        {title} ({flags.length})
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {flags.map((f, i) => (
          <li
            key={`${f.flagType}-${i}`}
            style={{
              border: '1px solid var(--hel-border)',
              borderLeft: `4px solid ${severityColor(f.severity)}`,
              borderRadius: 8,
              padding: 8,
              marginBottom: 6,
              background: 'var(--hel-surface)',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
              <StatusBadge kind={severityBadgeKind(f.severity)}>
                {severityLabel(f.severity)}
              </StatusBadge>
              <span style={{ fontWeight: 500 }}>{f.flagType.replace(/_/g, ' ')}</span>
              {f.impactUsd != null && f.impactUsd > 0 && (
                <span style={{ color: 'var(--hel-text-muted)' }}>
                  · {formatUsdCompact(f.impactUsd)}
                </span>
              )}
            </div>
            <div>{f.summary}</div>
            <div style={{ fontStyle: 'italic', color: 'var(--hel-text-muted)', marginTop: 2 }}>
              → {f.recommendedAction}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function severityColor(sev: number): string {
  if (sev >= 4) return 'var(--hel-danger)';
  if (sev >= 3) return 'var(--hel-warning)';
  return 'var(--hel-text-muted)';
}

function severityBadgeKind(sev: number): 'danger' | 'warning' | 'info' | 'muted' {
  if (sev >= 4) return 'danger';
  if (sev >= 3) return 'warning';
  if (sev >= 2) return 'info';
  return 'muted';
}

/* -------- Tank Heatmap -------- */

function TankHeatmap({
  tanks,
  itemsById,
}: {
  tanks: Tank[];
  itemsById: Record<string, CrudeItem>;
}) {
  const hs = tanks.filter((t) => t.tankGroup === 'HighSulphur');
  const ls = tanks.filter((t) => t.tankGroup === 'LowSulphur');
  const slops = tanks.filter((t) => t.tankGroup === 'Slops');

  return (
    <div>
      <TankRow title="High Sulphur" tanks={hs} itemsById={itemsById} />
      <TankRow title="Low Sulphur" tanks={ls} itemsById={itemsById} />
      {slops.length > 0 && <TankRow title="Slops" tanks={slops} itemsById={itemsById} />}
    </div>
  );
}

function TankRow({
  title,
  tanks,
  itemsById,
}: {
  title: string;
  tanks: Tank[];
  itemsById: Record<string, CrudeItem>;
}) {
  if (tanks.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--hel-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {title} ({tanks.length})
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 8,
        }}
      >
        {tanks.map((t) => {
          const pct = t.capacityBbls > 0 ? (t.currentVolumeBbls / t.capacityBbls) * 100 : 0;
          const band = pct >= 60 ? 'high' : pct >= 30 ? 'med' : 'low';
          const item = t.crudeGrade ? itemsById[t.crudeGrade] : undefined;
          return (
            <div key={t.tankId} className="hel-tank" title={`${t.tankId} · ${pct.toFixed(0)}% full`}>
              <div
                className={`hel-tank__fill hel-tank__fill--${band}`}
                style={{ height: `${Math.max(2, Math.min(100, pct))}%` }}
              />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{t.tankId}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: band === 'low' ? 'var(--hel-danger)' : 'var(--hel-text-muted)',
                      fontWeight: band === 'low' ? 600 : 400,
                    }}
                  >
                    {formatPct(pct, 0)}
                  </span>
                </div>
                {item && (
                  <div style={{ fontSize: 11, color: 'var(--hel-text-muted)', marginTop: 2 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: gradeFamilyColor(item.gradeFamily),
                        marginRight: 4,
                        verticalAlign: 'middle',
                      }}
                    />
                    {item.name}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--hel-text-muted)', marginTop: 2 }}>
                  {formatKbbls(t.currentVolumeBbls)} / {formatKbbls(t.capacityBbls)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------- Vessel Gantt -------- */

function VesselGantt({
  start,
  horizon,
  berthCount,
  cargoes,
  itemsById,
}: {
  start: string;
  horizon: number;
  berthCount: number;
  cargoes: Cargo[];
  itemsById: Record<string, CrudeItem>;
}) {
  const startMs = new Date(start).getTime();

  // Assign each cargo to a berth lane via a simple greedy interval scheduler
  // so overlapping cargoes stack vertically (spec: show concurrency clearly).
  const lanes: Cargo[][] = [];
  const sortedCargoes = [...cargoes].sort(
    (a, b) => new Date(a.laycanStart).getTime() - new Date(b.laycanStart).getTime()
  );
  for (const c of sortedCargoes) {
    const s = new Date(c.laycanStart).getTime();
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      const lastEnd = new Date(last.laycanEnd).getTime();
      if (s >= lastEnd) {
        lane.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([c]);
  }
  const berthWarning = lanes.length > berthCount;

  const trackW = 100;
  const rowH = 40;

  return (
    <div>
      {berthWarning && (
        <div style={{ marginBottom: 8 }}>
          <StatusBadge kind="warning">
            {lanes.length} concurrent lanes detected · only {berthCount} berths available
          </StatusBadge>
        </div>
      )}

      {/* Day axis */}
      <div
        style={{
          position: 'relative',
          height: 24,
          marginBottom: 6,
          borderBottom: '1px solid var(--hel-border)',
        }}
      >
        {Array.from({ length: horizon + 1 }).map((_, d) => (
          <div
            key={d}
            style={{
              position: 'absolute',
              left: `${(d / horizon) * trackW}%`,
              bottom: 0,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: 'var(--hel-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {d % 2 === 0 ? formatShort(start, d) : ''}
          </div>
        ))}
      </div>

      {/* Lanes */}
      {lanes.map((lane, laneIdx) => (
        <div
          key={laneIdx}
          style={{
            position: 'relative',
            height: rowH,
            marginBottom: 4,
            background: 'var(--hel-surface-alt)',
            border: '1px solid var(--hel-border)',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 6,
              top: 2,
              fontSize: 10,
              color: laneIdx >= berthCount ? 'var(--hel-danger)' : 'var(--hel-text-muted)',
              pointerEvents: 'none',
              fontWeight: laneIdx >= berthCount ? 600 : 400,
            }}
          >
            Berth {laneIdx + 1}
            {laneIdx >= berthCount && ' (overflow)'}
          </div>
          {lane.map((c) => {
            const sDay = (new Date(c.laycanStart).getTime() - startMs) / 86400000;
            const eDay = (new Date(c.laycanEnd).getTime() - startMs) / 86400000;
            if (eDay < 0 || sDay > horizon) return null;
            const left = Math.max(0, (sDay / horizon) * trackW);
            const width = Math.max(
              ((Math.min(horizon, eDay) - Math.max(0, sDay)) / horizon) * trackW,
              1.5
            );
            const classBar =
              c.status === 'Confirmed'
                ? 'hel-gantt-bar--Confirmed'
                : c.status === 'Provisional'
                  ? 'hel-gantt-bar--Provisional'
                  : 'hel-gantt-bar--AtRisk';
            const item = itemsById[c.crudeGrade];
            return (
              <div
                key={c.cargoId}
                className={`hel-gantt-bar ${classBar}`}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  width: `${width}%`,
                  top: 8,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  paddingRight: 8,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={`${c.vesselName} · ${item?.name ?? c.crudeGrade} · ${formatDate(c.laycanStart)} → ${formatDate(c.laycanEnd)}`}
              >
                {c.vesselName} · {formatKbbls(c.volumeBbls)}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        <LegendChip kind="Confirmed" />
        <LegendChip kind="Provisional" />
        <LegendChip kind="AtRisk" />
        <span style={{ fontSize: 11, color: 'var(--hel-text-muted)', marginLeft: 'auto' }}>
          Lanes stacked by conflict resolution · open the schedule for drag-and-drop.
        </span>
      </div>
    </div>
  );
}

function LegendChip({ kind }: { kind: 'Confirmed' | 'Provisional' | 'AtRisk' }) {
  const status: Cargo['status'] =
    kind === 'AtRisk' ? 'At Risk' : (kind as Cargo['status']);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        className={`hel-gantt-bar hel-gantt-bar--${kind}`}
        aria-hidden
        style={{ width: 24, height: 14, display: 'inline-block', borderRadius: 3 }}
      />
      <CargoStatusBadge status={status} />
    </span>
  );
}

function formatShort(start: string, dayOffset: number): string {
  const d = new Date(start);
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
