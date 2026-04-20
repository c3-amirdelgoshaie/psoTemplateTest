---
description: C3 Instructions for PSO React UI Development
alwaysApply: false
---

# PSO UI Development Instructions

Guidelines for building React UIs for Production Scheduling Optimization applications.

## Core Principles

- **Data contract alignment** — UI field names must match solver output exactly
- **Null safety** — Always handle undefined/null values in custom cell renderers
- **Session persistence** — Save scenario runs as entities for history tracking

---

## Recommended Pages

| Page                 | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| **Dashboard**        | KPIs, Run Optimizer button, primary entity tables, resource utilization |
| **Schedule/Results** | Tabbed view of optimization outputs (schedules, assignments, metrics)   |
| **Scenarios**        | What-if analysis with parameter editing and session history             |

---

## Data Contract: Solver Output ↔ UI

> ⚠️ **CRITICAL: Field Name Alignment**
>
> The UI expects specific field names. If the solver outputs different names, the UI will show blank columns or crash.

### Verification Process

Before building UI components, verify field alignment:

1. **Check seed data** — Inspect `seed/PsoInput/*.json` for actual field names
2. **Update interfaces** — Ensure `Interfaces.tsx` matches seed data structure
3. **Align solver output** — Solver must output fields matching UI interfaces

### Common Misalignment Patterns

| Category    | Issue                                | Solution                          |
| ----------- | ------------------------------------ | --------------------------------- |
| Date fields | Solver outputs `dayIndex` (number)   | Output ISO date strings instead   |
| Time fields | Solver outputs `startTime`/`endTime` | Match UI expected names exactly   |
| Numeric IDs | Solver omits `scheduleId`            | Always include unique identifiers |
| Balances    | Solver outputs `endingInventory`     | Match interface field names       |

### Field Name Discovery

```bash
# Check what fields exist in seed data
cat seed/PsoInput/PsoInput.json | jq 'keys'           # List top-level arrays
cat seed/PsoInput/PsoInput.json | jq '.<entityArray>[0]'  # Inspect first item
```

Then update `Interfaces.tsx` to match the actual field names exactly.

---

## Null Safety in Custom Cell Renderers

Custom cell renderers can crash the UI if values are undefined. Always use nullish coalescing:

```tsx
// ❌ BAD - crashes if closingBalance is undefined
const BalanceCell = (props: GridCellProps) => {
  const { closingBalance } = props.dataItem;
  return <td>{closingBalance.toFixed(0)}</td>; // TypeError!
};

// ✅ GOOD - handles undefined safely
const BalanceCell = (props: GridCellProps) => {
  const closingBalance = props.dataItem?.closingBalance ?? 0;
  return <td>{closingBalance.toFixed(0)}</td>;
};
```

---

## Scenario Management

### PsoScenario Entity

Create a `PsoScenario` entity to track what-if sessions:

```
src/scenario/
  PsoScenario.c3typ       # Entity type
  PsoScenarioOutput.c3typ # Embedded output type (separate file!)
```

> **Note:** Each `.c3typ` file can only contain ONE type definition.

### PsoScenario Fields

| Field              | Type              | Purpose                                   |
| ------------------ | ----------------- | ----------------------------------------- |
| `scenarioName`     | string            | User-friendly name                        |
| `status`           | string            | "draft", "running", "completed", "failed" |
| `createdAt`        | datetime          | When created                              |
| `lastRunAt`        | datetime          | When last optimized                       |
| `parameterChanges` | json              | What was modified from baseline           |
| `inputSnapshot`    | json              | Full modified input used                  |
| `output`           | PsoScenarioOutput | Optimization results                      |
| `baselineKpis`     | json              | Baseline for comparison                   |
| `scenarioKpis`     | json              | Scenario results                          |
| `kpiDeltas`        | json              | Difference (scenario - baseline)          |

### Service Methods

Add to `<Domain>PsoService`:

```python
# Scenario CRUD
createScenario(name, description, parameterChanges) -> json
getScenarios(limit) -> json
getScenario(scenarioId) -> json
runScenario(scenarioId) -> json
deleteScenario(scenarioId) -> json
getBaselineKpis() -> json
```

### Applying Parameter Changes

```python
def _apply_parameter_changes(baseline_input, changes):
    """Apply scenario parameter changes to baseline input.

    Pattern: For each change category, find matching entity by ID
    and update the specified fields.
    """
    modified = copy.deepcopy(baseline_input)

    # Example: Resource/cell capacity changes
    for change in changes.get("resources", []):
        for resource in modified.get("resources", []):
            if resource.get("resourceId") == change.get("resourceId"):
                for field, value in change.items():
                    if field != "resourceId":  # Don't overwrite ID
                        resource[field] = value

    # Repeat pattern for other entity types (tasks, constraints, etc.)
    # Always match by ID, then apply field updates

    return modified
```

---

## Persisting Optimization Outputs

### Baseline Output

Save baseline optimization to a file or entity:

```python
def _save_output(output):
    etl_path = c3.FileSystem.mounts().get("etl")
    file_path = etl_path + "/<Domain>Output.json"
    c3_file = c3.FileSystem.makeFile(file_path)
    c3.FileSystem.uploadFile(StringIO(json.dumps(output)), c3_file)
```

### Scenario Output

Embed output directly in `PsoScenario` entity:

```python
c3.PsoScenario.merge({
    "id": scenarioId,
    "status": "completed",
    "output": {
        "status": output.get("status"),
        "objectiveValue": output.get("objectiveValue"),
        "schedules": output.get("schedules"),
        "kpis": output.get("kpis")
    },
    "scenarioKpis": extracted_kpis,
    "kpiDeltas": calculated_deltas
})
```

---

## UI Components

### Dashboard Page

- **KPI Cards**: Key metrics from optimization (objective value, constraints satisfied, etc.)
- **Run Optimization Button**: Triggers solver, shows spinner during execution
- **Entity Tables**: Grids with status badges for primary entities
- **Resource Utilization**: Progress bars showing capacity usage

### Schedule/Results Page

- **Tabs**: Organize different output views (schedules, assignments, metrics)
- **Grids**: Resizable columns, custom cell renderers for badges

### Scenario Page

- **Baseline KPIs Card**: Current optimization baseline metrics
- **New Scenario Form**: Parameter editors for key decision inputs
- **Scenario History**: Cards showing each scenario with status, changes, KPI deltas

**Parameter Changes Display**: Show actual values, not just counts:

```tsx
// ❌ BAD - only shows count
<span>2 resource(s) modified</span>;

// ✅ GOOD - shows actual changes with original → new values
{
  scenario.parameterChanges.resources.map((r) => (
    <span key={r.resourceId}>
      {r.resourceName}: {r.originalValue} → {r.newValue}
    </span>
  ));
}
```

---

## Progress Bar Without Overlapping Labels

Kendo ProgressBar shows labels by default. Use simple CSS instead:

```tsx
// ✅ Simple CSS progress bar
<div className="w-full bg-gray-200 rounded h-2">
  <div className="bg-accent h-2 rounded" style={{ width: `${Math.min(value, 100)}%` }} />
</div>
```

---

## Checklist

### Data Contract Verification

- [ ] Inspected seed data JSON to identify actual field names
- [ ] Updated `Interfaces.tsx` to match seed data structure exactly
- [ ] Solver output field names match UI interface definitions
- [ ] Date fields output ISO strings (not numeric indices)

### Null Safety

- [ ] Custom cell renderers use `?.` and `??` operators
- [ ] Handle missing KPIs gracefully with `|| 0` fallbacks

### Scenario Management

- [ ] `PsoScenario.c3typ` created as entity type
- [ ] `PsoScenarioOutput.c3typ` in separate file (one type per file!)
- [ ] Service methods for CRUD and run
- [ ] Parameter changes applied via deep copy
- [ ] Scenario cards show actual values changed (not just counts)

### UI Build & Verification

- [ ] Run `npm run lint` - fix all errors
- [ ] Run `npm run build` - verify TypeScript compilation succeeds
- [ ] Load each page/tab - verify no blank screens or crashes
- [ ] Test optimization run - verify results display correctly
- [ ] Create scenario - verify parameters save and display
