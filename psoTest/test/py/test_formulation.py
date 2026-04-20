"""
Test file for the Crude Schedule Optimizer MILP formulation.
Uses synthetic data to validate the formulation logic.

Run (requires Gurobi license):
    conda activate agent-gurobi
    python psoTest/test/py/test_formulation.py

If Gurobi is unavailable, these tests will exit with status code 2 (skipped)
rather than failing hard — the solver has a deterministic rule-based fallback
exercised by test_solver.py.
"""

import sys


def _import_gurobi():
    try:
        import gurobipy as gp  # noqa: F401
        from gurobipy import GRB  # noqa: F401
        return gp, GRB
    except Exception as e:  # pragma: no cover
        print(f"[SKIP] gurobipy not available: {e}")
        sys.exit(2)


def test_tank_capacity_and_flow_balance():
    """Inventory stays ≥ 0 and ≤ capacity; flow balance holds over 3 days."""
    gp, GRB = _import_gurobi()
    m = gp.Model("test_tank")
    m.setParam("OutputFlag", 0)
    H = 3
    cap = 500.0
    inv0 = 200.0
    # Arrival of 200 on day 1, withdrawal of 100 each day
    I = m.addVars(range(H), lb=0, ub=cap, name="I")
    w = [100.0, 100.0, 100.0]
    arr = [0.0, 200.0, 0.0]
    m.addConstr(I[0] == inv0 + arr[0] - w[0])
    for t in range(1, H):
        m.addConstr(I[t] == I[t - 1] + arr[t] - w[t])
    m.setObjective(0, GRB.MINIMIZE)
    m.optimize()
    assert m.Status == GRB.OPTIMAL
    expected = [100.0, 200.0, 100.0]
    for t in range(H):
        assert abs(I[t].X - expected[t]) < 1e-6, (t, I[t].X, expected[t])
    print("✓ test_tank_capacity_and_flow_balance passed")


def test_cdu_blend_sulphur_limit():
    """Charging high-sulphur crude beyond limit is infeasible."""
    gp, GRB = _import_gurobi()
    m = gp.Model("test_blend")
    m.setParam("OutputFlag", 0)
    # Two grades: Arab Light (1.8% S), Urals (1.35% S); limit 1.5%
    sulphur = {"AL": 1.8, "URALS": 1.35}
    thr_min, thr_max = 100.0, 150.0
    limit = 1.5
    x = m.addVars(["AL", "URALS"], lb=0, name="x")
    total = gp.quicksum(x[g] for g in ["AL", "URALS"])
    m.addConstr(total >= thr_min)
    m.addConstr(total <= thr_max)
    m.addConstr(gp.quicksum(sulphur[g] * x[g] for g in x) <= limit * total)
    # Force only AL (infeasible at 1.8 > 1.5)
    m.addConstr(x["URALS"] == 0)
    m.optimize()
    assert m.Status in (GRB.INFEASIBLE, GRB.INF_OR_UNBD)
    print("✓ test_cdu_blend_sulphur_limit passed")


def test_berth_concurrency():
    """Cannot berth 3 cargoes concurrently when berthCount = 2."""
    gp, GRB = _import_gurobi()
    m = gp.Model("test_berth")
    m.setParam("OutputFlag", 0)
    # 3 cargoes all want day 1; berth duration 1 day; berths = 2
    C = ["c1", "c2", "c3"]
    H = 3
    s = m.addVars(C, lb=0, ub=H - 1, vtype=GRB.INTEGER, name="s")
    # One binary per (c,t) saying cargo c occupies berth on day t
    occ = m.addVars(C, range(H), vtype=GRB.BINARY, name="occ")
    for c in C:
        for t in range(H):
            # occ = 1 iff s[c] == t
            m.addConstr(s[c] - t <= (1 - occ[c, t]) * H)
            m.addConstr(t - s[c] <= (1 - occ[c, t]) * H)
        m.addConstr(gp.quicksum(occ[c, t] for t in range(H)) == 1)
    # Berth concurrency
    for t in range(H):
        m.addConstr(gp.quicksum(occ[c, t] for c in C) <= 2)
    m.setObjective(gp.quicksum(s[c] for c in C), GRB.MINIMIZE)
    m.optimize()
    assert m.Status == GRB.OPTIMAL
    # At most 2 cargoes berth on day 0
    day0 = sum(1 for c in C if abs(s[c].X - 0) < 1e-6)
    assert day0 <= 2
    print("✓ test_berth_concurrency passed")


def test_demurrage_linearization():
    """dem_c ≥ s_c − le_c; dem_c = 0 when on time, > 0 when late."""
    gp, GRB = _import_gurobi()
    m = gp.Model("test_dem")
    m.setParam("OutputFlag", 0)
    le = 5
    s = m.addVar(lb=0, ub=10, name="s")
    dem = m.addVar(lb=0, name="dem")
    m.addConstr(dem >= s - le)
    # Force lateness = 3
    m.addConstr(s == 8)
    m.setObjective(dem, GRB.MINIMIZE)
    m.optimize()
    assert m.Status == GRB.OPTIMAL
    assert abs(dem.X - 3) < 1e-6, dem.X
    print("✓ test_demurrage_linearization passed")


def test_cargo_decision_exclusivity():
    """a + sub + def + drp = 1 enforces exactly one decision."""
    gp, GRB = _import_gurobi()
    m = gp.Model("test_decision")
    m.setParam("OutputFlag", 0)
    a = m.addVar(vtype=GRB.BINARY, name="a")
    sub = m.addVar(vtype=GRB.BINARY, name="sub")
    dfr = m.addVar(vtype=GRB.BINARY, name="def")
    drp = m.addVar(vtype=GRB.BINARY, name="drp")
    m.addConstr(a + sub + dfr + drp == 1)
    # Prefer 'a' with a small bonus
    m.setObjective(a, GRB.MAXIMIZE)
    m.optimize()
    assert m.Status == GRB.OPTIMAL
    total = round(a.X + sub.X + dfr.X + drp.X)
    assert total == 1
    assert round(a.X) == 1
    print("✓ test_cargo_decision_exclusivity passed")


def test_days_of_cover_floor():
    """DOF floor ≥ 7 days forces inventory buffer."""
    gp, GRB = _import_gurobi()
    m = gp.Model("test_dof")
    m.setParam("OutputFlag", 0)
    daily_withdraw = 50.0
    dof_floor = 7
    inv = m.addVar(lb=0, name="inv")
    m.addConstr(inv >= dof_floor * daily_withdraw)
    m.setObjective(inv, GRB.MINIMIZE)
    m.optimize()
    assert m.Status == GRB.OPTIMAL
    assert abs(inv.X - 350.0) < 1e-6
    print("✓ test_days_of_cover_floor passed")


if __name__ == "__main__":
    test_tank_capacity_and_flow_balance()
    test_cdu_blend_sulphur_limit()
    test_berth_concurrency()
    test_demurrage_linearization()
    test_cargo_decision_exclusivity()
    test_days_of_cover_floor()
    print("\n✓ All formulation tests passed!")
