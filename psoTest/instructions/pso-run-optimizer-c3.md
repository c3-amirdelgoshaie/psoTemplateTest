---
description: C3 Instructions for PSO Optimizer Solver and UI Setup
alwaysApply: false
---

# PSO Run Optimizer AND UI Instructions

You are an operations research and C3 AI expert. Your task is to create a Python optimization solver that reads PsoInput, builds the MILP model, solves it, and returns structured output.

## Core Principles

- **Start simple** — begin with minimal viable implementations, add complexity only after validation
- **Test-driven** — write and run tests at each stage before proceeding
- **Iterative** — run code, observe results, fix issues, repeat

---

## ⚠️ Gurobi License Limitations

**CRITICAL:** C3 environments often have size-limited Gurobi licenses. Start with a simple model to avoid license errors.

### Start Simple, Scale Later

1. **Phase 1 - Minimal Model (Test License Limits)**

   - Max 10-15 orders/tasks
   - Max 5-6 resources/cells
   - Simple assignment variables only (no complex sequencing)
   - Basic constraints (capacity, demand satisfaction)

2. **Phase 2 - Add Complexity Gradually**
   - Increase problem size incrementally
   - Add sequencing/scheduling variables
   - Add changeover and setup constraints
   - Test after each addition

### License Error Pattern

```
gurobipy._exception.GurobiError: Model too large for size-limited license
```

**If you see this error:**

1. Reduce number of orders/resources in seed data
2. Simplify variable structure (remove O(n²) variables)
3. Use simpler time discretization
4. Consider LP relaxation for testing

````

---

# Generate Optimization Model API

> ⚠️ **MANDATORY: Local Testing Before Deployment**
>
> Every time you modify the solver code, you **MUST** run a local test before deploying to C3:
> ```bash
> conda activate agent-gurobi
> python <packageName>/tests/py/test_solver.py
> ```
> Only deploy to C3 after the local test passes successfully.

---

## Runtime Requirement

**All Python code in this guide must run in the `py.3.12-optim_312-server-py4j` runtime.** This runtime contains the required optimization dependencies (gurobipy, etc.).

See `pso-data-model-c3.md` for runtime installation prerequisites.

---

> 📋 **Single Model Architecture**
>
> The optimization model is defined **once** in `PsoOptimizer.py` inside the `solve_milp()` function.
> This same function:
> - Runs locally via `test_solver.py` for testing
> - Runs on C3 server via `c3.Lambda.fromPyFunc()` in the `py.3.12-optim_312-server-py4j` runtime
>
> **Key Requirements:**
> 1. **Runtime:** Use `py.3.12-optim_312-server-py4j` runtime (has gurobipy installed)
> 2. **Lambda Pattern:** Use `c3.Lambda.fromPyFunc()` with `actionRequirement="py.3.12-optim_312-server-py4j"`
> 3. **Self-Contained:** All imports must be INSIDE the `solve_milp()` function
> 4. **Arguments:** Call `lambda_func.apply([arg1, arg2, ...])` with array of args
> 5. **Credentials:** Get Gurobi license via `c3.GurobiCredential.inst()`

## Output Locations

| Artifact | Location | Purpose |
|----------|----------|---------|
| C3 API + Model | `<packageName>/src/solver/PsoOptimizer.c3typ` + `.py` | ⭐ **Single model definition** |
| Local test script | `<packageName>/tests/py/test_solver.py` | Validate model locally |
| Output types | `<packageName>/src/output/PsoOutput.c3typ` | Optimization results |
| UI service | `<packageName>/src/ds/<Domain>PsoService.c3typ` + `.py` | Data access for UI |

---

## Architecture Overview

````

UI calls: <Domain>PsoService.runOptimizer()
│
▼
<Domain>PsoService.py - Loads input data, calls PsoOptimizer, saves output
│
▼
PsoOptimizer.py - Wraps solve_milp() in c3.Lambda.fromPyFunc() - Executes in py.3.12-optim_312-server-py4j runtime (has gurobipy)
│
▼
solve_milp() function ⭐ SINGLE MODEL DEFINITION - Self-contained (all imports inside) - Parses input JSON → builds sets/parameters - Creates Gurobi model → solves → returns output

````

---

## The `solve_milp()` Function Structure

The optimization model is defined as a **self-contained function** inside `PsoOptimizer.py`:

```python
def solve_milp(input_data_str, gurobi_params_str, gap, limit):
    """
    Self-contained Gurobi MILP solver function.
    ALL imports must be INSIDE this function for Lambda execution.
    """
    # === 1. IMPORTS (must be inside function) ===
    import json as json_lib
    import time
    import gurobipy as gp
    from gurobipy import GRB
    from datetime import datetime as dt

    # === 2. PARSE INPUTS ===
    pso_dict = json_lib.loads(input_data_str)
    gurobi_creds = json_lib.loads(gurobi_params_str)

    # === 3. BUILD SETS (align with PsoInput data model) ===
    facilities = pso_dict.get("facilities", [])
    items = pso_dict.get("items", [])
    F = [f.get("facilityId") for f in facilities]
    I = [i.get("itemId") for i in items]

    # === 4. BUILD PARAMETERS (map from PsoInput structure) ===
    facilities_dict = {f.get("facilityId"): f for f in facilities}
    items_dict = {i.get("itemId"): i for i in items}
    # Extract tasks from facilities (example: flatten all tasks)
    all_tasks = []
    for f in facilities:
        for task in f.get("tasks", []):
            all_tasks.append({**task, "facilityId": f.get("facilityId")})
    T = [t.get("taskId") for t in all_tasks]
    tasks_dict = {t.get("taskId"): t for t in all_tasks}

    # === 5. CREATE GUROBI ENVIRONMENT ===
    if gurobi_creds:
        env = gp.Env(params=gurobi_creds)
    else:
        env = gp.Env(empty=True)
        env.start()

    # === 6. BUILD MODEL ===
    model = gp.Model("pso_optimization", env=env)

    # Variables (customize based on your MILP formulation)
    x = model.addVars(T, vtype=GRB.BINARY, name="x")           # Task selection
    y = model.addVars(T, F, vtype=GRB.BINARY, name="y")        # Task-facility assignment
    s = model.addVars(T, vtype=GRB.CONTINUOUS, lb=0, name="s") # Start time

    # Objective (customize based on your formulation)
    model.setObjective(gp.quicksum(x[t] for t in T), GRB.MAXIMIZE)

    # Constraints (add your domain-specific constraints here)
    for t in T:
        model.addConstr(gp.quicksum(y[t, f] for f in F) == x[t])
    # ... more constraints

    # === 7. SOLVE ===
    model.setParam("MIPGap", gap)
    model.setParam("TimeLimit", limit)
    model.optimize()

    # === 8. EXTRACT SOLUTION ===
    schedules = []
    if model.Status in [GRB.OPTIMAL, GRB.TIME_LIMIT]:
        for t in T:
            if x[t].X > 0.5:
                facility = next((f for f in F if y[t,f].X > 0.5), None)
                schedules.append({
                    "taskId": t, "facilityId": facility,
                    "startTime": s[t].X
                })

    # === 9. RETURN OUTPUT ===
    return {
        "id": f"Output_{dt.now().strftime('%Y%m%d_%H%M%S')}",
        "status": "optimal" if model.Status == GRB.OPTIMAL else "time_limit",
        "objectiveValue": model.ObjVal if model.SolCount > 0 else 0,
        "schedules": schedules,
        "kpis": {"totalTasks": len(T), "scheduledTasks": len(schedules)},
    }
````

### Key Points

1. **All imports inside function** — Lambda executes in isolated runtime
2. **Parse JSON strings** — Input is serialized for Lambda transport
3. **Get Gurobi credentials** — Passed from `c3.GurobiCredential.inst()`
4. **Return structured output** — Must include `id` for persistence

---

## PsoOptimizer C3 API

### PsoOptimizer.c3typ

```c3typ
type PsoOptimizer {
  runOptimization: function(psoInput: !json, mipGap: double = 0.001, timeLimit: double = 300): !json py
  validateInput: function(psoInput: !json): !json py
}
```

### PsoOptimizer.py (Lambda Pattern)

```python
import json
from datetime import datetime

GUROBI_RUNTIME = "py.3.12-optim_312-server-py4j"

# ⭐ Define solve_milp at MODULE LEVEL (enables local testing)
def solve_milp(input_data_str, gurobi_params_str, gap, limit):
    # ... full implementation from above ...
    pass

def runOptimization(this, psoInput, mipGap=0.001, timeLimit=300):
    """Run optimization using Lambda in py.3.12-optim_312-server-py4j runtime."""
    if hasattr(psoInput, 'toJson'):
        input_dict = psoInput.toJson()
    else:
        input_dict = psoInput

    input_json = json.dumps(input_dict)
    params_json = json.dumps(_get_gurobi_credentials())

    # ⭐ Key pattern: wrap solve_milp in Lambda
    lambda_func = c3.Lambda.fromPyFunc(solve_milp, actionRequirement=GUROBI_RUNTIME)
    return lambda_func.apply([input_json, params_json, mipGap, timeLimit])

def _get_gurobi_credentials():
    """Get Gurobi license credentials from C3."""
    params = {}
    try:
        cred = c3.GurobiCredential.inst()
        if cred:
            if hasattr(cred, 'stringParams') and cred.stringParams:
                params.update(cred.stringParams.toJson())
            if hasattr(cred, 'intParams') and cred.intParams:
                params.update(cred.intParams.toJson())
    except Exception:
        pass
    return params
```

---

## PsoOutput Types

### PsoOutput.c3typ (entity type — persistable)

```c3typ
entity type PsoOutput {
  status: !string              // "optimal", "time_limit", "infeasible"
  objectiveValue: double
  schedules: ![PsoScheduleOutput]
  kpis: !json
  solveTimeSeconds: double
  solvedAt: datetime
}
```

### PsoScheduleOutput.c3typ (type — embedded)

```c3typ
type PsoScheduleOutput {
  orderId: !string
  cellId: string
  startTime: !double
  endTime: !double
  isOnTime: !boolean
  productId: string
}
```

---

## UI Service Type

Create a service for the UI to access optimization data.

### `<Domain>PsoService.c3typ`

```c3typ
type <Domain>PsoService {
  getInputData: function(): !json py
  getOutputData: function(): json py
  runOptimizer: function(): !json py
  runOptimizerWithInput: function(inputData: !json): !json py
}
```

### `<Domain>PsoService.py`

```python
import json
from datetime import datetime
from io import StringIO

def getInputData(cls):
    """Get PSO input data from seed file."""
    file_content = c3.File(url="meta://<packageName>/seed/PsoInput/PsoInput.json").read()
    return json.loads(bytes(file_content).decode('utf-8'))

def getOutputData(cls):
    """Get PSO output data from etl mount."""
    try:
        etl_path = c3.FileSystem.mounts().get("etl")
        file_path = etl_path + "/<Domain>Output.json"
        file_content = c3.File(url=file_path).read()
        return json.loads(bytes(file_content).decode('utf-8'))
    except Exception:
        return None

def runOptimizer(cls):
    """Run optimization with baseline data."""
    input_data = cls.getInputData()
    output = c3.PsoOptimizer.runOptimization(input_data)
    _save_output(output)
    return output

def _save_output(output):
    """Save output to etl mount."""
    etl_path = c3.FileSystem.mounts().get("etl")
    if etl_path:
        file_path = etl_path + "/<Domain>Output.json"
        c3_file = c3.FileSystem.makeFile(file_path)
        c3.FileSystem.uploadFile(StringIO(json.dumps(output, indent=2)), c3_file)
```

---

## Local Test Script

**MANDATORY:** Test locally before every C3 deployment.

### `<packageName>/tests/py/test_solver.py`

```python
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PsoOptimizer import solve_milp

def main():
    seed_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "seed", "PsoInput", "PsoInput.json"
    )

    with open(seed_path, 'r') as f:
        pso_input = json.load(f)

    print(f"Loaded {len(pso_input.get('orders', []))} orders")

    # Call solve_milp directly (same function used on C3)
    result = solve_milp(json.dumps(pso_input), json.dumps({}), 0.001, 60)

    print(f"\nStatus: {result['status']}")
    print(f"Objective: {result['objectiveValue']}")
    print(f"Scheduled: {result['kpis']['scheduledOrders']}/{result['kpis']['totalOrders']}")
    print("\n✓ Test passed!")
    return result['status'] in ['optimal', 'time_limit']

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
```

### Running Local Tests

> **Local testing only:** The `agent-gurobi` conda environment is for local development. On C3, use the `py.3.12-optim_312-server-py4j` runtime.
>
> If you haven't set up the environment yet, see the setup instructions in `pso-formulation-setup-c3.md`.

```bash
conda activate agent-gurobi
python <packageName>/tests/py/test_solver.py
```

---

## Checklist

### Single Model Architecture

- [ ] `solve_milp()` function defined in `PsoOptimizer.py` at module level
- [ ] All imports are INSIDE the `solve_milp()` function
- [ ] All MILP variables, constraints, objective implemented inside `solve_milp()`
- [ ] **Local test script created** (`<packageName>/tests/py/test_solver.py`)
- [ ] **⚠️ MANDATORY: Local test passes** before every C3 deployment

### C3 API Types

- [ ] PsoOutput.c3typ created as **`entity type`** in `<packageName>/src/output/`
- [ ] PsoScheduleOutput.c3typ created as `type` (embedded)
- [ ] PsoOptimizer.c3typ created as `type` (service, no persistence)
- [ ] PsoOptimizer.py uses **Lambda + py.3.12-optim_312-server-py4j runtime** pattern
- [ ] `lambda_func.apply([arg1, arg2, ...])` called with **array of arguments**
- [ ] Gurobi credentials obtained via `c3.GurobiCredential.inst()`

### UI Service

- [ ] `<Domain>PsoService.c3typ` created in `<packageName>/src/ds/`
- [ ] `<Domain>PsoService.py` implemented with `getInputData`, `getOutputData`, `runOptimizer`
- [ ] Service calls `c3.PsoOptimizer.runOptimization()`

---

## UI Development

For React UI guidelines, scenario management, and data contract specifications, see **`pso-ui-c3.md`**.
