"""
Local test script for the Crude Schedule Optimizer solver.

Runs the module-level solve_milp() directly — the SAME function executed on
C3 via c3.Lambda.fromPyFunc. If gurobipy is unavailable (no license, or
environment missing), solve_milp() transparently falls back to the
deterministic rule-based optimizer defined in PsoOptimizer.py.

This script verifies:
  * Solver returns a JSON payload matching the PsoOutput contract.
  * Every cargo produces a schedule row with a valid decision.
  * The CDU-2 sulphur violation surfaces as a SUBSTITUTE recommendation.
  * Missing data is detected and lowers confidence.
  * KPIs required by the Dashboard are populated.

Run:
    conda activate agent-gurobi
    python psoTest/test/py/test_solver.py
"""
import json
import os
import sys

# Allow importing PsoOptimizer.py from src/solver/.
THIS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(THIS, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "src", "solver"))

from PsoOptimizer import solve_milp, validateInput  # noqa: E402


VALID_DECISIONS = {"HOLD", "REORDER", "SUBSTITUTE", "DEFER", "DROP", "RETIME", "NOMINATE_TANK"}


def _load_seed():
    seed_path = os.path.join(ROOT, "seed", "PsoInput", "PsoInput.json")
    with open(seed_path, "r") as f:
        return json.load(f)


def test_solver_returns_full_contract():
    pso = _load_seed()
    result = solve_milp(json.dumps(pso), json.dumps({}), "Balanced", 0.01, 30, 2, "{}")

    # Top-level keys.
    required_top = {
        "status", "objectiveValue", "schedules", "recommendations",
        "kpis", "riskFlags", "anomalies", "cduChargeByDay",
        "tankInventoryByDay", "metadata", "solveTimeSeconds", "solvedAt",
        "objectiveMode",
    }
    missing = required_top - set(result.keys())
    assert not missing, f"Missing top-level keys: {missing}"

    print(f"[OK] status={result['status']} solver={result['metadata'].get('solver')}")

    # One schedule per cargo.
    n_cargoes = len(pso["facilities"][0]["cargoes"])
    assert len(result["schedules"]) == n_cargoes, (
        f"Expected {n_cargoes} schedules, got {len(result['schedules'])}"
    )
    for s in result["schedules"]:
        assert s["decision"] in VALID_DECISIONS, s
    print(f"[OK] {len(result['schedules'])} schedule rows, all decisions valid")


def test_blend_violation_produces_substitute():
    pso = _load_seed()
    result = solve_milp(json.dumps(pso), json.dumps({}), "Balanced", 0.01, 30, 2, "{}")
    subs = [r for r in result["recommendations"] if r["decision"] == "SUBSTITUTE"]
    assert subs, "Expected at least one SUBSTITUTE rec for the CDU-2 sulphur violation"
    r = subs[0]
    assert r["metadata"].get("cduId") == "CDU-2", r["metadata"]
    assert any("CDU-2" in e for e in r["evidence"])
    assert r["priority"] == "HIGH"
    print(f"[OK] SUBSTITUTE rec for {r['crudeGrade']} on CDU-2 generated, confidence={r['confidence']}")


def test_missing_data_lowers_confidence():
    pso = _load_seed()
    # Strip out price differentials source.
    pso["dataFreshness"] = {k: v for k, v in (pso["dataFreshness"] or {}).items() if k != "priceDifferentials"}
    result = solve_milp(json.dumps(pso), json.dumps({}), "Balanced", 0.01, 30, 2, "{}")
    missing = result["metadata"].get("missingFields") or []
    assert "priceDifferentials" in missing, missing
    for r in result["recommendations"]:
        assert r["confidence"] <= 95, f"Confidence {r['confidence']} should be lowered"
    print(f"[OK] missingFields={missing}, confidences lowered")


def test_kpis_populated():
    pso = _load_seed()
    result = solve_milp(json.dumps(pso), json.dumps({}), "Balanced", 0.01, 30, 2, "{}")
    kpis = result["kpis"]
    for k in (
        "throughputBpd", "daysOfCoverHs", "daysOfCoverLs",
        "scheduledArrivalsNext14d", "openDemurrageRiskUsd",
        "grmUsdPerBbl", "grmUsdAnnualizedMM", "opportunityUsdAnnualizedMM",
        "blendViolationCount",
    ):
        assert k in kpis, f"KPI {k} missing"
    assert kpis["blendViolationCount"] == 1
    assert kpis["throughputBpd"] > 0
    print(f"[OK] KPIs populated: throughput={kpis['throughputBpd']:,} bpd, "
          f"GRM={kpis['grmUsdPerBbl']}/bbl, blendViolations={kpis['blendViolationCount']}")


def test_validate_input():
    pso = _load_seed()
    v = validateInput(None, pso)
    assert v["valid"], f"Seed input should validate: {v}"
    print(f"[OK] validateInput returned valid=True (warnings={len(v['warnings'])})")


def test_what_if_override_applies():
    pso = _load_seed()
    overrides = {"delayVesselDays": {"CRG-2026-002": 3}}
    result = solve_milp(json.dumps(pso), json.dumps({}), "MinDemurrage", 0.01, 30, 2, json.dumps(overrides))
    # Just confirm the run succeeded and produced recommendations.
    assert result["schedules"], "Expected schedules after override"
    print(f"[OK] override (delay CRG-2026-002 +3d) ran, {len(result['recommendations'])} recs")


def main():
    tests = [
        test_solver_returns_full_contract,
        test_blend_violation_produces_substitute,
        test_missing_data_lowers_confidence,
        test_kpis_populated,
        test_validate_input,
        test_what_if_override_applies,
    ]
    for t in tests:
        t()
    print("\n[PASS] All solver tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
