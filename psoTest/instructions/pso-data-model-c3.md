---
description: C3 Instructions for PSO Input Data Model and Seed Data Setup
alwaysApply: false
---

# PSO Data Model Instructions

You are an operations research and C3 AI expert. Your task is to create C3 AI types that represent the optimization input data and generate seed files that align with your MILP formulation for testing.

## Core Principles

- **Consistent patterns** — follow C3 AI conventions for types, transforms, and APIs
- **Explicit assumptions** — state any assumptions when information is missing
- **Test-driven** — write and run tests at each stage before proceeding

## Runtime Requirement

**All Python code in this guide must run in the `py.3.12-optim_312-server-py4j` runtime.** This runtime contains the required optimization dependencies (gurobipy, etc.).

| Requirement           | Description                                       |
| --------------------- | ------------------------------------------------- |
| **App MCP**           | Must be connected to the application              |
| **Code Runner Tools** | Py and JS code runner tools must be available     |
| **Runtime**           | `py.3.12-optim_312-server-py4j` must be installed |

Refer to the `/c3-runtime` skill for the full installation and verification workflow.

**Note:** If App MCP or code runner tools are not available, inform the user that they need to set up the MCP connection first before running any code.

## You can proceed with other tasks once you have initiated the runtime installation.

# Create PsoInput Data Model and Seed Data

Create C3 AI types that represent the optimization input data and generate seed files that align with your MILP formulation for testing.

## Output Locations

| Artifact       | Location                                    |
| -------------- | ------------------------------------------- |
| C3 input types | `<packageName>/src/input/`                  |
| Seed data      | `<packageName>/seed/PsoInput/PsoInput.json` |

## Naming Convention

**All PSO input types must begin with the `Pso` prefix.** This ensures clear identification of optimization-related types.

| Pattern               | Example                          |
| --------------------- | -------------------------------- |
| Top-level container   | `PsoInput.c3typ`                 |
| Domain-specific types | `Pso<Domain><Entity>Input.c3typ` |

**Examples:**

- `PsoInput.c3typ` — Top-level container
- `PsoInkOrderInput.c3typ` — Ink scheduling order
- `PsoInkCellInput.c3typ` — Ink production cell
- `PsoTruckLoadInput.c3typ` — Truck loading order
- `PsoFacilityInput.c3typ` — Generic facility

## Type Keywords: `entity type` vs `type`

**CRITICAL:** Use the correct type keyword based on persistence requirements:

| Keyword       | Use Case                                                         | Can be seeded? | Has API endpoints? |
| ------------- | ---------------------------------------------------------------- | -------------- | ------------------ |
| `entity type` | Top-level containers that need persistence (PsoInput, PsoOutput) | ✅ Yes         | ✅ Yes             |
| `type`        | Embedded/nested structures, API service types                    | ❌ No          | ❌ No              |

**Rules:**

- **`entity type`**: Use for `PsoInput` and `PsoOutput` — they must be persisted and fetched via API
- **`type`**: Use for nested arrays like `PsoInkOrderInput`, `PsoScheduleOutput`, and service types like `PsoOptimizer`

```c3typ
// ✅ Correct: entity type for top-level persistable containers
entity type PsoInput { ... }
entity type PsoOutput { ... }

// ✅ Correct: regular type for embedded/nested structures
type PsoInkOrderInput { ... }
type PsoScheduleOutput { ... }

// ✅ Correct: regular type for service/API types (no persistence)
type PsoOptimizer { ... }
```

## Reference Examples

Before creating your data model, review these example PsoInput JSON structures:

- `<packageName>/resource/examples/pso_input_example1.json` — Basic structure example

---

## Core Type Hierarchy

The PsoInput data model follows this hierarchical structure:

```
PsoInput (top-level container)
├── facilities: [PsoFacilityInput]
│   ├── items: [PsoItemFacilityInput]
│   ├── tasks: [PsoTaskInput]
│   └── (additional facility-level collections as needed)
├── items: [PsoItemInput]
├── startDate / endDate (optimization horizon)
└── (additional global parameters as needed)
```

---

## Create Input Types

Create the following types in `<packageName>/src/input/`:

### PsoInput.c3typ (Top-Level Container)

```c3typ
entity type PsoInput {
  /**
   * List of facilities in scope for optimization
   */
  facilities: ![PsoFacilityInput]

  /**
   * Master list of all items (materials, products)
   */
  items: ![PsoItemInput]

  /**
   * Start date of the optimization horizon
   */
  startDate: !date

  /**
   * End date of the optimization horizon
   */
  endDate: !date

  // === ADD DOMAIN-SPECIFIC FIELDS BELOW ===
  // Map fields from your MILP formulation parameters here
}
```

### PsoFacilityInput.c3typ (Facility-Level Data)

```c3typ
type PsoFacilityInput {
  /**
   * Unique identifier for the facility
   */
  facilityId: !string

  /**
   * Items in scope for this facility
   */
  items: [PsoItemFacilityInput]

  /**
   * Production tasks/BOMs/recipes at this facility
   */
  tasks: ![PsoTaskInput]

  // === ADD DOMAIN-SPECIFIC FIELDS ===
  // Examples: workingDays, capacityHours, resourceCapacities, changeoverMatrix
}
```

### PsoItemFacilityInput.c3typ (Item-Facility State)

```c3typ
type PsoItemFacilityInput {
  /**
   * Reference to the item
   */
  itemId: !string

  /**
   * Initial inventory on hand at this facility
   */
  initialInventory: double

  /**
   * Scheduled supply arrivals (time-indexed array)
   */
  arrivals: [double]

  /**
   * Demand by category (key: category, value: time-indexed array)
   */
  demand: map<string, [double]>

  // === ADD DOMAIN-SPECIFIC FIELDS ===
  // Examples: safetyStock, productionLimit, holdingCost, backorderCost
}
```

### PsoTaskInput.c3typ (BOM/Recipe Definition)

```c3typ
type PsoTaskInput {
  /**
   * Unique identifier for the task/BOM/recipe
   */
  taskId: !string

  /**
   * Effective start date for this task version
   */
  start: !date

  /**
   * Effective end date for this task version
   */
  end: !date

  /**
   * Input components with quantities per unit of output
   */
  inputs: !map<string, double>

  /**
   * Primary output item and quantity produced
   */
  primaryOutput: !Pair<string, double>

  // === ADD DOMAIN-SPECIFIC FIELDS ===
  // Examples: leadTimeOffsets, processingTime, resourceRequirements, yieldFactor
}
```

### PsoItemInput.c3typ (Item Master Data)

```c3typ
type PsoItemInput {
  /**
   * Unique identifier for the item
   */
  itemId: !string

  /**
   * Item classification (raw material, WIP, finished good)
   */
  itemType: !string

  /**
   * Unit cost or value per unit
   */
  unitCost: !double

  // === ADD DOMAIN-SPECIFIC FIELDS ===
  // Examples: leadTime, lotSizeMin, lotSizeMax, productionRate
}
```

---

## Map MILP Parameters to Data Model

**Critical:** Ensure every parameter in your MILP formulation has a corresponding field in the data model.

| MILP Parameter               | Maps To                                               |
| ---------------------------- | ----------------------------------------------------- |
| Sets (I, J, T)               | Array lengths and facility/item counts                |
| Demand `d_it`                | `PsoItemFacilityInput.demand`                         |
| Capacity `cap_j`             | `PsoFacilityInput.resourceCapacities` or domain field |
| Processing time `proc_o`     | `PsoTaskInput.processingTime` or domain field         |
| Due dates `d_o`              | Domain-specific field on order/task type              |
| Costs (holding, setup, etc.) | Domain-specific cost fields                           |

---

## Generate Seed Data

Create seed data that exercises your MILP formulation. The seed data should:

1. **Match your test scenarios** — Use the same data patterns as your Gurobipy tests
2. **Be realistic but small** — 5-10 orders, 2-3 facilities, 3-5 items
3. **Cover edge cases** — Include scenarios that test constraint boundaries

### Seed File Location

```
<packageName>/seed/PsoInput/PsoInput.json
```

### Seed Data Template

**IMPORTANT:** All seed files for entity types must include an `id` field.

```json
{
  "id": "MyOptimization_2024_01_01",
  "startDate": "2024-01-01",
  "endDate": "2024-01-07",
  "facilities": [
    {
      "facilityId": "FACILITY_001",
      "items": [
        {
          "itemId": "ITEM_001",
          "initialInventory": 100,
          "arrivals": [0, 50, 0, 0, 0, 0, 0],
          "demand": {
            "orders": [20, 30, 25, 15, 40, 20, 10]
          }
        }
      ],
      "tasks": [
        {
          "taskId": "TASK_001",
          "start": "2024-01-01",
          "end": "2024-12-31",
          "inputs": { "RAW_001": 2.0 },
          "primaryOutput": { "first": "ITEM_001", "second": 1.0 }
        }
      ]
    }
  ],
  "items": [
    {
      "itemId": "ITEM_001",
      "itemType": "FINISHED_GOOD",
      "unitCost": 10.0
    },
    {
      "itemId": "RAW_001",
      "itemType": "RAW_MATERIAL",
      "unitCost": 2.5
    }
  ]
}
```

### Seed Data Guidelines

- **Required `id` field**: Every seed file for an entity type MUST have an `id` field at the top level
- **Time granularity**: Match array lengths to your planning horizon (e.g., 7 days = 7 elements)
- **Consistent IDs**: Use clear, readable IDs (e.g., `FACILITY_001`, `ITEM_A`)
- **Include all required fields**: Every non-optional field must have a value
- **Test feasibility**: Ensure the data represents a solvable optimization problem
- **Folder structure**: Seed files must be in `<packageName>/seed/<TypeName>/<TypeName>.json`

---

## Supporting Types (Optional)

Add these types if your domain requires them:

### PsoWorkOrderInput.c3typ (Existing Commitments)

```c3typ
type PsoWorkOrderInput {
  workOrderId: !string
  dueDate: !date
  outputItem: !string
  outputQuantity: !double
}
```

### PsoResourceInput.c3typ (Resource Definitions)

```c3typ
type PsoResourceInput {
  resourceId: !string
  resourceType: !string
  availableCapacity: [double]
}
```

---

## Design Principles

### Separation of Concerns

| Level                    | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| **PsoInput**             | Global parameters, time horizon, objective weights |
| **PsoFacilityInput**     | Facility-specific capacity, calendars, constraints |
| **PsoItemFacilityInput** | Item state at facility (inventory, demand, supply) |
| **PsoTaskInput**         | Production relationships (BOM, recipes)            |
| **PsoItemInput**         | Item master data (shared across facilities)        |

### Data Conventions

- **Time-indexed arrays**: Use `[double]` for time-series aligned with horizon
- **Maps for sparse data**: Use `map<string, double>` for categorical data
- **Consistent array lengths**: All time-indexed arrays should have same length

---

## Checklist

### PsoInput Data Model

- [ ] Reviewed example JSONs in `<packageName>/resource/examples/pso_input_example*.json`
- [ ] PsoInput.c3typ created as **`entity type`** in `<packageName>/src/input/`
- [ ] Nested input types created as `type` (PsoFacilityInput, PsoItemInput, etc.)
- [ ] All MILP parameters mapped to data model fields
- [ ] Seed data generated in `<packageName>/seed/PsoInput/PsoInput.json` with `id` field
- [ ] Seed data matches Gurobipy test scenarios

---

## Next Steps

➡️ Proceed to **pso-run-optimizer-c3.md** to implement the solver and UI service.
