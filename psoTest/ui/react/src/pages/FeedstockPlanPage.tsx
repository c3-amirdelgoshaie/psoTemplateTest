/*
 * FeedstockPlanPage — Phase 6e
 *
 * Sections:
 *  1. KPI header strip (throughput, API, sulphur, violations)
 *  2. CDU Charge Chart — stacked bar by grade per day (recharts)
 *     – toggle: Quantity (bpd) ↔ Quality (API + sulphur overlays)
 *     – LP target reference line + operating envelope band
 *  3. Blend Constraints table (row highlighted red on VIOLATED)
 *     – click violated row → opens EvidenceDrawer for corrective rec
 *  4. LP Alignment Panel (grade × LP target × scheduled × delta)
 *     – "Re-optimize to LP" button calling runOptimizer("MaxGRM")
 *  5. Maintenance Calendar (secondary Gantt, collapsible, hatched bars)
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
  Legend,
  ReferenceLine,
  ReferenceArea,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';

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

// ─── Grade color / label maps ─────────────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  ARAB_LIGHT: '#5B8FAD',
  URALS: '#2F5A77',
  CPC_BLEND: '#77A850',
  AZERI_LIGHT: '#E5B94A',
};

const GRADE_LABELS: Record<string, string> = {
  ARAB_LIGHT: 'Arab Light',
  URALS: 'Urals',
  CPC_BLEND: 'CPC Blend',
  AZERI_LIGHT: 'Azeri Light',
};

// ─── Small helpers ────────────────────────────────────────────────────────────
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
  let totalCharge = 0;
  let weightedSum = 0;
  for (const g of gradeIds) {
    const charge = (chargeByGrade[g] ?? [])[day] ?? 0;
    const prop = propByGrade[g] ?? 0;
    totalCharge += charge;
    weightedSum += charge * prop;
  }
  return totalCharge > 0 ? weightedSum / totalCharge : 0;
}

// ─── Custom tooltip for CDU charge bar chart ──────────────────────────────────
interface TooltipPayloadItem {
  name: string;
  value: number;
  fill: string;
}

function CduChargeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div
      style={{
        background: 'var(--hel-surface)',
        border: '1px solid var(--hel-border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--hel-text)' }}>Day {label}</div>
      {payload.map((p) => (
        <div
          key={p.name}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            color: 'var(--hel-text-secondary)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: p.fill,
                display: 'inline-block',
              }}
            />
            {GRADE_LABELS[p.name] ?? p.name}
          </span>
          <span style={{ color: 'var(--hel-text)', fontVariantNumeric: 'tabular-nums' }}>
            {(p.value / 1000).toFixed(0)}k bpd
          </span>
        </div>
      ))}
      <div
        style={{
          marginTop: 4,
          paddingTop: 4,
          borderTop: '1px solid var(--hel-border)',
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 600,
          color: 'var(--hel-text)',
        }}
      >
        <span>Total</span>
        <span>{(total / 1000).toFixed(0)}k bpd</span>
      </div>
    </div>
  );
}

// ─── Blend constraint table row ───────────────────────────────────────────────
function BlendConstraintRow({
  bc,
  cduLabel,
  onViolationClick,
}: {
  bc: BlendConstraint;
  cduLabel: string;
  onViolationClick: (bc: BlendConstraint) => void;
}) {
  const violated = bc.status === 'VIOLATED';
  const isMax = bc.limitType === 'LE';
  const utilPct =
    bc.limitValue > 0 && bc.currentValue != null
      ? (bc.currentValue / bc.limitValue) * 100
      : 0;

  return (
    <tr
      style={{
        background: violated ? 'rgba(220,38,38,0.06)' : undefined,
        cursor: violated ? 'pointer' : 'default',
        borderBottom: '1px solid var(--hel-border)',
      }}
      onClick={violated ? () => onViolationClick(bc) : undefined}
    >
      <td style={{ padding: '8px 12px', color: 'var(--hel-text)', fontWeight: 500 }}>
        {cduLabel}
      </td>
      <td style={{ padding: '8px 12px', color: 'var(--hel-text-secondary)', fontSize: 12 }}>
        {bc.constraintId.replace(/_/g, ' ')}
      </td>
      <td style={{ padding: '8px 12px', color: 'var(--hel-text-secondary)', fontSize: 12 }}>
        {bc.metric} {isMax ? '≤' : '≥'} {bc.limitValue.toFixed(2)}
      </td>
      <td
        style={{
          padding: '8px 12px',
          fontVariantNumeric: 'tabular-nums',
          color: violated ? '#dc2626' : 'var(--hel-text)',
          fontWeight: violated ? 700 : 400,
        }}
      >
        {(bc.currentValue ?? 0).toFixed(2)}
      </td>
      <td style={{ padding: '8px 12px', minWidth: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: 'var(--hel-border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, utilPct)}%`,
                height: '100%',
                borderRadius: 3,
                background: violated ? '#dc2626' : utilPct > 90 ? '#f59e0b' : '#22c55e',
              }}
            />
          </div>
          <span
            style={{
              fontSize: 11,
              color: 'var(--hel-text-secondary)',
              minWidth: 36,
              textAlign: 'right',
            }}
          >
            {utilPct.toFixed(0)}%
          </span>
        </div>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <StatusBadge kind={violated ? 'danger' : 'success'}>
          {violated ? 'VIOLATED' : 'OK'}
        </StatusBadge>
      </td>
      <td
        style={{
          padding: '8px 12px',
          fontSize: 12,
          color: violated ? '#dc2626' : 'var(--hel-text-muted)',
        }}
      >
        {violated ? '→ View recommendation' : '—'}
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FeedstockPlanPage() {
  const { filters } = useGlobalFilters();
  const { push } = useToast();
  const qc = useQueryClient();

  const [chartMode, setChartMode] = useState<'quantity' | 'quality'>('quantity');
  const [selectedCduId, setSelectedCduId] = useState<string | null>(null);
  const [maintOpen, setMaintOpen] = useState(false);
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

  // ── Derived data ─────────────────────────────────────────────────────────
  const horizon = filters.horizon ?? 30;
  const facility = input?.facilities?.[0];
  const cdus: Cdu[] = facility?.cdus ?? [];
  const allGradeIds = (input?.items ?? []).map((i) => i.itemId);

  const activeCdu: Cdu | undefined =
    cdus.find((c) => c.cduId === selectedCduId) ?? cdus[0];

  const apiByGrade = useMemo(
    () => Object.fromEntries((input?.items ?? []).map((i) => [i.itemId, i.apiGravity ?? 0])),
    [input]
  );
  const sulphurByGrade = useMemo(
    () => Object.fromEntries((input?.items ?? []).map((i) => [i.itemId, i.sulphurPct ?? 0])),
    [input]
  );

  const cduCharge: Record<string, Record<string, number[]>> = output?.cduChargeByDay ?? {};

  // Grades that have non-zero charge or LP targets for this CDU
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
      // LP target total for reference line
      const lpTotal = activeGradeIds.reduce(
        (s, g) => s + ((activeCdu.lpTargetByGrade?.[g] ?? [])[day] ?? 0),
        0
      );
      point['__lpTarget'] = lpTotal;

      // Weighted API and sulphur
      const chargeByGradeForDay: Record<string, number[]> = {};
      for (const g of activeGradeIds) {
        chargeByGradeForDay[g] = cduCharge[cduId]?.[g] ?? [];
      }
      point['__api'] = parseFloat(
        weightedAvgProp(activeGradeIds, chargeByGradeForDay, apiByGrade, day).toFixed(1)
      );
      point['__sulphur'] = parseFloat(
        weightedAvgProp(activeGradeIds, chargeByGradeForDay, sulphurByGrade, day).toFixed(2)
      );

      return point;
    });
  }, [activeCdu, cduCharge, activeGradeIds, horizon, apiByGrade, sulphurByGrade]);

  // Operating envelope ±5%
  const lpMin = activeCdu ? activeCdu.plannedThroughputBpd * 0.95 : 0;
  const lpMax = activeCdu ? activeCdu.plannedThroughputBpd * 1.05 : 0;

  // KPIs
  const blendViolationCount = useMemo(
    () =>
      cdus.reduce(
        (n, u) => n + (u.blendConstraints ?? []).filter((b) => b.status === 'VIOLATED').length,
        0
      ),
    [cdus]
  );

  // Toast on blend violations detected (fire once per data load)
  const lastViolationToastRef = useRef(0);
  useEffect(() => {
    if (blendViolationCount > 0 && lastViolationToastRef.current !== blendViolationCount) {
      lastViolationToastRef.current = blendViolationCount;
      push({
        kind: 'warning',
        title: 'Blend Constraint Violated',
        message: `${blendViolationCount} blend constraint${blendViolationCount > 1 ? 's' : ''} violated — review Feedstock Plan.`,
      });
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

  const totalThroughput = output?.kpis?.throughputBpd ?? activeCdu?.plannedThroughputBpd ?? 0;
  const throughputVsPlan =
    activeCdu && activeCdu.plannedThroughputBpd > 0
      ? ((totalThroughput / activeCdu.plannedThroughputBpd - 1) * 100)
      : null;

  // LP alignment rows
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

  // Maintenance windows
  const maintWindows = facility?.maintenanceWindows ?? [];
  const horizonStart = input ? new Date(input.startDate) : new Date();

  // Find corrective rec for a violated blend constraint
  function findViolationRec(bc: BlendConstraint): PersistedRecommendation | null {
    const rawRecs = output?.recommendations ?? [];
    const recs: PersistedRecommendation[] = rawRecs.map((r) => ({
      ...r,
      id: r.recommendationId,
      scenarioId: output?.scenarioId ?? '',
      status: 'Proposed' as const,
      createdAt: output?.solvedAt ?? new Date().toISOString(),
      lastUpdatedAt: output?.solvedAt ?? new Date().toISOString(),
      cargoId: r.cargoId ?? '',
      crudeGrade: r.crudeGrade ?? '',
      feedbackNotes: '',
    }));
    // prefer a rec that is about blend or substitution
    return (
      recs.find(
        (r) =>
          r.decision === 'SUBSTITUTE' ||
          r.summary?.toLowerCase().includes('blend') ||
          r.summary?.toLowerCase().includes('sulphur') ||
          String(bc.constraintId).toLowerCase().includes((r.crudeGrade ?? '').toLowerCase())
      ) ??
      recs[0] ??
      null
    );
  }

  function handleViolationClick(bc: BlendConstraint) {
    const rec = findViolationRec(bc);
    setEvidenceRec(rec);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionHeader
        title="Refinery Feedstock Plan"
        subtitle={`${input?.refineryId ?? 'Aspropyrgos'} · ${horizon}-day horizon`}
        action={
          <HelButton
            variant="primary"
            size="md"
            disabled={reoptMutation.isPending}
            onClick={() => reoptMutation.mutate()}
          >
            {reoptMutation.isPending ? 'Optimizing…' : 'Re-optimize to LP'}
          </HelButton>
        }
      />
      <PageFilterBar />

      {/* ── 1. KPI strip ────────────────────────────────────────────────── */}
      <div className="hel-grid hel-grid--kpi" style={{ marginBottom: 24 }}>
        <KpiCard
          label="CDU Throughput"
          value={`${(totalThroughput / 1000).toFixed(0)}k bpd`}
          delta={throughputVsPlan}
          deltaFormatter={(d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}% vs plan`}
          accent={
            throughputVsPlan == null
              ? 'default'
              : throughputVsPlan >= -5
              ? 'success'
              : 'warning'
          }
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
          small={`${cdus.length} unit${cdus.length !== 1 ? 's' : ''} planned`}
        />
        <KpiCard
          label="LP Version"
          value={input?.lpTargetVersion ?? '—'}
          small="current reference plan"
        />
      </div>

      {/* ── 2. CDU charge chart ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}><Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15 }}>
              CDU Charge Schedule
            </div>
            <div style={{ fontSize: 12, color: 'var(--hel-text-secondary)', marginTop: 2 }}>
              Stacked grade charge vs LP target · operating envelope ±5%
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* CDU selector */}
            {cdus.length > 1 && (
              <div style={{ display: 'flex', gap: 4 }}>
                {cdus.map((c) => (
                  <button
                    key={c.cduId}
                    onClick={() => setSelectedCduId(c.cduId)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--hel-border)',
                      background:
                        activeCdu?.cduId === c.cduId
                          ? 'var(--hel-accent)'
                          : 'var(--hel-surface-raised)',
                      color: activeCdu?.cduId === c.cduId ? '#fff' : 'var(--hel-text)',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {c.cduId}
                  </button>
                ))}
              </div>
            )}

            {/* Quantity / Quality toggle */}
            <div
              style={{
                display: 'flex',
                border: '1px solid var(--hel-border)',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {(['quantity', 'quality'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setChartMode(mode)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    background:
                      chartMode === mode ? 'var(--hel-accent)' : 'var(--hel-surface-raised)',
                    color: chartMode === mode ? '#fff' : 'var(--hel-text)',
                  }}
                >
                  {mode === 'quantity' ? 'Quantity' : 'Quality'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          {chartMode === 'quantity' ? (
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hel-border)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: 'var(--hel-text-secondary)' }}
                tickLine={false}
                interval={4}
                label={{
                  value: 'Day',
                  position: 'insideBottomRight',
                  offset: -4,
                  fontSize: 11,
                }}
              />
              <YAxis
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: 'var(--hel-text-secondary)' }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'bpd',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 11,
                  offset: 8,
                }}
              />
              <Tooltip content={<CduChargeTooltip />} />
              <Legend
                formatter={(value: string) => GRADE_LABELS[value] ?? value}
                wrapperStyle={{ fontSize: 12 }}
              />
              {/* Operating envelope */}
              {lpMin > 0 && (
                <ReferenceArea
                  y1={lpMin}
                  y2={lpMax}
                  fill="var(--hel-accent)"
                  fillOpacity={0.06}
                  stroke="none"
                />
              )}
              {/* LP target line */}
              {activeCdu && (
                <ReferenceLine
                  y={activeCdu.plannedThroughputBpd}
                  stroke="var(--hel-accent)"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: 'LP Target',
                    position: 'insideTopRight',
                    fontSize: 10,
                    fill: 'var(--hel-accent)',
                  }}
                />
              )}
              {activeGradeIds.map((g, i) => (
                <Bar
                  key={g}
                  dataKey={g}
                  stackId="charge"
                  fill={GRADE_COLORS[g] ?? '#8D7DA3'}
                  name={g}
                  radius={
                    i === activeGradeIds.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]
                  }
                />
              ))}
            </BarChart>
          ) : (
            /* Quality mode — API + Sulphur overlay lines */
            <LineChart data={chartData} margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hel-border)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: 'var(--hel-text-secondary)' }}
                tickLine={false}
                interval={4}
              />
              <YAxis
                yAxisId="api"
                orientation="left"
                tick={{ fontSize: 11, fill: 'var(--hel-text-secondary)' }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                label={{
                  value: '°API',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 11,
                  offset: 8,
                }}
              />
              <YAxis
                yAxisId="sulphur"
                orientation="right"
                tick={{ fontSize: 11, fill: 'var(--hel-text-secondary)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                label={{
                  value: 'S%',
                  angle: 90,
                  position: 'insideRight',
                  fontSize: 11,
                  offset: 8,
                }}
              />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === '__api'
                    ? [`${value} °API`, 'API Gravity']
                    : [`${value}%`, 'Sulphur']
                }
                labelFormatter={(label: string) => `Day ${label}`}
              />
              <Legend
                formatter={(value: string) =>
                  value === '__api' ? 'API Gravity' : 'Sulphur %'
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              {/* Max sulphur spec lines */}
              {(activeCdu?.blendConstraints ?? [])
                .filter((bc) => bc.metric === 'sulphur' && bc.limitType === 'LE')
                .map((bc) => (
                  <ReferenceLine
                    key={bc.constraintId}
                    yAxisId="sulphur"
                    y={bc.limitValue}
                    stroke="#dc2626"
                    strokeDasharray="4 2"
                    strokeWidth={1.5}
                    label={{
                      value: `Max S ${bc.limitValue}%`,
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: '#dc2626',
                    }}
                  />
                ))}
              <Line
                yAxisId="api"
                type="monotone"
                dataKey="__api"
                stroke="#5B8FAD"
                strokeWidth={2}
                dot={false}
                name="__api"
              />
              <Line
                yAxisId="sulphur"
                type="monotone"
                dataKey="__sulphur"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
                name="__sulphur"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </Card></div>

      {/* ── 3. Blend Constraints table ───────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}><Card>
        <div style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15, marginBottom: 4 }}>
          Blend Constraints
        </div>
        <div style={{ fontSize: 12, color: 'var(--hel-text-secondary)', marginBottom: 16 }}>
          Click a{' '}
          <StatusBadge kind="danger">VIOLATED</StatusBadge>{' '}
          row to view the corrective recommendation
        </div>

        {cdus.length === 0 ? (
          <div style={{ color: 'var(--hel-text-secondary)', fontSize: 13, padding: '16px 0' }}>
            No CDU data available.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '2px solid var(--hel-border)',
                    color: 'var(--hel-text-secondary)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {['CDU', 'Constraint', 'Spec', 'Current', 'Utilisation', 'Status', 'Action'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600 }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {cdus.flatMap((cdu) =>
                  (cdu.blendConstraints ?? []).map((bc) => (
                    <BlendConstraintRow
                      key={`${cdu.cduId}-${bc.constraintId}`}
                      bc={bc}
                      cduLabel={cdu.cduId}
                      onViolationClick={handleViolationClick}
                    />
                  ))
                )}
                {cdus.every((c) => !c.blendConstraints?.length) && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ padding: '16px 12px', color: 'var(--hel-text-secondary)' }}
                    >
                      No blend constraints defined.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card></div>

      {/* ── 4. LP Alignment panel ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}><Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15 }}>
              LP Alignment
            </div>
            <div style={{ fontSize: 12, color: 'var(--hel-text-secondary)', marginTop: 2 }}>
              Avg daily charge vs LP reference plan ·{' '}
              {activeCdu?.cduId ?? 'CDU-1'}
            </div>
          </div>
          <HelButton
            variant="secondary"
            size="md"
            disabled={reoptMutation.isPending}
            onClick={() => reoptMutation.mutate()}
          >
            {reoptMutation.isPending ? 'Optimizing…' : 'Re-optimize to LP'}
          </HelButton>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--hel-border)',
                  color: 'var(--hel-text-secondary)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {['Crude Grade', 'LP Target avg bpd', 'Scheduled avg bpd', 'Delta', 'Alignment'].map(
                  (h) => (
                    <th
                      key={h}
                      style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600 }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {lpAlignmentRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: '16px 12px', color: 'var(--hel-text-secondary)' }}
                  >
                    Run optimizer to populate LP alignment data.
                  </td>
                </tr>
              )}
              {lpAlignmentRows.map((row) => {
                const pct =
                  row.lpAvg > 0 ? ((row.schedAvg / row.lpAvg - 1) * 100) : 0;
                const onTarget = Math.abs(pct) < 5;
                const overTarget = pct > 5;
                return (
                  <tr
                    key={row.gradeId}
                    style={{ borderBottom: '1px solid var(--hel-border)' }}
                  >
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: GRADE_COLORS[row.gradeId] ?? '#8D7DA3',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontWeight: 500, color: 'var(--hel-text)' }}>
                          {GRADE_LABELS[row.gradeId] ?? row.gradeId}
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        color: 'var(--hel-text-secondary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {(row.lpAvg / 1000).toFixed(1)}k
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        color: 'var(--hel-text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {(row.schedAvg / 1000).toFixed(1)}k
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        fontVariantNumeric: 'tabular-nums',
                        color: onTarget
                          ? 'var(--hel-text-secondary)'
                          : overTarget
                          ? '#22c55e'
                          : '#f59e0b',
                        fontWeight: onTarget ? 400 : 600,
                      }}
                    >
                      {row.delta > 0 ? '+' : ''}
                      {(row.delta / 1000).toFixed(1)}k ({pct > 0 ? '+' : ''}
                      {pct.toFixed(1)}%)
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <StatusBadge
                        kind={onTarget ? 'success' : overTarget ? 'info' : 'warning'}
                      >
                        {onTarget ? 'On Target' : overTarget ? 'Above LP' : 'Below LP'}
                      </StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card></div>

      {/* ── 5. Maintenance Calendar (collapsible Gantt) ───────────────────── */}
      <Card>
        <button
          onClick={() => setMaintOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            width: '100%',
            textAlign: 'left',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--hel-text)', fontSize: 15 }}>
            Maintenance Calendar
          </span>
          <span style={{ fontSize: 12, color: 'var(--hel-text-secondary)', marginLeft: 4 }}>
            ({maintWindows.length} window{maintWindows.length !== 1 ? 's' : ''})
          </span>
          <span
            style={{
              marginLeft: 'auto',
              color: 'var(--hel-text-secondary)',
              fontSize: 14,
              transform: maintOpen ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.15s',
            }}
          >
            ▾
          </span>
        </button>

        {maintOpen && (
          <div style={{ marginTop: 16 }}>
            {maintWindows.length === 0 ? (
              <div style={{ color: 'var(--hel-text-secondary)', fontSize: 13 }}>
                No maintenance windows in this horizon.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div
                  style={{
                    position: 'relative',
                    height: maintWindows.length * 44 + 28,
                    minWidth: 600,
                  }}
                >
                  {/* Day axis labels */}
                  {Array.from({ length: Math.floor(horizon / 5) + 2 }, (_, i) => i * 5).map(
                    (d) =>
                      d <= horizon ? (
                        <div
                          key={d}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: `calc(120px + ${(d / horizon) * (100 - 0)}%)`,
                            fontSize: 10,
                            color: 'var(--hel-text-secondary)',
                            transform: 'translateX(-50%)',
                            height: 20,
                            lineHeight: '20px',
                          }}
                        >
                          {d === 0 ? formatDate(input?.startDate ?? '') : `+${d}d`}
                        </div>
                      ) : null
                  )}

                  {/* Vertical grid lines */}
                  {Array.from({ length: Math.floor(horizon / 5) + 2 }, (_, i) => i * 5).map(
                    (d) =>
                      d <= horizon ? (
                        <div
                          key={d}
                          style={{
                            position: 'absolute',
                            left: `calc(120px + ${(d / horizon) * (100 - 0)}%)`,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: 'var(--hel-border)',
                            opacity: 0.4,
                          }}
                        />
                      ) : null
                  )}

                  {/* Rows */}
                  {maintWindows.map((w, idx) => {
                    const startDay = Math.max(
                      0,
                      Math.floor(
                        (new Date(w.startDate).getTime() - horizonStart.getTime()) / 86400000
                      )
                    );
                    const endDay = Math.min(
                      horizon,
                      Math.ceil(
                        (new Date(w.endDate).getTime() - horizonStart.getTime()) / 86400000
                      )
                    );
                    const leftPct = (startDay / horizon) * 100;
                    const widthPct = Math.max(1, ((endDay - startDay) / horizon) * 100);

                    return (
                      <div
                        key={w.windowId}
                        style={{
                          position: 'absolute',
                          top: 28 + idx * 44,
                          left: 0,
                          right: 0,
                          height: 36,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {/* Row label */}
                        <div
                          style={{
                            width: 112,
                            flexShrink: 0,
                            fontSize: 12,
                            fontWeight: 500,
                            color: 'var(--hel-text)',
                            paddingRight: 8,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {w.cduId}
                        </div>

                        {/* Track */}
                        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                          <div
                            className="hel-gantt-bar hel-gantt-bar--maint"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              cursor: 'default',
                              fontSize: 11,
                            }}
                            title={`${w.reason ?? 'Maintenance'} · ${formatDate(w.startDate)} – ${formatDate(w.endDate)}`}
                          >
                            {w.reason ?? 'Maintenance'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                    marginTop: 8,
                    fontSize: 11,
                    color: 'var(--hel-text-secondary)',
                  }}
                >
                  {maintWindows.map((w) => (
                    <div
                      key={w.windowId}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 8,
                          borderRadius: 2,
                          background:
                            'repeating-linear-gradient(45deg, #666 0, #666 3px, #777 3px, #777 6px)',
                        }}
                      />
                      <span>
                        {w.cduId} — {w.reason ?? 'Planned'} ({formatDate(w.startDate)} →{' '}
                        {formatDate(w.endDate)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Evidence drawer (blend violation corrective rec) ─────────────── */}
      <EvidenceDrawer rec={evidenceRec} onClose={() => setEvidenceRec(null)} />
    </div>
  );
}
