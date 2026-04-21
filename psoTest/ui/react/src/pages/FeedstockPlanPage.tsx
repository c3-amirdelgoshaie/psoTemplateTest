/*
 * FeedstockPlanPage
 *
 * Sections:
 *  1. KPI header strip (throughput, API, sulphur, violations, CDUs, LP version)
 *  2. CDU Charge Chart — stacked bar by grade per day (recharts)
 *     – toggle: Quantity (bpd) ↔ Quality (API + sulphur overlays)
 *     – LP target reference line + operating envelope band ±5%
 *  3. Blend Constraints table (VIOLATED rows highlighted, click to open rec)
 *  4. LP Alignment Panel (grade × LP target × scheduled × delta bar)
 *  5. Maintenance Calendar (always-open Gantt strip)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench } from 'lucide-react';

import { getInputData, getOutputData, runOptimizer } from '../shared/crudeApi';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import { useToast } from '../contexts/ToastContext';
import SectionHeader from '../components/hel/SectionHeader';
import PageFilterBar from '../components/TopBar/PageFilterBar';
import Card from '../components/hel/Card';
import KpiCard from '../components/hel/KpiCard';
import HelButton from '../components/hel/HelButton';
import EvidenceDrawer from '../components/hel/EvidenceDrawer';
import { StatusBadge } from '../components/hel/StatusBadge';
import { formatDate, formatPct } from '../lib/format';
import type { BlendConstraint, Cdu, PersistedRecommendation } from '../types/crude';

// ─── Grade palettes ───────────────────────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  ARAB_LIGHT:  '#5B8FAD',
  URALS:       '#2F5A77',
  CPC_BLEND:   '#77A850',
  AZERI_LIGHT: '#E5B94A',
};
const GRADE_LABELS: Record<string, string> = {
  ARAB_LIGHT:  'Arab Light',
  URALS:       'Urals',
  CPC_BLEND:   'CPC Blend',
  AZERI_LIGHT: 'Azeri Light',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function weightedAvgProp(
  gradeIds: string[],
  chargeByGrade: Record<string, number[]>,
  propByGrade: Record<string, number>,
  day: number
): number {
  let total = 0, weighted = 0;
  for (const g of gradeIds) {
    const c = (chargeByGrade[g] ?? [])[day] ?? 0;
    total += c;
    weighted += c * (propByGrade[g] ?? 0);
  }
  return total > 0 ? weighted / total : 0;
}

// ─── Custom bar-chart tooltip ────────────────────────────────────────────────
interface TooltipPayloadItem { name: string; value: number; fill: string }
function CduChargeTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div style={{ background: 'var(--hel-surface)', border: '1px solid var(--hel-border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--hel-text)', borderBottom: '1px solid var(--hel-border)', paddingBottom: 4 }}>Day {label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', color: 'var(--hel-text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, display: 'inline-block' }} />
            {GRADE_LABELS[p.name] ?? p.name}
          </span>
          <span style={{ color: 'var(--hel-text)', fontVariantNumeric: 'tabular-nums' }}>
            {(p.value / 1000).toFixed(1)}k
          </span>
        </div>
      ))}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--hel-border)', display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--hel-text)' }}>
        <span>Total</span>
        <span>{(total / 1000).toFixed(1)}k bpd</span>
      </div>
    </div>
  );
}

// ─── Blend constraint row ─────────────────────────────────────────────────────
function BlendConstraintRow({ bc, cduLabel, onViolationClick }: { bc: BlendConstraint; cduLabel: string; onViolationClick: (bc: BlendConstraint) => void }) {
  const violated = bc.status === 'VIOLATED';
  const isMax = bc.limitType === 'LE';
  const utilPct = bc.limitValue > 0 && bc.currentValue != null ? (bc.currentValue / bc.limitValue) * 100 : 0;
  return (
    <tr
      style={{ background: violated ? 'rgba(216,90,48,0.05)' : undefined, cursor: violated ? 'pointer' : 'default' }}
      onClick={violated ? () => onViolationClick(bc) : undefined}
    >
      <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--hel-text)', fontSize: 13 }}>{cduLabel}</td>
      <td style={{ padding: '9px 14px', color: 'var(--hel-text-muted)', fontSize: 12 }}>{bc.name ?? bc.constraintId.replace(/_/g, ' ')}</td>
      <td style={{ padding: '9px 14px', color: 'var(--hel-text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {bc.metric} {isMax ? '≤' : '≥'} {bc.limitValue.toFixed(2)}
      </td>
      <td style={{ padding: '9px 14px', fontVariantNumeric: 'tabular-nums', color: violated ? 'var(--hel-danger)' : 'var(--hel-text)', fontWeight: violated ? 700 : 400, fontSize: 13 }}>
        {(bc.currentValue ?? 0).toFixed(2)}
      </td>
      <td style={{ padding: '9px 14px', minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--hel-border)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, utilPct)}%`, height: '100%', borderRadius: 3, background: violated ? 'var(--hel-danger)' : utilPct > 90 ? 'var(--hel-warning)' : 'var(--hel-success)' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--hel-text-muted)', minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{utilPct.toFixed(0)}%</span>
        </div>
      </td>
      <td style={{ padding: '9px 14px' }}>
        <StatusBadge kind={violated ? 'danger' : 'success'}>{violated ? 'VIOLATED' : 'OK'}</StatusBadge>
      </td>
      <td style={{ padding: '9px 14px', fontSize: 12, color: violated ? 'var(--hel-danger)' : 'var(--hel-text-muted)' }}>
        {violated ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} />View recommendation →</span> : '—'}
      </td>
    </tr>
  );
}

// ─── CDU selector toggle ──────────────────────────────────────────────────────
function CduToggle({ cdus, activeId, onSelect }: { cdus: Cdu[]; activeId: string; onSelect: (id: string) => void }) {
  if (cdus.length <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 4, border: '1px solid var(--hel-border)', borderRadius: 8, padding: 3, background: 'var(--hel-surface-alt)' }}>
      {cdus.map((c) => (
        <button
          key={c.cduId}
          onClick={() => onSelect(c.cduId)}
          style={{
            padding: '4px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            background: activeId === c.cduId ? 'var(--hel-accent)' : 'transparent',
            color: activeId === c.cduId ? '#fff' : 'var(--hel-text-muted)',
            transition: 'all 0.12s ease',
          }}
        >
          {c.cduId}
        </button>
      ))}
    </div>
  );
}

// ─── View toggle (Quantity / Quality) ────────────────────────────────────────
function ViewToggle({ mode, onToggle }: { mode: 'quantity' | 'quality'; onToggle: (m: 'quantity' | 'quality') => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--hel-border)', borderRadius: 8, padding: 3, background: 'var(--hel-surface-alt)' }}>
      {(['quantity', 'quality'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onToggle(m)}
          style={{
            padding: '4px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            background: mode === m ? 'var(--hel-primary)' : 'transparent',
            color: mode === m ? '#fff' : 'var(--hel-text-muted)',
            transition: 'all 0.12s ease',
          }}
        >
          {m === 'quantity' ? 'Quantity' : 'Quality'}
        </button>
      ))}
    </div>
  );
}

// ─── Grade legend chip ────────────────────────────────────────────────────────
function GradeLegend({ gradeIds }: { gradeIds: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
      {gradeIds.map((g) => (
        <span key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--hel-text-muted)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: GRADE_COLORS[g] ?? '#8D7DA3', display: 'inline-block' }} />
          {GRADE_LABELS[g] ?? g}
        </span>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FeedstockPlanPage() {
  const { filters } = useGlobalFilters();
  const { push } = useToast();
  const qc = useQueryClient();

  const [chartMode, setChartMode] = useState<'quantity' | 'quality'>('quantity');
  const [selectedCduId, setSelectedCduId] = useState<string | null>(null);
  const [evidenceRec, setEvidenceRec] = useState<PersistedRecommendation | null>(null);

  const { data: input } = useQuery({ queryKey: ['psoInput'], queryFn: getInputData });
  const { data: output } = useQuery({ queryKey: ['psoOutput'], queryFn: getOutputData });

  const reoptMutation = useMutation({
    mutationFn: () => runOptimizer('MaxGRM'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['psoOutput'] });
      push({ kind: 'success', message: 'Re-optimized to LP targets (MaxGRM mode).' });
    },
    onError: () => push({ kind: 'danger', message: 'Optimizer error — check backend.' }),
  });

  const horizon = filters.horizon ?? 30;
  const facility = input?.facilities?.[0];
  const cdus: Cdu[] = useMemo(() => facility?.cdus ?? [], [facility]);
  const allGradeIds = useMemo(() => (input?.items ?? []).map((i) => i.itemId), [input]);

  const activeCdu: Cdu | undefined = cdus.find((c) => c.cduId === selectedCduId) ?? cdus[0];

  const apiByGrade = useMemo(
    () => Object.fromEntries((input?.items ?? []).map((i) => [i.itemId, i.apiGravity ?? 0])),
    [input]
  );
  const sulphurByGrade = useMemo(
    () => Object.fromEntries((input?.items ?? []).map((i) => [i.itemId, i.sulphurPct ?? 0])),
    [input]
  );

  const cduCharge: Record<string, Record<string, number[]>> = useMemo(
    () => output?.cduChargeByDay ?? {},
    [output]
  );

  const activeGradeIds = useMemo(() => {
    if (!activeCdu) return [];
    return allGradeIds.filter(
      (g) =>
        (cduCharge[activeCdu.cduId]?.[g] ?? []).some((v) => v > 0) ||
        (activeCdu.lpTargetByGrade?.[g] ?? []).some((v) => v > 0)
    );
  }, [activeCdu, cduCharge, allGradeIds]);

  // Chart data: one point per day
  const chartData = useMemo(() => {
    if (!activeCdu) return [];
    const cduId = activeCdu.cduId;
    const days = Math.min(horizon, 30);
    return Array.from({ length: days }, (_, day) => {
      const point: Record<string, number | string> = { day: String(day + 1) };
      for (const g of activeGradeIds) {
        point[g] = (cduCharge[cduId]?.[g] ?? [])[day] ?? 0;
      }
      const lpTotal = activeGradeIds.reduce(
        (s, g) => s + ((activeCdu.lpTargetByGrade?.[g] ?? [])[day] ?? 0),
        0
      );
      point['__lpTarget'] = lpTotal;

      const chargeByGradeForDay: Record<string, number[]> = {};
      for (const g of activeGradeIds) chargeByGradeForDay[g] = cduCharge[cduId]?.[g] ?? [];
      point['__api'] = parseFloat(weightedAvgProp(activeGradeIds, chargeByGradeForDay, apiByGrade, day).toFixed(1));
      point['__sulphur'] = parseFloat(weightedAvgProp(activeGradeIds, chargeByGradeForDay, sulphurByGrade, day).toFixed(3));

      return point;
    });
  }, [activeCdu, cduCharge, activeGradeIds, horizon, apiByGrade, sulphurByGrade]);

  // Operating envelope ±5%
  const lpMin = activeCdu ? activeCdu.plannedThroughputBpd * 0.95 : 0;
  const lpMax = activeCdu ? activeCdu.plannedThroughputBpd * 1.05 : 0;

  // KPIs
  const blendViolationCount = useMemo(
    () => cdus.reduce((n, u) => n + (u.blendConstraints ?? []).filter((b) => b.status === 'VIOLATED').length, 0),
    [cdus]
  );

  const lastViolationToastRef = useRef(0);
  useEffect(() => {
    if (blendViolationCount > 0 && lastViolationToastRef.current !== blendViolationCount) {
      lastViolationToastRef.current = blendViolationCount;
      push({ kind: 'warning', title: 'Blend Constraint Violated', message: `${blendViolationCount} blend constraint${blendViolationCount > 1 ? 's' : ''} violated — review Feedstock Plan.` });
    }
  }, [blendViolationCount, push]);

  const avgApiOverall = useMemo(() => {
    const vals = chartData.map((d) => d['__api'] as number).filter(Boolean);
    return vals.length ? avg(vals) : 0;
  }, [chartData]);

  const avgSulphurOverall = useMemo(() => {
    const vals = chartData.map((d) => d['__sulphur'] as number).filter(Boolean);
    return vals.length ? avg(vals) : 0;
  }, [chartData]);

  // Throughput vs plan: compare against combined CDU planned capacity
  const totalPlannedBpd = cdus.reduce((s, u) => s + u.plannedThroughputBpd, 0);
  const totalThroughput = output?.kpis?.throughputBpd ?? 0;
  const throughputVsPlan =
    totalPlannedBpd > 0 ? ((totalThroughput / totalPlannedBpd - 1) * 100) : null;

  // LP alignment rows — show delta vs LP so it's interesting
  const lpAlignmentRows = useMemo(() => {
    if (!activeCdu) return [];
    return activeGradeIds.map((g) => {
      const lpTargets: number[] = activeCdu.lpTargetByGrade?.[g] ?? [];
      const scheduled: number[] = cduCharge[activeCdu.cduId]?.[g] ?? [];
      const lpAvg = lpTargets.length ? avg(lpTargets.slice(0, horizon)) : 0;
      const schedAvg = scheduled.length ? avg(scheduled.slice(0, horizon)) : 0;
      const delta = schedAvg - lpAvg;
      return { gradeId: g, lpAvg, schedAvg, delta };
    });
  }, [activeCdu, activeGradeIds, cduCharge, horizon]);

  const maintWindows = facility?.maintenanceWindows ?? [];
  const horizonStart = input ? new Date(input.startDate) : new Date();

  function findViolationRec(): PersistedRecommendation | null {
    const rawRecs = output?.recommendations ?? [];
    const recs: PersistedRecommendation[] = rawRecs.map((r) => ({
      ...r, id: r.recommendationId, scenarioId: output?.scenarioId ?? '',
      status: 'Proposed' as const, createdAt: output?.solvedAt ?? new Date().toISOString(),
      lastUpdatedAt: output?.solvedAt ?? new Date().toISOString(),
      cargoId: r.cargoId ?? '', crudeGrade: r.crudeGrade ?? '', feedbackNotes: '',
    }));
    return (
      recs.find((r) => r.decision === 'SUBSTITUTE' || r.summary?.toLowerCase().includes('sulphur') || r.summary?.toLowerCase().includes('blend')) ??
      recs[0] ??
      null
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionHeader
        title="Refinery Feedstock Plan"
        subtitle={`${input?.refineryId ?? 'Aspropyrgos'} · ${horizon}-day horizon · LP ref ${input?.lpTargetVersion ?? '—'}`}
        action={
          <HelButton variant="primary" size="md" disabled={reoptMutation.isPending} onClick={() => reoptMutation.mutate()} icon={<RefreshCw size={14} />}>
            {reoptMutation.isPending ? 'Optimizing…' : 'Re-optimize to LP'}
          </HelButton>
        }
      />
      <PageFilterBar />

      {/* ── 1. KPI strip ────────────────────────────────────────────────── */}
      <div className="hel-grid hel-grid--kpi" style={{ marginBottom: 24 }}>
        <KpiCard
          label="Combined Throughput"
          value={totalThroughput > 0 ? `${(totalThroughput / 1000).toFixed(0)}k bpd` : '—'}
          delta={throughputVsPlan}
          deltaFormatter={(d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}% vs plan`}
          accent={throughputVsPlan == null ? 'default' : Math.abs(throughputVsPlan) <= 5 ? 'success' : throughputVsPlan > 0 ? 'success' : 'warning'}
          small={totalPlannedBpd > 0 ? `Plan ${(totalPlannedBpd / 1000).toFixed(0)}k bpd combined` : undefined}
        />
        <KpiCard
          label="Avg API Gravity"
          value={avgApiOverall > 0 ? avgApiOverall.toFixed(1) : '—'}
          small="°API weighted avg"
        />
        <KpiCard
          label="Avg Sulphur"
          value={avgSulphurOverall > 0 ? formatPct(avgSulphurOverall, 2) : '—'}
          accent={avgSulphurOverall > 1.4 ? 'warning' : 'default'}
          small="blend weighted avg"
        />
        <KpiCard
          label="Blend Violations"
          value={String(blendViolationCount)}
          accent={blendViolationCount > 0 ? 'danger' : 'success'}
          small={blendViolationCount > 0 ? 'Click row below to fix' : 'All specs met'}
        />
        <KpiCard
          label="CDUs Active"
          value={String(cdus.length)}
          small={cdus.map((c) => `${c.cduId} ${(c.plannedThroughputBpd / 1000).toFixed(0)}k`).join(' · ')}
        />
        <KpiCard
          label="LP Version"
          value={input?.lpTargetVersion ?? '—'}
          small="current reference plan"
        />
      </div>

      {/* ── 2. CDU charge chart ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15 }}>CDU Charge Schedule</div>
              <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: 2 }}>
                Stacked grade charge vs LP target · operating envelope ±5% · dips = maintenance shutdowns
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <CduToggle cdus={cdus} activeId={activeCdu?.cduId ?? ''} onSelect={setSelectedCduId} />
              <ViewToggle mode={chartMode} onToggle={setChartMode} />
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            {chartMode === 'quantity' ? (
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hel-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--hel-text-muted)' }} tickLine={false} interval={4}
                  label={{ value: 'Day', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: 'var(--hel-text-muted)' }} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'var(--hel-text-muted)' }} tickLine={false} axisLine={false}
                  label={{ value: 'bpd', angle: -90, position: 'insideLeft', fontSize: 11, offset: 8, fill: 'var(--hel-text-muted)' }} />
                <Tooltip content={<CduChargeTooltip />} />
                {/* Operating envelope band */}
                {lpMin > 0 && (
                  <ReferenceArea y1={lpMin} y2={lpMax} fill="var(--hel-accent)" fillOpacity={0.07} stroke="none" />
                )}
                {/* LP target line */}
                {activeCdu && (
                  <ReferenceLine y={activeCdu.plannedThroughputBpd} stroke="var(--hel-accent)" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: 'LP Target', position: 'insideTopRight', fontSize: 10, fill: 'var(--hel-accent)' }} />
                )}
                {activeGradeIds.map((g, i) => (
                  <Bar key={g} dataKey={g} stackId="charge" fill={GRADE_COLORS[g] ?? '#8D7DA3'} name={g}
                    radius={i === activeGradeIds.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hel-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--hel-text-muted)' }} tickLine={false} interval={4} />
                <YAxis yAxisId="api" orientation="left" tick={{ fontSize: 11, fill: 'var(--hel-text-muted)' }} tickLine={false} axisLine={false} domain={['auto', 'auto']}
                  label={{ value: '°API', angle: -90, position: 'insideLeft', fontSize: 11, offset: 8, fill: 'var(--hel-text-muted)' }} />
                <YAxis yAxisId="sulphur" orientation="right" tick={{ fontSize: 11, fill: 'var(--hel-text-muted)' }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                  label={{ value: 'S%', angle: 90, position: 'insideRight', fontSize: 11, offset: 8, fill: 'var(--hel-text-muted)' }} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === '__api' ? [`${value} °API`, 'API Gravity'] : [`${value}%`, 'Sulphur']
                  }
                  labelFormatter={(label: string) => `Day ${label}`}
                  contentStyle={{ background: 'var(--hel-surface)', border: '1px solid var(--hel-border)', borderRadius: 8, fontSize: 12 }}
                />
                {/* Max sulphur spec line */}
                {(activeCdu?.blendConstraints ?? []).filter((bc) => bc.metric === 'sulphur' && bc.limitType === 'LE').map((bc) => (
                  <ReferenceLine key={bc.constraintId} yAxisId="sulphur" y={bc.limitValue}
                    stroke="var(--hel-danger)" strokeDasharray="4 2" strokeWidth={1.5}
                    label={{ value: `Max S ${bc.limitValue}%`, position: 'insideTopRight', fontSize: 10, fill: 'var(--hel-danger)' }} />
                ))}
                {/* Min API spec line */}
                {(activeCdu?.blendConstraints ?? []).filter((bc) => bc.metric === 'api' && bc.limitType === 'GE').map((bc) => (
                  <ReferenceLine key={bc.constraintId} yAxisId="api" y={bc.limitValue}
                    stroke="var(--hel-warning)" strokeDasharray="4 2" strokeWidth={1.5}
                    label={{ value: `Min API ${bc.limitValue}`, position: 'insideBottomRight', fontSize: 10, fill: 'var(--hel-warning)' }} />
                ))}
                <Line yAxisId="api" type="monotone" dataKey="__api" stroke={GRADE_COLORS.ARAB_LIGHT} strokeWidth={2} dot={false} name="__api" />
                <Line yAxisId="sulphur" type="monotone" dataKey="__sulphur" stroke="var(--hel-warning)" strokeWidth={2} dot={false} strokeDasharray="4 2" name="__sulphur" />
              </LineChart>
            )}
          </ResponsiveContainer>

          <GradeLegend gradeIds={activeGradeIds} />
        </Card>
      </div>

      {/* ── 3. Blend Constraints ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15 }}>Blend Constraints</div>
              <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: 2 }}>
                Click a <StatusBadge kind="danger">VIOLATED</StatusBadge> row to view the corrective recommendation
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              {blendViolationCount > 0
                ? <StatusBadge kind="danger"><AlertTriangle size={11} style={{ marginRight: 4 }} />{blendViolationCount} violation{blendViolationCount > 1 ? 's' : ''}</StatusBadge>
                : <StatusBadge kind="success"><CheckCircle2 size={11} style={{ marginRight: 4 }} />All clear</StatusBadge>
              }
            </div>
          </div>

          {cdus.length === 0 ? (
            <div style={{ color: 'var(--hel-text-muted)', fontSize: 13, padding: '16px 0' }}>No CDU data available.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="hel-table">
                <thead>
                  <tr>
                    {['CDU', 'Constraint', 'Spec', 'Current', 'Utilisation', 'Status', 'Action'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cdus.flatMap((cdu) =>
                  (cdu.blendConstraints ?? []).map((bc) => (
                    <BlendConstraintRow key={`${cdu.cduId}-${bc.constraintId}`} bc={bc} cduLabel={cdu.cduId} onViolationClick={() => { setEvidenceRec(findViolationRec()); }} />
                    ))
                  )}
                  {cdus.every((c) => !c.blendConstraints?.length) && (
                    <tr><td colSpan={7} style={{ padding: '16px 12px', color: 'var(--hel-text-muted)' }}>No blend constraints defined.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── 4. LP Alignment ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15 }}>LP Alignment</div>
              <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: 2 }}>
                Avg daily scheduled charge vs LP reference — {activeCdu?.cduId ?? ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <CduToggle cdus={cdus} activeId={activeCdu?.cduId ?? ''} onSelect={setSelectedCduId} />
              <HelButton variant="secondary" size="sm" disabled={reoptMutation.isPending} onClick={() => reoptMutation.mutate()}>
                {reoptMutation.isPending ? 'Optimizing…' : 'Re-optimize to LP'}
              </HelButton>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="hel-table">
              <thead>
                <tr>
                  {['Crude Grade', 'LP Target avg', 'Scheduled avg', 'Delta', 'vs LP', 'Alignment'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lpAlignmentRows.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--hel-text-muted)' }}>Run optimizer to populate LP alignment data.</td></tr>
                )}
                {lpAlignmentRows.map((row) => {
                  const pct = row.lpAvg > 0 ? ((row.schedAvg / row.lpAvg - 1) * 100) : 0;
                  const onTarget = Math.abs(pct) < 5;
                  const above = pct > 5;
                  const barPct = Math.min(100, Math.abs(pct) * 4); // exaggerate for visual
                  return (
                    <tr key={row.gradeId}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: GRADE_COLORS[row.gradeId] ?? '#8D7DA3', display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontWeight: 500 }}>{GRADE_LABELS[row.gradeId] ?? row.gradeId}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--hel-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {row.lpAvg > 0 ? `${(row.lpAvg / 1000).toFixed(1)}k bpd` : '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {row.schedAvg > 0 ? `${(row.schedAvg / 1000).toFixed(1)}k bpd` : '—'}
                      </td>
                      <td style={{
                        fontVariantNumeric: 'tabular-nums', fontWeight: onTarget ? 400 : 600,
                        color: onTarget ? 'var(--hel-text-muted)' : above ? 'var(--hel-success)' : 'var(--hel-warning)',
                      }}>
                        {row.delta !== 0 ? `${row.delta > 0 ? '+' : ''}${(row.delta / 1000).toFixed(1)}k` : '—'}
                      </td>
                      <td style={{ minWidth: 120 }}>
                        {row.lpAvg > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--hel-border)', overflow: 'hidden' }}>
                              <div style={{
                                width: `${barPct}%`, height: '100%', borderRadius: 3,
                                background: onTarget ? 'var(--hel-success)' : above ? 'var(--hel-accent)' : 'var(--hel-warning)',
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--hel-text-muted)', minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <StatusBadge kind={onTarget ? 'success' : above ? 'info' : 'warning'}>
                          {onTarget ? 'On Target' : above ? 'Above LP' : 'Below LP'}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── 5. Maintenance Calendar (always open) ────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wrench size={15} style={{ opacity: 0.6 }} />
              Maintenance Calendar
            </div>
            <div style={{ fontSize: 12, color: 'var(--hel-text-muted)', marginTop: 2 }}>
              {maintWindows.length} scheduled window{maintWindows.length !== 1 ? 's' : ''} — {horizon}-day horizon
            </div>
          </div>
          {maintWindows.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {maintWindows.map((w) => (
                <StatusBadge key={w.windowId} kind="muted">
                  {w.cduId} · {w.reason?.replace(/_/g, ' ')} · {formatDate(w.startDate)}
                </StatusBadge>
              ))}
            </div>
          )}
        </div>

        {maintWindows.length === 0 ? (
          <div style={{ color: 'var(--hel-text-muted)', fontSize: 13 }}>No maintenance windows in this horizon.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* CDU rows */}
            {Array.from(new Set(maintWindows.map((w) => w.cduId))).sort().map((cduId) => {
              const wins = maintWindows.filter((w) => w.cduId === cduId);
              return (
                <div key={cduId} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  {/* Label */}
                  <div style={{ width: 80, minWidth: 80, fontSize: 12, fontWeight: 600, color: 'var(--hel-text-muted)', paddingRight: 10, flexShrink: 0 }}>
                    {cduId}
                  </div>
                  {/* Track */}
                  <div style={{ flex: 1, position: 'relative', height: 36, background: 'var(--hel-surface-alt)', border: '1px solid var(--hel-border)', borderRadius: 8, overflow: 'hidden', minWidth: 400 }}>
                    {/* Gridlines every 5 days */}
                    {Array.from({ length: Math.floor(horizon / 5) + 1 }, (_, i) => i * 5).filter((d) => d <= horizon).map((d) => (
                      <div key={d} style={{ position: 'absolute', left: `${(d / horizon) * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--hel-border)', opacity: 0.5 }} />
                    ))}
                    {wins.map((w) => {
                      const startDay = Math.max(0, Math.floor((new Date(w.startDate).getTime() - horizonStart.getTime()) / 86400000));
                      const endDay = Math.min(horizon, Math.ceil((new Date(w.endDate).getTime() - horizonStart.getTime()) / 86400000));
                      const left = (startDay / horizon) * 100;
                      const width = Math.max(1.5, ((endDay - startDay) / horizon) * 100);
                      return (
                        <div
                          key={w.windowId}
                          className="hel-gantt-bar hel-gantt-bar--maint"
                          style={{ left: `${left}%`, width: `${width}%`, top: 5, bottom: 5, cursor: 'default', fontSize: 10, fontWeight: 500, borderRadius: 5 }}
                          title={`${w.cduId} · ${w.reason} · ${formatDate(w.startDate)} → ${formatDate(w.endDate)}${w.description ? '\n' + w.description : ''}`}
                        >
                          <Wrench size={9} style={{ marginRight: 4, flexShrink: 0 }} />
                          {w.reason?.replace(/_/g, ' ')} · {formatDate(w.startDate)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Day axis labels */}
            <div style={{ display: 'flex', marginTop: 4 }}>
              <div style={{ width: 80, minWidth: 80, flexShrink: 0 }} />
              <div style={{ flex: 1, position: 'relative', height: 18, minWidth: 400 }}>
                {Array.from({ length: Math.floor(horizon / 5) + 1 }, (_, i) => i * 5).filter((d) => d <= horizon).map((d) => (
                  <div key={d} style={{ position: 'absolute', left: `${(d / horizon) * 100}%`, transform: 'translateX(-50%)', fontSize: 10, color: 'var(--hel-text-muted)', whiteSpace: 'nowrap' }}>
                    {d === 0 ? formatDate(input?.startDate ?? '') : `+${d}d`}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <EvidenceDrawer rec={evidenceRec} onClose={() => setEvidenceRec(null)} />
    </div>
  );
}
