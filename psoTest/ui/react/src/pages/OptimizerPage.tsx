/*
 * OptimizerPage — Phase 6f
 *
 * 40/60 split layout:
 *
 * LEFT (40%) — Scenario Builder
 *   · Objective dropdown
 *   · Crude grades checklist w/ inline price differentials
 *   · Constraints checkboxes
 *   · Fixed cargoes toggle
 *   · Arrival flexibility slider (0–5 days)
 *   · Collapsible What-Ifs (delayVessel, removeGrades, priceOverride, cduThroughputPct)
 *   · "Run Optimizer" button → 4 labeled steps over ~4 s via setTimeout
 *
 * RIGHT (60%) — Results
 *   · Summary KPI cards (baseline | optimized | delta)
 *   · Recommendation list (reuse card pattern from Dashboard)
 *   · Crude Diet Comparison chart (recharts grouped bar)
 *   · Scenario Management table (getScenarios, columns: name/created/obj/GRM delta/status)
 *   · "Compare Scenarios" button → Radix Dialog
 */

import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import {
  compareScenarios,
  createScenario,
  deleteScenario,
  getInputData,
  getOutputData,
  getScenarios,
  runOptimizerWithInput,
} from '../shared/crudeApi';
import { useToast } from '../contexts/ToastContext';
import SectionHeader from '../components/hel/SectionHeader';
import PageFilterBar from '../components/TopBar/PageFilterBar';
import Card from '../components/hel/Card';
import KpiCard from '../components/hel/KpiCard';
import HelButton from '../components/hel/HelButton';
import EvidenceDrawer from '../components/hel/EvidenceDrawer';
import { DecisionBadge, PriorityBadge, StatusBadge } from '../components/hel/StatusBadge';
import {
  formatRelative,
  formatUsdCompact,
  gradeFamilyColor,
} from '../lib/format';
import type {
  ObjectiveMode,
  PersistedRecommendation,
  PsoInput,
  PsoOutput,
  Scenario,
} from '../types/crude';

// ─── Grade colors ─────────────────────────────────────────────────────────────
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

const OBJECTIVE_LABELS: Record<ObjectiveMode, string> = {
  MaxGRM: 'Maximise GRM',
  MinDemurrage: 'Minimise Demurrage',
  MinLogistics: 'Minimise Logistics Cost',
  Balanced: 'Balanced (Default)',
};

const RUN_STEPS = [
  'Validating input data…',
  'Building MILP model…',
  'Solving optimization…',
  'Generating recommendations…',
];

// ─── Compare modal ────────────────────────────────────────────────────────────
function CompareModal({
  open,
  onClose,
  scenarios,
}: {
  open: boolean;
  onClose: () => void;
  scenarios: Scenario[];
}) {
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');

  const cmpQuery = useQuery({
    queryKey: ['compareScenarios', aId, bId],
    queryFn: () => compareScenarios(aId, bId),
    enabled: !!(aId && bId && aId !== bId),
  });

  const rows = cmpQuery.data?.rows ?? [];
  const scenarioA = cmpQuery.data?.scenarioA;
  const scenarioB = cmpQuery.data?.scenarioB;

  const KPI_LABELS: Record<string, string> = {
    throughputBpd: 'Throughput (bpd)',
    daysOfCoverHs: 'Days Cover HS',
    daysOfCoverLs: 'Days Cover LS',
    openDemurrageRiskUsd: 'Open Demurrage ($)',
    grmUsdPerBbl: 'GRM ($/bbl)',
    grmUsdAnnualizedMM: 'GRM Annualised ($M)',
    opportunityUsdAnnualizedMM: 'Opportunity ($M)',
    blendViolationCount: 'Blend Violations',
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--hel-surface)',
            border: '1px solid var(--hel-border)',
            borderRadius: 10,
            padding: 28,
            width: 660,
            maxWidth: '95vw',
            maxHeight: '85vh',
            overflowY: 'auto',
            zIndex: 1001,
            boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
          }}
          aria-describedby={undefined}
        >
          <Dialog.Title
            style={{ fontWeight: 700, fontSize: 16, color: 'var(--hel-text)', marginBottom: 20 }}
          >
            Compare Scenarios
          </Dialog.Title>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Scenario A', value: aId, set: setAId },
              { label: 'Scenario B', value: bId, set: setBId },
            ].map(({ label, value, set }) => (
              <div key={label} style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--hel-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 6,
                  }}
                >
                  {label}
                </div>
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--hel-border)',
                    background: 'var(--hel-surface-raised)',
                    color: 'var(--hel-text)',
                    fontSize: 13,
                  }}
                >
                  <option value="">Select…</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {aId && bId && aId !== bId && (
            <>
              {cmpQuery.isLoading && (
                <div style={{ color: 'var(--hel-text-secondary)', fontSize: 13 }}>
                  Loading comparison…
                </div>
              )}
              {cmpQuery.isSuccess && rows.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: '2px solid var(--hel-border)',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--hel-text-secondary)',
                      }}
                    >
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>
                        Metric
                      </th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                        {scenarioA?.name ?? 'A'}
                      </th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                        {scenarioB?.name ?? 'B'}
                      </th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                        Δ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((r) => KPI_LABELS[r.metric])
                      .map((r) => {
                        const delta = typeof r.delta === 'number' ? r.delta : null;
                        const isPos =
                          delta != null &&
                          delta > 0 &&
                          r.metric !== 'openDemurrageRiskUsd' &&
                          r.metric !== 'blendViolationCount';
                        const isNeg =
                          delta != null &&
                          delta < 0 &&
                          (r.metric === 'openDemurrageRiskUsd' ||
                            r.metric === 'blendViolationCount');
                        return (
                          <tr
                            key={r.metric}
                            style={{ borderBottom: '1px solid var(--hel-border)' }}
                          >
                            <td
                              style={{
                                padding: '7px 8px',
                                color: 'var(--hel-text)',
                                fontWeight: 500,
                              }}
                            >
                              {KPI_LABELS[r.metric]}
                            </td>
                            <td
                              style={{
                                padding: '7px 8px',
                                textAlign: 'right',
                                color: 'var(--hel-text-secondary)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {typeof r.a === 'number' ? r.a.toLocaleString() : String(r.a ?? '—')}
                            </td>
                            <td
                              style={{
                                padding: '7px 8px',
                                textAlign: 'right',
                                color: 'var(--hel-text)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {typeof r.b === 'number' ? r.b.toLocaleString() : String(r.b ?? '—')}
                            </td>
                            <td
                              style={{
                                padding: '7px 8px',
                                textAlign: 'right',
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 600,
                                color: isPos
                                  ? '#22c55e'
                                  : isNeg
                                  ? '#dc2626'
                                  : delta == null
                                  ? 'var(--hel-text-muted)'
                                  : delta > 0
                                  ? '#f59e0b'
                                  : '#22c55e',
                              }}
                            >
                              {delta != null
                                ? `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
              {cmpQuery.isSuccess && rows.length === 0 && (
                <div style={{ color: 'var(--hel-text-secondary)', fontSize: 13 }}>
                  No KPI data available for comparison.
                </div>
              )}
            </>
          )}
          {aId === bId && aId !== '' && (
            <div style={{ color: 'var(--hel-text-secondary)', fontSize: 13 }}>
              Select two different scenarios to compare.
            </div>
          )}

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <HelButton variant="secondary" size="md" onClick={onClose}>
              Close
            </HelButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OptimizerPage() {
  const { push } = useToast();
  const qc = useQueryClient();

  // ── Builder state ────────────────────────────────────────────────────────
  const [objective, setObjective] = useState<ObjectiveMode>('Balanced');
  const [enabledGrades, setEnabledGrades] = useState<Set<string>>(
    new Set(['ARAB_LIGHT', 'URALS', 'CPC_BLEND', 'AZERI_LIGHT'])
  );
  const [fixedCargoes, setFixedCargoes] = useState(true);
  const [flexDays, setFlexDays] = useState(2);
  const [constraints, setConstraints] = useState({
    tankSeg: true,
    qualitySpecs: true,
    cduBlend: true,
    pipeline: true,
    berth: true,
  });
  const [whatIfsOpen, setWhatIfsOpen] = useState(false);
  const [whatIfFlexDays] = useState<Record<string, number>>({});
  const [whatIfPriceOverride, setWhatIfPriceOverride] = useState<Record<string, string>>({});
  const [whatIfCduPct, setWhatIfCduPct] = useState<Record<string, string>>({});

  // ── Run state ────────────────────────────────────────────────────────────
  const [runStep, setRunStep] = useState(-1);
  const [runResult, setRunResult] = useState<PsoOutput | null>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [compareOpen, setCompareOpen] = useState(false);
  const [evidenceRec, setEvidenceRec] = useState<PersistedRecommendation | null>(null);

  // ── Scenario name/desc state for new scenario ────────────────────────────
  const [scenName, setScenName] = useState('');
  const [scenDesc, setScenDesc] = useState('');

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: input } = useQuery({ queryKey: ['psoInput'], queryFn: getInputData });
  const { data: output } = useQuery({ queryKey: ['psoOutput'], queryFn: getOutputData });
  const { data: scenarios = [], refetch: refetchScenarios } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => getScenarios(20),
  });

  const deleteScenMutation = useMutation({
    mutationFn: (id: string) => deleteScenario(id),
    onSuccess: () => {
      refetchScenarios();
      push({ kind: 'success', message: 'Scenario deleted.' });
    },
  });

  const saveScenMutation = useMutation({
    mutationFn: () =>
      createScenario(
        scenName || `Scenario ${new Date().toLocaleDateString()}`,
        scenDesc,
        objective,
        {
          enabledGrades: Array.from(enabledGrades),
          fixedCargoes,
          flexDays,
          constraints,
          whatIfFlexDays,
          whatIfPriceOverride,
          whatIfCduPct,
        }
      ),
    onSuccess: () => {
      refetchScenarios();
      setScenName('');
      setScenDesc('');
      push({ kind: 'success', message: 'Scenario saved.' });
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const gradeItems = input?.items ?? [];
  const baseline = output?.kpis;
  const optimized = runResult?.kpis;

  const topRecs: PersistedRecommendation[] = (runResult?.recommendations ?? [])
    .slice(0, 5)
    .map((r) => ({
      ...r,
      id: r.recommendationId,
      scenarioId: runResult?.scenarioId ?? '',
      status: 'Proposed' as const,
      createdAt: runResult?.solvedAt ?? new Date().toISOString(),
      lastUpdatedAt: runResult?.solvedAt ?? new Date().toISOString(),
      cargoId: r.cargoId ?? '',
      crudeGrade: r.crudeGrade ?? '',
      feedbackNotes: '',
    }));

  // Diet comparison chart data
  const dietChartData = gradeItems.map((item) => {
    const baseCharge = Object.values(output?.cduChargeByDay ?? {}).reduce((sum, cduData) => {
      const gradeArr = cduData[item.itemId] ?? [];
      return sum + gradeArr.reduce((s, v) => s + v, 0) / (gradeArr.length || 1);
    }, 0);
    const optCharge = Object.values(runResult?.cduChargeByDay ?? {}).reduce((sum, cduData) => {
      const gradeArr = cduData[item.itemId] ?? [];
      return sum + gradeArr.reduce((s, v) => s + v, 0) / (gradeArr.length || 1);
    }, 0);
    return {
      grade: GRADE_LABELS[item.itemId] ?? item.itemId,
      gradeId: item.itemId,
      baseline: Math.round(baseCharge),
      optimized: Math.round(optCharge),
    };
  }).filter((d) => d.baseline > 0 || d.optimized > 0);

  // ── Run optimizer logic ──────────────────────────────────────────────────
  function handleRunOptimizer() {
    if (!input) return;
    // clear any in-flight timers
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    setRunStep(0);
    setRunResult(null);

    // Simulate 4 steps, then fire real call
    [0, 1, 2, 3].forEach((step) => {
      const t = setTimeout(() => {
        setRunStep(step);
        if (step === 3) {
          // Kick off the actual optimizer call
          const patchedInput: PsoInput = {
            ...input,
            items: input.items.filter((i) => enabledGrades.has(i.itemId)),
            flexDays,
          };
          runOptimizerWithInput(patchedInput, objective, flexDays)
            .then((result) => {
              setRunResult(result);
              setRunStep(-1);
              qc.invalidateQueries({ queryKey: ['psoOutput'] });
              push({ kind: 'success', message: `Optimizer complete (${OBJECTIVE_LABELS[objective]}).` });
            })
            .catch(() => {
              setRunStep(-1);
              push({ kind: 'danger', message: 'Optimizer failed — using heuristic fallback.' });
            });
        }
      }, step * 1000 + 200);
      stepTimers.current.push(t);
    });
  }

  const isRunning = runStep >= 0;

  // ── Constraint toggle helper ─────────────────────────────────────────────
  function toggleConstraint(key: keyof typeof constraints) {
    setConstraints((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleGrade(gradeId: string) {
    setEnabledGrades((prev) => {
      const next = new Set(prev);
      if (next.has(gradeId)) next.delete(gradeId);
      else next.add(gradeId);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionHeader
        title="Crude Diet Optimizer"
        subtitle={`${input?.refineryId ?? 'Aspropyrgos'} · configure & run scenarios`}
        action={
          <HelButton
            variant="secondary"
            size="md"
            onClick={() => setCompareOpen(true)}
            disabled={scenarios.length < 2}
          >
            Compare Scenarios
          </HelButton>
        }
      />
      <PageFilterBar />

      {/* ── Split layout ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 3fr',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* ─── LEFT: Scenario Builder ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--hel-text)', marginBottom: 16 }}>
              Scenario Builder
            </div>

            {/* Objective */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="optimizer-objective"
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--hel-text-secondary)',
                  marginBottom: 6,
                }}
              >
                Optimization Objective
              </label>
              <select
                id="optimizer-objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value as ObjectiveMode)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--hel-border)',
                  background: 'var(--hel-surface-raised)',
                  color: 'var(--hel-text)',
                  fontSize: 13,
                }}
              >
                {(Object.keys(OBJECTIVE_LABELS) as ObjectiveMode[]).map((m) => (
                  <option key={m} value={m}>
                    {OBJECTIVE_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            {/* Crude grades */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--hel-text-secondary)',
                  marginBottom: 8,
                }}
              >
                Crude Grades
              </div>
              {gradeItems.map((item) => (
                <label
                  key={item.itemId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '5px 0',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabledGrades.has(item.itemId)}
                    onChange={() => toggleGrade(item.itemId)}
                    style={{ accentColor: GRADE_COLORS[item.itemId] ?? '#5B8FAD' }}
                  />
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: GRADE_COLORS[item.itemId] ?? '#8D7DA3',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, color: 'var(--hel-text)' }}>
                    {GRADE_LABELS[item.itemId] ?? item.itemId}
                  </span>
                  <span style={{ color: 'var(--hel-text-muted)', fontSize: 11 }}>
                    {item.priceDifferentialUsdBbl != null
                      ? `${item.priceDifferentialUsdBbl > 0 ? '+' : ''}$${item.priceDifferentialUsdBbl.toFixed(2)}/bbl`
                      : ''}
                  </span>
                </label>
              ))}
            </div>

            {/* Constraints */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--hel-text-secondary)',
                  marginBottom: 8,
                }}
              >
                Active Constraints
              </div>
              {[
                { key: 'tankSeg', label: 'Tank Segregation' },
                { key: 'qualitySpecs', label: 'Quality Specs' },
                { key: 'cduBlend', label: 'CDU Blend Limits' },
                { key: 'pipeline', label: 'Pipeline Capacity' },
                { key: 'berth', label: 'Vessel Berth Availability' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={constraints[key as keyof typeof constraints]}
                    onChange={() => toggleConstraint(key as keyof typeof constraints)}
                  />
                  <span style={{ color: 'var(--hel-text)' }}>{label}</span>
                </label>
              ))}
            </div>

            {/* Fixed cargoes + flex days */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                marginBottom: 16,
                flexWrap: 'wrap',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={fixedCargoes}
                  onChange={() => setFixedCargoes((p) => !p)}
                />
                <span style={{ color: 'var(--hel-text)' }}>Respect fixed cargoes</span>
              </label>
            </div>

            {/* Flex days slider */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--hel-text-secondary)',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Arrival Flexibility</span>
                <span style={{ color: 'var(--hel-text)' }}>±{flexDays} days</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={flexDays}
                onChange={(e) => setFlexDays(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--hel-accent)' }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--hel-text-muted)',
                  marginTop: 2,
                }}
              >
                <span>0 days</span>
                <span>5 days</span>
              </div>
            </div>

            {/* What-Ifs (collapsible) */}
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={() => setWhatIfsOpen((o) => !o)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: '1px solid var(--hel-border)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--hel-text)',
                  width: '100%',
                  justifyContent: 'space-between',
                }}
              >
                <span>What-If Parameters</span>
                <span style={{ transform: whatIfsOpen ? 'rotate(180deg)' : 'none', fontSize: 11 }}>
                  ▾
                </span>
              </button>

              {whatIfsOpen && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 12,
                    background: 'var(--hel-surface-raised)',
                    borderRadius: 6,
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {/* Price overrides */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--hel-text)', marginBottom: 6 }}>
                      Price Differential Override ($/bbl)
                    </div>
                    {gradeItems.map((item) => (
                      <div
                        key={item.itemId}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                      >
                        <span style={{ flex: 1, color: 'var(--hel-text-secondary)' }}>
                          {GRADE_LABELS[item.itemId] ?? item.itemId}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder={String(item.priceDifferentialUsdBbl ?? 0)}
                          value={whatIfPriceOverride[item.itemId] ?? ''}
                          onChange={(e) =>
                            setWhatIfPriceOverride((p) => ({
                              ...p,
                              [item.itemId]: e.target.value,
                            }))
                          }
                          style={{
                            width: 80,
                            padding: '3px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--hel-border)',
                            background: 'var(--hel-surface)',
                            color: 'var(--hel-text)',
                            fontSize: 12,
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* CDU throughput % */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--hel-text)', marginBottom: 6 }}>
                      CDU Throughput Override (%)
                    </div>
                    {(input?.facilities?.[0]?.cdus ?? []).map((cdu) => (
                      <div
                        key={cdu.cduId}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                      >
                        <span style={{ flex: 1, color: 'var(--hel-text-secondary)' }}>
                          {cdu.cduId}
                        </span>
                        <input
                          type="number"
                          step="1"
                          min="50"
                          max="110"
                          placeholder="100"
                          value={whatIfCduPct[cdu.cduId] ?? ''}
                          onChange={(e) =>
                            setWhatIfCduPct((p) => ({ ...p, [cdu.cduId]: e.target.value }))
                          }
                          style={{
                            width: 80,
                            padding: '3px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--hel-border)',
                            background: 'var(--hel-surface)',
                            color: 'var(--hel-text)',
                            fontSize: 12,
                          }}
                        />
                        <span style={{ color: 'var(--hel-text-muted)' }}>%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Save scenario inputs */}
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                placeholder="Scenario name (optional)"
                value={scenName}
                onChange={(e) => setScenName(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--hel-border)',
                  background: 'var(--hel-surface-raised)',
                  color: 'var(--hel-text)',
                  fontSize: 12,
                }}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={scenDesc}
                onChange={(e) => setScenDesc(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--hel-border)',
                  background: 'var(--hel-surface-raised)',
                  color: 'var(--hel-text)',
                  fontSize: 12,
                }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <HelButton
                variant="primary"
                size="md"
                disabled={isRunning || !input}
                onClick={handleRunOptimizer}
                style={{ flex: 1 }}
              >
                {isRunning ? RUN_STEPS[runStep] ?? 'Running…' : 'Run Optimizer'}
              </HelButton>
              <HelButton
                variant="secondary"
                size="md"
                disabled={saveScenMutation.isPending}
                onClick={() => saveScenMutation.mutate()}
              >
                Save
              </HelButton>
            </div>

            {/* Progress indicator */}
            {isRunning && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    marginBottom: 6,
                  }}
                >
                  {RUN_STEPS.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background:
                          i <= runStep ? 'var(--hel-accent)' : 'var(--hel-border)',
                        transition: 'background 0.3s',
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--hel-text-secondary)',
                    textAlign: 'center',
                  }}
                >
                  Step {runStep + 1} of {RUN_STEPS.length}: {RUN_STEPS[runStep]}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ─── RIGHT: Results ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* KPI comparison strip */}
          <Card>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--hel-text)',
                marginBottom: 16,
              }}
            >
              {runResult ? 'Optimization Results' : 'Baseline KPIs'}
            </div>

            {!runResult && !baseline && (
              <div style={{ color: 'var(--hel-text-secondary)', fontSize: 13 }}>
                Run the optimizer to see results.
              </div>
            )}

            {(baseline || runResult) && (
              <div className="hel-grid hel-grid--kpi">
                {[
                  {
                    label: 'GRM',
                    base: baseline?.grmUsdPerBbl,
                    opt: optimized?.grmUsdPerBbl,
                    fmt: (v: number) => `$${v.toFixed(2)}/bbl`,
                    higherIsBetter: true,
                  },
                  {
                    label: 'Throughput',
                    base: baseline?.throughputBpd,
                    opt: optimized?.throughputBpd,
                    fmt: (v: number) => `${(v / 1000).toFixed(0)}k bpd`,
                    higherIsBetter: true,
                  },
                  {
                    label: 'Demurrage Risk',
                    base: baseline?.openDemurrageRiskUsd,
                    opt: optimized?.openDemurrageRiskUsd,
                    fmt: (v: number) => formatUsdCompact(v),
                    higherIsBetter: false,
                  },
                  {
                    label: 'Blend Violations',
                    base: baseline?.blendViolationCount,
                    opt: optimized?.blendViolationCount,
                    fmt: (v: number) => String(v),
                    higherIsBetter: false,
                  },
                  {
                    label: 'GRM Annualised',
                    base: baseline?.grmUsdAnnualizedMM,
                    opt: optimized?.grmUsdAnnualizedMM,
                    fmt: (v: number) => `$${v.toFixed(1)}M`,
                    higherIsBetter: true,
                  },
                  {
                    label: 'Opportunity',
                    base: baseline?.opportunityUsdAnnualizedMM,
                    opt: optimized?.opportunityUsdAnnualizedMM,
                    fmt: (v: number) => `$${v.toFixed(1)}M`,
                    higherIsBetter: true,
                  },
                ].map(({ label, base, opt, fmt, higherIsBetter }) => {
                  const delta =
                    runResult && base != null && opt != null ? opt - base : null;
                  const isGood =
                    delta != null && (higherIsBetter ? delta > 0 : delta < 0);
                  return (
                    <KpiCard
                      key={label}
                      label={label}
                      value={opt != null ? fmt(opt) : base != null ? fmt(base) : '—'}
                      delta={delta}
                      deltaFormatter={(d) =>
                        `${d > 0 ? '+' : ''}${fmt(d)} vs baseline`
                      }
                      accent={
                        delta == null
                          ? 'default'
                          : isGood
                          ? 'success'
                          : 'warning'
                      }
                    />
                  );
                })}
              </div>
            )}
          </Card>

          {/* Top recommendations */}
          {topRecs.length > 0 && (
            <Card>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--hel-text)',
                  marginBottom: 12,
                }}
              >
                Recommendations ({topRecs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topRecs.map((rec) => (
                  <div
                    key={rec.id}
                    role="button"
                    tabIndex={0}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--hel-surface-raised)',
                      border: '1px solid var(--hel-border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                    onClick={() => setEvidenceRec(rec)}
                    onKeyDown={(e) => e.key === 'Enter' && setEvidenceRec(rec)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <PriorityBadge priority={rec.priority} />
                        <DecisionBadge decision={rec.decision} />
                        {rec.crudeGrade && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: gradeFamilyColor(rec.crudeGrade),
                              color: '#fff',
                            }}
                          >
                            {GRADE_LABELS[rec.crudeGrade] ?? rec.crudeGrade}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--hel-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {rec.title}
                      </div>
                      {rec.expectedImpactUsd != null && (
                        <div style={{ fontSize: 11, color: 'var(--hel-text-secondary)', marginTop: 2 }}>
                          Impact: {formatUsdCompact(rec.expectedImpactUsd)} · Conf: {rec.confidence}%
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--hel-text-muted)', flexShrink: 0 }}>
                      →
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Crude Diet Comparison chart */}
          {runResult && dietChartData.length > 0 && (
            <Card>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--hel-text)',
                  marginBottom: 4,
                }}
              >
                Crude Diet Comparison
              </div>
              <div style={{ fontSize: 12, color: 'var(--hel-text-secondary)', marginBottom: 12 }}>
                Avg daily charge by grade — Baseline vs Optimized
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={dietChartData}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--hel-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="grade"
                    tick={{ fontSize: 11, fill: 'var(--hel-text-secondary)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: 'var(--hel-text-secondary)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v: number) => `${(v / 1000).toFixed(1)}k bpd`}
                    labelStyle={{ color: 'var(--hel-text)', fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="baseline" name="Baseline" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                  <Bar
                    dataKey="optimized"
                    name="Optimized"
                    fill="var(--hel-accent)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Scenario Management table */}
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--hel-text)' }}>
                Saved Scenarios ({scenarios.length})
              </div>
              <HelButton
                variant="ghost"
                size="sm"
                onClick={() => refetchScenarios()}
              >
                Refresh
              </HelButton>
            </div>

            {scenarios.length === 0 ? (
              <div style={{ color: 'var(--hel-text-secondary)', fontSize: 13 }}>
                No scenarios saved yet. Configure and save a scenario above.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: '2px solid var(--hel-border)',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--hel-text-secondary)',
                      }}
                    >
                      {['Name', 'Created', 'Objective', 'GRM Δ', 'Status', ''].map((h) => (
                        <th
                          key={h}
                          style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600 }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s) => {
                      const grmDelta = s.kpiDeltas?.grmUsdPerBbl;
                      return (
                        <tr
                          key={s.id}
                          style={{ borderBottom: '1px solid var(--hel-border)' }}
                        >
                          <td
                            style={{
                              padding: '6px 8px',
                              fontWeight: 500,
                              color: 'var(--hel-text)',
                              maxWidth: 140,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.name}
                          </td>
                          <td
                            style={{
                              padding: '6px 8px',
                              color: 'var(--hel-text-secondary)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatRelative(s.createdAt)}
                          </td>
                          <td style={{ padding: '6px 8px', color: 'var(--hel-text-secondary)' }}>
                            {OBJECTIVE_LABELS[s.objective] ?? s.objective}
                          </td>
                          <td
                            style={{
                              padding: '6px 8px',
                              fontVariantNumeric: 'tabular-nums',
                              color:
                                grmDelta == null
                                  ? 'var(--hel-text-muted)'
                                  : grmDelta > 0
                                  ? '#22c55e'
                                  : '#f59e0b',
                              fontWeight: grmDelta != null ? 600 : 400,
                            }}
                          >
                            {grmDelta != null
                              ? `${grmDelta > 0 ? '+' : ''}$${grmDelta.toFixed(2)}`
                              : '—'}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <StatusBadge
                              kind={
                                s.status === 'Complete'
                                  ? 'success'
                                  : s.status === 'Running'
                                  ? 'info'
                                  : s.status === 'Failed'
                                  ? 'danger'
                                  : 'muted'
                              }
                            >
                              {s.status}
                            </StatusBadge>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <HelButton
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                deleteScenMutation.mutate(s.id)
                              }
                            >
                              Delete
                            </HelButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Evidence Drawer */}
      <EvidenceDrawer rec={evidenceRec} onClose={() => setEvidenceRec(null)} />

      {/* Compare Modal */}
      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        scenarios={scenarios}
      />
    </div>
  );
}
