"""
Implementation of CrudePsoService — the UI-facing facade for the Crude
Schedule Optimizer.

Keeps the React layer simple: one service, one set of endpoints, no need
for the frontend to know about PsoInput / PsoOptimizer / PsoOutput
internals. Persists recommendations as PsoRecommendation rows so the
Recommendations page is queryable and filterable.
"""
import copy
import json
from datetime import datetime
from io import StringIO


# ---------------------------------------------------------------
# Input / Output
# ---------------------------------------------------------------
def getInputData(cls):
    """Load the baseline PsoInput document from seed."""
    f = c3.File(url="meta://psoTest/seed/PsoInput/PsoInput.json")
    return json.loads(bytes(f.read()).decode("utf-8"))


def getOutputData(cls):
    """Return the most recent baseline PsoOutput JSON (from etl mount)."""
    try:
        etl_path = c3.FileSystem.mounts().get("etl")
        if not etl_path:
            return None
        f = c3.File(url=etl_path + "/CrudeOutput.json")
        return json.loads(bytes(f.read()).decode("utf-8"))
    except Exception:
        return None


def runOptimizer(cls, objectiveMode="Balanced"):
    """Run the optimizer on the baseline input and persist outputs + recs."""
    input_data = cls.getInputData()
    output = c3.PsoOptimizer.runOptimization(input_data, objectiveMode)
    output_dict = output.toJson() if hasattr(output, "toJson") else output
    _save_output(output_dict)
    _persist_recommendations(output_dict, scenarioId="BASELINE")
    return output_dict


def runOptimizerWithInput(cls, inputData, objectiveMode="Balanced", flexDays=2):
    """Run the optimizer against a caller-provided input document."""
    input_dict = inputData.toJson() if hasattr(inputData, "toJson") else inputData
    output = c3.PsoOptimizer.runOptimization(
        input_dict, objectiveMode, 0.01, 60.0, flexDays, None
    )
    return output.toJson() if hasattr(output, "toJson") else output


# ---------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------
def createScenario(cls, name, description, objective, parameterChanges):
    sid = f"SCN_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}"
    rec = {
        "id": sid,
        "name": name,
        "description": description or "",
        "objective": objective or "Balanced",
        "status": "Draft",
        "createdAt": _utcnow(),
        "parameterChanges": parameterChanges or {},
        "createdBy": "operator",
    }
    c3.PsoScenario.merge(rec)
    return rec


def getScenarios(cls, limit=20):
    rows = c3.PsoScenario.fetch({"order": "descending(createdAt)", "limit": limit})
    return [_entity_to_json(r) for r in (rows.objs or [])]


def getScenario(cls, scenarioId):
    row = c3.PsoScenario.get(scenarioId)
    return _entity_to_json(row) if row else None


def deleteScenario(cls, scenarioId):
    try:
        c3.PsoScenario.removeAll({"filter": f"id == '{scenarioId}'"})
        return True
    except Exception:
        return False


def runScenario(cls, scenarioId):
    """Apply the scenario's parameterChanges to the baseline input, solve,
    and persist the output + KPI deltas on the scenario row."""
    scenario = c3.PsoScenario.get(scenarioId)
    if not scenario:
        raise Exception(f"Scenario {scenarioId} not found")

    baseline = cls.getInputData()
    baseline_kpis = cls.getBaselineKpis()
    changes = scenario.parameterChanges.toJson() if hasattr(scenario.parameterChanges, "toJson") else (
        scenario.parameterChanges or {}
    )

    c3.PsoScenario.merge({"id": scenarioId, "status": "Running"})
    try:
        modified = _apply_parameter_changes(baseline, changes)
        output = c3.PsoOptimizer.runOptimization(
            modified, scenario.objective or "Balanced", 0.01, 60.0,
            int(changes.get("flexDays", 2) or 2), changes
        )
        output_dict = output.toJson() if hasattr(output, "toJson") else output

        scenario_kpis = output_dict.get("kpis") or {}
        deltas = _kpi_deltas(baseline_kpis or {}, scenario_kpis)

        c3.PsoScenario.merge({
            "id": scenarioId,
            "status": "Complete",
            "lastRunAt": _utcnow(),
            "inputSnapshot": modified,
            "output": {
                "status": output_dict.get("status"),
                "objectiveValue": output_dict.get("objectiveValue") or 0,
                "schedules": output_dict.get("schedules") or [],
                "recommendations": output_dict.get("recommendations") or [],
                "kpis": scenario_kpis,
                "solveTimeSeconds": output_dict.get("solveTimeSeconds") or 0,
                "solver": (output_dict.get("metadata") or {}).get("solver"),
            },
            "baselineKpis": baseline_kpis or {},
            "scenarioKpis": scenario_kpis,
            "kpiDeltas": deltas,
        })

        _persist_recommendations(output_dict, scenarioId=scenarioId)
        return cls.getScenario(scenarioId)
    except Exception as e:
        c3.PsoScenario.merge({"id": scenarioId, "status": "Failed"})
        raise e


def getBaselineKpis(cls):
    out = cls.getOutputData()
    if out and out.get("kpis"):
        return out["kpis"]
    # Fresh baseline run to get kpis if the etl output is missing.
    baseline = cls.getInputData()
    output = c3.PsoOptimizer.runOptimization(baseline, "Balanced")
    output_dict = output.toJson() if hasattr(output, "toJson") else output
    _save_output(output_dict)
    return output_dict.get("kpis") or {}


def compareScenarios(cls, scenarioIdA, scenarioIdB):
    a = cls.getScenario(scenarioIdA) or {}
    b = cls.getScenario(scenarioIdB) or {}
    kpis_a = a.get("scenarioKpis") or {}
    kpis_b = b.get("scenarioKpis") or {}
    keys = sorted(set(kpis_a.keys()) | set(kpis_b.keys()))
    rows = []
    for k in keys:
        va = kpis_a.get(k)
        vb = kpis_b.get(k)
        rows.append({"metric": k, "a": va, "b": vb,
                     "delta": _safe_sub(vb, va)})
    return {"scenarioA": a, "scenarioB": b, "rows": rows}


# ---------------------------------------------------------------
# Recommendations / feedback
# ---------------------------------------------------------------
def getRecommendations(cls, filter=None, limit=200):
    filter_json = filter.toJson() if hasattr(filter, "toJson") else (filter or {})
    clauses = []

    # C3 filter engine does not support the 'in' operator — expand to chained == with ||
    def _eq_clause(field, values):
        if not values:
            return None
        parts = [f"{field} == '{v}'" for v in values]
        if len(parts) == 1:
            return parts[0]
        return "(" + " || ".join(parts) + ")"

    for field, key in [("status", "status"), ("decision", "decision"),
                       ("crudeGrade", "crudeGrade"), ("cargoId", "cargoId")]:
        vals = filter_json.get(key)
        if vals:
            c = _eq_clause(field, vals)
            if c:
                clauses.append(c)

    if filter_json.get("dateFrom"):
        clauses.append(f"createdAt >= dateTime('{filter_json['dateFrom']}')")
    if filter_json.get("dateTo"):
        clauses.append(f"createdAt <= dateTime('{filter_json['dateTo']}')")

    spec = {"order": "descending(createdAt)", "limit": limit}
    if clauses:
        spec["filter"] = " && ".join(clauses)
    rows = c3.PsoRecommendation.fetch(spec)
    return [_entity_to_json(r) for r in (rows.objs or [])]


def acceptRecommendation(cls, recommendationId, notes="", actor="operator"):
    return _update_rec_status(recommendationId, "Accepted", notes, actor)


def rejectRecommendation(cls, recommendationId, notes="", actor="operator"):
    return _update_rec_status(recommendationId, "Rejected", notes, actor)


def modifyRecommendation(cls, recommendationId, modifications, notes="", actor="operator"):
    row = c3.PsoRecommendation.get(recommendationId)
    if not row:
        raise Exception(f"Recommendation {recommendationId} not found")
    mods = modifications.toJson() if hasattr(modifications, "toJson") else (modifications or {})
    upd = {
        "id": recommendationId,
        "status": "Modified",
        "actedOnAt": _utcnow(),
        "actedOnBy": actor,
        "feedbackNotes": notes or "",
    }
    if "reorderPlan" in mods:
        upd["reorderPlan"] = mods["reorderPlan"]
    if "nextActions" in mods:
        upd["nextActions"] = mods["nextActions"]
    c3.PsoRecommendation.merge(upd)
    return _entity_to_json(c3.PsoRecommendation.get(recommendationId))


def addRecommendationNote(cls, recommendationId, note, actor="operator"):
    row = c3.PsoRecommendation.get(recommendationId)
    if not row:
        raise Exception(f"Recommendation {recommendationId} not found")
    existing = getattr(row, "feedbackNotes", "") or ""
    stamp = _utcnow()
    updated = f"{existing}\n[{stamp} {actor}] {note}".strip()
    c3.PsoRecommendation.merge({"id": recommendationId, "feedbackNotes": updated})
    return _entity_to_json(c3.PsoRecommendation.get(recommendationId))


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------
def _utcnow():
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def _save_output(output):
    try:
        etl_path = c3.FileSystem.mounts().get("etl")
        if not etl_path:
            return
        file_path = etl_path + "/CrudeOutput.json"
        c3_file = c3.FileSystem.makeFile(file_path)
        c3.FileSystem.uploadFile(StringIO(json.dumps(output, indent=2)), c3_file)
    except Exception:
        pass


def _persist_recommendations(output_dict, scenarioId="BASELINE"):
    """Persist each recommendation in the run as a PsoRecommendation row.
    Uses an upsert keyed by recommendationId so re-running doesn't duplicate
    history for unchanged ids."""
    recs = output_dict.get("recommendations") or []
    run_id = output_dict.get("id") or ""
    rows = []
    for r in recs:
        rows.append({
            "id": r.get("recommendationId"),
            "decision": r.get("decision"),
            "scenarioId": scenarioId,
            "runId": run_id,
            "cargoId": r.get("cargoId") or "",
            "crudeGrade": r.get("crudeGrade") or "",
            "confidence": r.get("confidence") or 0,
            "priority": r.get("priority") or "MEDIUM",
            "expectedImpactUsd": r.get("expectedImpactUsd") or 0,
            "title": r.get("title") or "",
            "summary": r.get("summary") or "",
            "evidence": r.get("evidence") or [],
            "assumptions": r.get("assumptions") or [],
            "risks": r.get("risks") or [],
            "nextActions": r.get("nextActions") or [],
            "reorderPlan": r.get("reorderPlan"),
            "riskFlags": r.get("riskFlags") or [],
            "anomalies": r.get("anomalies") or [],
            "metadata": r.get("metadata") or {},
            "status": "Proposed",
            "createdAt": _utcnow(),
        })
    for row in rows:
        try:
            # Only create if missing; do not overwrite operator feedback.
            if not c3.PsoRecommendation.exists(row["id"]):
                c3.PsoRecommendation.create(row)
        except Exception:
            # Fall back to merge if exists/create isn't available.
            try:
                c3.PsoRecommendation.merge(row)
            except Exception:
                pass


def _update_rec_status(recId, status, notes, actor):
    row = c3.PsoRecommendation.get(recId)
    if not row:
        raise Exception(f"Recommendation {recId} not found")
    c3.PsoRecommendation.merge({
        "id": recId,
        "status": status,
        "actedOnAt": _utcnow(),
        "actedOnBy": actor,
        "feedbackNotes": notes or (getattr(row, "feedbackNotes", "") or ""),
    })
    return _entity_to_json(c3.PsoRecommendation.get(recId))


def _entity_to_json(row):
    if row is None:
        return None
    if hasattr(row, "toJson"):
        return row.toJson()
    return row


def _apply_parameter_changes(baseline_input, changes):
    """Delegate to the same override routine the solver uses internally, so
    baseline and scenario runs apply identical semantics."""
    if not changes:
        return baseline_input
    import sys, os
    # Inline the overrides application (small dupe; keeps this service
    # independent of PsoOptimizer.py path resolution).
    import copy, datetime as _dt
    p = copy.deepcopy(baseline_input)
    fac = p["facilities"][0]

    for cid, delta in (changes.get("delayVesselDays") or {}).items():
        for c in fac.get("cargoes", []):
            if c["cargoId"] == cid:
                for field in ("laycanStart", "laycanEnd"):
                    if c.get(field):
                        d = _dt.date.fromisoformat(c[field][:10])
                        c[field] = (d + _dt.timedelta(days=int(delta))).isoformat()

    for g, price in (changes.get("priceOverride") or {}).items():
        for i in p.get("items", []):
            if i["itemId"] == g:
                i["priceDifferentialUsdBbl"] = price

    for g in changes.get("removeGrades") or []:
        p["items"] = [i for i in p.get("items", []) if i["itemId"] != g]
        fac["cargoes"] = [c for c in fac.get("cargoes", []) if c["crudeGrade"] != g]

    for uid, pct in (changes.get("cduThroughputPct") or {}).items():
        for u in fac.get("cdus", []):
            if u["cduId"] == uid:
                u["plannedThroughputBpd"] = u["plannedThroughputBpd"] * pct
                u["minThroughputBpd"] = u["minThroughputBpd"] * pct
                u["maxThroughputBpd"] = u["maxThroughputBpd"] * pct

    for tid, cap in (changes.get("tankCapacityBbls") or {}).items():
        for t in fac.get("tanks", []):
            if t["tankId"] == tid:
                t["capacityBbls"] = cap
                t["ullageBbls"] = max(0, cap - (t.get("currentVolumeBbls") or 0))

    return p


def _kpi_deltas(baseline, scenario):
    deltas = {}
    for k in set(list(baseline.keys()) + list(scenario.keys())):
        deltas[k] = _safe_sub(scenario.get(k), baseline.get(k))
    return deltas


def _safe_sub(a, b):
    try:
        return round((a or 0) - (b or 0), 3)
    except Exception:
        return None
