### improvements for general template

#### The react template's C3 design tokens must be treated as the single source of truth for all generated apps
When the c3-mcp-cli generates a new package (default, pso, genai, io, etc.), the generated app's CSS token files (`c3ui/c3FoundationTokens.css`, `c3SemanticTokensLight.css`, `c3SemanticTokensDark.css`, `tailwind/c3TailwindTheme.css`, `tailwind/c3CustomUtilities.css`, `tailwind/vendorOverrides.css`) must be byte-identical to the react template's versions. Template-specific CSS (e.g., a domain theme file) must layer on top of these tokens, never duplicate or override them at the foundation level.

---

#### Template-specific CSS must never use `!important` to override body-level styles
Template-specific theme CSS should never set `font-family`, `background-color`, or `color` on `body` with `!important` — these are already handled by `c3CustomUtilities.css` and `globals.css` via `@layer base`. Overriding them stomps the C3 design tokens for every element on the page, breaks dark mode, and forces manual removal during migration. If a template needs a different body style, it must use a scoped wrapper class (e.g., `.{template}-shell`) rather than a global body override.

---

#### Template-specific CSS classes must use C3 font variables, not custom font stacks
All CSS utility classes in a template's theme file should reference `var(--font-sans)` or `var(--font-default)` from the C3 Tailwind theme, not custom font variables (e.g., `var(--{template}-font-display)` or `var(--{template}-font-body)`). Custom font stacks create visual inconsistency with the C3 design system and force a full audit when migrating to the standard look. If a template needs a display font, it should be opt-in via an explicit className (e.g., `.{template}-display-font`), not baked into shared utility classes.

---

#### Inline `fontFamily` styles in TSX components must be avoided
Hardcoded inline `fontFamily` values referencing template-specific CSS variables in JSX elements bypass the design system and require per-file auditing to fix. Font should come from CSS classes or be inherited from the body. The only acceptable inline `fontFamily` is `monospace` for code/ID values.

---

#### The useTheme hook must not contain vendor-specific theme loading logic
The react template's `useTheme.ts` uses only `localStorage('ui-theme')`, `document.documentElement.classList.toggle('dark')`, and a `c3-theme-changed` custom event. Template-specific apps should import the standard useTheme hook as-is. If vendor-specific theme loading is needed (e.g., Kendo CSS link element management, MutationObserver hacks, vendor-specific localStorage keys), it must be handled in a separate hook or utility — not baked into the shared useTheme hook.

---

#### App.tsx layout must use Tailwind utility classes, not inline styles
Template App.tsx files should not use inline style objects for root layout (e.g., `style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}`). The react template uses `<div className="h-screen flex max-w-full overflow-hidden">` which is more maintainable, responsive to dark mode, and consistent with Tailwind conventions. All templates should follow the react template's App.tsx layout pattern.

---

#### SideNav must use C3 design token classes, not template-specific BEM classes
Template SideNav components should not use template-prefixed BEM classes (e.g., `{template}-sidebar`, `{template}-sidebar__brand`) with hardcoded hex colors. The react template uses `bg-primary`, `border-weak`, `text-secondary`, `bg-secondary` from C3 tokens, which automatically adapt to light/dark mode. All templates should use the react template's SideNav pattern as a starting point and only add domain-specific features on top.

---

#### TopBar/header components must use C3 token classes, not hardcoded hex colors
Inline styles referencing template-specific CSS variables (e.g., `color: 'var(--{template}-primary)'`) should be replaced with Tailwind token classes (`text-primary`, `border border-weak`). This ensures dark mode compatibility and consistent spacing.

---

#### React sidebar nav labels must fit the collapsed width
Nav item labels should be short enough to render within the sidebar's fixed width (typically `w-16` / 64px). Long multi-word labels wrap or overflow.
**Rule:** Keep sidebar labels to ≤10 characters. Store the full name in `tooltip` for hover; use a short display label in `label`. Also add `truncate` and `overflow-hidden` to the label `<span>` as a safety net.

---

#### Mock / seed data must demonstrate the full visual range of the UI
Flat, constant arrays (e.g. `[50000, 50000, 50000, ...]` for every day) produce boring, featureless charts and tables that look broken in a demo. Seed data and mock output builders should:
- Introduce realistic **daily variation** (±5–10% smoothed noise around a baseline).
- Include **event-driven spikes** (e.g., deliveries, arrivals, demand surges) at correct day offsets.
- Include **downtime dips** (zero or near-zero values on shutdown/maintenance days) aligned to any maintenance or outage calendar.
- Ensure mock output values deliberately **diverge from targets/baselines** in some rows so that comparison tables show interesting deltas (not all "On Target / 0%").
- Use a **seeded deterministic random** function so the chart looks the same on every page load.

---

#### KPI cards must compare against the correct denominator
Aggregate KPI percentages (e.g., "% vs plan") should compare against the **combined planned capacity of all active resources**, not just the first one in the list. Always sum the relevant planned-capacity field across all active units before computing the delta percentage.

---

#### useMemo dependency warnings are ESLint errors in this project
The ESLint rule `react-hooks/exhaustive-deps` treats logical-expression fallbacks like `data?.items ?? []` as unstable dependencies when used directly inside `useMemo`/`useCallback`. Always wrap such derivations in their own `useMemo` first:
```tsx
// ❌ triggers exhaustive-deps warning
const items = data?.items ?? [];
const x = useMemo(() => items.map(...), [items]);

// ✅ correct
const items = useMemo(() => data?.items ?? [], [data]);
const x = useMemo(() => items.map(...), [items]);
```

---

#### Unused imports and parameters must be cleaned before saving
The Vite ESLint plugin (`vite-plugin-eslint2`) runs on every HMR save and blocks the overlay on the first error. The most common causes:
- Unused icon imports (e.g. `Ship` imported but never used after refactoring).
- Unused function parameters — prefix with `_` only if the linter rule allows it; otherwise remove the parameter entirely and update the call site.
- Duplicate React import (`import React` + `import { useState } from 'react'` in the same file) — merge into a single import line.

---

#### If the template includes a Gantt component, chart lanes require a fixed label column to align axes
When rendering a multi-row Gantt (resource rows, transfer rows, schedule rows), always reserve a fixed-width label column (e.g. `width: 72px`, `flexShrink: 0`) on the left of every row, including the time axis header. Without this, the axis labels and bar tracks are horizontally misaligned.

---

#### Concurrent items in a Gantt need lane assignment, not absolute positioning
Placing all items with `position: absolute` in a single container causes overlapping bars whenever two items share the same time window. Use a greedy lane-assignment algorithm (sort by start date, assign to the first lane whose last item ends before the new one starts) to distribute items into non-overlapping rows. Apply the same algorithm to all Gantt-like strips (maintenance windows, resource transfers, etc.).

---

#### Secondary visualization strips should show real data, not a placeholder
A secondary chart or Gantt strip that only says "no data wired in v1" is worse than nothing in a demo — it signals an incomplete product. If the template includes a secondary visualization area, it should always be wired to real or realistic mock data from day one. If the data source isn't ready, remove the strip entirely rather than shipping an empty placeholder.

---

#### Chart subtitles should explain visual encoding to the reader
Chart cards should include a subtitle that decodes the visual — e.g., "Stacked values vs target · envelope ±5% · dips = scheduled downtime". Users should not have to guess why bars suddenly drop to zero.

---

#### Collapsible panels with important information should default to open
A collapsible panel that starts closed hides relevant information on first load. For demo readiness, render important panels (maintenance calendars, alert summaries, etc.) always-open. If a collapse toggle is still desired, default `open = true`.

---

#### LSP / type-checker noise from optional native deps should be suppressed at the template level
Every `write` on any file (even UI-only changes) may surface errors like "Import `{optional_library}` could not be resolved" or "`c3` is not defined" from unrelated Python files in the repo. These are expected (optional or licensed libraries; `c3` is a magic global injected by the platform runtime) but they pollute every tool call and make it harder to see real errors. The template should ship a `pyrightconfig.json` (or equivalent) at the repo root that marks these imports as `reportMissingImports: "none"` and declares the `c3` global via a stub, so the agent's LSP feedback only surfaces genuinely new problems.

---

#### Placeholder pages should be overwritable without requiring a prior Read
Placeholder page stubs (≤15 lines, content == "implementation pending") are read-known — their shape is fully specified by the template. The agent's `write` tool safety rule that requires a `read` before overwrite burns a tool call per page when replacing these stubs. Either (a) auto-skip the rule for files under N lines matching a known placeholder pattern, or (b) have the template generate empty page files instead of stubs, so `write` can create them fresh without the overwrite check.

---

#### Maintain a `PROGRESS_NOTES.md` as a first-class resume artefact
Resuming a long multi-phase build from another session is dramatically faster when a single Markdown file captures: (1) phase matrix with status indicators, (2) locked-in design decisions, (3) file inventory, (4) where to resume next, (5) hard-won gotchas, (6) runbook commands, (7) continuation checklist. The template should ship an empty `resource/spec/PROGRESS_NOTES.md` skeleton with these exact sections, and `CLAUDE.md` should instruct: "At the end of every working session — or whenever the user asks to stop, handoff, or summarize — update `PROGRESS_NOTES.md` so the next agent can resume in one file-read." Without this explicit instruction, agents default to ad-hoc chat summaries that vanish with the session.

---

#### Ship a `patterns/` reference folder with canonical UI snippets
Building a new page in a template requires grepping / reading existing pages to learn the conventional combinations (SectionHeader + PageFilterBar + Card + table + row-click drawer; KPI strip layout; Gantt lane structure; modal shell). A `ui/react/src/patterns/` folder (or a single `PATTERNS.md` in `resource/`) with 50–80-line minimal examples of each canonical page/component pattern would eliminate the grep-everything step and keep newer pages visually consistent with older ones. Each snippet should be annotated with what it demonstrates and what it intentionally omits.

---

#### Design-system utility classes should be indexed in a single header
Template-specific utility classes in a theme CSS file are authoritative but agents have to `grep` the CSS file to discover them. Add a comment header at the top of the theme CSS that lists every class with a one-line purpose (and variants it supports). Treat the list as part of the component library's public API — components that introduce new utilities must add them to the index in the same diff.

---

#### Reconcile the two component-styling systems in the template
The React template currently carries two parallel styling systems that do not interoperate well: (1) the repo's `components/ui/*.tsx` wrappers that use Tailwind + `cn()` class composition, and (2) any template-specific primitives that use inline styles + a CSS utility namespace. New pages either bypass the `ui/` wrappers or mix the two awkwardly. The template should either (a) re-skin the `ui/` wrappers to emit the template's utility classes so they're drop-in usable, or (b) remove the unused wrappers and document inline-style + template utilities as the single sanctioned approach.

---

#### Reusable primitive slot props need inline documentation
Reusable primitives (e.g., `SectionHeader`, `Card`, `KpiCard`, `Drawer`) support slot props like `action` that aren't obvious from the type signature alone. Add a JSDoc comment above each prop with the intended content type (button, button cluster, ghost link, etc.) and an example. Without this, agents either omit the slot (missing a spec-required action) or put the wrong kind of element in it.

---

#### Page components over ~500 lines should be split into folder modules
Single-file page components that grow past 500 lines become difficult to navigate and review. The template's file layout convention should explicitly support `pages/<PageName>/{index.tsx, SubView.tsx, Modals.tsx, helpers.ts}` for pages with multiple sub-views. CLAUDE.md should encode: "If a page exceeds 400 lines, split into a folder; keep the public entry point as `index.tsx` so route imports are unchanged." This also makes targeted edits with the `edit` tool reliable (no ambiguous-match failures from near-duplicated block patterns).

---

#### Codify the `tsc --noEmit` check as the canonical pre-commit smoke test
`npx tsc -p tsconfig.build.json --noEmit` runs in ~2 seconds, is deterministic, and catches every type error the UI build would surface. The template's `CLAUDE.md` should instruct: "After writing any `.ts`/`.tsx` file, always run `npx tsc -p tsconfig.build.json --noEmit` from `ui/react/` and fix errors before moving on." Equally important — the agent should never silence a tsc error with `any` or `@ts-ignore`; the types should be widened/narrowed correctly. Without an explicit instruction, agents sometimes skip this and ship pages that fail the eventual `vite build`.

---

#### Every exported API service function needs at least one UI call site
When a service method is present in the API layer but has zero callers in any page component, it is a latent demo failure — buttons are missing, drill-downs don't exist. As part of implementing the service layer, always verify every exported function has at least one UI call site. Missing call sites should be treated as incomplete features, not optional polish.

---

#### The mock-fallback pattern must not silently mask backend errors
The pattern of catching all backend errors and silently falling back to mock data (`console.warn` + return mock) makes it impossible to distinguish a working backend from a broken one during a demo. The fallback should only activate when `VITE_USE_MOCK_API=true` or when the app is running with no C3 session cookies (pure local dev). In all other cases, errors should propagate so the UI can show a meaningful error state.

---

#### Smoke-test backend actions in the C3 JS console before wiring React queries
The fastest way to verify whether a backend action is working is to call it directly in the C3 JS console (via `C3AI-AppMCP_runJsCode`) before writing any React query. This test-first loop — console → service layer → UI — avoids building UI against a broken or missing backend action. Always smoke-test `ServiceType.action(args)` in the console and confirm the response shape matches the TypeScript interface before wiring the query.

---

#### C3 filter engine does not support the `in` operator — expand to chained `==` with `||`
The C3 `.fetch()` filter DSL has no `in (...)` operator. Generating a filter like `status in ('Proposed','Accepted')` raises a runtime `"Unsupported operator: 'in'"` from the Java engine. This affects every service method that builds a filter from a list of acceptable values:

```python
# ❌ runtime error
"status in ('Proposed','Accepted')"

# ✅ correct
"(status == 'Proposed' || status == 'Accepted')"
```

Use a reusable helper in every service file:

```python
def _eq_clause(field, values):
    if not values:
        return None
    parts = [f"{field} == '{v}'" for v in values]
    return parts[0] if len(parts) == 1 else "(" + " || ".join(parts) + ")"
```

Date-range clauses using `>=` / `<=` are not affected.

---

#### C3 objects are not plain dicts — call `.toJson()` before any dict operation
Objects returned from C3 platform calls and objects received as action arguments from the UI may be C3 wrapper instances rather than native Python dicts. Calling `.get()`, iterating keys, or passing to `json.dumps()` directly raises `AttributeError`. Normalize at every boundary:

```python
# ❌ AttributeError if result is a C3 object
result = c3.MyType.get("SOME_ID")
items = result.get("items")

# ✅ always normalize first
obj = result.toJson() if hasattr(result, "toJson") else result
items = obj.get("items")
```

Apply this to **every** argument received from the UI layer — it may arrive as a C3 value object depending on the runtime and serialization path.

---

#### Use `strftime("%Y-%m-%dT%H:%M:%SZ")` for C3 datetime strings — `isoformat()` breaks the filter engine
`datetime.isoformat()` produces `2026-04-21T12:00:00.123456` — the microsecond suffix and missing `Z` cause C3's `dateTime()` filter parser to fail. Always use the explicit format:

```python
# ❌ microseconds + no Z — rejected by C3 dateTime() parser
datetime.utcnow().isoformat()

# ✅ accepted by C3 filter engine and dateTime() constructor
datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
```

Apply this format to every stored timestamp field (`createdAt`, `updatedAt`, `lastRunAt`) and every datetime value embedded in a filter clause.

---

#### Guard lifecycle-state entities with `exists()` + `create()`, not unconditional `merge()`
Calling `merge()` unconditionally on entities that carry user-mutable state (status, feedback, audit trail) resets those fields back to their initial values on every re-computation, erasing all user input. The safe pattern:

```python
# ❌ overwrites user feedback on re-run
c3.MyEntity.merge(row)

# ✅ only create if genuinely new; never overwrite user-modified rows
if not c3.MyEntity.exists(row["id"]):
    c3.MyEntity.create(row)
# fall back to merge() only if exists()/create() are unavailable on the type
```

Apply this pattern to any entity whose lifecycle state (status, feedback, audit trail) must survive re-computation of the underlying optimizer or ETL job.

---

#### Never use `type` (or other C3-reserved names) as a field name in `.c3typ` files
`type` is a method on every C3 type object (`obj.type()` returns the type descriptor). Declaring a field called `type` produces the hard package error `"redeclaring method as field"`. Other known reserved identifiers: `meta`, `version`, `name` (safe only on types that explicitly mixin `WithName`). Whenever a domain field would naturally be named `type` (flag type, anomaly type, event category), use a qualified name: `flagType`, `anomalyType`, `eventKind`. Apply the same avoidance to `meta` → `outputMeta`, `version` → `schemaVersion`. Add this to the C3 type generation checklist so it is caught at authoring time, not at package-validation time.

---

#### CSS `@import` for external fonts must be the first lines of `globals.css`
Any `@import url(...)` for Google Fonts must appear before all other CSS, including `@import './tailwind/...'` and `@layer` blocks. Vite emits a build warning — which escalates to an error in stricter lint configs — when a font import follows other rules. Put all `@import url(...)` statements as the very first lines of `globals.css`. Never put font imports inside a component-level CSS file that is itself imported after other rules. The template's `globals.css` comment header should call this out explicitly.

---

#### The `generate_new_c3_type_from_description` MCP tool is unreliable — document the hand-authoring fallback
The tool intermittently fails with `unexpected keyword argument 'type_name'` and similar internal errors unrelated to the input. Template instructions that say "always use the MCP tool" should include a fallback path: when the tool errors, hand-author the `.c3typ` directly using the syntax patterns in the data model instructions — the result is identical in quality and there is no need to keep retrying the tool.

---

#### The test directory path is `test/` not `tests/`
Some template instruction files reference `<packageName>/tests/py/` or `<packageName>/tests/js-rhino/`. The actual folder created by the template is `<packageName>/test/py/` and `<packageName>/test/js-rhino/` (singular), matching the standard C3 package structure convention. All path references in instruction files should use `test/`, not `tests/`.

---

#### Template UI instructions should document the mock-data module pattern for frontend-first development
UI instructions often assume a live C3 backend from the start. Backend is often not deployed when UI work begins. Add a section: (1) copy seed JSONs to `ui/react/src/data/` at the start of UI development; (2) create `shared/mockData.ts` that imports those JSONs and synthesizes representative output; (3) create `shared/<domain>Api.ts` wrapping every `c3Action` call with a `VITE_USE_MOCK_API=true` env-var fallback; (4) the fallback must only activate in local dev or when the env var is set — not on a deployed C3 app. This lets frontend and backend work proceed in parallel.

---

### improvements for PSO template

#### PSO template must ship with the standard react template's CSS token files, not modified copies
The PSO template's `c3CustomUtilities.css` had an extra `box-shadow: var(--shadow-card)` line in `@utility c3-card` not present in the react template, and `vendorOverrides.css` had 70 lines of Kendo overrides that the react template had already cleaned out. When the PSO template is generated by c3-mcp-cli, the CSS token and utility files should be copied verbatim from the react template — no template-specific modifications to these shared files.

---

#### PSO template's `helTheme.css` body override must be removed before shipping
The shipped `helTheme.css` contained `body { font-family: var(--hel-font-body) !important; background-color: var(--hel-bg) !important; color: var(--hel-text) !important; font-size: 14px; }` which overrides the C3 foundation body styles. This block should be removed from the template so that new PSO apps inherit the standard C3 body font (Inter), background, and text color, with dark mode working out of the box.

---

#### PSO template's `helTheme.css` CSS classes must use `var(--font-sans)` not `var(--hel-font-display/body)`
Every `font-family` declaration in `helTheme.css` utility classes (`.hel-card__title`, `.hel-section-title`, `.hel-kpi__value`, `.hel-btn`, `.hel-sidebar__brand-text`, `.hel-horizon-toggle > button`, `.hel-shell`) should reference `var(--font-sans)` from the C3 Tailwind theme. The custom font variables (`--hel-font-display`, `--hel-font-body`) can remain defined in `:root` for any page-level opt-in usage, but should not be the default in utility classes.

---

#### Seed data should include overlapping laycan windows to showcase Gantt contention
If all cargo laycans are sequential (each one starts after the previous ends), the Gantt renders a single berth lane, which looks trivial. The seed data should deliberately overlap at least 2–3 cargo windows simultaneously so that multiple berth lanes are visible and the berth-contention logic is exercised.

---

#### Seed data should include tank transfer operations
Add a `tankTransfers` array to `PsoFacilityInput` in the type definition and seed JSON. This makes the secondary Gantt strip meaningful from day one and demonstrates the optimizer's inventory management capability. Minimum fields: `transferId`, `fromTankId`, `toTankId`, `crudeGrade`, `volumeBbls`, `startDate`, `endDate`, `status`, `reason`.

---

#### CDU charge arrays in seed/mock must use per-CDU grade lists, not all grades
CDU-1 (HS train) should only carry `ARAB_LIGHT` and `URALS`; CDU-2 (LS+HS mix) carries `URALS`, `CPC_BLEND`, `AZERI_LIGHT`. Passing `0` arrays for grades a CDU does not process is correct but must be explicit — do not omit grades that appear in the LP alignment table or the chart will silently skip them.

---

#### LP target arrays and scheduled charge should be separated in the output
The mock output builder must NOT simply copy `lpTargetByGrade` as `cduChargeByDay`. The scheduled charge should be independently generated with variation so that the LP Alignment table shows meaningful deltas (Above LP / Below LP / On Target) rather than all zeros.

---

#### FeedstockPlan KPI: combined throughput denominator
The throughput KPI percentage should compare against the sum of all CDU `plannedThroughputBpd` values, not the first CDU alone. Add a `small` subtitle to the KPI card showing the planned total (e.g. "Plan 151k bpd combined") so the denominator is transparent.

---

#### Blend constraint table should use `bc.name` not raw `constraintId`
`constraintId` values like `CDU1_SULPHUR_MAX` are internal identifiers. Display `bc.name` (e.g. "Max Sulphur %") in the Constraint column for a professional look. Fall back to `constraintId.replace(/_/g, ' ')` only when `name` is absent.

---

#### The horizon filter (7/14/30 day) must be respected by the CDU charge chart
The chart `days` calculation should use `Math.min(horizon, H)` where `horizon` comes from `useGlobalFilters()`. This lets a user narrow the chart to the near-term view without changing the underlying data.

---

#### PsoInput seed data should sync between frontend and backend
`ui/react/src/data/psoInput.seed.json` (used by the mock API fallback) and `seed/PsoInput/PsoInput.json` (used by the C3 backend) must always be identical. Add a note to the PSO data model instructions to keep them in sync, and always `cp` one to the other after editing.

---

#### Add TankTransfer to the TypeScript interface file alongside the C3 type
When adding `tankTransfers` to `PsoFacilityInput`, the matching `TankTransfer` TypeScript interface in `types/crude.ts` (or `Interfaces.tsx`) must be created at the same time. The `Facility` interface's `tankTransfers?` field also needs updating. Missing this causes silent `undefined` rendering downstream.

---

#### `Card` does not forward `style`, `onClick`, or arbitrary HTML attributes — wrap it when needed
`Card`'s prop interface is `{ title?, subtitle?, action?, flush?, compact?, className?, children }`. It accepts no `style`, `id`, `onClick`, or event handlers. Passing `<Card style={{ marginBottom: 24 }}>` is a TypeScript error and is silently ignored at runtime. Carry layout attributes on a wrapper `<div>`:

```tsx
// ❌ TS error — style is not a Card prop
<Card style={{ marginBottom: 24 }}>...</Card>

// ✅ correct
<div style={{ marginBottom: 24 }}><Card>...</Card></div>
```

`Card` also renders as `<section>`, not `<div>`, so CSS child selectors like `> div` will not match it.

---

#### `KpiCard.delta` is `number | null`, not a string — `accent` only colours the value text
`KpiCard` uses `delta` in numeric comparisons and passes it to `deltaFormatter(delta)` which calls `.toFixed()`. Passing a string silently breaks both. Always pass a parsed number or `null`, and supply a custom `deltaFormatter` for any domain that is not a plain decimal (USD, percentages, thousands):

```tsx
// ❌ breaks comparisons and .toFixed()
<KpiCard delta="+5.2% vs plan" />

// ✅ numeric delta with a custom formatter
<KpiCard
  delta={throughputVsPlan}
  deltaFormatter={(d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}% vs plan`}
  accent={throughputVsPlan >= -5 ? 'success' : 'warning'}
/>

// ✅ static label with no indicator arrow — use the `small` prop instead
<KpiCard value="150k bpd" small="Plan 151k bpd combined" />
```

`accent` (`'default'|'success'|'warning'|'danger'`) changes only the `hel-kpi__value` text colour. The card border and background are unaffected; for those, add a modifier class at the call site.

---

#### `HelButton` uses `children` for its label, not a `label` prop — and `type` defaults to `"button"`
`HelButton` is a thin wrapper around `<button>` that renders its label via `{children}`. There is no `label` prop. The component also explicitly overrides the HTML default by setting `type={rest.type ?? 'button'}`, so buttons inside forms will **not** submit unless `type="submit"` is passed:

```tsx
// ❌ compile error — no label prop exists
<HelButton label="Run Optimizer" variant="primary" />

// ✅ correct
<HelButton variant="primary">Run Optimizer</HelButton>

// ✅ submit button inside a <form>
<HelButton type="submit" variant="primary">Save</HelButton>
```

Available variants: `'primary' | 'secondary' | 'destructive' | 'ghost'` (no `'link'` or `'outline'`).
Available sizes: `'md' | 'sm'` (no `'lg'`).

---

#### `ToastKind` has no `'error'` value — use `'danger'`
The toast context defines `type ToastKind = 'info' | 'success' | 'warning' | 'danger'`. There is no `'error'`. Passing `kind: 'error'` is a TypeScript error that is easy to write by habit from other libraries:

```tsx
// ❌ TS error — 'error' is not a valid ToastKind
push({ kind: 'error', message: 'Optimizer failed.' });

// ✅ correct
push({ kind: 'danger', message: 'Optimizer failed.' });
```

`useToast()` throws (not returns `undefined`) when called outside `ToastProvider`. The provider must be placed at the app root in `main.tsx`, outside the router, so all route-rendered components can call it safely.

---

#### PSO solver instructions must require a heuristic fallback for the Gurobi-license-absent case
`pso-run-optimizer-c3.md` currently assumes Gurobi is always available. In practice the license is absent in many dev and demo environments. The instructions should explicitly require that `solve_milp()` includes a deterministic heuristic fallback that: (1) catches any `ImportError` or `GurobiError` on `import gurobipy`; (2) produces output with the identical JSON shape as the Gurobi path — same top-level keys, same array structures; (3) sets `metadata.solver = "heuristic"` so the UI can distinguish the paths; (4) is exercised by `test_solver.py` without a license so the test suite passes in both environments. Without this a missing license silently breaks the entire demo.

---

#### Document that `_apply_parameter_changes` belongs in the solver, not only in the service layer
`pso-run-optimizer-c3.md` shows `_apply_parameter_changes` defined only in `<Domain>PsoService.py`. But `solve_milp()` also needs override logic when scenario calls pass `parameterOverrides` directly — leading to duplication. The canonical pattern: define `_apply_overrides(pso_dict, overrides)` at module level in `PsoOptimizer.py` (no C3 dependencies; runs locally). Call it from both `runOptimization()` in the solver and from `runScenario()` in the service. Show this explicitly in the architecture diagram.

---

#### `pso-run-optimizer-c3.md` should document the full `runOptimization` call signature including `objectiveMode`
The composite objective (MaxGRM / MinDemurrage / MinLogistics / Balanced) is one of the most user-visible parameters but is absent from the current instructions. Clarify: pass `objectiveMode` as a separate argument to `runOptimization()`, not embedded in `PsoInput`, so the same input entity can be re-solved under different objectives without mutation. Show the canonical signature: `PsoOptimizer.runOptimization(psoInput, objectiveMode="Balanced", mipGap=0.01, timeLimit=120, flexDays=2, parameterOverrides=None)`. `PsoScenario.objective` should hold the string that gets passed through on scenario runs.
