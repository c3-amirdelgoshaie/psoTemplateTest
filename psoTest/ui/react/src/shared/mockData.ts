/*
 * Embedded mock data for the Crude Schedule Optimizer UI.
 *
 * Mirrors seed/PsoInput/PsoInput.json and constructs a rich, demo-ready
 * PsoOutput with realistic CDU charge variation, maintenance dips,
 * arrival-driven spikes, and interesting LP alignment gaps.
 */

import type {
  PsoInput,
  PsoOutput,
  PersistedRecommendation,
  Scenario,
} from '../types/crude';

import psoInputSeed from '../data/psoInput.seed.json';
import scenariosSeed from '../data/psoScenarios.seed.json';
import recsSeed from '../data/psoRecommendations.seed.json';

export const MOCK_INPUT: PsoInput = psoInputSeed as unknown as PsoInput;
export const MOCK_SCENARIOS: Scenario[] = scenariosSeed as unknown as Scenario[];
export const MOCK_RECS: PersistedRecommendation[] = recsSeed as unknown as PersistedRecommendation[];

// Seeded pseudo-random so the chart is deterministic across re-renders
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
}

/**
 * Generate a realistic CDU charge profile for one grade over H days.
 * - Starts at `base` bpd
 * - Smooth day-to-day variation ±`swing` bpd (exponential smoothing)
 * - `dips`: array of {start, end} day ranges where charge drops to ~60% (maintenance / inventory low)
 * - `surges`: array of {start, end, delta} day ranges where charge spikes (cargo arrival)
 * - Clamped to [min, max]
 */
function makeChargeProfile(opts: {
  H: number;
  base: number;
  swing: number;
  min: number;
  max: number;
  dips?: { start: number; end: number }[];
  surges?: { start: number; end: number; delta: number }[];
  seed?: number;
}): number[] {
  const { H, base, swing, min, max, dips = [], surges = [], seed = 42 } = opts;
  const rand = seededRand(seed);
  const out: number[] = [];
  let current = base;
  for (let d = 0; d < H; d++) {
    // Smooth noise
    const noise = (rand() - 0.5) * 2 * swing;
    current = current * 0.75 + (base + noise) * 0.25;

    // Apply dips (maintenance)
    const inDip = dips.some((dip) => d >= dip.start && d < dip.end);
    if (inDip) current = base * 0.0; // full stop

    // Apply surges (fresh crude arrival)
    const surge = surges.find((s) => d >= s.start && d < s.end);
    if (surge) current = Math.min(max, current + surge.delta);

    out.push(Math.round(Math.max(inDip ? 0 : min, Math.min(max, current))));
  }
  return out;
}

/** Build a representative PsoOutput matching what the heuristic solver returns. */
function buildMockOutput(): PsoOutput {
  const input = MOCK_INPUT;
  const start = new Date(input.startDate);
  const H = input.planningHorizonDays;

  const facility = input.facilities[0];
  const cargoes = facility.cargoes;

  // ── Schedules ──────────────────────────────────────────────────────────────
  const schedules = cargoes.map((c) => {
    const laycanStart = Math.max(
      0,
      Math.floor((new Date(c.laycanStart).getTime() - start.getTime()) / 86400000)
    );
    const laycanEnd = Math.max(
      laycanStart + 1,
      Math.floor((new Date(c.laycanEnd).getTime() - start.getTime()) / 86400000)
    );
    const isRisky =
      c.status === 'At Risk' ||
      c.demurrageRiskLevel === 'High' ||
      c.demurrageRiskLevel === 'Medium';
    const demDays = isRisky && !c.isFixed ? 1 : 0;

    type Decision =
      | 'HOLD'
      | 'RETIME'
      | 'SUBSTITUTE'
      | 'DEFER'
      | 'REORDER'
      | 'DROP'
      | 'NOMINATE_TANK';
    let decision: Decision = 'HOLD';
    if (demDays > 0) decision = 'RETIME';
    if (c.status === 'Provisional' && !c.nominatedTanks?.length) decision = 'NOMINATE_TANK';

    return {
      cargoId: c.cargoId,
      decision,
      berthStartDay: laycanStart,
      berthEndDay: laycanEnd,
      assignedTanks: c.nominatedTanks ?? [],
      substitutedWithGrade: '',
      deferredToDay: 0,
      demurrageDays: demDays,
      demurrageCostUsd:
        demDays *
        (c.demurrageRateUsdDay ??
          { VLCC: 65000, Suezmax: 42000, Aframax: 28000 }[c.vesselType]),
      isOnTime: demDays === 0,
    };
  });

  // ── CDU Charge — rich realistic profiles ──────────────────────────────────
  //
  // CDU-1 (HS train): Arab Light ~50k bpd, Urals ~35k bpd
  //   Maintenance dip days 16-17 (Apr 30–May 1 = day 16-17 of horizon)
  //   Arab Light surges when Ionian Star / Hellas Phoenix / Rhodes Titan arrive
  //
  // CDU-2 (LS+HS mix): Urals ~20k, CPC Blend ~25k, Azeri Light ~20.5k
  //   Maintenance dip days 22-23 (May 6-7)
  //   CPC surge when Kithira Pride arrives; Azeri surge for Olympia Trident
  //
  // Scheduled charge ≠ LP target to create interesting LP Alignment deltas:
  //   Arab Light running ~4% above LP (high inventory, running hard)
  //   Urals running ~6% below LP on CDU-2 (sulphur constraint mitigation)
  //   CPC Blend slightly above LP
  //   Azeri Light on target

  // Day offsets (horizon starts Apr 14):
  //   CRG-001 Ionian Star arrives Apr 16 → day 2
  //   CRG-002 Aegean Voyager Apr 17 → day 3
  //   CRG-003 Kithira Pride Apr 21 → day 7
  //   CRG-004 Olympia Trident Apr 22 → day 8
  //   CRG-006 Thrace Meridian Apr 26 → day 12
  //   CDU-1 maintenance Apr 30–May 1 → days 16-17
  //   CRG-007 Hellas Phoenix Apr 29 → day 15
  //   CDU-2 catalyst change May 6-7 → days 22-23
  //   CRG-009 Mykonos Spirit May 3 → day 19
  //   CDU-1 valve repair May 11 → day 27

  const cdu1_arabLight = makeChargeProfile({
    H, base: 50000, swing: 3500, min: 38000, max: 62000, seed: 11,
    dips: [{ start: 16, end: 18 }, { start: 27, end: 28 }],
    surges: [
      { start: 2, end: 5, delta: 6000 },   // Ionian Star
      { start: 15, end: 18, delta: 8000 },  // Hellas Phoenix VLCC
      { start: 22, end: 24, delta: 4000 },  // Rhodes Titan
    ],
  });

  const cdu1_urals = makeChargeProfile({
    H, base: 33000, swing: 2500, min: 24000, max: 44000, seed: 22,
    dips: [{ start: 16, end: 18 }, { start: 27, end: 28 }],
    surges: [
      { start: 3, end: 6, delta: 5000 },   // Aegean Voyager
      { start: 12, end: 15, delta: 4000 }, // Thrace Meridian
      { start: 19, end: 22, delta: 6000 }, // Mykonos Spirit
    ],
  });

  const cdu2_urals = makeChargeProfile({
    H, base: 18000, swing: 2000, min: 10000, max: 26000, seed: 33,
    // Running below LP target to manage sulphur constraint violation
    dips: [{ start: 22, end: 24 }],
    surges: [{ start: 3, end: 5, delta: 3000 }],
  });

  const cdu2_cpcBlend = makeChargeProfile({
    H, base: 27000, swing: 2000, min: 18000, max: 34000, seed: 44,
    dips: [{ start: 22, end: 24 }],
    surges: [
      { start: 7, end: 10, delta: 5000 },  // Kithira Pride
      { start: 15, end: 17, delta: 3000 }, // Crete Navigator
      { start: 23, end: 26, delta: 4000 }, // Corfu Express
    ],
  });

  const cdu2_azeri = makeChargeProfile({
    H, base: 20500, swing: 1800, min: 14000, max: 27000, seed: 55,
    dips: [{ start: 22, end: 24 }],
    surges: [
      { start: 8, end: 11, delta: 5000 },  // Olympia Trident
      { start: 19, end: 22, delta: 4000 }, // Santorini Dawn
    ],
  });

  const cduCharge: Record<string, Record<string, number[]>> = {
    'CDU-1': {
      ARAB_LIGHT: cdu1_arabLight,
      URALS: cdu1_urals,
      CPC_BLEND: new Array(H).fill(0),
      AZERI_LIGHT: new Array(H).fill(0),
    },
    'CDU-2': {
      ARAB_LIGHT: new Array(H).fill(0),
      URALS: cdu2_urals,
      CPC_BLEND: cdu2_cpcBlend,
      AZERI_LIGHT: cdu2_azeri,
    },
  };

  // ── Tank inventory ─────────────────────────────────────────────────────────
  const tankInventory: Record<string, Record<string, number[]>> = {};
  for (const t of facility.tanks) {
    const g = t.crudeGrade ?? '';
    if (!g) continue;
    const it = (facility.items ?? []).find((x) => x.itemId === g);
    const sameGrade = facility.tanks.filter((x) => x.crudeGrade === g).length || 1;
    let inv = t.currentVolumeBbls;
    const row: number[] = [];
    for (let day = 0; day < H; day++) {
      inv +=
        ((it?.arrivalsBblsByDay?.[day] ?? 0) / sameGrade) -
        ((it?.demandBblsByDay?.[day] ?? 0) / sameGrade);
      inv = Math.max(0, Math.min(inv, t.capacityBbls));
      row.push(Math.round(inv));
    }
    tankInventory[t.tankId] = { [g]: row };
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────
  // Combined throughput = avg of non-zero days across both CDUs
  const combinedDaily = Array.from({ length: H }, (_, d) => {
    const cdu1 = (cdu1_arabLight[d] ?? 0) + (cdu1_urals[d] ?? 0);
    const cdu2 = (cdu2_urals[d] ?? 0) + (cdu2_cpcBlend[d] ?? 0) + (cdu2_azeri[d] ?? 0);
    return cdu1 + cdu2;
  });
  const avgThroughput = Math.round(
    combinedDaily.reduce((s, v) => s + v, 0) / H
  );

  const totalDem = schedules.reduce((s, x) => s + x.demurrageCostUsd, 0);
  const arrivals14 = cargoes.filter(
    (c) =>
      (new Date(c.laycanStart).getTime() - start.getTime()) / 86400000 >= 0 &&
      (new Date(c.laycanStart).getTime() - start.getTime()) / 86400000 < 14
  ).length;
  const blendViolations = facility.cdus.reduce(
    (n, u) =>
      n + (u.blendConstraints ?? []).filter((b) => b.status === 'VIOLATED').length,
    0
  );

  // Planned total = sum of both CDU planned throughputs
  const plannedTotal = facility.cdus.reduce((s, u) => s + u.plannedThroughputBpd, 0);

  const kpis = {
    throughputBpd: avgThroughput,
    plannedThroughputBpd: plannedTotal,
    daysOfCoverHs: 9.1,
    daysOfCoverLs: 10.4,
    scheduledArrivalsNext14d: arrivals14,
    openDemurrageRiskUsd: totalDem || 168000,
    grmUsdPerBbl: 7.12,
    grmUsdAnnualizedMM: 391.3,
    opportunityUsdAnnualizedMM: 16.0,
    blendViolationCount: blendViolations,
    objectiveValue: 3_350_000,
    objectiveMode: 'Balanced' as const,
  };

  return {
    id: 'OUT_ASPR_20260414_094212',
    status: 'fallback',
    objectiveValue: 3_350_000,
    solveTimeSeconds: 0.18,
    solvedAt: '2026-04-14T09:42:12Z',
    scenarioId: 'BASELINE',
    objectiveMode: 'Balanced',
    schedules,
    recommendations: MOCK_RECS.map((r) => ({
      recommendationId: r.id,
      cargoId: r.cargoId,
      crudeGrade: r.crudeGrade,
      decision: r.decision,
      confidence: r.confidence,
      expectedImpactUsd: r.expectedImpactUsd,
      title: r.title,
      summary: r.summary,
      evidence: r.evidence,
      assumptions: r.assumptions,
      risks: r.risks,
      nextActions: r.nextActions,
      reorderPlan: r.reorderPlan,
      riskFlags: r.riskFlags,
      anomalies: r.anomalies,
      priority: r.priority,
      metadata: r.metadata,
    })),
    kpis,
    riskFlags: (MOCK_RECS[0]?.riskFlags ?? []) as PsoOutput['riskFlags'],
    anomalies: (MOCK_RECS[0]?.anomalies ?? []) as PsoOutput['anomalies'],
    cduChargeByDay: cduCharge,
    tankInventoryByDay: tankInventory,
    metadata: {
      solver: 'heuristic',
      missingFields: [],
      dataSourcesUsed: Object.keys(input.dataFreshness ?? {}),
      dataFreshness: input.dataFreshness,
      lpTargetVersion: input.lpTargetVersion,
      gurobiStatus: null,
      fallbackReason: 'UI mock mode',
    },
  };
}

export const MOCK_OUTPUT: PsoOutput = buildMockOutput();
