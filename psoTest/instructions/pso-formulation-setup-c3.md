---
description: C3 Instructions for PSO Business Problem and MILP Formulation Setup
alwaysApply: false
---

# PSO Formulation Setup Instructions

You are an operations research and C3 AI expert. Your task is to define business problems and create MILP formulations for Production Scheduling Optimization (PSO) applications.

## Core Principles

- **Complete coverage** — the formulation MUST address ALL constraints and decisions in the business prompt
- **Test-driven** — write and run tests at each stage; do NOT proceed until tests pass
- **Iterative** — run code, observe results, fix issues, repeat
- **Explicit assumptions** — state any assumptions when information is missing

> ⚠️ **CRITICAL: No Simplified Formulations**
>
> The MILP formulation must model ALL aspects of the business problem:
>
> - Every constraint mentioned in the business prompt
> - Every decision variable needed
> - All material/inventory tracking if mentioned
> - All BOM/routing dependencies if mentioned
> - All capacity and calendar constraints
>
> Do NOT create "simplified" versions that omit business requirements. If the business prompt describes inventory tracking, BOM dependencies, or multi-stage production, these MUST be in the formulation.

---

# Generate Business Problem Description

Transform user prompts into a structured business problem document targeted for optimization.

## Output Location

```
<packageName>/resource/examples/<packageName>-BusinessPrompt.md
```

## Required Sections

| Section                     | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| **Business Objective**      | What are we optimizing? What metric defines success?                          |
| **Planning Cycle**          | When does planning happen? What inputs/outputs?                               |
| **Core Decisions**          | What must the model decide? (order selection, assignment, sequencing, timing) |
| **Constraints & Tradeoffs** | Real-world limits (capacity, inventory, routing, time, operational rules)     |
| **Entities to Model**       | Data model entities with key fields                                           |
| **Summary**                 | One-paragraph recap of the optimization problem                               |

## Template

```markdown
# Business Prompt: <Problem Name>

You are building an internal enterprise application for <Company/Context>.

## Business Objective

**Primary Goal:** <Maximize/Minimize what?>
**Success Metric:** <Quantifiable target>

## Planning Cycle

1. **Demand Input:** <What demand info and when?>
2. **Resource Availability:** <What resources/constraints known?>
3. **Planning Output:** <What does the plan specify?>
4. **Backlog Management:** <How is unfulfilled demand handled?>

## Core Business Problem (What Must Be Decided)

1. <Decision 1>
2. <Decision 2>
3. <Decision 3>

## Constraints and Tradeoffs

### <Category 1>

- <Constraint>

### <Category 2>

- <Constraint>

## Entities to Model

| Entity      | Description | Key Fields     |
| ----------- | ----------- | -------------- |
| **Entity1** | Description | field1, field2 |

## Summary

The application supports <planning cadence> under constraints, with the goal of <primary objective>.
```

---

# Create and Test MILP Formulation

Convert the business problem into a mathematical optimization model and validate it with tests.

## Output Locations

| Artifact              | Location                                                           |
| --------------------- | ------------------------------------------------------------------ |
| Formulation document  | `<packageName>/resource/formulations/<packageName>-formulation.md` |
| Formulation test code | `<packageName>/tests/py/test_formulation.py`                       |
| Solver test code      | `<packageName>/tests/py/test_solver.py`                            |

## Local Testing Environment Setup

Before running tests locally, ensure you have a conda environment with Gurobi installed.

> **Note:** This is for **local testing only**. On C3, use the `py.3.12-optim_312-server-py4j` runtime which has Gurobi pre-installed.

**One-time setup (if not already done):**

```bash
conda create -n agent-gurobi python=3.10 -y
conda activate agent-gurobi
pip install gurobipy
```

**Gurobi License:** A valid Gurobi license is required. Academic licenses are free at [gurobi.com](https://www.gurobi.com/academia/academic-program-and-licenses/). For local testing, the free "restricted license" (included with pip install) works for small models.

## Write the Complete Formulation

> ⚠️ **IMPORTANT: Cover All Business Requirements**
>
> The formulation must address EVERY constraint and decision in the business prompt.
> Cross-reference each section of the business prompt to ensure nothing is omitted.

### Formulation Completeness Checklist

Before finalizing, cross-reference the business prompt and verify the formulation covers every requirement:

| Business Prompt Section       | Formulation Must Include                             |
| ----------------------------- | ---------------------------------------------------- |
| **Business Objective**        | Objective function that optimizes the stated goal    |
| **Core Decisions**            | Decision variables for each decision mentioned       |
| **Every Constraint Category** | Corresponding mathematical constraints               |
| **Every Entity Relationship** | Parameters and variables that model the relationship |

**How to verify completeness:**

1. List every constraint mentioned in the business prompt
2. For each constraint, identify the corresponding mathematical constraint(s)
3. If a constraint has no formulation equivalent, add it
4. Repeat until every business requirement maps to formulation elements

**Handling redundant or conflicting constraints:**
If the business prompt contains redundant or conflicting constraints, implement what makes practical and mathematical sense:

- **Redundant constraints:** Include only the more restrictive or canonical form; document the simplification
- **Conflicting constraints:** Resolve in favor of what is mathematically feasible or practically meaningful; document the resolution and rationale
- When in doubt, ask the user for clarification before proceeding

### Required Formulation Sections

#### Problem Summary

Briefly restate the business problem in optimization terms:

- What is being optimized (minimized/maximized)
- Key decision points
- Main constraints and trade-offs

#### Indices and Sets

```
Sets:
  I       Set of products, indexed by i
  J       Set of facilities, indexed by j
  T       Set of time periods, indexed by t
  S ⊆ J   Subset of supplier facilities
```

#### Parameters (Data)

```
Parameters:
  d_it        Demand for product i in period t (units)
  c_ij        Unit cost to ship from i to j ($/unit)
  cap_j       Capacity of facility j (units/period)
  lt_ij       Lead time from i to j (periods)
  bom_ip      Units of product p required per unit of i
```

#### Decision Variables

```
Continuous Variables:
  x_ijt ≥ 0       Quantity shipped from i to j in period t
  I_it ≥ 0        Inventory of product i at end of period t

Integer Variables:
  n_jt ∈ Z⁺      Number of batches produced at j in period t

Binary Variables:
  y_jt ∈ {0,1}   1 if facility j is open in period t
  z_ijt ∈ {0,1}  1 if route i→j is used in period t
```

#### Objective Function

```
Minimize: Total Cost = Production + Inventory + Transportation

  min  Σ_ijt (c_ij · x_ijt) + Σ_it (h_i · I_it) + Σ_jt (f_j · y_jt)
```

#### Constraints

Group constraints with brief explanations. Include ALL constraints from the business prompt.

**Common constraint categories (examples — actual constraints depend on your business prompt):**

- Resource/capacity limits (machines, labor, storage)
- Inventory or flow balance
- Demand satisfaction or order fulfillment
- Material consumption or BOM ratios
- Sequencing, precedence, or routing dependencies
- Time windows, calendars, or scheduling restrictions
- Quality, regulatory, or business rules

---

## Write Gurobipy Test Code

> ⚠️ **MANDATORY: Tests Must Pass Before Proceeding**
>
> You MUST:
>
> 1. Create test files for the formulation
> 2. Run the tests locally using `conda activate agent-gurobi`
> 3. Verify ALL tests pass
> 4. Only then proceed to create the solver and data model
>
> Do NOT skip this step. Do NOT proceed if tests fail.

Create test files that validate the formulation with synthetic data.

### Test File Template

```python
"""
Test file for <Problem Name> MILP formulation.
Uses synthetic data to validate the formulation logic.

IMPORTANT: Run these tests before creating the solver:
    conda activate agent-gurobi
    python <packageName>/tests/py/test_formulation.py
"""

import gurobipy as gp
from gurobipy import GRB

def test_basic_scenario():
    """
    Test: Basic scenario with minimal data.
    Expected: Model should be feasible and produce expected results.
    """
    # === SYNTHETIC DATA ===
    # Keep data minimal and easy to verify by hand

    # === MODEL ===
    model = gp.Model("test_basic")

    # Variables, Objective, Constraints...

    # === SOLVE ===
    model.optimize()

    # === ASSERTIONS ===
    assert model.Status == GRB.OPTIMAL, f"Model not optimal: {model.Status}"
    print("✓ test_basic_scenario passed")


def test_capacity_constraint():
    """Test: Verify capacity constraints are respected."""
    # ... similar structure ...
    print("✓ test_capacity_constraint passed")


def test_inventory_balance():
    """Test: Verify inventory flows correctly across periods."""
    # ... test inventory tracking ...
    print("✓ test_inventory_balance passed")


def test_bom_dependencies():
    """Test: Verify BOM/material consumption is enforced."""
    # ... test material requirements ...
    print("✓ test_bom_dependencies passed")


def test_infeasible_scenario():
    """Test: Verify model correctly identifies infeasible cases."""
    # ... create infeasible scenario ...
    assert model.Status == GRB.INFEASIBLE, "Model should be infeasible"
    print("✓ test_infeasible_scenario passed")


if __name__ == "__main__":
    test_basic_scenario()
    test_capacity_constraint()
    test_inventory_balance()
    test_bom_dependencies()
    test_infeasible_scenario()
    print("\n✓ All tests passed!")
```

### Required Test Scenarios

Create tests for EACH constraint type in your formulation. The specific tests depend on your business problem.

**Example test scenarios (adapt to your specific constraints):**

| Constraint Type       | Example Test Scenario                             |
| --------------------- | ------------------------------------------------- |
| Assignment/completion | Verify all tasks/orders are assigned exactly once |
| Capacity              | Verify resource limits are respected              |
| Flow/balance          | Verify inventory or flow conservation             |
| Availability          | Verify production respects available inputs       |
| Dependencies          | Verify sequencing or precedence rules             |
| Time windows          | Verify scheduling within allowed periods          |
| Infeasibility         | Verify model detects impossible scenarios         |

**Key principle:** For every constraint in your formulation, create a test that would fail if that constraint were removed.

### Synthetic Data Rules

- Use small numbers (1-10 range) for easy manual verification
- Use round numbers to avoid floating-point issues
- Document expected results as comments
- Calculate expected values by hand before running

### Assertion Patterns

```python
# Check optimality
assert model.Status == GRB.OPTIMAL

# Check objective value
assert abs(model.ObjVal - expected_obj) < 1e-6

# Check variable value
assert abs(x.X - expected_x) < 1e-6

# Check binary is 0 or 1
assert y.X in [0, 1] or abs(y.X) < 1e-6 or abs(y.X - 1) < 1e-6
```

---

## Run and Validate Tests

> ⚠️ **STOP: Do NOT proceed until tests pass**

```bash
# Activate the Gurobi environment
conda activate agent-gurobi

# Run the formulation tests
python <packageName>/tests/py/test_formulation.py

# ALL tests must pass before proceeding
```

### Test Execution Workflow

1. **Run formulation tests** — Validate the MILP logic with synthetic data
2. **Fix any failures** — Debug and iterate until all tests pass
3. **Run solver tests** — After creating solver, test with seed data
4. **Verify feasibility** — Ensure seed data produces a valid solution

### If Tests Fail

1. Read the error message carefully
2. Check if the constraint logic is correct
3. Verify synthetic data is valid (not inherently infeasible)
4. Debug variable values by printing intermediate results
5. Re-run until all tests pass

---

## MILP Reference

### Notation

| Symbol | Meaning                |
| ------ | ---------------------- |
| Σ      | Summation              |
| ∀      | For all                |
| ∈      | Element of             |
| ⊆      | Subset of              |
| Z⁺     | Non-negative integers  |
| ≥, ≤   | Inequality constraints |

### Common Constraint Templates

| Category     | Template                                  |
| ------------ | ----------------------------------------- |
| Flow balance | `in - out = demand ± inventory`           |
| Capacity     | `usage ≤ capacity × binary`               |
| Demand       | `supply ≥ demand`                         |
| Linking      | `continuous ≤ M × binary`                 |
| BOM          | `Σ (usage_rate × production) ≤ available` |
| Logical OR   | `y₁ + y₂ ≥ 1`                             |
| Logical AND  | `y₁ + y₂ ≤ 2·z; z ≤ y₁; z ≤ y₂`           |

---

## Checklist

### Business Problem Description

- [ ] Business objective clearly stated with success metrics
- [ ] Planning cycle defined (inputs, outputs, timing)
- [ ] Core decisions enumerated
- [ ] Constraints categorized and described
- [ ] Entities to model listed with key fields
- [ ] Summary captures the essence of the problem

### MILP Formulation

- [ ] Formulation covers ALL constraints from business prompt
- [ ] Formulation covers ALL decisions from business prompt
- [ ] All indices/sets defined with clear meaning
- [ ] All parameters listed with units
- [ ] Variables classified (continuous/integer/binary)
- [ ] Objective has clear business interpretation
- [ ] Constraints grouped logically with explanations
- [ ] No "simplified" version that omits requirements

### Testing (MANDATORY)

- [ ] Test file created with synthetic data
- [ ] Tests cover each constraint type
- [ ] Tests run successfully: `conda activate agent-gurobi && python tests/py/test_formulation.py`
- [ ] ALL tests pass
- [ ] Seed data tested for feasibility after solver created

---

## Next Steps

➡️ **Only after ALL tests pass**, proceed to **pso-data-model-c3.md** to create C3 types and seed data based on your MILP formulation.
