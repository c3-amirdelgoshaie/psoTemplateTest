"""
Crude Schedule Optimizer — solver entry point.

Runs inside the `py.3.12-optim_312-server-py4j` runtime on C3 and directly
under conda locally (for `test_solver.py`). The module-level `solve_milp()`
function is the single model definition, per the PSO template convention.

Strategy:
  1. Try to build and solve the Gurobi MILP defined in
     resource/formulations/psoTest-formulation.md.
  2. If gurobipy is missing, the license is too small, or the model is
     infeasible / errors out, fall back to `_solve_heuristic()` which
     produces an output JSON with the **exact same shape**.

The solver ALWAYS emits the full structured JSON contract defined in the
spec (lines 178-186). Missing input fields are listed in metadata and
surface as assumptions on individual recommendations, lowering confidence
rather than blocking the run.
"""

GUROBI_RUNTIME = "py.3.12-optim_312-server-py4j"


# ------------------------------------------------------------------
# Public entry points used by the C3 PsoOptimizer service.
# ------------------------------------------------------------------
def runOptimization(
    this,
    psoInput,
    objectiveMode="Balanced",
    mipGap=0.01,
    timeLimit=120,
    flexDays=2,
    parameterOverrides=None,
):
    """Called by the C3 service layer. Dispatches to solve_milp() in the
    optimization runtime so gurobipy is available."""
    import json as _json

    input_dict = psoInput.toJson() if hasattr(psoInput, "toJson") else psoInput
    input_str = _json.dumps(input_dict)
    params_str = _json.dumps(_get_gurobi_credentials())
    overrides_str = _json.dumps(parameterOverrides or {})

    try:
        lam = c3.Lambda.fromPyFunc(solve_milp, actionRequirement=GUROBI_RUNTIME)
        return lam.apply(
            [input_str, params_str, objectiveMode, mipGap, timeLimit, flexDays, overrides_str]
        )
    except Exception:
        # If Lambda dispatch itself fails, run the heuristic in-process so
        # the caller still receives a valid PsoOutput-shaped payload.
        return solve_milp(input_str, params_str, objectiveMode, mipGap, timeLimit, flexDays, overrides_str)


def validateInput(this, psoInput):
    """Structural sanity check. Run without Gurobi."""
    import json as _json

    d = psoInput.toJson() if hasattr(psoInput, "toJson") else psoInput
    issues, warnings = [], []
    if not d.get("facilities"):
        issues.append("No facilities provided.")
    H = d.get("planningHorizonDays", 0)
    if H <= 0:
        issues.append("planningHorizonDays must be > 0.")
    item_ids = {i.get("itemId") for i in d.get("items", [])}
    for f in d.get("facilities", []):
        for it in f.get("items", []) or []:
            for arr_name in ("arrivalsBblsByDay", "demandBblsByDay"):
                arr = it.get(arr_name) or []
                if len(arr) != H:
                    warnings.append(f"{arr_name} length {len(arr)} != horizon {H} for {it.get('itemId')}.")
            if it.get("itemId") not in item_ids:
                warnings.append(f"Facility item {it.get('itemId')} not in top-level items list.")
        for tk in f.get("tanks", []):
            if tk.get("currentVolumeBbls", 0) > tk.get("capacityBbls", 0):
                issues.append(f"Tank {tk.get('tankId')} overfilled.")
    return {"valid": not issues, "issues": issues, "warnings": warnings}


def _get_gurobi_credentials():
    """Fetch Gurobi license params from c3.GurobiCredential, if configured."""
    params = {}
    try:
        cred = c3.GurobiCredential.inst()
        if cred:
            if hasattr(cred, "stringParams") and cred.stringParams:
                params.update(cred.stringParams.toJson())
            if hasattr(cred, "intParams") and cred.intParams:
                params.update(cred.intParams.toJson())
    except Exception:
        pass
    return params


# ==================================================================
# solve_milp — SINGLE MODEL DEFINITION (module-level, self-contained).
# ==================================================================
def solve_milp(
    input_data_str,
    gurobi_params_str,
    objective_mode,
    gap,
    limit,
    flex,
    overrides_str,
):
    """
    Self-contained optimizer callable from both C3 Lambda and local tests.

    Args:
      input_data_str    JSON-serialized PsoInput document.
      gurobi_params_str JSON-serialized map of Gurobi license params.
      objective_mode    "MaxGRM" | "MinDemurrage" | "MinLogistics" | "Balanced".
      gap               MIP gap.
      limit             Time limit seconds.
      flex              Vessel arrival flexibility in days.
      overrides_str     JSON-serialized parameter overrides (what-if scenarios).

    Returns:
      PsoOutput-shaped dict (see src/output/PsoOutput.c3typ).
    """
    # --- imports (inside for Lambda safety) ---
    import json
    import time
    from datetime import datetime as dt, timedelta

    t0 = time.time()
    pso = json.loads(input_data_str) if isinstance(input_data_str, str) else input_data_str
    gurobi_creds = json.loads(gurobi_params_str) if isinstance(gurobi_params_str, str) else (gurobi_params_str or {})
    overrides = json.loads(overrides_str) if isinstance(overrides_str, str) and overrides_str else (overrides_str or {})

    # Apply parameter overrides (scenario what-ifs) in-memory.
    pso = _apply_overrides(pso, overrides)

    # Identify missing data → assumptions / lowered confidence.
    missing = _detect_missing_fields(pso)

    # Try Gurobi; fall back to heuristic on any error.
    used_solver = "heuristic"
    gurobi_status = None
    try:
        import gurobipy as gp  # noqa: F401

        result = _solve_gurobi(pso, gurobi_creds, objective_mode, gap, limit, flex, missing)
        used_solver = "gurobi"
        gurobi_status = result.get("gurobiStatus")
    except Exception as e:
        result = _solve_heuristic(pso, objective_mode, flex, missing, reason=str(e))

    # Ensure output contract is complete.
    result["solveTimeSeconds"] = round(time.time() - t0, 3)
    result["solvedAt"] = dt.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    result["objectiveMode"] = objective_mode
    result.setdefault("scenarioId", "BASELINE")
    meta = result.setdefault("metadata", {})
    meta["solver"] = used_solver
    meta["gurobiStatus"] = gurobi_status
    meta["missingFields"] = missing
    meta["dataSourcesUsed"] = list((pso.get("dataFreshness") or {}).keys())
    meta["dataFreshness"] = pso.get("dataFreshness") or {}
    meta["lpTargetVersion"] = pso.get("lpTargetVersion")
    result.setdefault(
        "id",
        f"OUT_{pso.get('refineryId','ASPR')}_{dt.utcnow().strftime('%Y%m%d_%H%M%S')}",
    )
    return result


# ------------------------------------------------------------------
# Gurobi implementation (simplified but faithful to the formulation).
# ------------------------------------------------------------------
def _solve_gurobi(pso, creds, mode, gap, limit, flex, missing):
    """Build and solve the MILP. Raises on any license/size error so the
    heuristic fallback kicks in."""
    import gurobipy as gp
    from gurobipy import GRB

    fac = pso["facilities"][0]
    H = pso["planningHorizonDays"]
    cargoes = fac.get("cargoes", [])
    cdus = fac.get("cdus", [])
    tanks = fac.get("tanks", [])
    items = pso.get("items", [])
    berth_count = pso.get("berthCount", 2)
    weights = _objective_weights(mode)

    # --- sets ---
    C = [c["cargoId"] for c in cargoes]
    G = [i["itemId"] for i in items]
    U = [u["cduId"] for u in cdus]
    K = [t["tankId"] for t in tanks]
    T = list(range(H))

    grade_of = {c["cargoId"]: c["crudeGrade"] for c in cargoes}
    vol_c = {c["cargoId"]: c["volumeBbls"] for c in cargoes}
    ls_c = {c["cargoId"]: _day_offset(pso["startDate"], c["laycanStart"]) for c in cargoes}
    le_c = {c["cargoId"]: _day_offset(pso["startDate"], c["laycanEnd"]) for c in cargoes}
    dem_rate = {c["cargoId"]: c.get("demurrageRateUsdDay") or _default_dem_rate(c.get("vesselType")) for c in cargoes}
    freight_c = {c["cargoId"]: c.get("freightCostUsd") or 0 for c in cargoes}
    isFixed = {c["cargoId"]: bool(c.get("isFixed")) for c in cargoes}

    grm = {i["itemId"]: i.get("grmContributionUsdBbl") or 0 for i in items}
    tank_group = {i["itemId"]: i.get("tankGroup") or "HighSulphur" for i in items}
    tank_group_of = {t["tankId"]: t["tankGroup"] for t in tanks}
    cap_k = {t["tankId"]: t["capacityBbls"] for t in tanks}

    lp = {
        u["cduId"]: u.get("lpTargetByGrade", {}) for u in cdus
    }

    # --- Gurobi env ---
    if creds:
        env = gp.Env(params=creds)
    else:
        env = gp.Env(empty=True)
        env.start()
    m = gp.Model("crude_schedule", env=env)
    m.setParam("OutputFlag", 0)
    m.setParam("MIPGap", gap)
    m.setParam("TimeLimit", limit)

    # --- variables ---
    a = m.addVars(C, vtype=GRB.BINARY, name="a")
    sub = m.addVars(C, vtype=GRB.BINARY, name="sub")
    defr = m.addVars(C, vtype=GRB.BINARY, name="def")
    drp = m.addVars(C, vtype=GRB.BINARY, name="drp")
    s = m.addVars(C, lb=0, ub=H, name="s")
    dem = m.addVars(C, lb=0, name="dem")

    y = m.addVars(C, K, vtype=GRB.BINARY, name="y")

    x = m.addVars(U, G, T, lb=0, name="x")
    devPos = m.addVars(U, G, T, lb=0, name="devPos")
    devNeg = m.addVars(U, G, T, lb=0, name="devNeg")

    # --- decision exclusivity ---
    for c in C:
        m.addConstr(a[c] + sub[c] + defr[c] + drp[c] == 1)
        if isFixed[c]:
            m.addConstr(a[c] == 1)

    # --- laycan & demurrage ---
    for c in C:
        m.addConstr(s[c] >= ls_c[c] * (a[c] + sub[c]))
        m.addConstr(s[c] <= le_c[c] + flex * (1 - drp[c]))
        m.addConstr(dem[c] >= s[c] - le_c[c])

    # --- tank nomination (one tank per accepted cargo; segregation) ---
    for c in C:
        m.addConstr(gp.quicksum(y[c, k] for k in K) == a[c] + sub[c])
        gcfam = tank_group.get(grade_of[c], "HighSulphur")
        for k in K:
            if tank_group_of[k] != gcfam:
                m.addConstr(y[c, k] == 0)

    # --- CDU throughput envelope & blend ---
    maint = _maintenance_map(fac.get("maintenanceWindows", []), pso["startDate"], H)
    for u in cdus:
        uid = u["cduId"]
        for t in T:
            total = gp.quicksum(x[uid, g, t] for g in G)
            if maint.get((uid, t), 0):
                m.addConstr(total == 0)
            else:
                m.addConstr(total >= u["minThroughputBpd"])
                m.addConstr(total <= u["maxThroughputBpd"])
            # blend: sulphur
            sul_lim = next(
                (bc["limitValue"] for bc in u.get("blendConstraints", []) if bc["metric"] == "sulphur" and bc["limitType"] == "LE"),
                None,
            )
            if sul_lim is not None:
                sul = gp.quicksum(
                    _grade_attr(items, g, "sulphurPct") * x[uid, g, t] for g in G
                )
                m.addConstr(sul <= sul_lim * total)
            api_lim = next(
                (bc["limitValue"] for bc in u.get("blendConstraints", []) if bc["metric"] == "api" and bc["limitType"] == "GE"),
                None,
            )
            if api_lim is not None:
                api = gp.quicksum(
                    _grade_attr(items, g, "apiGravity") * x[uid, g, t] for g in G
                )
                m.addConstr(api >= api_lim * total)

    # --- LP alignment slack ---
    for u in cdus:
        uid = u["cduId"]
        for g in G:
            lp_arr = (lp.get(uid) or {}).get(g) or [0.0] * H
            for t in T:
                target = lp_arr[t] if t < len(lp_arr) else 0.0
                m.addConstr(x[uid, g, t] - target == devPos[uid, g, t] - devNeg[uid, g, t])

    # --- objective (composite) ---
    (w_grm, w_dem, w_log, w_lp) = weights
    grm_term = gp.quicksum(
        grm.get(g, 0) * x[u["cduId"], g, t] for u in cdus for g in G for t in T
    )
    dem_term = gp.quicksum(dem_rate[c] * dem[c] for c in C)
    log_term = gp.quicksum(freight_c[c] * (a[c] + sub[c]) + 250000 * sub[c] for c in C)
    lp_term = gp.quicksum(devPos[u["cduId"], g, t] + devNeg[u["cduId"], g, t] for u in cdus for g in G for t in T)
    m.setObjective(
        w_grm * grm_term - w_dem * dem_term - w_log * log_term - w_lp * lp_term,
        GRB.MAXIMIZE,
    )

    m.optimize()
    if m.SolCount == 0:
        raise RuntimeError(f"No Gurobi solution (status={m.Status})")

    # --- extract solution to the PsoOutput contract ---
    schedules = []
    for c in cargoes:
        cid = c["cargoId"]
        decision = _decision_from_vars(a[cid].X, sub[cid].X, defr[cid].X, drp[cid].X)
        assigned = [k for k in K if y[cid, k].X > 0.5]
        schedules.append(
            {
                "cargoId": cid,
                "decision": decision,
                "berthStartDay": float(s[cid].X),
                "berthEndDay": float(s[cid].X) + 1.0,
                "assignedTanks": assigned,
                "substitutedWithGrade": "" if sub[cid].X < 0.5 else _best_substitute(grade_of[cid], items),
                "deferredToDay": float(s[cid].X) if defr[cid].X > 0.5 else 0.0,
                "demurrageDays": float(dem[cid].X),
                "demurrageCostUsd": float(dem_rate[cid] * dem[cid].X),
                "isOnTime": dem[cid].X < 1e-6,
            }
        )

    cdu_charge = {
        u["cduId"]: {g: [float(x[u["cduId"], g, t].X) for t in T] for g in G}
        for u in cdus
    }

    kpis, recs, risk_flags, anomalies = _compose_outputs(pso, schedules, cdu_charge, missing, mode, m.ObjVal)
    return {
        "status": "optimal" if m.Status == GRB.OPTIMAL else "time_limit",
        "gurobiStatus": int(m.Status),
        "objectiveValue": float(m.ObjVal),
        "schedules": schedules,
        "recommendations": recs,
        "kpis": kpis,
        "riskFlags": risk_flags,
        "anomalies": anomalies,
        "cduChargeByDay": cdu_charge,
        "tankInventoryByDay": _project_tank_inventory(pso, schedules),
        "metadata": {},
    }


# ------------------------------------------------------------------
# Heuristic fallback — deterministic, always succeeds, same output shape.
# ------------------------------------------------------------------
def _solve_heuristic(pso, mode, flex, missing, reason=""):
    """Rule-based optimizer used when Gurobi is unavailable or fails.

    Logic:
      * Each cargo defaults to HOLD.
      * If current inventory + arrivals can't cover demand over the horizon
        for a grade → emit REORDER recommendation.
      * If a blend constraint is VIOLATED → emit SUBSTITUTE recommendation
        against the offending grade, prefer the next cheapest in same group.
      * If a cargo is At Risk or demurrageRiskLevel >= Medium → emit
        DEFER/RETIME suggestion with demurrage estimate.
      * CDU charge = LP target, clipped to min/max throughput.
    """
    from datetime import datetime as dt, timedelta

    fac = pso["facilities"][0]
    H = pso["planningHorizonDays"]
    start = _parse_date(pso["startDate"])
    cargoes = fac.get("cargoes", [])
    items = pso.get("items", [])
    cdus = fac.get("cdus", [])
    tanks = fac.get("tanks", [])

    schedules = []
    for c in cargoes:
        laycan_start = _day_offset(pso["startDate"], c["laycanStart"])
        laycan_end = _day_offset(pso["startDate"], c["laycanEnd"])
        berth_day = max(0, laycan_start)
        dem_days = 0.0
        decision = "HOLD"
        if c.get("status") == "At Risk" or c.get("demurrageRiskLevel") in ("High", "Medium"):
            dem_days = 1.0
            decision = "RETIME"
        if c.get("isFixed"):
            decision = "HOLD"
        schedules.append(
            {
                "cargoId": c["cargoId"],
                "decision": decision,
                "berthStartDay": float(berth_day),
                "berthEndDay": float(berth_day + 1),
                "assignedTanks": list(c.get("nominatedTanks") or []),
                "substitutedWithGrade": "",
                "deferredToDay": 0.0,
                "demurrageDays": dem_days,
                "demurrageCostUsd": dem_days * (c.get("demurrageRateUsdDay") or _default_dem_rate(c.get("vesselType"))),
                "isOnTime": dem_days < 1e-6,
            }
        )

    # CDU charge = LP target clamped to envelope.
    cdu_charge = {}
    for u in cdus:
        uid = u["cduId"]
        cdu_charge[uid] = {}
        for g in [i["itemId"] for i in items]:
            lp = (u.get("lpTargetByGrade") or {}).get(g) or [0.0] * H
            cdu_charge[uid][g] = [max(0.0, v) for v in lp[:H]] + [0.0] * max(0, H - len(lp))

    obj = _estimate_objective(pso, schedules, cdu_charge, mode)
    kpis, recs, risk_flags, anomalies = _compose_outputs(pso, schedules, cdu_charge, missing, mode, obj)
    return {
        "status": "fallback",
        "gurobiStatus": None,
        "objectiveValue": obj,
        "schedules": schedules,
        "recommendations": recs,
        "kpis": kpis,
        "riskFlags": risk_flags,
        "anomalies": anomalies,
        "cduChargeByDay": cdu_charge,
        "tankInventoryByDay": _project_tank_inventory(pso, schedules),
        "metadata": {"fallbackReason": reason or "Gurobi unavailable"},
    }


# ------------------------------------------------------------------
# Shared output composition — builds recommendations, KPIs, risk flags.
# ------------------------------------------------------------------
def _compose_outputs(pso, schedules, cdu_charge, missing, mode, objective_value):
    """Builds the structured JSON (recs, kpis, risk_flags, anomalies)
    shared by both Gurobi and heuristic code paths."""
    from datetime import datetime as dt, timedelta

    fac = pso["facilities"][0]
    H = pso["planningHorizonDays"]
    start = _parse_date(pso["startDate"])
    items_idx = {i["itemId"]: i for i in pso.get("items", [])}
    tanks = fac.get("tanks", [])
    cargoes = fac.get("cargoes", [])
    cdus = fac.get("cdus", [])
    data_freshness = pso.get("dataFreshness") or {}
    lp_ver = pso.get("lpTargetVersion") or "UNKNOWN"

    recs, risk_flags, anomalies = [], [], []

    # --- helper: base metadata for every rec ---
    def _meta(extra=None):
        m = {
            "dataSourcesUsed": list(data_freshness.keys()),
            "dataFreshness": data_freshness,
            "lpTargetVersion": lp_ver,
            "missingFields": list(missing),
            "generatedAt": dt.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if extra:
            m.update(extra)
        return m

    rec_seq = 0

    def _next_rec_id():
        nonlocal rec_seq
        rec_seq += 1
        return f"REC-{dt.utcnow().strftime('%Y%m%d')}-{rec_seq:03d}"

    # --- 1) per-cargo recommendations ---
    for c, sch in zip(cargoes, schedules):
        cid = c["cargoId"]
        dem_days = sch["demurrageDays"]
        if sch["decision"] == "RETIME" or dem_days > 0:
            severity = min(5, max(1, int(round(dem_days)) + 1))
            flag = {
                "flagType": "DEMURRAGE_RISK",
                "severity": severity,
                "summary": f"{c['vesselName']} ({c['vesselType']}) projects {dem_days:.0f}d demurrage (${sch['demurrageCostUsd']:,.0f}).",
                "recommendedAction": "Re-time berth or nominate a compatible tank with ullage.",
                "cargoId": cid,
                "crudeGrade": c["crudeGrade"],
                "tankId": "",
                "cduId": "",
                "dayOffset": int(sch["berthStartDay"]),
                "impactUsd": float(sch["demurrageCostUsd"]),
            }
            risk_flags.append(flag)
            recs.append(
                {
                    "recommendationId": _next_rec_id(),
                    "cargoId": cid,
                    "crudeGrade": c["crudeGrade"],
                    "decision": "DEFER" if severity >= 4 else "RETIME",
                    "confidence": _confidence(78, missing),
                    "expectedImpactUsd": -float(sch["demurrageCostUsd"]),
                    "title": f"Re-time {c['vesselName']} to avoid {dem_days:.0f}d demurrage",
                    "summary": f"Berth {c['vesselName']} on day {int(sch['berthStartDay']) + 1} or nominate alternate tank to stay within laycan.",
                    "evidence": [
                        f"Laycan: {c['laycanStart']} → {c['laycanEnd']}",
                        f"ETA terminal: {c.get('etaTerminal','n/a')}",
                        f"Demurrage rate: ${c.get('demurrageRateUsdDay', _default_dem_rate(c.get('vesselType'))):,.0f}/day ({c['vesselType']})",
                        f"Status: {c.get('status')}, risk: {c.get('demurrageRiskLevel')}",
                    ],
                    "assumptions": _assumption_lines(missing),
                    "risks": [
                        "Re-timing may cascade into next cargo's berth window.",
                    ],
                    "nextActions": [
                        "Coordinate with berth master for revised window.",
                        f"Confirm tank nomination for {c['crudeGrade']}.",
                    ],
                    "reorderPlan": None,
                    "riskFlags": [flag],
                    "anomalies": [],
                    "priority": "HIGH" if severity >= 4 else "MEDIUM",
                    "metadata": _meta({"cargoId": cid}),
                }
            )

    # --- 2) blend-violation recommendations (SUBSTITUTE / DEFER) ---
    for u in cdus:
        uid = u["cduId"]
        for bc in u.get("blendConstraints", []):
            if bc.get("status") == "VIOLATED":
                offending = _offending_grade(u, bc, items_idx)
                substitute = _best_substitute(offending, pso.get("items", []), bc)
                flag = {
                    "flagType": "BLEND_VIOLATION",
                    "severity": 4,
                    "summary": f"{bc['name']} on {uid}: {bc.get('currentValue')} vs {_symbol(bc['limitType'])} {bc['limitValue']}",
                    "recommendedAction": f"Substitute {offending} with {substitute} on {uid}.",
                    "cargoId": "",
                    "crudeGrade": offending or "",
                    "tankId": "",
                    "cduId": uid,
                    "dayOffset": 0,
                    "impactUsd": 0.0,
                }
                risk_flags.append(flag)
                recs.append(
                    {
                        "recommendationId": _next_rec_id(),
                        "cargoId": "",
                        "crudeGrade": offending or "",
                        "decision": "SUBSTITUTE",
                        "confidence": _confidence(87, missing),
                        "expectedImpactUsd": 105000.0,
                        "title": f"Substitute {offending or 'crude'} with {substitute or 'lower-sulphur grade'} on {uid}",
                        "summary": f"Active {bc['name']} violation ({bc.get('currentValue')} {_symbol(bc['limitType'])} {bc['limitValue']}). Substitute to bring CDU back within spec.",
                        "evidence": [
                            f"CDU {uid}: {bc['metric']} = {bc.get('currentValue')} vs limit {bc['limitValue']} ({_symbol(bc['limitType'])}).",
                            f"Constraint version {bc.get('version')}.",
                            f"LP target version {lp_ver}.",
                        ],
                        "assumptions": _assumption_lines(missing),
                        "risks": [
                            "Substitute grade may have lower GRM contribution.",
                            "Tank segregation may require re-nomination.",
                        ],
                        "nextActions": [
                            "Validate substitute availability with procurement.",
                            "Re-run LP with substituted charge.",
                        ],
                        "reorderPlan": None,
                        "riskFlags": [flag],
                        "anomalies": [
                            {
                                "anomalyType": "BLEND_VIOLATION",
                                "description": f"{bc['name']} breached on {uid}.",
                                "severity": 4,
                                "dayOffset": 0,
                                "objectId": uid,
                                "objectKind": "CDU",
                            }
                        ],
                        "priority": "HIGH",
                        "metadata": _meta({"cduId": uid, "constraintId": bc["constraintId"]}),
                    }
                )

    # --- 3) stockout / REORDER recommendations by grade ---
    inv_proj = _project_grade_inventory(pso)
    for grade, series in inv_proj.items():
        min_level = min(series) if series else 0
        safety = _safety_stock(pso, grade)
        if min_level < safety:
            day_hit = series.index(min_level) if series else 0
            order_by = (start + timedelta(days=max(0, day_hit - 20))).strftime("%Y-%m-%d")
            arrival = (start + timedelta(days=day_hit)).strftime("%Y-%m-%d")
            short_kbbls = max(1, int(round((safety - min_level) / 1000)))
            flag = {
                "flagType": "STOCKOUT_RISK",
                "severity": min(5, max(1, int(1 + (safety - min_level) / max(safety, 1) * 4))),
                "summary": f"{grade} projected inventory {min_level:,.0f} bbls (below safety {safety:,.0f}) on day {day_hit + 1}.",
                "recommendedAction": f"Reorder {short_kbbls} kbbls of {grade}; order by {order_by}.",
                "cargoId": "",
                "crudeGrade": grade,
                "tankId": "",
                "cduId": "",
                "dayOffset": day_hit,
                "impactUsd": 0.0,
            }
            risk_flags.append(flag)
            recs.append(
                {
                    "recommendationId": _next_rec_id(),
                    "cargoId": "",
                    "crudeGrade": grade,
                    "decision": "REORDER",
                    "confidence": _confidence(82, missing),
                    "expectedImpactUsd": 0.0,
                    "title": f"Reorder {short_kbbls} kbbls of {grade}",
                    "summary": f"Projected stockout for {grade} on day {day_hit + 1}. Trigger replenishment now to secure laycan slot.",
                    "evidence": [
                        f"Minimum projected inventory: {min_level:,.0f} bbls on day {day_hit + 1}.",
                        f"Safety floor: {safety:,.0f} bbls.",
                        f"Horizon demand total: {sum(_grade_demand(pso, grade)):,.0f} bbls.",
                    ],
                    "assumptions": _assumption_lines(missing) + [
                        "Lead time defaulted to vessel-class typical (Aframax ≈ 20 days, Suezmax ≈ 28 days).",
                    ],
                    "risks": [
                        "Price differential may shift between order and delivery.",
                    ],
                    "nextActions": [
                        "Notify procurement with target laycan.",
                        "Confirm tank ullage will accommodate cargo at arrival.",
                    ],
                    "reorderPlan": {
                        "totalQtyKbbls": short_kbbls,
                        "crudeGrade": grade,
                        "originRegion": (items_idx.get(grade) or {}).get("originRegion", ""),
                        "orderByDate": order_by,
                        "expectedArrivalWindowStart": arrival,
                        "expectedArrivalWindowEnd": (start + timedelta(days=day_hit + 3)).strftime("%Y-%m-%d"),
                    },
                    "riskFlags": [flag],
                    "anomalies": [],
                    "priority": "HIGH" if flag["severity"] >= 4 else "MEDIUM",
                    "metadata": _meta({"crudeGrade": grade}),
                }
            )

    # --- 4) KPIs ---
    throughput = sum(sum(sum(v) for v in cdu_charge.get(u["cduId"], {}).values()) for u in cdus) / max(1, H)
    total_dem = sum(s["demurrageCostUsd"] for s in schedules)
    dof_hs, dof_ls = _days_of_cover(pso)
    grm_per_bbl = _estimate_grm_per_bbl(pso, cdu_charge)
    arrivals_14 = sum(
        1 for c in cargoes if 0 <= _day_offset(pso["startDate"], c["laycanStart"]) < 14
    )
    blend_viol = sum(
        1 for u in cdus for bc in u.get("blendConstraints", []) if bc.get("status") == "VIOLATED"
    )
    kpis = {
        "throughputBpd": round(throughput, 0),
        "daysOfCoverHs": round(dof_hs, 1),
        "daysOfCoverLs": round(dof_ls, 1),
        "scheduledArrivalsNext14d": arrivals_14,
        "openDemurrageRiskUsd": round(total_dem, 0),
        "grmUsdPerBbl": round(grm_per_bbl, 2),
        "grmUsdAnnualizedMM": round(grm_per_bbl * throughput * 365 / 1_000_000, 1),
        "opportunityUsdAnnualizedMM": round((grm_per_bbl - 6.5) * throughput * 365 / 1_000_000, 1),
        "blendViolationCount": blend_viol,
        "objectiveValue": round(objective_value, 2),
        "objectiveMode": mode,
    }

    # --- 5) global anomalies ---
    maintenance = fac.get("maintenanceWindows", [])
    for m in maintenance:
        anomalies.append(
            {
                "anomalyType": "CDU_THROUGHPUT_SPIKE",
                "description": f"Scheduled {m.get('reason','MAINT')} on {m['cduId']} from {m['startDate']} to {m['endDate']}.",
                "severity": 2,
                "dayOffset": _day_offset(pso["startDate"], m["startDate"]),
                "objectId": m["cduId"],
                "objectKind": "CDU",
            }
        )
    if "ais" in missing:
        anomalies.append(
            {
                "anomalyType": "AIS_STALE",
                "description": "Live AIS feed missing — last known positions used.",
                "severity": 2,
                "dayOffset": 0,
                "objectId": "",
                "objectKind": "GRADE",
            }
        )

    return kpis, recs, risk_flags, anomalies


# ------------------------------------------------------------------
# Small helpers.
# ------------------------------------------------------------------
def _objective_weights(mode):
    return {
        "MaxGRM": (1.0, 0.2, 0.2, 0.2),
        "MinDemurrage": (0.2, 1.0, 0.3, 0.2),
        "MinLogistics": (0.2, 0.3, 1.0, 0.2),
        "Balanced": (0.6, 0.6, 0.4, 0.4),
    }.get(mode, (0.6, 0.6, 0.4, 0.4))


def _default_dem_rate(vessel_type):
    return {"VLCC": 65000, "Suezmax": 42000, "Aframax": 28000}.get(vessel_type, 30000)


def _parse_date(s):
    from datetime import datetime as dt
    return dt.strptime(s[:10], "%Y-%m-%d")


def _day_offset(start_str, date_str):
    return (_parse_date(date_str) - _parse_date(start_str)).days


def _maintenance_map(windows, start_str, H):
    m = {}
    for w in windows or []:
        ds = _day_offset(start_str, w["startDate"])
        de = _day_offset(start_str, w["endDate"])
        for d in range(max(0, ds), min(H, de + 1)):
            m[(w["cduId"], d)] = 1
    return m


def _grade_attr(items, grade_id, attr):
    for i in items:
        if i["itemId"] == grade_id:
            return i.get(attr) or 0
    return 0


def _decision_from_vars(a_v, sub_v, def_v, drp_v):
    if sub_v > 0.5:
        return "SUBSTITUTE"
    if def_v > 0.5:
        return "DEFER"
    if drp_v > 0.5:
        return "DROP"
    return "HOLD"


def _best_substitute(grade, items, blend_constraint=None):
    """Pick the cheapest compatible substitute (same tank group, lower
    sulphur if a sulphur violation drove us here)."""
    if not grade:
        return ""
    src = next((i for i in items if i["itemId"] == grade), None)
    if not src:
        return ""
    candidates = [
        i
        for i in items
        if i["itemId"] != grade and i.get("tankGroup") == src.get("tankGroup")
    ]
    if blend_constraint and blend_constraint.get("metric") == "sulphur":
        candidates = [c for c in candidates if (c.get("sulphurPct") or 0) < (src.get("sulphurPct") or 0)]
    if not candidates:
        return ""
    candidates.sort(key=lambda c: c.get("priceDifferentialUsdBbl") or 0)
    return candidates[0]["itemId"]


def _offending_grade(cdu, blend_constraint, items_idx):
    """Best-effort: the grade from this CDU's LP with the highest value on
    the violated metric."""
    metric = blend_constraint.get("metric")
    lp = cdu.get("lpTargetByGrade") or {}
    best, best_val = None, -1e30
    for g in lp.keys():
        v = (items_idx.get(g) or {}).get(f"{metric}Pct" if metric == "sulphur" else "apiGravity") or 0
        if metric == "sulphur" and v > best_val:
            best, best_val = g, v
    return best or ""


def _symbol(limit_type):
    return {"LE": "≤", "GE": "≥", "EQ": "="}.get(limit_type, limit_type)


def _confidence(base, missing):
    """Lower confidence by 4 pts per missing data category, clamp to [50,99]."""
    return max(50, min(99, base - 4 * len(missing or [])))


def _assumption_lines(missing):
    return [
        {
            "ais": "Live AIS feed unavailable — last known vessel position used.",
            "priceDifferentials": "Crude price differential stale — last available price used.",
            "leadTime": "Lead time defaulted to vessel-class typical.",
            "lpTarget": "LP target missing — prior week's LP used.",
            "blendConstraints": "Blend constraints unverified — treating as advisory.",
            "maintenanceCalendar": "Maintenance calendar stale — windows may be out of date.",
        }.get(k, f"Assumption applied for missing field: {k}")
        for k in (missing or [])
    ]


def _detect_missing_fields(pso):
    """Compute the list of missing data categories per spec missing-data rules."""
    missing = []
    fresh = pso.get("dataFreshness") or {}
    # An entry is "missing" if no freshness timestamp exists for it.
    for k in ("ais", "priceDifferentials", "leadTime", "lpTarget", "blendConstraints", "maintenanceCalendar"):
        if not fresh.get(k) and k != "leadTime":
            # leadTime is always implicit; we only flag it if ALL cargoes lack demurrageRateUsdDay.
            if k == "ais":
                if any(not (c.get("currentLat") and c.get("currentLon")) for c in pso["facilities"][0].get("cargoes", [])):
                    missing.append(k)
            else:
                missing.append(k)
    if all(not c.get("demurrageRateUsdDay") for c in pso["facilities"][0].get("cargoes", [])):
        missing.append("leadTime")
    # Stale >= 3 days considered missing.
    from datetime import datetime as dt
    now = dt.utcnow()
    for k, ts in fresh.items():
        if not ts:
            continue
        try:
            ts_dt = dt.strptime(ts.replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
            if (now - ts_dt).days >= 3 and k not in missing:
                missing.append(k)
        except Exception:
            pass
    return missing


def _project_grade_inventory(pso):
    fac = pso["facilities"][0]
    H = pso["planningHorizonDays"]
    series = {}
    for it in fac.get("items", []) or []:
        inv = it.get("initialInventoryBbls") or 0.0
        arr = it.get("arrivalsBblsByDay") or [0.0] * H
        dmd = it.get("demandBblsByDay") or [0.0] * H
        rolling = []
        for t in range(H):
            inv = inv + (arr[t] if t < len(arr) else 0) - (dmd[t] if t < len(dmd) else 0)
            rolling.append(inv)
        series[it["itemId"]] = rolling
    return series


def _safety_stock(pso, grade):
    for it in pso["facilities"][0].get("items", []) or []:
        if it["itemId"] == grade:
            return it.get("safetyStockBbls") or 0
    return 0


def _grade_demand(pso, grade):
    for it in pso["facilities"][0].get("items", []) or []:
        if it["itemId"] == grade:
            return it.get("demandBblsByDay") or []
    return []


def _days_of_cover(pso):
    fac = pso["facilities"][0]
    items_idx = {i["itemId"]: i for i in pso.get("items", [])}
    hs_inv = sum(
        t.get("currentVolumeBbls") or 0 for t in fac.get("tanks", []) if t.get("tankGroup") == "HighSulphur"
    )
    ls_inv = sum(
        t.get("currentVolumeBbls") or 0 for t in fac.get("tanks", []) if t.get("tankGroup") == "LowSulphur"
    )
    hs_demand = sum(
        sum(it.get("demandBblsByDay") or []) for it in fac.get("items", []) or []
        if items_idx.get(it["itemId"], {}).get("tankGroup") == "HighSulphur"
    )
    ls_demand = sum(
        sum(it.get("demandBblsByDay") or []) for it in fac.get("items", []) or []
        if items_idx.get(it["itemId"], {}).get("tankGroup") == "LowSulphur"
    )
    H = pso.get("planningHorizonDays", 30)
    dof_hs = hs_inv / max(1.0, hs_demand / H)
    dof_ls = ls_inv / max(1.0, ls_demand / H)
    return dof_hs, dof_ls


def _estimate_grm_per_bbl(pso, cdu_charge):
    items_idx = {i["itemId"]: i for i in pso.get("items", [])}
    tot_vol, tot_grm = 0.0, 0.0
    for u, grades in (cdu_charge or {}).items():
        for g, series in (grades or {}).items():
            v = sum(series)
            tot_vol += v
            tot_grm += v * (items_idx.get(g, {}).get("grmContributionUsdBbl") or 0)
    return (tot_grm / tot_vol) if tot_vol > 0 else 0.0


def _estimate_objective(pso, schedules, cdu_charge, mode):
    w = _objective_weights(mode)
    grm = _estimate_grm_per_bbl(pso, cdu_charge)
    tot_vol = sum(sum(s) for grades in (cdu_charge or {}).values() for s in grades.values())
    dem = sum(s["demurrageCostUsd"] for s in schedules)
    return w[0] * grm * tot_vol - w[1] * dem


def _project_tank_inventory(pso, schedules):
    """Very simple projection used by the Feedstock page — starts with
    current volume, applies grade-level arrivals/demand proportionally.
    Not intended to be exact; exact values come from Gurobi when licensed."""
    fac = pso["facilities"][0]
    out = {}
    H = pso["planningHorizonDays"]
    for tank in fac.get("tanks", []):
        grade = tank.get("crudeGrade") or ""
        if not grade:
            continue
        inv = tank["currentVolumeBbls"]
        row = []
        it = next((x for x in fac.get("items", []) or [] if x["itemId"] == grade), None)
        arr = (it or {}).get("arrivalsBblsByDay") or [0.0] * H
        dmd = (it or {}).get("demandBblsByDay") or [0.0] * H
        # Split flows equally across tanks of this grade (approximation).
        same_grade_tanks = [t for t in fac.get("tanks", []) if t.get("crudeGrade") == grade]
        denom = max(1, len(same_grade_tanks))
        for t in range(H):
            inv = max(0.0, inv + (arr[t] / denom) - (dmd[t] / denom))
            inv = min(inv, tank["capacityBbls"])
            row.append(round(inv, 1))
        out[tank["tankId"]] = {grade: row}
    return out


def _apply_overrides(pso, overrides):
    """Apply what-if scenario overrides from the Optimizer page.
    Supported keys:
      delayVesselDays:  {cargoId: +/-days}
      priceOverride:    {grade: priceDifferentialUsdBbl}
      removeGrades:     [grade]
      cduThroughputPct: {cduId: 0.9..1.1}
      tankCapacityBbls: {tankId: value}
      objectiveMode:    "MaxGRM" | ...  (handled by caller)
    """
    import copy, datetime as _dt
    if not overrides:
        return pso
    p = copy.deepcopy(pso)
    fac = p["facilities"][0]

    for cid, delta in (overrides.get("delayVesselDays") or {}).items():
        for c in fac.get("cargoes", []):
            if c["cargoId"] == cid:
                for field in ("laycanStart", "laycanEnd"):
                    if c.get(field):
                        d = _dt.date.fromisoformat(c[field][:10])
                        c[field] = (d + _dt.timedelta(days=int(delta))).isoformat()

    for g, price in (overrides.get("priceOverride") or {}).items():
        for i in p.get("items", []):
            if i["itemId"] == g:
                i["priceDifferentialUsdBbl"] = price

    for g in overrides.get("removeGrades") or []:
        p["items"] = [i for i in p.get("items", []) if i["itemId"] != g]
        fac["cargoes"] = [c for c in fac.get("cargoes", []) if c["crudeGrade"] != g]

    for uid, pct in (overrides.get("cduThroughputPct") or {}).items():
        for u in fac.get("cdus", []):
            if u["cduId"] == uid:
                u["plannedThroughputBpd"] = u["plannedThroughputBpd"] * pct
                u["minThroughputBpd"] = u["minThroughputBpd"] * pct
                u["maxThroughputBpd"] = u["maxThroughputBpd"] * pct

    for tid, cap in (overrides.get("tankCapacityBbls") or {}).items():
        for t in fac.get("tanks", []):
            if t["tankId"] == tid:
                t["capacityBbls"] = cap
                t["ullageBbls"] = max(0, cap - (t.get("currentVolumeBbls") or 0))

    return p
