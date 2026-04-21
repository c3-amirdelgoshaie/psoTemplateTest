# ─── LLM configuration ────────────────────────────────────────────────────────
# v2 — history-aware intent classification

_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"


def _get_llm_client():
    """
    Build a GenaiCore.Llm.Completion.Client backed by Bedrock Claude Haiku.
    Auth is read from the 'bedrock' config key.
    """
    return c3.GenaiCore.Llm.Completion.Client.make({
        "model": c3.GenaiCore.Llm.Bedrock.Model.make({
            "model": _MODEL_ID,
            "auth":  c3.GenaiCore.Llm.Bedrock.Auth.forConfigKey("bedrock"),
        })
    })


def _llm_invoke(system_prompt, messages):
    """
    Call GenaiCore.Llm.Completion.Client.completion() with a system prompt
    prepended as a system message. Returns the reply text as a plain string.
    """
    full_messages = [{"role": "system", "content": system_prompt}] + messages
    client   = _get_llm_client()
    response = client.completion(
        messages=full_messages,
        options={"max_tokens": 2048, "returnJson": True},
    )
    return response["choices"][0]["message"]["content"]


# ─── Data gathering ────────────────────────────────────────────────────────────

def _get_overview():
    """High-level record counts and latest optimizer run status."""
    total_inputs   = c3.PsoInput.fetchCount({})
    total_outputs  = c3.PsoOutput.fetchCount({})
    total_scenarios = c3.PsoScenario.fetchCount({})

    complete_scenarios = c3.PsoScenario.fetchCount({"filter": "status == 'Complete'"})
    running_scenarios  = c3.PsoScenario.fetchCount({"filter": "status == 'Running'"})
    failed_scenarios   = c3.PsoScenario.fetchCount({"filter": "status == 'Failed'"})

    return (
        f"PSO Application Overview:\n"
        f"  Optimizer inputs (PsoInput records): {total_inputs}\n"
        f"  Optimizer outputs (PsoOutput records): {total_outputs}\n"
        f"  Total scenarios: {total_scenarios}\n"
        f"    Complete: {complete_scenarios}\n"
        f"    Running: {running_scenarios}\n"
        f"    Failed: {failed_scenarios}\n"
    )


def _get_scenario_stats():
    """Summary of saved scenarios with objectives and full KPI deltas."""
    result = c3.PsoScenario.fetch({
        "include": "id,name,description,objective,status,createdAt,lastRunAt,kpiDeltas,scenarioKpis",
        "order":   "descending(createdAt)",
        "limit":   20,
    })
    objs = result.objs or []
    if not objs:
        return "No scenarios found."

    lines = ["Recent scenarios (newest first):"]
    for s in objs:
        kd = getattr(s, "kpiDeltas", None) or {}
        sk = getattr(s, "scenarioKpis", None) or {}
        desc = getattr(s, "description", "")
        lines.append(f"\n  [{s.status}] {s.name} (objective: {s.objective})")
        if desc:
            lines.append(f"    Description: {desc}")
        # KPI deltas
        if isinstance(kd, dict) and kd:
            lines.append("    KPI deltas vs baseline:")
            delta_labels = [
                ("grmUsdPerBbl",          "GRM delta ($/bbl)"),
                ("grmUsdAnnualizedMM",    "GRM annualized delta ($MM)"),
                ("opportunityUsdAnnualizedMM", "Opportunity uplift ($MM annualized)"),
                ("openDemurrageRiskUsd",  "Demurrage risk delta ($)"),
                ("blendViolationCount",   "Blend violations delta"),
                ("daysOfCoverHs",         "Days of cover HS delta"),
                ("daysOfCoverLs",         "Days of cover LS delta"),
            ]
            for key, label in delta_labels:
                val = kd.get(key)
                if val is not None and val != 0:
                    lines.append(f"      {label}: {val:+g}")
        # Absolute scenario KPIs
        if isinstance(sk, dict) and sk:
            lines.append("    Scenario KPIs (absolute):")
            abs_labels = [
                ("grmUsdPerBbl",          "GRM ($/bbl)"),
                ("grmUsdAnnualizedMM",    "GRM annualized ($MM)"),
                ("throughputBpd",         "Throughput (bpd)"),
                ("openDemurrageRiskUsd",  "Open demurrage risk ($)"),
                ("blendViolationCount",   "Blend violations"),
                ("daysOfCoverHs",         "Days of cover HS"),
                ("daysOfCoverLs",         "Days of cover LS"),
            ]
            for key, label in abs_labels:
                val = sk.get(key)
                if val is not None:
                    lines.append(f"      {label}: {val:g}")
    return "\n".join(lines)


def _get_latest_output_kpis():
    """KPIs from the most recent optimizer output."""
    result = c3.PsoOutput.fetch({
        "include": "id,status,objectiveValue,objectiveMode,solvedAt,kpis,scenarioId",
        "order":   "descending(solvedAt)",
        "limit":   1,
    })
    objs = result.objs or []
    if not objs:
        return "No optimizer outputs found."

    o = objs[0]
    kpis = getattr(o, "kpis", {}) or {}
    solved_at = getattr(o, "solvedAt", "unknown")

    lines = [f"Latest optimizer run (solved at {solved_at}):"]
    lines.append(f"  Status: {o.status}  |  Objective mode: {o.objectiveMode}")
    lines.append(f"  Objective value: {getattr(o, 'objectiveValue', 'N/A')}")
    if isinstance(kpis, dict):
        kpi_keys = [
            ("grmUsdPerBbl", "GRM ($/bbl)"),
            ("grmUsdAnnualizedMM", "GRM annualized ($MM)"),
            ("demurrageCostUsd", "Demurrage cost ($)"),
            ("logisticsCostUsd", "Logistics cost ($)"),
            ("throughputBpd", "Throughput (bpd)"),
            ("daysOfCoverHs", "Days of cover HS"),
            ("daysOfCoverLs", "Days of cover LS"),
            ("scheduledArrivalsNext14d", "Arrivals next 14d"),
            ("openDemurrageRiskUsd", "Open demurrage risk ($)"),
            ("blendViolationCount", "Blend violations"),
        ]
        for key, label in kpi_keys:
            val = kpis.get(key)
            if val is not None:
                lines.append(f"  {label}: {val}")
    return "\n".join(lines)


def _get_schedule_stats():
    """Summary of cargo schedules from the latest optimizer output."""
    # Get latest output id first
    out_result = c3.PsoOutput.fetch({
        "include": "id,solvedAt",
        "order":   "descending(solvedAt)",
        "limit":   1,
    })
    out_objs = out_result.objs or []
    if not out_objs:
        return "No schedule data available."

    latest = out_objs[0]
    result = c3.PsoOutput.fetch({
        "filter":  f"id == '{latest.id}'",
        "include": "id,schedules",
        "limit":   1,
    })
    objs = result.objs or []
    if not objs or not getattr(objs[0], "schedules", None):
        return "No cargo schedules in latest output."

    schedules = objs[0].schedules or []
    status_counts = {}
    for s in schedules:
        st = getattr(s, "status", "Unknown")
        status_counts[st] = status_counts.get(st, 0) + 1

    lines = [f"Cargo schedules in latest run ({len(schedules)} total):"]
    for st, cnt in sorted(status_counts.items()):
        lines.append(f"  {st}: {cnt}")
    return "\n".join(lines)


def _get_recommendations_stats():
    """Summary of recommendations from the latest optimizer output."""
    out_result = c3.PsoOutput.fetch({
        "include": "id,solvedAt",
        "order":   "descending(solvedAt)",
        "limit":   1,
    })
    out_objs = out_result.objs or []
    if not out_objs:
        return "No recommendation data available."

    latest = out_objs[0]
    result = c3.PsoOutput.fetch({
        "filter":  f"id == '{latest.id}'",
        "include": "id,recommendations",
        "limit":   1,
    })
    objs = result.objs or []
    if not objs or not getattr(objs[0], "recommendations", None):
        return "No recommendations in latest output."

    recs = objs[0].recommendations or []
    type_counts = {}
    priority_counts = {}
    for r in recs:
        rtype = getattr(r, "type", "Unknown")
        prio  = getattr(r, "priority", "Unknown")
        type_counts[rtype] = type_counts.get(rtype, 0) + 1
        priority_counts[prio] = priority_counts.get(prio, 0) + 1

    lines = [f"Recommendations in latest run ({len(recs)} total):"]
    lines.append("  By type:")
    for t, cnt in sorted(type_counts.items(), key=lambda x: -x[1]):
        lines.append(f"    {t}: {cnt}")
    lines.append("  By priority:")
    for p, cnt in sorted(priority_counts.items(), key=lambda x: -x[1]):
        lines.append(f"    {p}: {cnt}")
    return "\n".join(lines)


def _get_vessel_cargo_status():
    """Vessel names, crude grades, ETAs, volumes, statuses, and demurrage rates from PsoInput."""
    result = c3.PsoInput.fetch({"include": "id,facilities", "limit": 1})
    objs = result.objs or []
    if not objs:
        return "No input data found."
    facilities = getattr(objs[0], "facilities", None) or []
    if not facilities:
        return "No facility data found."
    fac = facilities[0]
    cargoes = getattr(fac, "cargoes", None) or []
    if not cargoes:
        return "No cargo data found."

    lines = [f"Incoming cargoes ({len(cargoes)} vessels):"]
    total_demurrage_risk = 0
    for c in cargoes:
        vessel   = getattr(c, "vesselName", "?")
        grade    = getattr(c, "crudeGrade", "?")
        eta      = getattr(c, "etaTerminal", "?")
        vol      = getattr(c, "volumeBbls", 0) or 0
        status   = getattr(c, "status", "?")
        dem_rate = getattr(c, "demurrageRateUsdDay", 0) or 0
        dem_risk = getattr(c, "demurrageRiskLevel", None)
        loading  = getattr(c, "loadingPort", "?")
        origin   = getattr(c, "originRegion", "?")
        cargo_id = getattr(c, "cargoId", "?")
        lines.append(
            f"  [{status}] {vessel} ({cargo_id}) — {grade}, {vol:,.0f} bbls, ETA {eta}"
            f" | demurrage rate: ${dem_rate:,.0f}/day | origin: {origin} ({loading})"
            + (f" | risk: {dem_risk}" if dem_risk else "")
        )
        if status == "At Risk":
            total_demurrage_risk += dem_rate
    lines.append(f"Total daily demurrage exposure from At-Risk vessels: ${total_demurrage_risk:,.0f}/day")
    return "\n".join(lines)


def _get_tank_inventory():
    """Tank names, grades, current volumes, capacities, and utilisation from PsoInput."""
    result = c3.PsoInput.fetch({"include": "id,facilities", "limit": 1})
    objs = result.objs or []
    if not objs:
        return "No input data found."
    facilities = getattr(objs[0], "facilities", None) or []
    if not facilities:
        return "No facility data found."
    fac = facilities[0]
    tanks = getattr(fac, "tanks", None) or []
    if not tanks:
        return "No tank data found."

    lines = [f"Tank inventory ({len(tanks)} tanks):"]
    for t in tanks:
        name     = getattr(t, "name", "?")
        grade    = getattr(t, "crudeGrade", "?")
        current  = getattr(t, "currentVolumeBbls", 0) or 0
        capacity = getattr(t, "capacityBbls", 0) or 0
        ullage   = getattr(t, "ullageBbls", 0) or 0
        group    = getattr(t, "tankGroup", "?")
        pct      = (current / capacity * 100) if capacity else 0
        lines.append(
            f"  {name} [{group}] — {grade}: {current:,.0f}/{capacity:,.0f} bbls ({pct:.0f}% full)"
            f" | ullage: {ullage:,.0f} bbls"
        )
    return "\n".join(lines)


def _get_cdu_status():
    """CDU names, throughput plans, constraints, and LP targets from PsoInput."""
    result = c3.PsoInput.fetch({"include": "id,facilities", "limit": 1})
    objs = result.objs or []
    if not objs:
        return "No input data found."
    facilities = getattr(objs[0], "facilities", None) or []
    if not facilities:
        return "No facility data found."
    fac = facilities[0]
    cdus = getattr(fac, "cdus", None) or []
    if not cdus:
        return "No CDU data found."

    lines = [f"CDU status ({len(cdus)} CDUs):"]
    for cdu in cdus:
        name        = getattr(cdu, "name", "?")
        planned     = getattr(cdu, "plannedThroughputBpd", 0) or 0
        min_thr     = getattr(cdu, "minThroughputBpd", 0) or 0
        max_thr     = getattr(cdu, "maxThroughputBpd", 0) or 0
        constraints = getattr(cdu, "blendConstraints", None) or []
        lines.append(f"  {name}: planned {planned:,.0f} bpd (range {min_thr:,.0f}–{max_thr:,.0f} bpd)")
        if isinstance(constraints, list):
            for bc in constraints:
                if isinstance(bc, dict):
                    cname  = bc.get("name", "?")
                    status = bc.get("status", "?")
                    cur    = bc.get("currentValue", "?")
                    lim    = bc.get("limitValue", "?")
                    lines.append(f"    Constraint [{status}] {cname}: current={cur}, limit={lim}")
    return "\n".join(lines)


def _get_anomalies_and_risks():
    """Risk flags and anomalies from the latest optimizer output."""
    out_result = c3.PsoOutput.fetch({
        "include": "id,solvedAt",
        "order":   "descending(solvedAt)",
        "limit":   1,
    })
    out_objs = out_result.objs or []
    if not out_objs:
        return "No risk/anomaly data available."

    latest = out_objs[0]
    result = c3.PsoOutput.fetch({
        "filter":  f"id == '{latest.id}'",
        "include": "id,riskFlags,anomalies",
        "limit":   1,
    })
    objs = result.objs or []
    if not objs:
        return "No output found."

    o = objs[0]
    risk_flags = getattr(o, "riskFlags", None) or []
    anomalies  = getattr(o, "anomalies", None) or []

    lines = []
    if risk_flags:
        lines.append(f"Risk flags ({len(risk_flags)} total):")
        for rf in risk_flags[:10]:
            rtype = getattr(rf, "type", "?")
            msg   = getattr(rf, "message", "")
            lines.append(f"  [{rtype}] {msg}")
    else:
        lines.append("No active risk flags.")

    if anomalies:
        lines.append(f"Anomalies ({len(anomalies)} total):")
        for a in anomalies[:10]:
            atype = getattr(a, "type", "?")
            msg   = getattr(a, "message", "")
            lines.append(f"  [{atype}] {msg}")
    else:
        lines.append("No anomalies detected.")

    return "\n".join(lines)


# ─── Intent classification ─────────────────────────────────────────────────────

def _classify_text(text):
    """Return the set of intents triggered by a single text string."""
    q = text.lower()
    intents = set()

    if any(w in q for w in ["scenario", "what-if", "compare", "draft", "running", "complete", "failed", "plan",
                             "urals substitution", "vessel re-timing", "base april"]):
        intents.add("scenarios")

    if any(w in q for w in ["kpi", "grm", "demurrage", "throughput", "days of cover", "objective",
                             "solve", "run", "output", "result", "annualized", "opportunity"]):
        intents.add("kpis")

    if any(w in q for w in ["cargo", "vessel", "arrival", "berth", "slot", "delay", "at risk",
                             "demurrage rate", "loading port", "eta", "ionian", "aegean", "kithira",
                             "olympia", "poseidon", "thrace", "crg-"]):
        intents.add("vessels")

    if any(w in q for w in ["tank", "inventory", "stock", "ullage", "storage",
                             "t-101", "t-102", "t-103", "t-104",
                             "t-201", "t-202", "t-203", "t-204"]):
        intents.add("tanks")

    if any(w in q for w in ["cdu", "blend constraint", "sulphur", "api", "refin",
                             "cdu-1", "cdu-2", "hs train", "ls train"]):
        intents.add("cdus")

    if any(w in q for w in ["schedule", "cargo schedule"]):
        intents.add("schedules")

    if any(w in q for w in ["recommend", "action", "accept", "dismiss", "substitut", "reorder", "re-order"]):
        intents.add("recommendations")

    if any(w in q for w in ["risk", "anomal", "alert", "flag", "stockout", "blend violation"]):
        intents.add("risks")

    return intents


def _classify_question(question, chatHistory=None):
    """
    Map the current question — plus any intents surfaced in chat history — to
    a set of data-gathering intents.

    Follow-up questions ("tell me more about T-101") often contain no keywords
    of their own, so we union in any intents triggered by the prior conversation.
    This ensures the relevant data domain is always re-fetched for follow-ups.
    """
    intents = {"overview"}

    # Classify the current question
    intents |= _classify_text(question)

    # Union in intents from the chat history (questions + answers)
    for entry in (chatHistory or []):
        q = entry.get("question") if isinstance(entry, dict) else getattr(entry, "question", "")
        a = entry.get("answer")   if isinstance(entry, dict) else getattr(entry, "answer", "")
        if q:
            intents |= _classify_text(str(q))
        if a:
            intents |= _classify_text(str(a))

    return intents


def _build_context(intents):
    """
    Fetch and concatenate data-gathering function outputs for detected intents.
    """
    parts = []
    if "overview" in intents:
        parts.append(_get_overview())
    if "scenarios" in intents:
        parts.append(_get_scenario_stats())
    if "kpis" in intents:
        parts.append(_get_latest_output_kpis())
    if "vessels" in intents:
        parts.append(_get_vessel_cargo_status())
    if "tanks" in intents:
        parts.append(_get_tank_inventory())
    if "cdus" in intents:
        parts.append(_get_cdu_status())
    if "schedules" in intents:
        parts.append(_get_schedule_stats())
    if "recommendations" in intents:
        parts.append(_get_recommendations_stats())
    if "risks" in intents:
        parts.append(_get_anomalies_and_risks())
    return "\n\n".join(parts)


# ─── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a data analyst assistant for the Production Schedule Optimizer (PSO) — \
a crude scheduling and optimization tool for a refinery.

You answer questions about the application's data: scenarios, optimizer outputs, KPIs, \
cargo schedules, recommendations, risk flags, and anomalies.

Guidelines:
- Answer concisely and precisely using only the provided data context.
- Use markdown formatting: headers, bullet lists, tables, bold numbers.
- When asked for counts or percentages, be exact.
- For monetary values, use dollar formatting (e.g. $1,234,567).
- If the data context does not contain enough information to answer, say so clearly.
- Do not reference internal field names (like 'grmUsdPerBbl') — use human-readable names ('GRM in $/bbl').
- Assume the user is a refinery planner or operations analyst who understands crude scheduling.
"""


# ─── Main entrypoint ───────────────────────────────────────────────────────────

def answerQuestion(self, question, chatHistory):
    """
    Answer a natural-language question about the PSO application data.
    Called as a member function on the Singleton instance.
    """
    # 1. Classify intent and gather data context — include history so follow-ups
    #    about entities mentioned in prior answers get the right data fetched
    intents = _classify_question(question, chatHistory)
    context = _build_context(intents)

    # 2. Build message history (client sends last N pairs, already trimmed)
    messages = []
    for entry in (chatHistory or []):
        q = entry.get("question") if isinstance(entry, dict) else getattr(entry, "question", "")
        a = entry.get("answer")   if isinstance(entry, dict) else getattr(entry, "answer", "")
        if q and a:
            messages.append({"role": "user",      "content": str(q)})
            messages.append({"role": "assistant",  "content": str(a)})

    # 3. Append current question with data context injected
    messages.append({
        "role": "user",
        "content": (
            f"DATA CONTEXT:\n{context}\n\n"
            f"QUESTION: {question}"
        ),
    })

    # 4. Call LLM via GenaiCore.Llm.Completion.Client
    return _llm_invoke(_SYSTEM_PROMPT, messages)
