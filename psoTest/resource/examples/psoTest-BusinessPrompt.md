# Business Prompt: Helleniq Energy Crude Schedule Optimizer (v1)

You are building an internal enterprise decision-support application for
**Helleniq Energy**, a Greek petroleum company operating three refineries
(Aspropyrgos, Elefsina, Thessaloniki) with ~350,000 bpd combined throughput.
The v1 scope is limited to **Aspropyrgos refinery (~150,500 bpd)**.

The app is the front-end interface for an AI/optimization engine. It tells
crude procurement managers, logistics schedulers, and refinery planners
**which crude to buy, how much, and when**, while preventing demurrage and
stockout risk and keeping the refinery aligned with the LP (Linear Program)
target.

## Business Objective

**Primary Goal:** Maximize net refinery margin over the planning horizon by
jointly deciding crude procurement, vessel scheduling, tank nomination, and
CDU charge.

**Composite Objective (user-selectable on the Optimizer page):**

- `MaxGRM`        — maximize Gross Refining Margin ($/bbl)
- `MinDemurrage`  — minimize expected demurrage cost ($)
- `MinLogistics`  — minimize freight + pipeline + berth fees ($)
- `Balanced`      — weighted blend of the three (default)

**Success Metrics:**

- GRM uplift vs baseline LP target ($/bbl and $M annualized)
- Demurrage cost avoided ($)
- Days-of-cover never falls below 7 days for any tank group (HS / LS)
- Number of CDU blend constraint violations = 0
- Operator decision time on the Dashboard < 30 s; on the Optimizer < 60 s

## Planning Cycle

1. **Demand / LP Input:** CDU throughput and blend targets from APS, refreshed
   daily. Planning horizon toggled between **7 / 14 / 30 days**.
2. **Resource Availability:** Live tank inventory snapshots, vessel AIS
   positions, berth availability, pipeline capacity, maintenance calendar.
3. **Planning Output:** For each cargo — a decision in
   `{REORDER, HOLD, SUBSTITUTE, DEFER, DROP}` with confidence, evidence,
   assumptions, risks, next_actions, and (when REORDER/SUBSTITUTE) a full
   reorder plan. For each CDU day — planned crude charge by grade.
4. **Backlog / Shortfall:** When demand cannot be met, the optimizer emits a
   `STOCKOUT_RISK` flag (severity 1–5) and a recommended corrective action
   (REORDER with quantity, grade, order-by date, arrival window).

## Core Business Problem (What Must Be Decided)

1. **Cargo nomination** — accept, defer, substitute, or drop each incoming
   cargo given tank availability and CDU needs.
2. **Berth timing** — when each vessel is berthed, within its laycan window,
   to avoid demurrage and honor pipeline capacity.
3. **Tank assignment** — which tank each cargo unloads into, respecting
   segregation (HighSulphur vs LowSulphur vs Slops) and ullage.
4. **CDU charge per day** — how much of each crude grade to feed each CDU
   each day, respecting blend constraints, LP targets, and capacity.
5. **Replenishment (REORDER)** — when current plan is short, recommend
   quantity (kbbls), grade, origin, order-by date, and expected arrival
   window using lead-time assumptions per vessel class.

## Constraints and Tradeoffs

### Tank / Inventory

- Tank inventory ≥ 0 and ≤ tank capacity at all times.
- Tank segregation: HighSulphur crudes only in HS tanks; LowSulphur only in LS
  tanks; Slops tanks reserved for slops.
- Days-of-cover per group ≥ safety floor (default 7 days).
- Initial inventory + arrivals − withdrawals = closing inventory (flow balance).

### Vessel / Berth / Demurrage

- Each berthed vessel occupies a berth for its discharge window; berth
  concurrency ≤ berth count.
- Vessel berth start must fall within its laycan window
  `[laycanStart, laycanEnd]`. Berthing outside the window incurs demurrage
  proportional to lateness × vessel-class demurrage rate.
- Vessel arrival flexibility: operator can allow ±N days (0–5) on the
  Optimizer screen.

### CDU / Blend

- CDU daily throughput ∈ [min, max] (operating envelope).
- Blend constraints (per CDU): sulphur ≤ limit, API ∈ [min,max], and any
  user-defined constraint; each constraint is *hard* by default but the
  optimizer may propose SUBSTITUTE/DEFER to relax a violation.
- LP alignment: scheduled volume per grade should track LP target; deviation
  penalized in the objective.

### Pipeline / Logistics

- Pipeline capacity (kbbls/day) from berth → tank farm and across sites.
- Cross-site transfers permitted but incur logistics cost.

### Maintenance

- During CDU shutdowns (maintenance calendar), CDU throughput = 0.
- Tanks feeding a shut-down CDU flagged for OVERSTOCK_RISK.

### Data Freshness / Missing Data

- The optimizer must still emit a recommendation even when data is missing;
  it must list assumptions, lower confidence, and name exactly which fields
  were missing (per the prompt's **Missing Data Rules**).

## Entities to Model

| Entity               | Description                                           | Key Fields |
| -------------------- | ----------------------------------------------------- | ---------- |
| **Refinery / Facility** | Aspropyrgos; contains tanks, CDUs, cargoes         | facilityId, terminalId, berthCount |
| **Crude Grade (Item)**  | Grade master (Arab Light, Urals, CPC, Azeri, …)    | itemId, apiGravity, sulphurPct, originRegion, priceDifferentialUsdBbl, tankGroup |
| **Tank**                | Physical storage                                   | tankId, tankGroup (HS/LS/Slops), crudeGrade, currentVolumeBbls, capacityBbls, ullage |
| **Cargo / Vessel**      | Inbound cargo                                      | cargoId, vesselName, imoNumber, vesselType (VLCC/Suezmax/Aframax), crudeGrade, volumeBbls, loadingPort, laycanStart, laycanEnd, etaTerminal, status, isFixed, demurrageRiskLevel, currentPosition |
| **CDU**                 | Crude Distillation Unit                            | cduId, plannedThroughputBpd, minThroughputBpd, maxThroughputBpd, blendConstraints, lpTarget |
| **BlendConstraint**     | Quality / operational limit on a CDU               | cduId, constraintName, metric (sulphur/API/…), limitValue, limitType (≤/≥/=), currentValue |
| **MaintenanceWindow**   | CDU shutdown                                       | cduId, startDate, endDate, reason |
| **OptimizationScenario**| User-defined what-if                               | scenarioId, name, objective, parameterChanges, status, baselineKpis, scenarioKpis, kpiDeltas |
| **Recommendation**      | Optimizer decision with feedback                   | recommendationId, decision, confidence, evidence, assumptions, risks, nextActions, reorderPlan, riskFlags, anomalies, metadata, status (proposed/accepted/rejected/completed), feedbackNotes |

## Summary

The application supports daily-to-monthly crude scheduling at the Aspropyrgos
refinery under tank, berth, CDU, blend, pipeline, and LP-alignment constraints,
with the goal of maximizing net refining margin while preventing demurrage and
stockout. The optimizer emits auditable, evidence-backed recommendations with
a mandatory Accept/Reject/Modify/Note feedback loop, and the UI renders
everything purely from the structured JSON contract.
