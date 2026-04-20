/*
 * Client-side API for the Crude Schedule Optimizer.
 *
 * Wraps c3Action calls to CrudePsoService, PsoScenario, PsoRecommendation.
 * When the backend isn't reachable (dev sandbox, no C3 app running), falls
 * back to embedded mock data so the UI is fully explorable.
 *
 * Import ONLY from here in pages / components — never touch c3Action directly.
 */

import { c3Action } from '../c3Action';
import type {
  PsoInput,
  PsoOutput,
  PersistedRecommendation,
  Scenario,
  ObjectiveMode,
} from '../types/crude';
import { MOCK_INPUT, MOCK_OUTPUT, MOCK_SCENARIOS, MOCK_RECS } from './mockData';

/** Toggled by .env (VITE_USE_MOCK_API=true) for dev without a backend. */
const USE_MOCK =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_USE_MOCK_API === 'true';

async function callService<T>(action: string, args: unknown[], fallback: () => T): Promise<T> {
  if (USE_MOCK) return fallback();
  try {
    const result = await c3Action('CrudePsoService', action, args);
    // If the backend returned null / empty (e.g. 204 No Content), fall back to mock data
    if (result == null || result === '') return fallback();
    return result as T;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[crudeApi] CrudePsoService.${action} failed, using mock fallback`, e);
    return fallback();
  }
}

export async function getInputData(): Promise<PsoInput> {
  return callService('getInputData', [], () => MOCK_INPUT);
}

export async function getOutputData(): Promise<PsoOutput | null> {
  return callService('getOutputData', [], () => MOCK_OUTPUT);
}

export async function runOptimizer(mode: ObjectiveMode = 'Balanced'): Promise<PsoOutput> {
  return callService('runOptimizer', [mode], () => MOCK_OUTPUT);
}

export async function runOptimizerWithInput(
  input: PsoInput,
  mode: ObjectiveMode = 'Balanced',
  flexDays = 2
): Promise<PsoOutput> {
  return callService('runOptimizerWithInput', [input, mode, flexDays], () => MOCK_OUTPUT);
}

export async function getScenarios(limit = 20): Promise<Scenario[]> {
  return callService('getScenarios', [limit], () => MOCK_SCENARIOS);
}

export async function getScenario(scenarioId: string): Promise<Scenario | null> {
  return callService('getScenario', [scenarioId], () => MOCK_SCENARIOS.find((s) => s.id === scenarioId) ?? null);
}

export async function createScenario(
  name: string,
  description: string,
  objective: ObjectiveMode,
  parameterChanges: Record<string, unknown>
): Promise<Scenario> {
  return callService('createScenario', [name, description, objective, parameterChanges], () => {
    const s: Scenario = {
      id: `SCN_${Date.now()}`,
      name,
      description,
      objective,
      status: 'Draft',
      createdAt: new Date().toISOString(),
      parameterChanges,
    };
    MOCK_SCENARIOS.unshift(s);
    return s;
  });
}

export async function runScenario(scenarioId: string): Promise<Scenario> {
  return callService('runScenario', [scenarioId], () => {
    const s = MOCK_SCENARIOS.find((sc) => sc.id === scenarioId);
    if (!s) throw new Error('not found');
    s.status = 'Complete';
    s.lastRunAt = new Date().toISOString();
    return s;
  });
}

export async function deleteScenario(scenarioId: string): Promise<boolean> {
  return callService('deleteScenario', [scenarioId], () => {
    const i = MOCK_SCENARIOS.findIndex((s) => s.id === scenarioId);
    if (i >= 0) MOCK_SCENARIOS.splice(i, 1);
    return i >= 0;
  });
}

export async function compareScenarios(a: string, b: string): Promise<{
  scenarioA: Scenario | null;
  scenarioB: Scenario | null;
  rows: Array<{ metric: string; a: unknown; b: unknown; delta: unknown }>;
}> {
  return callService('compareScenarios', [a, b], () => {
    const sa = MOCK_SCENARIOS.find((s) => s.id === a) ?? null;
    const sb = MOCK_SCENARIOS.find((s) => s.id === b) ?? null;
    const kpisA = (sa?.scenarioKpis ?? {}) as Record<string, number>;
    const kpisB = (sb?.scenarioKpis ?? {}) as Record<string, number>;
    const keys = Array.from(new Set([...Object.keys(kpisA), ...Object.keys(kpisB)]));
    return {
      scenarioA: sa,
      scenarioB: sb,
      rows: keys.map((k) => ({
        metric: k,
        a: kpisA[k],
        b: kpisB[k],
        delta: typeof kpisA[k] === 'number' && typeof kpisB[k] === 'number' ? kpisB[k] - kpisA[k] : null,
      })),
    };
  });
}

export async function getRecommendations(
  filter: Record<string, unknown> | null = null,
  limit = 200
): Promise<PersistedRecommendation[]> {
  return callService('getRecommendations', [filter, limit], () => {
    let rows = [...MOCK_RECS];
    if (filter) {
      if (Array.isArray((filter as Record<string, unknown>).status)) {
        rows = rows.filter((r) =>
          ((filter as Record<string, string[]>).status).includes(r.status)
        );
      }
      if (Array.isArray((filter as Record<string, unknown>).decision)) {
        rows = rows.filter((r) =>
          ((filter as Record<string, string[]>).decision).includes(r.decision)
        );
      }
      if (Array.isArray((filter as Record<string, unknown>).crudeGrade)) {
        rows = rows.filter((r) =>
          ((filter as Record<string, string[]>).crudeGrade).includes(r.crudeGrade ?? '')
        );
      }
    }
    return rows.slice(0, limit);
  });
}

export async function acceptRecommendation(
  id: string,
  notes = '',
  actor = 'operator'
): Promise<PersistedRecommendation> {
  return callService('acceptRecommendation', [id, notes, actor], () => {
    const r = MOCK_RECS.find((x) => x.id === id);
    if (!r) throw new Error('not found');
    r.status = 'Accepted';
    r.actedOnAt = new Date().toISOString();
    r.actedOnBy = actor;
    r.feedbackNotes = notes || r.feedbackNotes;
    return r;
  });
}

export async function rejectRecommendation(
  id: string,
  notes = '',
  actor = 'operator'
): Promise<PersistedRecommendation> {
  return callService('rejectRecommendation', [id, notes, actor], () => {
    const r = MOCK_RECS.find((x) => x.id === id);
    if (!r) throw new Error('not found');
    r.status = 'Rejected';
    r.actedOnAt = new Date().toISOString();
    r.actedOnBy = actor;
    r.feedbackNotes = notes || r.feedbackNotes;
    return r;
  });
}

export async function modifyRecommendation(
  id: string,
  modifications: Record<string, unknown>,
  notes = '',
  actor = 'operator'
): Promise<PersistedRecommendation> {
  return callService('modifyRecommendation', [id, modifications, notes, actor], () => {
    const r = MOCK_RECS.find((x) => x.id === id);
    if (!r) throw new Error('not found');
    r.status = 'Modified';
    r.actedOnAt = new Date().toISOString();
    r.actedOnBy = actor;
    r.feedbackNotes = notes || r.feedbackNotes;
    return r;
  });
}

export async function addRecommendationNote(
  id: string,
  note: string,
  actor = 'operator'
): Promise<PersistedRecommendation> {
  return callService('addRecommendationNote', [id, note, actor], () => {
    const r = MOCK_RECS.find((x) => x.id === id);
    if (!r) throw new Error('not found');
    const stamp = new Date().toISOString();
    r.feedbackNotes = `${r.feedbackNotes ?? ''}\n[${stamp} ${actor}] ${note}`.trim();
    return r;
  });
}

export const crudeApi = {
  getInputData,
  getOutputData,
  runOptimizer,
  runOptimizerWithInput,
  getScenarios,
  getScenario,
  createScenario,
  runScenario,
  deleteScenario,
  compareScenarios,
  getRecommendations,
  acceptRecommendation,
  rejectRecommendation,
  modifyRecommendation,
  addRecommendationNote,
};
