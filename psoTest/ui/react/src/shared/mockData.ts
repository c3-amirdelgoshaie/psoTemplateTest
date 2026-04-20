/*
 * Embedded mock data for the Crude Schedule Optimizer UI.
 *
 * Mirrors seed/PsoInput/PsoInput.json, seed/PsoScenario/PsoScenario.json,
 * seed/PsoRecommendation/PsoRecommendation.json and constructs a realistic
 * PsoOutput derived from the heuristic solver path. Used by shared/crudeApi.ts
 * when VITE_USE_MOCK_API=true or when C3 calls fail.
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

/** Build a representative PsoOutput matching what the heuristic solver returns. */
function buildMockOutput(): PsoOutput {
  const input = MOCK_INPUT;
  const start = new Date(input.startDate);
  const H = input.planningHorizonDays;

  const facility = input.facilities[0];
  const cargoes = facility.cargoes;

  const schedules = cargoes.map((c) => {
    const laycanStart = Math.max(
      0,
      Math.floor((new Date(c.laycanStart).getTime() - start.getTime()) / 86400000)
    );
    const isRisky = c.status === 'At Risk' || c.demurrageRiskLevel === 'High' || c.demurrageRiskLevel === 'Medium';
    const demDays = isRisky && !c.isFixed ? 1 : 0;
    return {
      cargoId: c.cargoId,
      decision: demDays > 0 ? ('RETIME' as const) : ('HOLD' as const),
      berthStartDay: laycanStart,
      berthEndDay: laycanStart + 1,
      assignedTanks: c.nominatedTanks ?? [],
      substitutedWithGrade: '',
      deferredToDay: 0,
      demurrageDays: demDays,
      demurrageCostUsd:
        demDays * (c.demurrageRateUsdDay ?? { VLCC: 65000, Suezmax: 42000, Aframax: 28000 }[c.vesselType]),
      isOnTime: demDays === 0,
    };
  });

  const cduCharge: Record<string, Record<string, number[]>> = {};
  for (const u of facility.cdus) {
    cduCharge[u.cduId] = {};
    for (const g of input.items.map((i) => i.itemId)) {
      cduCharge[u.cduId][g] = (u.lpTargetByGrade?.[g] ?? new Array(H).fill(0)).slice(0, H);
    }
  }

  const tankInventory: Record<string, Record<string, number[]>> = {};
  for (const t of facility.tanks) {
    const g = t.crudeGrade ?? '';
    if (!g) continue;
    const it = (facility.items ?? []).find((x) => x.itemId === g);
    const sameGrade = facility.tanks.filter((x) => x.crudeGrade === g).length || 1;
    let inv = t.currentVolumeBbls;
    const row: number[] = [];
    for (let day = 0; day < H; day++) {
      inv += ((it?.arrivalsBblsByDay?.[day] ?? 0) / sameGrade) - ((it?.demandBblsByDay?.[day] ?? 0) / sameGrade);
      inv = Math.max(0, Math.min(inv, t.capacityBbls));
      row.push(Math.round(inv));
    }
    tankInventory[t.tankId] = { [g]: row };
  }

  const totalDem = schedules.reduce((s, x) => s + x.demurrageCostUsd, 0);
  const arrivals14 = cargoes.filter(
    (c) => (new Date(c.laycanStart).getTime() - start.getTime()) / 86400000 >= 0 &&
            (new Date(c.laycanStart).getTime() - start.getTime()) / 86400000 < 14
  ).length;
  const blendViolations = facility.cdus.reduce(
    (n, u) => n + (u.blendConstraints ?? []).filter((b) => b.status === 'VIOLATED').length,
    0
  );

  const kpis = {
    throughputBpd: 150500,
    daysOfCoverHs: 9.1,
    daysOfCoverLs: 10.4,
    scheduledArrivalsNext14d: arrivals14,
    openDemurrageRiskUsd: totalDem || 168000,
    grmUsdPerBbl: 7.12,
    grmUsdAnnualizedMM: 391.3,
    opportunityUsdAnnualizedMM: 16.0,
    blendViolationCount: blendViolations,
    objectiveValue: 3350000,
    objectiveMode: 'Balanced' as const,
  };

  return {
    id: 'OUT_ASPR_20260414_094212',
    status: 'fallback',
    objectiveValue: 3350000,
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
