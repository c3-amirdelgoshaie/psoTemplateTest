   BUILD A NEW INTERNAL DASHBOARD APP: "CRUDE SCHEDULE OPTIMIZER" (v1)

GOAL
Build an internal decision dashboard for crude procurement managers, logistics schedulers, and refinery planners at Helleniq Energy — a Greek petroleum company operating three refineries (Aspropyrgos, Elefsina, Thessaloniki) with ~350,000 bpd combined throughput. The app must tell operators which crude to buy, how much, and when; prevent demurrage and stockout risk; recommend optimal crude diet scenarios; and provide traceable AI recommendations with confidence scores. The app is the front-end interface for an AI/optimization engine and integrates with the Aspen Petroleum Scheduler (APS) database and live data feeds. The IPD scope is limited to Aspropyrgos refinery (~150,500 bpd).

NON-NEGOTIABLE UI/UX CONTRACT
1) Use a consistent dashboard design system across ALL pages:
   - Fixed-width left icon sidebar with dark navy background (#0B2545)
   - Persistent top header bar with refinery selector and planning horizon toggle
   - Same card grid style, spacing, typography, rounded cards, off-white background
   - No alternative layouts. No new page layouts. Pages must feel like the same dashboard template.
   - Only content inside cards changes; layout patterns never change.
2) All pages must be built from the same reusable card + table + chart components (same padding, borders, font scale).
3) No "creative" UI changes. Consistency is mandatory.

SCOPE (v1 PAGES ONLY)
Implement ONLY these pages:
1) Dashboard (Optimizer Overview)
2) Crude Cargo Schedule
3) Refinery Feedstock Plan
4) Crude Diet Optimizer (Decision Console)
5) Products List (Cargo & SKU Registry)
6) Recommendations (Decision History + Feedback)

Do NOT implement multi-refinery views, marketing features, or customer-facing storefront features in v1.

GLOBAL LAYOUT
Header Bar:
- Company logo (left): "Helleniq Energy" wordmark + oil drop icon
- Refinery selector (center): dropdown defaulting to Aspropyrgos; Elefsina and Thessaloniki greyed out with "Coming Soon" badge
- Planning horizon toggle: 7-day / 14-day / 30-day
- Last data sync timestamp: "Data last updated: 14 Apr 2026, 09:42 UTC"
- User avatar and notification bell (right)

Sidebar:
- Icons + labels for all five screens
- Collapse button (icon-only mode)
- Bottom section: data feed health indicator (green = all live; amber = partial; red = degraded)

GLOBAL FILTERS (apply to every page)
- Planning horizon (7 / 14 / 30 days)
- Refinery / terminal (default: Aspropyrgos)
- Crude grade family (All / Arab Light / Urals / CPC Blend / Azeri / Other)
- Vessel status (All / Confirmed / Provisional / At Risk)
Filters must update all cards, tables, and charts on the page.

MINIMUM DATA INPUTS (app must still work with missing fields)
Required:
- Cargo catalog: cargo_id, vessel_name, imo_number, vessel_type, crude_grade, origin_region, volume_bbls, loading_port, laycan_dates, eta_terminal
- Tank inventory snapshots by grade and location: on_hand_bbls, capacity_bbls, ullage, tank_group (HighSulphur / LowSulphur)
- CDU plan: cdu_id, planned_throughput_bpd, crude_grade, blend_constraints, lp_target
- Lead time assumptions per vessel class (default if unknown)

Optional (use if available):
- Live AIS vessel position feeds
- Demurrage rate tables by vessel type
- Benchmark crude price differentials
- Maintenance calendar (CDU shutdowns and turnarounds)
- Purchase contract and nomination data

REQUIREMENT: The app must still produce optimizer decisions even when some data is missing, using explicit assumptions and lowering confidence.

OPTIMIZER AGENT RESPONSIBILITIES (CORE OUTPUTS)
For each cargo or crude grade decision, generate:

A) Decision: REORDER / HOLD / SUBSTITUTE / DEFER / DROP
B) Confidence: 0–100
C) Evidence bullets (3–6) grounded in available data
D) Assumptions (explicit)
E) Risks (explicit)
F) Next actions checklist
G) Reorder / Substitution Plan (when REORDER or SUBSTITUTE):
   - recommended total qty (kbbls)
   - recommended crude grade and origin
   - "order by" date + expected arrival window (based on lead time and laycan)
H) Inventory risk flags:
   - STOCKOUT_RISK and/or OVERSTOCK_RISK with severity 1–5 and recommended corrective action
I) Demurrage risk flags:
   - DEMURRAGE_RISK with severity 1–5, impacted vessel, recommended berth re-timing or tank nomination
J) Anomaly flags (if detected):
   - sudden CDU throughput change, cargo delay, blend constraint violation, price spike

FEEDBACK LOOP (MANDATORY)
Every recommendation must allow:
- Accept
- Reject
- Modify
- Add note

Persist feedback and show it on the Recommendations history page. Display recommendation status: proposed / accepted / rejected / completed.

EVIDENCE TRACEABILITY (MANDATORY)
Each recommendation must show which data was used:
- Inventory snapshot timestamp used
- LP target version and date
- Crude price differential source and date
- Lead time assumption used
- Blend constraint version

If data is missing, list exactly what is missing and how the decision might change.

PAGES — REQUIREMENTS

1) DASHBOARD (Optimizer Overview)
Purpose: Operator sees what to act on in 30 seconds.
Must include:
- KPI cards: current throughput (bpd), days of crude cover, scheduled vessel arrivals (next 14 days), open demurrage risk ($), GRM vs LP target ($/bbl), optimizer opportunity ($M annualized)
- "Top Recommendations" list (3–5) with decision + confidence + 1–2 key reasons + Accept/Dismiss inline
- Alerts section: top 5 demurrage risks and top 5 stockout/inventory risks
- Inventory heatmap: tank farm layout with fill level color coding (green >60%, amber 30–60%, red <30%), grouped by High-Sulphur and Low-Sulphur
- Upcoming vessel Gantt: 14-day horizontal timeline, vessels color-coded by status (Confirmed = blue, Provisional = amber, At Risk = red)

Acceptance: operator instantly knows top actions without navigating away.

2) CRUDE CARGO SCHEDULE
Purpose: Full visibility and management of crude cargo movements — vessel arrivals, tank nominations, pipeline transfers, and berth bookings.
Must include:
- Timeline view (primary): horizontal Gantt chart, one row per vessel/cargo, bars colored by crude grade family; draggable to reschedule with inline constraint validation
- Table view (toggle): sortable/filterable table with columns: Cargo ID | Vessel | Grade | Volume (kbbls) | ETA | Status | Berth | Tank | Demurrage Risk
- Cargo Detail Panel (slide-in on click): all cargo fields, current AIS position, berth status, demurrage risk indicator, action buttons (Edit / Nominate Tanks / Flag for Review / Run Optimizer)
- Tank Transfer sub-section: secondary Gantt below main chart showing intra-site and cross-site pipeline nominations
- "Add Cargo" button: opens modal form

Acceptance: operator can manage all vessel movements and flag conflicts from one screen.

3) REFINERY FEEDSTOCK PLAN
Purpose: Manage and visualize planned crude intake into each CDU, including blend constraints, quality specs, and LP alignment.
Must include:
- Header KPI row: planned CDU throughput vs capacity, average API, average sulphur, count of active blend constraint violations
- CDU Charge Schedule (main chart): stacked bar chart by crude grade and CDU; toggle between Quantity view (bpd) and Quality view (API + sulphur overlaid as lines); LP target shown as dashed reference line; CDU operating envelope as shaded band
- Blend Constraints Table: CDU | Constraint | Limit | Current Value | Status; violations highlighted in red with optimizer corrective action on click
- LP Alignment Panel: table of crude grades vs LP target vs scheduled volume vs delta; "Re-optimize to LP" button
- Maintenance Calendar (collapsible): CDU shutdown Gantt overlaid with cargo schedule to flag inventory risk windows

Acceptance: operator can identify blend violations and LP deviations at a glance.

4) CRUDE DIET OPTIMIZER (Decision Console)
Purpose: AI-powered core. Generate optimized crude procurement and processing schedules, run what-if scenarios, and compare outcomes.
Layout: Split view — left panel (40%) for scenario configuration; right panel (60%) for results.

Left Panel — Scenario Builder:
- Planning horizon toggle: 7 / 14 / 30 days
- Optimization objective dropdown: Maximize GRM / Minimize Demurrage / Minimize Logistics Cost / Balanced
- Crude grades to include: multi-select checklist with current price differentials inline
- Constraints to enforce: checkboxes for Tank Segregation, Quality Specs, CDU Blend Limits, Pipeline Capacity, Vessel Berth Availability
- Fixed cargoes toggle: mark confirmed cargoes as locked vs. flexible
- Vessel arrival flexibility slider: ±0–5 days
- What-If Parameters (collapsible): delay vessel by N days, remove crude grade, price assumption override (slider per grade, % from market), CDU throughput change (±10%), tank capacity override
- "Run Optimizer" button: simulates async process with 4 labeled progress steps over ~5 seconds

Right Panel — Scenario Results:
- Summary metric cards: GRM ($/bbl), Demurrage Cost ($), Logistics Cost ($), Total Annualized Value ($M) — baseline vs optimized vs delta
- Recommendation list: priority-ordered action cards (HIGH / MEDIUM / LOW) each showing action type, natural-language description, reasoning, estimated $ value, confidence score, and Accept / Modify / Dismiss buttons
- Crude Diet Comparison Chart: grouped bar chart, current vs optimized by grade (kbbls)
- Timeline Diff view (toggle): side-by-side Gantt with changed bars highlighted and delta annotations
- Scenario Management table (bottom): list of saved scenarios with Created date, Objective, GRM Delta, Status, and View/Load actions; "Compare Scenarios" button opens side-by-side KPI modal

Acceptance: operator can run a new scenario, review AI recommendations, and accept or dismiss actions within 60 seconds.

5) CARGO & SKU REGISTRY (Products List)
Purpose: Fast find and jump to cargo or crude grade detail.
Must include:
- Search by Cargo ID / Vessel Name / Crude Grade
- Performance chips per row: volume (kbbls), margin ($/bbl), decision badge, confidence score
- Click-through to Cargo / Grade Detail page
- Filter by vessel type, crude grade family, status

6) RECOMMENDATIONS (Decision History + Feedback)
Purpose: Governance and auditability of all optimizer decisions.
Must include:
- Full list of all recommendations with status: proposed / accepted / rejected / completed
- Filters: date range, decision type, crude grade, vessel
- Show feedback notes and evidence snapshot per recommendation
- Optional: realized outcome vs projected value if data available

Acceptance: operator can audit all decisions and trace evidence for any recommendation.

OPTIMIZER AGENT OUTPUT CONTRACT (STRICT JSON)
Design the system so the frontend renders purely from structured JSON outputs.
Each recommendation must include:
- decision, confidence, expected_impact, evidence[], assumptions[], risks[], next_actions[]
- reorder_plan { total_qty_kbbls, crude_grade, order_by_date, expected_arrival_window }
- risk_flags[] { type, severity (1–5), summary, recommended_action }
- anomalies[] (optional)
- metadata { data_sources_used, timestamps, missing_data[] }

MISSING DATA RULES
If AIS position missing: show last known position with stale timestamp warning.
If crude price differential missing: use last available price; mark assumption; lower confidence.
If lead time missing: use default by vessel class; mark assumption; lower confidence.
If LP target missing: use prior week LP; mark assumption; lower confidence.
If blend constraint data missing: flag as unverified; lower confidence; do not block recommendation.

MOCK DATA REQUIREMENTS
Seed the application with realistic mock data for Aspropyrgos refinery:
- 8 tanks: mix of High-Sulphur and Low-Sulphur groups, varying fill levels, storing Arab Light, Urals, CPC Blend, Azeri Light; at least 2 tanks below 30% (red state)
- 6 upcoming cargoes over next 30 days: mix of Confirmed, Provisional, and At Risk; at least 1 vessel flagged with demurrage risk; at least 1 Aframax and 1 Suezmax
- 2 CDUs with planned throughput and 4 active blend constraints, including 1 active violation on CDU-2 (Urals sulphur at 44% vs 40% limit)
- 3 saved optimizer scenarios: one baseline (Base April Plan), one Urals substitution (+$0.29/bbl GRM delta), one vessel re-timing (−$104K demurrage)
- All data feed statuses set to "Live" except Maintenance Calendar which shows "Stale" (last updated 10 Apr)
- 1 recent optimizer recommendation of type "Crude Substitution" on the Dashboard with confidence 87% and status "New"

FUNCTIONAL REQUIREMENTS
1) Gantt drag-and-drop: Cargo bars in the Crude Cargo Schedule must be draggable along the time axis with real-time constraint violation detection shown as inline tooltips or card alerts.
2) Optimizer run simulation: "Run Optimizer" button simulates async process (4 labeled steps, ~5 seconds total via setTimeout) before populating mock results — no real backend call required.
3) Scenario comparison: "Compare Scenarios" modal renders side-by-side KPI cards with delta indicators for any two selected scenarios.
4) Accept/Dismiss recommendations: Accepting a recommendation updates the cargo Gantt (moving or replacing the affected bar) and recalculates Dashboard KPI cards.
5) Tank nomination flow: "Nominate Tanks" on the Cargo Detail Panel opens a modal showing available tanks with ullage and crude compatibility; confirming a selection updates the cargo record.
6) Data freshness indicators: each data source in Settings shows a relative time label ("2 hours ago", "3 days ago") alongside the raw timestamp.
7) Alert notifications: toast notifications fire for: optimizer run complete, blend constraint violation detected, vessel ETA within 6 hours of berth availability conflict.

DESIGN SYSTEM
Colors:
- Primary brand (sidebar, primary buttons): #0B2545 (deep navy)
- Accent (active states, teal highlights): #1D9E75 (petroleum teal)
- Warning (amber alerts): #EF9F27
- Danger (violations, demurrage risk): #D85A30 (coral red)
- Success (within limits): #639922 (muted green)
- Background: #F8F7F4 (off-white)
- Surface (cards): #FFFFFF
- Text primary: #1A1A1A
- Text secondary: #6B6B6B
- Border: #E0DEDB

Typography:
- Display / KPI numbers / screen titles: DM Serif Display
- All labels, table data, body text: IBM Plex Sans

Component conventions:
- Cards: white bg, 1px border #E0DEDB, border-radius 12px, padding 20px
- KPI numbers: 32px DM Serif Display, color varies by status
- Status badges: pill shape, 12px, semantically color-coded
- Buttons: Primary (navy fill + white text), Secondary (white + navy border), Destructive (coral fill)
- Gantt bars: border-radius 4px, height 28px, semi-transparent on hover with tooltip
- Sidebar: #0B2545 bg, white icons + labels, #1D9E75 active indicator on left edge
- Minimum viewport: 1280px (desktop-first); sidebar collapses to icon-only at 1280px; charts reflow to single-column below 1440px

DATA MODELS (KEY ENTITIES)

Cargo:
- cargoId, vesselName, imoNumber, vesselType (VLCC | Suezmax | Aframax)
- crudeGrade, originRegion, cargoVolumeBbls
- loadingPort, laycanStart, laycanEnd, etaTerminal, destinationTerminal
- charterPartyRef, status (Confirmed | Provisional | At Risk)
- nominatedTanks[], currentPosition { lat, lon }, demurrageRiskLevel (None | Low | Medium | High)
- isFixed (boolean — locked in optimizer)

Tank:
- tankId, terminalId, crudeGrade, currentVolumeBbls, capacityBbls, ullage
- tankGroup (HighSulphur | LowSulphur | Slops), lastUpdated

OptimizationScenario:
- scenarioId, name, createdAt
- objective (MaxGRM | MinDemurrage | MinLogistics | Balanced)
- parameters (ScenarioParameters), status (Running | Complete | Failed)
- results: grmDeltaPerBbl, demurrageSaving, logisticsSaving, totalAnnualizedValue, recommendations[], optimizedSchedule[], confidenceScore

ACCESSIBILITY & QUALITY REQUIREMENTS
- All interactive elements must have aria-label or aria-labelledby
- Color is never the sole indicator of state — always pair with icon or text label
- Full keyboard navigation through all tables and form controls
- All charts must have a text summary accessible to screen readers
- No console errors in the rendered application
- All mock data must be internally consistent: tank volumes ≤ tank capacity; cargo volumes consistent with vessel type; blend constraint current values consistent with grade mix

HARD ACCEPTANCE TESTS (Definition of Done)
A) Demurrage prevention: if vessel ETA conflicts with tank availability, agent must flag DEMURRAGE_RISK and recommend berth re-timing or tank nomination.
B) Blend constraint enforcement: if CDU blend limit is breached, agent must recommend SUBSTITUTE or DEFER with evidence and corrective action.
C) Decision clarity: any cargo must show decision + confidence + evidence + assumptions + next steps; a reorder/substitution plan must exist when decision is REORDER or SUBSTITUTE.
D) Dashboard completeness: operator answers in <30 seconds — what are the top 3 actions, what vessels are at risk, and what is the optimizer opportunity?
E) Optimizer screen completeness: operator can configure, run, review, and accept a scenario within 60 seconds.

BUILD ORDER (recommended)
1) Implement the fixed design shell (sidebar, header, card grid) with the exact design system above.
2) Implement Cargo & SKU Registry + Cargo Detail rendering using mocked JSON data.
3) Implement data model and mock data seed for cargoes, tanks, CDUs, and scenarios.
4) Implement Optimizer Agent engine to generate recommendations JSON and render recommendation cards.
5) Implement feedback loop (Accept / Reject / Modify / Note) and Recommendations history page.
6) Implement Gantt chart with drag-and-drop, constraint validation, and tank nomination flow.
7) Implement Dashboard alerts, KPI cards, inventory heatmap, and vessel timeline.

DELIVERABLES
- Working app with the 6 pages above
- Optimizer agent recommendations rendered consistently in the dashboard UI
- Cargo detail page with inventory, blend constraints, AI decision, and scenario output
- Feedback loop persisted and visible in Recommendations history
- All pages follow the exact design system (no deviations)
- All mock data internally consistent and realistic for Aspropyrgos refinery operations
