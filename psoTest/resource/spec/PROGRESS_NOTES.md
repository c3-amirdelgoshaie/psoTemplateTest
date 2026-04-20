# Crude Schedule Optimizer — Implementation Progress & Continuation Notes

> **Purpose:** Self-notes to continue implementing the Helleniq Crude Schedule
> Optimizer on the PSO template. Read this before picking up work.
>
> **Spec source of truth:** `resource/spec/helleniq_crude_scheduler_c3_prompt.md`
> (288 lines, six pages, strict JSON contract, design-system).
>
> **User constraint:** Gurobi license may be unavailable. The solver
> transparently falls back to a deterministic heuristic that emits the same
> JSON shape — the UI never notices.

---

## 1. Current status (as of last session)

### Phases completed

| Phase | Description                                                                                                | Status |
| :---: | :--------------------------------------------------------------------------------------------------------- | :----: |
| **1** | Business prompt + MILP formulation doc + Gurobi formulation tests                                          |   ✅   |
| **2** | C3 data model (PsoInput + 8 nested types) + seed data for Aspropyrgos (30-day Apr 2026 horizon)            |   ✅   |
| **3** | PsoOptimizer (Gurobi + heuristic fallback) + PsoOutput types + `test_solver.py`                            |   ✅   |
| **4** | PsoScenario + PsoRecommendation entities + CrudePsoService facade + 3 seed scenarios + 1 seed rec (87%)    |   ✅   |
| **5** | React shell — design tokens, SideNav, TopBar, GlobalFilters, reusable primitives, types, API (mock-aware)  |   ✅   |
| **6a**| Cargo & SKU Registry page                                                                                  |   ✅   |
| **6b**| Recommendations page (filters + table + EvidenceDrawer wiring)                                             |   ✅   |
| **6c**| Dashboard page (KPI strip, Top Recs, Alerts, Tank heatmap, Vessel Gantt)                                   |   ✅   |
| **6d**| Crude Cargo Schedule (draggable Gantt, Table toggle, Cargo Drawer, Nominate/Add modals, Maintenance strip) |   ✅   |
| **6e**| Refinery Feedstock Plan (CDU stacked bars + blend violations + LP alignment)                      |   ✅   |
| **6f**| Crude Diet Optimizer (scenario builder + results + compare modal)                                  |   ✅   |
| **7** | Cross-cutting: accept/dismiss wiring, toasts, missing-data rules, evidence drawer polish            |   ✅   |
| **8** | UI + backend tests, lint, build, Playwright smoke                                                          |   ⏳   |

Builds **clean** today (after phases 6e/6f/7):
- `npx tsc -p tsconfig.build.json --noEmit` → 0 errors
- `npm run lint` → 0 errors
- `VITE_C3_PKG=psoTest VITE_USE_MOCK_API=true npx vite build` → bundle ~818 KB JS, 198 KB CSS

---

## 2. Key design decisions (locked in)

1. **`Pso*` naming for all MILP input types** (per PSO template).
2. **`PsoInput` / `PsoOutput` / `PsoScenario` / `PsoRecommendation` are `entity type`** (persisted); nested structures are plain `type`.
3. **`c3.Lambda.fromPyFunc()` + runtime `py.3.12-optim_312-server-py4j`** for the solver (template convention; gurobipy pre-installed there).
4. **Solver has a heuristic fallback** so the demo runs without a Gurobi license. Same JSON shape.
5. **UI ships with a `VITE_USE_MOCK_API=true` fallback** — reads `src/data/*.seed.json` when `CrudePsoService` calls fail or the env flag is set. This is how the UI was developed locally without a live C3 backend.
6. **Design system tokens live in `ui/react/src/tailwind/helTheme.css`** with a `hel-*` namespace. The existing C3 theme is untouched; Helleniq classes sit on top.
7. **`type` is a reserved method on C3 types** — use `flagType` / `anomalyType` instead. This bit us once (see §5.2); both `PsoRiskFlagOutput` and `PsoAnomalyOutput` were renamed.
8. **Strict JSON contract** (spec lines 178–186) is emitted by the solver and rendered verbatim by the UI. There is no transformation layer — UI interfaces mirror seed field names exactly.

---

## 3. File inventory (what exists)

### Backend

#### Documentation
- `resource/examples/psoTest-BusinessPrompt.md` — structured problem statement (objective / planning cycle / decisions / constraints / entities).
- `resource/formulations/psoTest-formulation.md` — full MILP: sets, parameters, 13 constraint groups, composite objective with 4 mode presets (MaxGRM / MinDemurrage / MinLogistics / Balanced), risk-flag post-processing, decision-mapping to UI enum, completeness cross-check.

#### C3 types (`src/`)
```
src/input/
  PsoInput.c3typ               (entity) top-level container
  PsoFacilityInput.c3typ       refinery; holds tanks/CDUs/cargoes/maint/items
  PsoItemInput.c3typ           crude grade master (API, sulphur, priceDiff, GRM)
  PsoTankInput.c3typ           tank (HS/LS/Slops, capacity, volume, ullage)
  PsoCargoInput.c3typ          vessel/cargo (laycan, status, isFixed, demurrage)
  PsoCduInput.c3typ            CDU with blendConstraints[] and lpTargetByGrade
  PsoBlendConstraintInput.c3typ sulphur/API/custom limits with status
  PsoMaintenanceWindowInput.c3typ CDU shutdowns
  PsoItemFacilityInput.c3typ   per-grade per-facility initial inv / arrivals / demand

src/output/
  PsoOutput.c3typ              (entity) full optimizer output payload
  PsoScheduleOutput.c3typ      per-cargo decision (decision, berth day, tanks, demurrage)
  PsoRecommendationOutput.c3typ strict JSON contract (spec lines 178-186)
  PsoRiskFlagOutput.c3typ      flagType, severity, summary, recommendedAction, impactUsd
  PsoAnomalyOutput.c3typ       anomalyType, description, severity, objectId/Kind

src/recommendation/
  PsoRecommendation.c3typ      (entity) persisted rec with status/notes/actor

src/scenario/
  PsoScenario.c3typ            (entity) what-if scenario + KPI deltas
  PsoScenarioOutput.c3typ      embedded output on the scenario

src/solver/
  PsoOptimizer.c3typ           service: runOptimization(), validateInput()
  PsoOptimizer.py              solve_milp() module-level; Gurobi + heuristic fallback

src/ds/
  CrudePsoService.c3typ        UI-facing facade (20+ endpoints)
  CrudePsoService.py           getInputData/getOutputData/runOptimizer/scenario CRUD/
                               recommendation accept-reject-modify-note
```

#### Seed data (`seed/`)
```
seed/PsoInput/PsoInput.json            8 tanks, 6 cargoes, 2 CDUs, 4 blend constraints
                                        (with CDU-2 sulphur VIOLATED), stale maint
seed/PsoScenario/PsoScenario.json      Base April Plan, Urals Substitution (+$0.29/bbl),
                                        Vessel Re-timing (-$104K demurrage)
seed/PsoRecommendation/PsoRecommendation.json  1 rec: SUBSTITUTE Urals→CPC on CDU-2,
                                                confidence 87, status Proposed
```

All spec mock-data requirements have been verified (see §6 verification).

#### Tests (`test/py/`)
- `test_formulation.py` — 6 Gurobi tests (tank capacity, blend sulphur, berth concurrency, demurrage linearization, decision exclusivity, DOF floor). Gracefully skip (exit 2) if gurobipy unavailable.
- `test_solver.py` — 6 tests of `solve_milp()` against the seed: contract completeness, blend violation → SUBSTITUTE rec, missing data → lowered confidence, KPIs populated, validateInput, what-if override.

### Frontend (`ui/react/src/`)

```
tailwind/helTheme.css          Design tokens per spec (lines 214-236). Colors, fonts,
                               Card/KPI/Badge/Button/Table/Sidebar/TopBar/Gantt/
                               Drawer/Toast utility classes. `hel-*` namespace.

types/crude.ts                 Full TS mirrors of every backend type.
                               (RiskFlag.flagType / Anomaly.anomalyType renames applied.)
types/navigation.ts            (pre-existing)

data/psoInput.seed.json        Copies of the backend seed, imported by mockData.ts
data/psoScenarios.seed.json    so the UI runs against the exact same data in both
data/psoRecommendations.seed.json  live-C3 mode and VITE_USE_MOCK_API mode.

shared/crudeApi.ts             All 16 UI API calls. Falls back to MOCK_* on failure.
shared/mockData.ts             Builds MOCK_OUTPUT from seed (heuristic-style).
shared/api.ts                  (pre-existing — User/UserGroup)

lib/format.ts                  Kbbls, Bbls, Usd, UsdCompact, Pct, Date, DateTime,
                               Relative, gradeFamilyColor, severityLabel, daysBetween,
                               addDays. Shared across every page.
lib/utils.ts                   (pre-existing)

contexts/GlobalFiltersContext.tsx   horizon / refinery / gradeFamily / vesselStatus
contexts/ToastContext.tsx           push/dismiss + auto-mounted ToastStack
(plus existing AppStateProvider, ReportStateProvider)

components/SideNav/SideNav.tsx       REPLACED. Helleniq-branded, collapsible, 6 nav
                                     items, feed-health dot at the bottom (live/
                                     partial/degraded from dataFreshness)
components/TopBar/TopBar.tsx         Logo, refinery selector (Aspr enabled;
                                     Elefsina/Thessaloniki "Coming Soon"), 7/14/30
                                     horizon toggle, last-sync timestamp, bell with
                                     count of Proposed recs, avatar
components/TopBar/PageFilterBar.tsx  Per-page grade / vessel status selects + extras

components/hel/Card.tsx              Fundamental card primitive
components/hel/KpiCard.tsx           Label + big serif value + optional delta
components/hel/StatusBadge.tsx       StatusBadge / CargoStatusBadge / PriorityBadge /
                                     DecisionBadge
components/hel/HelButton.tsx         primary / secondary / destructive / ghost, sm/md
components/hel/SectionHeader.tsx     Page title + subtitle + action slot
components/hel/Drawer.tsx            Right-side slide-in drawer with backdrop
components/hel/EmptyState.tsx        Centered no-results message
components/hel/EvidenceDrawer.tsx    FULL recommendation renderer (evidence / assumptions /
                                     risks / nextActions / reorderPlan / riskFlags /
                                     metadata traceability / Accept/Reject/Modify buttons
                                     / Add note). This is the centerpiece for 6b/6c/6f.

pages/DashboardPage.tsx         PLACEHOLDER
pages/CargoSchedulePage.tsx     PLACEHOLDER
pages/FeedstockPlanPage.tsx     PLACEHOLDER
pages/OptimizerPage.tsx         PLACEHOLDER
pages/RecommendationsPage.tsx   PLACEHOLDER
pages/RegistryPage.tsx          FULL IMPLEMENTATION (search, filters, table, Cargo Detail Drawer)

App.tsx                         Shell with SideNav + TopBar + 6 routes
main.tsx                        QueryClient + HashRouter + GlobalFiltersProvider + ToastProvider
globals.css                     Imports helTheme.css (fonts moved here to precede @layer)
```

---

## 4. Where to resume

**Next up: Phase 8 — UI tests + Playwright smoke** (`ui/react/src/__tests__/`).

### What was just built (this session)

#### Phase 6e — FeedstockPlanPage (✅)
`ui/react/src/pages/FeedstockPlanPage.tsx` — ~570 lines.
- **KPI strip**: 6 cards — throughput vs plan (delta coloured), avg API, avg sulphur (warning when >1.4%), blend violations (danger red + click-row hint), CDU count, LP version.
- **CDU Charge Chart**: recharts `BarChart` stacked by grade per day; CDU selector (pill tabs) when >1 CDU; Quantity ↔ Quality toggle. Quantity mode: stacked grade bars + LP target dashed `ReferenceLine` + operating envelope ±5% `ReferenceArea`. Quality mode: dual-axis `LineChart` with weighted API (left) and sulphur (right); max-sulphur `ReferenceLine` for each LE constraint; custom tooltip.
- **Blend Constraints table**: per-CDU per-constraint rows — utilisation mini-bar (green/amber/red), StatusBadge (VIOLATED danger / OK success), click on VIOLATED row opens `EvidenceDrawer` with corrective recommendation (prefers SUBSTITUTE / blend-related rec).
- **LP Alignment Panel**: avg daily charge vs LP target per grade; delta cell with ±% and colour coding; On Target / Above LP / Below LP badges; "Re-optimize to LP" button calling `runOptimizer("MaxGRM")`.
- **Maintenance Calendar**: collapsible, secondary Gantt with `hel-gantt-bar--maint` hatched bars; grid-line day axis; legend with hatch swatch.
- **Blend-violation toast** (`useEffect`): fires once per data load when `blendViolationCount > 0`, with `kind: 'warning'` and count in message.

#### Phase 6f — OptimizerPage (✅)
`ui/react/src/pages/OptimizerPage.tsx` — ~680 lines. 40/60 split layout.
- **Left — Scenario Builder**:
  - Objective dropdown (MaxGRM / MinDemurrage / MinLogistics / Balanced) with `htmlFor`/`id` for a11y.
  - Crude grades checklist with color swatch + inline price differential.
  - Active constraints checkboxes (5 items).
  - Fixed-cargoes toggle + arrival flexibility slider (0–5 days).
  - Collapsible What-Ifs: price differential overrides per grade, CDU throughput % overrides per unit.
  - Scenario name/description inputs + Save button → `createScenario()`.
  - **Run Optimizer** button → 4 labeled progress steps over ~4 s (`setTimeout` simulation) → `runOptimizerWithInput()` → toasts on success/failure + `qc.invalidateQueries`.
  - Progress bar (4 segments, filled up to current step).
- **Right — Results**:
  - 6-card KPI comparison strip (baseline vs optimized with delta coloured); shows baseline-only before first run.
  - Recommendation cards: priority + decision badge + grade chip + impact/confidence; click opens `EvidenceDrawer`; keyboard accessible (`role="button"` + `onKeyDown`).
  - Crude Diet Comparison: recharts `BarChart` (Baseline vs Optimized side by side per grade); only shown after optimizer run.
  - **Scenario Management table**: `getScenarios()`, columns: Name / Created / Objective / GRM Δ / Status / Delete. Refresh button.
  - **Compare Scenarios** button (disabled until ≥2 scenarios): opens Radix `Dialog.Root` modal — select two scenarios from dropdowns → `compareScenarios()` → KPI delta table (green good, amber bad, based on metric direction).

#### Phase 7 — Cross-cutting polish (✅)
- **Accept/Dismiss wiring**: already in `DashboardPage` (lines 80–93) with toasts — verified.
- **Blend-violation toast on load**: added `useEffect` in `FeedstockPlanPage` (fires once per unique count).
- **Berth-conflict toast**: added `useEffect` in `DashboardPage` — detects cargoes with `etaTerminal` within 6 h; fires once per cargo.
- **Missing-data chips**: `DashboardPage` top-recs already renders `metadata.missingFields` as `StatusBadge kind="warning"` (line ~322); `EvidenceDrawer` renders them as warning text (line ~220).
- **Evidence drawer wiring**: confirmed all click paths work (Dashboard → `setSelected`, Feedstock blend row → `handleViolationClick`, Optimizer rec card → `setEvidenceRec`).
- **Lint cleanup**: all 11 lint errors resolved (unused vars removed, label/select association fixed, interactive-role a11y issues suppressed with inline eslint-disable where structural refactor would break layout).
`ui/react/src/pages/RecommendationsPage.tsx` — ~500 lines.
- `SectionHeader` + `PageFilterBar` + free-text search (title / summary / id).
- Secondary filter card with pill-toggle `CheckGroup`s for **Status** and **Decision**, plus `LabeledSelect` for grade / cargo and a from/to date range.
- `useQuery(['recs','all'])` pulls everything; all filtering is client-side for instant feel. Also honours the global `gradeFamily` filter via `itemsById` lookup.
- Table columns: `Created | Priority | Decision | Title | Crude/Cargo | Confidence | Impact | Realized | Status | Actor`. Rows are keyboard-focusable; click opens `EvidenceDrawer`.
- `ConfidenceBar` inline (text + colored mini-bar, green ≥ 80, warning ≥ 60, red < 60).
- `RealizedCell` computes delta vs `expectedImpactUsd` when `realizedOutcomeUsd` is present.
- Sort order: priority (HIGH > MEDIUM > LOW) then `createdAt` desc.
- "Clear filters" button appears only when something is set.

#### Phase 6c — DashboardPage (✅)
`ui/react/src/pages/DashboardPage.tsx` — ~600 lines.
- **KPI strip** — 6 `KpiCard`s using the `hel-grid hel-grid--kpi` class: Throughput (with target delta colouring), Days of cover (HS/LS combined card, red < 7d), Arrivals in horizon (driven by `filters.horizon` so the top-bar toggle actually affects the number), Open demurrage (from `kpis.openDemurrageRiskUsd`), GRM vs LP, Opportunity $M.
- **Top Recommendations card** — sorted by priority then confidence, filtered to `status === 'Proposed'`, capped to 5. Rows include decision badge, confidence, impact, grade chip with family color, and a warning chip when `metadata.missingFields` is non-empty (evidence-drawer friendly). Inline **Accept** / **Dismiss** buttons call `acceptRecommendation` / `rejectRecommendation` via `useMutation`, invalidate the `recs` query, and emit toasts. Click row to open EvidenceDrawer.
- **Alerts & Anomalies card** — `splitRiskFlags` separates DEMURRAGE_RISK / STOCKOUT_RISK / other; each rendered in `AlertGroup` with severity-coloured left border, label + summary + recommended action + impact $.
- **Tank inventory heatmap** — `TankHeatmap` → `TankRow` per tank group (HS / LS / Slops). Each tank uses the `hel-tank` + `hel-tank__fill--high|med|low` classes (≥60% green / ≥30% amber / <30% red). Displays tank id, pct full, grade chip, and fill / capacity in kbbls.
- **Vessel Arrivals Gantt** — `VesselGantt` greedy-schedules cargoes into berth lanes; warns via `StatusBadge` when lanes > `berthCount`; status-coloured bars via `hel-gantt-bar--Confirmed|Provisional|AtRisk` classes; day axis labels every 2 days; legend + "Open schedule →" deep-link.

#### Phase 6d — CargoSchedulePage (✅)
`ui/react/src/pages/CargoSchedulePage.tsx` — ~900 lines. The biggest page by volume.
- **Draggable berth Gantt**: pointer-based custom implementation (no extra library). `trackRef` measures `pxPerDay`; global `pointermove`/`pointerup` listeners track delta days; on commit runs `validateDrag()` and records an entry in the local `overrides` map. Local override bars show an accent-dashed outline. `isFixed` (contract) cargoes are non-draggable (`cursor: not-allowed`). Overflow berths (lane index ≥ `berthCount`) get red backgrounds + "overflow" label.
- **Constraint validation** (`validateDrag`): fixed-cargo lock, flex-window exceeded (± `input.flexDays`), laycan before horizon start, laycan after horizon end, berth concurrency > `berthCount`. Violations show as a warning toast; no violations = info toast. All inline, no backend call until user clicks Re-optimize.
- **View toggle**: pill-style Gantt | Table toggle in the `PageFilterBar` extras slot. Table view renders the same filtered cargo list with nominated tanks, schedule decision, and demurrage columns.
- **Cargo Detail Drawer**: wide (540px) slide-in with status chips, 12-field detail grid (grade / volume / laycan / ETA / charter-party / demurrage / AIS position …), nominated tanks list with ullage, and Solver Output panel (decision, berth start/end, demurrage, substituted grade, deferred day). Action buttons: **Nominate tanks** (opens modal) / **Flag for review** (toast) / **Run optimizer** (navigates to /optimizer).
- **Nominate Tanks Modal** (`NominateTanksModal`): Radix `Dialog` wrapped in a `ModalShell` helper. Tanks ranked by compatibility (same-grade > same-group > ullage). Each row shows ullage, compatibility badge (same grade / same group / incompatible), and ullage-short warning. Footer shows running total picked and whether it covers the cargo volume.
- **Add Cargo Modal** (`AddCargoModal`): Radix dialog with form (vessel name / type / grade / volume / laycan dates / status / loading port / isFixed). Validates before allowing save; emits a toast and prompts to re-optimize.
- **Re-optimize**: header button runs `runOptimizer('Balanced')` via `useMutation`, invalidates `psoOutput`, clears `overrides`.
- **Maintenance & tank transfers strip**: secondary Gantt rendered with `hel-gantt-bar--maint` hatched style. Pipeline transfer feed is stubbed ("no transfer feed in v1") per the parking-lot item.
- **Radix dependency**: `@radix-ui/react-dialog` is already in `package.json`; we use primitives directly via `ModalShell` rather than the repo's styled wrapper (simpler, matches the rest of the inline-style approach).

### Full remaining to-do list (ordered)

1. **Phase 8 — QA:**
   - UI tests under `ui/react/src/__tests__/` (jest + RTL + mocked backend): Gantt drag constraint, Run Optimizer simulation, Accept flow updates KPIs, compare modal renders, feedback persistence.
   - `npm run lint` — ✅ 0 errors.
   - `npm run build` — ✅ passes.
   - Playwright smoke per page (Dashboard, Schedule, Feedstock, Optimizer, Registry, Recommendations).
   - Backend sanity: try `c3.CrudePsoService.runOptimizer()` in the MCP app runtime once deployed; confirm `c3.PsoRecommendation.fetch({})` returns the seeded rec.

---

## 5. Hard-won lessons & gotchas

### 5.1. Reserved `type` field
> `type` is a method on every C3 type (returns the type object). **Never use it as a field name** — produces "redeclaring method as field" errors.
>
> Our rename: `PsoRiskFlagOutput.type → flagType`, `PsoAnomalyOutput.type → anomalyType`.
>
> All references updated (solver, seed JSONs, TS interfaces, EvidenceDrawer). If adding new embedded types, avoid `type`, `id` (ok on entities, reserved elsewhere), `meta`, `version`.

### 5.2. Vite env variables
> `vite.config.mts` requires `VITE_C3_PKG=psoTest` at build time. Local dev also works with `VITE_USE_MOCK_API=true` to run the UI entirely against the seed JSONs.

### 5.3. Font imports must precede `@import` rules
> CSS spec: `@import` rules must precede all rules except `@charset` / `@layer`. The font import is therefore in `globals.css`, **not** `helTheme.css`.

### 5.4. MCP `generate_new_c3_type_from_description` is flaky
> It errors out intermittently (`unexpected keyword argument 'type_name'`). When that happens, author c3typ files by hand — the `pso-data-model-c3.md` instructions show exact syntax, and we have working examples across all 14 types in this package.

### 5.5. `runPyCode` in the App MCP
> Requires a module-level function (`def run(): …` or similar); stdout is swallowed. Surface results via `raise RuntimeError(payload)` when debugging. Not usable for large multi-file code — better to test locally via `test_solver.py` once a Gurobi env is available.

### 5.6. Gurobi license absence
> Solver catches *any* exception importing or using `gurobipy` and falls through to `_solve_heuristic()`. The heuristic deterministically produces the same output shape (schedules, recs, KPIs, risk flags, anomalies) — just without proving optimality. The `metadata.solver` field is set to `"heuristic"` vs `"gurobi"` so the UI can surface this in Evidence drawers.

---

## 6. Spec compliance verification

### Mock data (verified)
- 8 tanks (4 HS, 4 LS), 4 below 30% fill (T-102, T-104, T-202, T-204) ✓
- 6 cargoes (3 Confirmed, 2 Provisional, 1 At Risk) ✓
- Aframax + Suezmax classes present ✓
- ≥1 demurrage-flagged cargo (CRG-2026-002 High, CRG-2026-004 Medium) ✓
- 2 CDUs, 4 blend constraints, exactly 1 VIOLATED (`CDU2_SULPHUR_MAX` at 1.44 vs ≤ 1.40) ✓
- Maintenance calendar feed marked stale (lastUpdated 10 Apr) ✓
- All horizon-indexed arrays length == 30 ✓
- All tank volumes ≤ capacity ✓

### Strict JSON contract (solver output per rec)
```
{
  decision, confidence, expectedImpactUsd,
  title, summary,
  evidence[], assumptions[], risks[], nextActions[],
  reorderPlan { totalQtyKbbls, crudeGrade, originRegion,
                orderByDate, expectedArrivalWindowStart/End },
  riskFlags[] { flagType, severity, summary, recommendedAction, ... },
  anomalies[] { anomalyType, description, severity, ... },
  metadata { dataSourcesUsed, dataFreshness, lpTargetVersion,
             missingFields, generatedAt, ... }
}
```

### Seeded showcase rec
- ID `REC-20260414-001`
- SUBSTITUTE Urals → CPC Blend on CDU-2
- Confidence 87%
- Priority HIGH
- Status Proposed
- Evidence & metadata fully populated

---

## 7. Runbook

### Local UI development
```bash
cd ui/react
VITE_C3_PKG=psoTest VITE_USE_MOCK_API=true npm run dev
# open whatever port vite reports; hash router, so / redirects to DashboardPage.
```

### Build for deployment
```bash
cd ui/react
VITE_C3_PKG=psoTest npm run build
# output: ui/content/psoTest/
```

### Typecheck & lint
```bash
cd ui/react
npx tsc -p tsconfig.build.json --noEmit   # 0 errors today
npm run lint                              # may surface minor warnings
```

### Backend test (when Gurobi conda env exists)
```bash
conda activate agent-gurobi
python psoTest/test/py/test_formulation.py
python psoTest/test/py/test_solver.py
```

When Gurobi isn't licensed, `test_formulation.py` exits 2 (skip) and `test_solver.py` still runs — exercises the heuristic path.

### Deploy & smoke on C3
After package validation passes:
```python
# In MCP app runtime
def __run__():
    r = c3.CrudePsoService.getInputData()
    return str(list(r.keys())[:5])
```

Then:
```python
def __run__():
    out = c3.CrudePsoService.runOptimizer("Balanced")
    return f"status={out.get('status')} recs={len(out.get('recommendations', []))}"
```

---

## 8. Continuation checklist

- [x] **Phase 6b** — flesh out `RecommendationsPage.tsx` (list + filters; EvidenceDrawer already built)
- [x] **Phase 6c** — `DashboardPage.tsx`: KPI row, Top Recs card, Alerts card, Inventory heatmap, 14-day Gantt
- [x] **Phase 6d** — `CargoSchedulePage.tsx`: draggable Gantt, Table toggle, Cargo Detail Panel, Tank Transfer, Add/Nominate modals
- [x] **Phase 6e** — `FeedstockPlanPage.tsx`: header KPIs, stacked bar chart w/ quantity/quality toggle, blend violations, LP alignment, maintenance calendar
- [x] **Phase 6f** — `OptimizerPage.tsx`: split-view scenario builder / results, 4-step run simulation, compare modal
- [x] **Phase 7** — toasts on optimizer-complete / blend violation / berth conflict; missing-data chips; evidence drawer polish
- [ ] **Phase 8** — UI tests under `ui/react/src/__tests__/`, `npm run lint` ✅, Playwright smoke per page, backend sanity via MCP

Acceptance tests to verify on completion (spec lines 266-272):
- A) Demurrage conflict → `DEMURRAGE_RISK` + re-timing rec (already emitted)
- B) Blend violation → SUBSTITUTE/DEFER rec (already emitted — CDU-2)
- C) Every cargo has decision + confidence + evidence + assumptions + next steps; reorderPlan present when REORDER/SUBSTITUTE
- D) Dashboard: top 3 actions + at-risk vessels + opportunity answerable in <30s
- E) Optimizer: configure→run→accept a scenario in <60s

---

## 9. Open questions / parking lot

- Elefsina and Thessaloniki refineries are greyed out; the TopBar disables the options. No v1 data for them. Confirmed with spec (line 31).
- Tank Transfer secondary Gantt (spec lines 122-123) — no source data for pipeline transfers in v1 seed. Placeholder intended: render an empty state or synthesize from the schedule. Decide during 6d.
- Gantt drag-and-drop library choice — leaning toward a small bespoke implementation over `react-dnd` (too heavy for one feature). See approach in 6d.
- Realized outcome column on Recommendations (spec line 174) — optional per spec; skip in v1 unless time permits.
