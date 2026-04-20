# Crude Schedule Optimizer — MILP Formulation

> Scope: Aspropyrgos refinery only (v1). Planning horizon T in
> {7, 14, 30} days, daily granularity. Companion to
> `psoTest-BusinessPrompt.md`.

## Problem Summary

We jointly decide **cargo nomination**, **berth timing**, **tank assignment**,
**CDU daily charge**, and **replenishment recommendations** over a rolling
horizon so as to maximize a weighted combination of GRM, demurrage avoided,
and logistics cost saved, subject to tank, berth, pipeline, CDU, blend, and LP
constraints.

---

## Indices and Sets

```
t ∈ T = {0, …, H−1}          Planning day index (H = horizon length)
c ∈ C                        Cargoes / vessels in scope
g ∈ G                        Crude grades (Arab Light, Urals, CPC, Azeri, …)
k ∈ K                        Tanks at the refinery
u ∈ U                        CDUs (CDU-1, CDU-2)
b ∈ B                        Berths (aggregated; |B| = berthCount)
```

Group subsets:
```
K_HS ⊂ K      HighSulphur tanks
K_LS ⊂ K      LowSulphur tanks
K_SL ⊂ K      Slops tanks
G_HS ⊂ G      HighSulphur grades
G_LS ⊂ G      LowSulphur grades
```

Cargo attributes: `grade(c) ∈ G`, `vol(c)` (bbls), `laycan(c) = [ls_c, le_c]`,
`vesselClass(c)`, `isFixed(c) ∈ {0,1}`.

---

## Parameters

```
cap_k         Tank capacity (bbls)
inv0_k        Initial inventory at tank k (bbls)
grade0_k      Current grade in tank k (if any)
vol_c         Cargo volume (bbls)
ls_c, le_c    Laycan start / end day for cargo c
demRate_c     Demurrage rate ($/day) for cargo c's vessel class
freight_c     Freight + logistics cost ($) if cargo nominated
diff_g        Price differential ($/bbl) of grade g vs marker
grm_g         Contribution to GRM ($/bbl) of grade g at this refinery
thrMin_u      Min daily throughput of CDU u (bpd)
thrMax_u      Max daily throughput of CDU u (bpd)
lp_ugt        LP target charge of grade g at CDU u on day t (bpd)
maint_ut      1 if CDU u is down on day t (maintenance), else 0
sulphur_g     Sulphur % of grade g
api_g         API gravity of grade g
sulphurMax_u  Blend sulphur limit at CDU u
apiMin_u      Blend API minimum at CDU u
pipeCap       Pipeline capacity (bbls/day)
berthCount    Number of concurrent berths |B|
holdCost_g    Inventory holding cost ($/bbl/day)
stockoutCost  Per-bbl penalty for unmet LP demand
dofFloor      Minimum days-of-cover per group (default 7)
w_grm, w_dem, w_log, w_lp   Objective weights (depend on user-selected objective)
```

---

## Decision Variables

```
# Cargo nomination (binary)
a_c ∈ {0,1}                Accept cargo c
sub_c ∈ {0,1}              Substitute cargo c (replace grade, same laycan)
def_c ∈ {0,1}              Defer cargo c (push berthing past laycan end)
drp_c ∈ {0,1}              Drop cargo c entirely
# Constraint: a_c + sub_c + def_c + drp_c = 1 if isFixed(c)=0; a_c = 1 otherwise.

# Berth timing (continuous, bounded to horizon)
s_c ∈ [0, H]               Berth start day for cargo c

# Demurrage (continuous, ≥ 0)
dem_c ≥ 0                  Days of demurrage for cargo c

# Tank assignment (binary)
y_ck ∈ {0,1}               Cargo c unloaded into tank k

# Tank inventory (continuous, ≥ 0)
I_kgt ≥ 0                  Inventory of grade g in tank k end-of-day t

# CDU charge (continuous, ≥ 0)
x_ugt ≥ 0                  Volume of grade g charged to CDU u on day t (bpd)

# LP deviation slack (continuous, ≥ 0)
devPos_ugt, devNeg_ugt ≥ 0 Positive / negative deviation from LP

# Stockout slack (continuous, ≥ 0)
short_gt ≥ 0               Unmet demand of grade g on day t
```

Derived: `berth_bt ∈ {0,1}` — 1 if berth b is occupied on day t (expressed via
`s_c`, `a_c`, and discharge duration `δ_c`).

---

## Objective

Composite objective, tuned by the user-selected mode via `(w_grm, w_dem, w_log, w_lp)`:

```
maximize
    w_grm · Σ_ugt (grm_g · x_ugt)                              # refinery margin
  − w_dem · Σ_c (demRate_c · dem_c)                            # demurrage cost
  − w_log · Σ_c (freight_c · a_c + substPenalty · sub_c)       # logistics cost
  − w_lp  · Σ_ugt (devPos_ugt + devNeg_ugt)                    # LP alignment
  − Σ_gt stockoutCost · short_gt                               # stockout penalty
  − Σ_kgt holdCost_g · I_kgt                                   # holding cost
```

Mode presets:

| Mode           | w_grm | w_dem | w_log | w_lp |
|----------------|-------|-------|-------|------|
| `MaxGRM`       | 1.0   | 0.2   | 0.2   | 0.2  |
| `MinDemurrage` | 0.2   | 1.0   | 0.3   | 0.2  |
| `MinLogistics` | 0.2   | 0.3   | 1.0   | 0.2  |
| `Balanced`     | 0.6   | 0.6   | 0.4   | 0.4  |

---

## Constraints

### (1) Cargo decision exclusivity

```
a_c + sub_c + def_c + drp_c = 1              ∀ c ∈ C
a_c = 1                                      ∀ c with isFixed(c) = 1
```

### (2) Laycan / berth timing

```
ls_c · (a_c + sub_c) ≤ s_c ≤ le_c + flex · (1 − def_c)      ∀ c
dem_c ≥ s_c − le_c                                          ∀ c (demurrage = days late)
dem_c ≥ 0
```

Where `flex` is the Optimizer's arrival-flexibility slider (0–5 days).

### (3) Berth concurrency

At most `berthCount` cargoes may be berthed concurrently on any day t:
```
Σ_c 1[s_c ≤ t < s_c + δ_c] · (a_c + sub_c) ≤ berthCount     ∀ t
```
(Linearized via big-M and auxiliary `berth_bt` binaries in code.)

### (4) Tank nomination and segregation

```
Σ_k y_ck = a_c + sub_c                       ∀ c                 (one tank per accepted cargo)
y_ck = 0                                     ∀ c, k with tankGroup(k) incompatible with grade(c)
```

### (5) Tank capacity (per tank, per day)

```
0 ≤ I_kgt ≤ cap_k                            ∀ k, g, t
Σ_g I_kgt ≤ cap_k                            ∀ k, t
```

### (6) Tank flow balance

```
I_kgt = I_kg,t−1
      + Σ_{c: grade(c)=g, ⌊s_c⌋=t} vol_c · y_ck · (a_c + sub_c)
      − Σ_u withdraw_ukgt                    ∀ k, g, t
```
`withdraw_ukgt` is the portion of `x_ugt` pulled from tank k.

### (7) CDU throughput envelope (respecting maintenance)

```
thrMin_u · (1 − maint_ut) ≤ Σ_g x_ugt ≤ thrMax_u · (1 − maint_ut)    ∀ u, t
```

### (8) CDU blend constraints

```
Σ_g sulphur_g · x_ugt ≤ sulphurMax_u · Σ_g x_ugt       ∀ u, t
Σ_g api_g · x_ugt      ≥ apiMin_u · Σ_g x_ugt          ∀ u, t
```
(Linearized directly — both sides are linear in x.)

### (9) Pipeline capacity

```
Σ_c 1[⌊s_c⌋ = t] · vol_c · (a_c + sub_c) ≤ pipeCap     ∀ t
```

### (10) LP alignment (soft)

```
x_ugt − lp_ugt = devPos_ugt − devNeg_ugt               ∀ u, g, t
devPos_ugt, devNeg_ugt ≥ 0
```

### (11) Demand satisfaction with slack

```
Σ_u x_ugt + short_gt ≥ Σ_u lp_ugt                      ∀ g, t
```

### (12) Days-of-cover floor (per group)

```
Σ_{k ∈ K_HS, g ∈ G_HS} I_kgt ≥ dofFloor · Σ_{u, g ∈ G_HS} avg(x_ugt)   ∀ t
Σ_{k ∈ K_LS, g ∈ G_LS} I_kgt ≥ dofFloor · Σ_{u, g ∈ G_LS} avg(x_ugt)   ∀ t
```

### (13) Non-negativity / integrality as declared.

---

## Risk flag post-processing

After solve, the solver inspects primals/duals to emit the structured JSON
flags required by the UI:

- `DEMURRAGE_RISK` when `dem_c > 0` or `s_c > le_c − 1`.
  Severity = clamp(⌈dem_c⌉, 1, 5).
- `STOCKOUT_RISK` when `short_gt > 0` or DOF floor dual active.
  Severity = clamp(⌈short_gt / avg demand⌉, 1, 5).
- `OVERSTOCK_RISK` when `I_kgt > 0.9 · cap_k` and `maint_ut = 1` soon.
- `BLEND_VIOLATION` when a blend constraint has near-zero slack and the
  corresponding rec proposes `SUBSTITUTE` or `DEFER`.

---

## Decision mapping (→ UI contract)

Each cargo c maps to exactly one top-level decision:

| Optimizer outcome | UI decision  |
|-------------------|--------------|
| `a_c = 1`         | `HOLD`       |
| `sub_c = 1`       | `SUBSTITUTE` |
| `def_c = 1`       | `DEFER`      |
| `drp_c = 1`       | `DROP`       |
| `short_gt > 0`    | adds `REORDER` recommendation (replenishment plan) |

Confidence per recommendation is computed as:
```
confidence = 100 · (1 − α · missingDataRatio − β · devNorm − γ · |reducedCost|)
```
clamped to [50, 99]. Missing-data rules (from the spec) lower confidence and
add explicit assumption entries.

---

## Completeness check vs business prompt

| Business constraint                       | Formulation section |
|-------------------------------------------|---------------------|
| Tank ≥ 0 and ≤ capacity                   | (5)                 |
| Tank segregation HS/LS/Slops              | (4)                 |
| Days-of-cover floor                       | (12)                |
| Tank flow balance                         | (6)                 |
| Berth concurrency / laycan                | (2), (3)            |
| Demurrage (lateness × rate)               | (2), objective      |
| Vessel flexibility ±N days                | (2)                 |
| CDU throughput envelope                   | (7)                 |
| CDU blend: sulphur, API                   | (8)                 |
| LP alignment                              | (10), objective     |
| Demand cover                              | (11)                |
| Pipeline capacity                         | (9)                 |
| Maintenance shutdowns                     | (7) via `maint_ut`  |
| Cargo decisions REORDER/HOLD/SUBSTITUTE/DEFER/DROP | (1) + post-processing |

All constraints listed in the business prompt have corresponding formulation
elements.
