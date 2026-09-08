import type {
  AlignmentReport,
  BalanceReport,
  CheckinStatus,
  Direction,
  GamingFinding,
  ImprovementAction,
  KeyResult,
  Kpi,
  MaturityReport,
  Objective,
  QualityNotes,
  ScoreResult,
  WeightReport,
} from "./types";
import { clamp } from "./utils";

const MISSING = "Not yet defined";

export function missingLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return MISSING;
  return String(value);
}

export function scoreKpiValue(opts: {
  current: number | null | undefined;
  target: number | null | undefined;
  baseline?: number | null;
  direction: Direction | null;
  thresholds?: { min?: number; max?: number; green?: number; amber?: number; red?: number } | null;
}): ScoreResult {
  const { current, target, baseline, direction, thresholds } = opts;
  if (current === null || current === undefined || Number.isNaN(current)) {
    return { score: null, status: "not_measured", reason: "No current value has been recorded." };
  }
  if (!Number.isFinite(current)) {
    return { score: null, status: "not_measured", reason: "Current value is invalid." };
  }

  if (direction === "range" || direction === "threshold") {
    const min = thresholds?.min;
    const max = thresholds?.max;
    if (min === undefined && max === undefined && target === null) {
      return {
        score: null,
        status: "not_measured",
        reason: "A range or threshold KPI cannot be scored without bounds.",
      };
    }
    const lo = min ?? (target !== null && target !== undefined ? target * 0.9 : current);
    const hi = max ?? (target !== null && target !== undefined ? target * 1.1 : current);
    if (hi === lo) {
      return {
        score: current === lo ? 100 : 0,
        status: current === lo ? "achieved" : "behind",
        reason: "Threshold is a single point; equality is required.",
      };
    }
    if (current >= lo && current <= hi) {
      return { score: 100, status: "on_track", reason: "Value sits inside the agreed range." };
    }
    const dist = current < lo ? lo - current : current - hi;
    const span = hi - lo;
    const score = clamp(100 - (dist / span) * 100, 0, 99);
    return {
      score,
      status: score >= 70 ? "at_risk" : "behind",
      reason: "Value is outside the agreed range.",
    };
  }

  if (target === null || target === undefined || Number.isNaN(target)) {
    return {
      score: null,
      status: "not_measured",
      reason: "Target cannot be scored because it is not yet defined.",
    };
  }

  const dir: Direction = direction ?? "higher";
  const base = baseline ?? (dir === "lower" ? target * 1.4 : target * 0.6);

  if (dir === "higher") {
    if (target === base) {
      const ok = current >= target;
      return {
        score: ok ? 100 : 0,
        status: ok ? "achieved" : "behind",
        reason: "Target equals baseline; scoring is binary.",
      };
    }
    const span = target - base;
    if (span === 0) {
      return { score: null, status: "not_measured", reason: "Cannot score: target and baseline are identical." };
    }
    const score = clamp(((current - base) / span) * 100, 0, 120);
    return statusFromScore(score, current >= target);
  }

  // lower is better
  if (target === base) {
    const ok = current <= target;
    return {
      score: ok ? 100 : 0,
      status: ok ? "achieved" : "behind",
      reason: "Target equals baseline; scoring is binary.",
    };
  }
  const span = base - target;
  if (span === 0) {
    return { score: null, status: "not_measured", reason: "Cannot score: target and baseline are identical." };
  }
  const score = clamp(((base - current) / span) * 100, 0, 120);
  return statusFromScore(score, current <= target);
}

function statusFromScore(score: number, achieved: boolean): ScoreResult {
  if (achieved || score >= 100) return { score: Math.min(score, 100), status: "achieved", reason: "Target has been met." };
  if (score >= 80) return { score, status: "on_track", reason: "Progress is within the expected band." };
  if (score >= 55) return { score, status: "at_risk", reason: "Progress is slipping relative to the target path." };
  return { score, status: "behind", reason: "Progress is well below the target path." };
}

export function assessQuality(kpi: Partial<Kpi>): QualityNotes {
  const criteria: QualityNotes["criteria"] = [];

  const add = (id: string, label: string, ok: boolean, note: string, partial = false) => {
    criteria.push({
      id,
      label,
      score: ok ? 10 : partial ? 5 : 0,
      max: 10,
      note,
    });
  };

  add(
    "relevance",
    "Strategic relevance",
    Boolean(kpi.objectiveId || kpi.purpose),
    kpi.objectiveId
      ? "Linked to an objective."
      : kpi.purpose
        ? "Has a purpose but is not yet linked to an objective."
        : "No objective or decision this KPI supports.",
    Boolean(kpi.purpose) && !kpi.objectiveId,
  );
  const def = (kpi.definition ?? "").trim();
  add(
    "definition",
    "Clear definition",
    def.length >= 40,
    def.length >= 40 ? "Definition is specific enough to audit." : "Definition is missing or too vague to measure consistently.",
    def.length >= 16,
  );
  add(
    "measurable",
    "Measurability",
    Boolean(kpi.unit && (kpi.formula || kpi.dataSource)),
    kpi.unit && (kpi.formula || kpi.dataSource)
      ? "Unit and a formula or source exist."
      : "Cannot be measured as specified.",
    Boolean(kpi.unit),
  );
  add(
    "ownership",
    "Ownership",
    Boolean(kpi.ownerName),
    kpi.ownerName ? `Owned by ${kpi.ownerName}.` : "No owner — the measure will not be managed.",
  );
  const formula = (kpi.formula ?? "").trim();
  add(
    "formula",
    "Formula clarity",
    formula.length >= 8,
    formula.length >= 8 ? "Formula is documented." : "Formula is missing or unclear.",
    formula.length > 0,
  );
  add(
    "data",
    "Data availability",
    Boolean(kpi.dataSource),
    kpi.dataSource ? `Source: ${kpi.dataSource}.` : "No data source. Do not approve until this is known.",
  );
  const hasTarget = kpi.target !== null && kpi.target !== undefined;
  const hasBase = kpi.baseline !== null && kpi.baseline !== undefined;
  add(
    "target",
    "Target quality",
    Boolean(hasTarget && hasBase && kpi.direction),
    hasTarget && hasBase
      ? "Baseline and target are both present."
      : hasTarget
        ? "Target exists without a baseline — treat as an assumption, not a fact."
        : "Target cannot be responsibly determined yet.",
    hasTarget || hasBase,
  );
  add(
    "frequency",
    "Frequency suitability",
    Boolean(kpi.frequency),
    kpi.frequency ? `Measured ${kpi.frequency}.` : "Measurement frequency is not defined.",
  );
  add(
    "action",
    "Actionability",
    Boolean(kpi.purpose && kpi.ownerName),
    kpi.purpose && kpi.ownerName
      ? "Someone can act on this number."
      : "Unclear what decision this KPI would change.",
    Boolean(kpi.purpose),
  );
  const gamingHigh = (kpi.gamingSeverity ?? "").toLowerCase() === "high" && !kpi.guardrail;
  add(
    "gaming",
    "Gaming risk",
    !gamingHigh,
    gamingHigh
      ? "High gaming risk with no guardrail — do not treat as high quality."
      : kpi.guardrail
        ? "Guardrail documented."
        : "Gaming risk is acceptable or mitigated.",
    !gamingHigh && !kpi.guardrail,
  );

  const total = criteria.reduce((s, c) => s + c.score, 0);
  return { total, criteria };
}

const GAMING_PATTERNS: { test: RegExp; risk: string; why: string; behavior: string; guardrail: string; severity: "high" | "medium" | "low" }[] = [
  {
    test: /\b(revenue|sales|gmv|top[- ]?line)\b/i,
    risk: "Revenue-only pressure",
    why: "A commercial volume measure with no quality or margin partner invites discounting and poor-fit deals.",
    behavior: "Discounting, stuffing channels, booking premature sales.",
    guardrail: "Pair with gross margin %, refund rate and retention or NPS.",
    severity: "high",
  },
  {
    test: /\b(tasks? completed|tickets? closed|stories closed|throughput)\b/i,
    risk: "Output splitting",
    why: "Counting completed units rewards smaller units, not better work.",
    behavior: "Splitting tasks, closing and reopening tickets, avoiding hard work.",
    guardrail: "Pair with cycle time, reopen rate and customer/quality outcome.",
    severity: "high",
  },
  {
    test: /\b(calls? (made|taken)|talk time|handle time)\b/i,
    risk: "Activity theatre",
    why: "Activity volume is a driver, not an outcome, and is easy to game.",
    behavior: "Short low-value calls, avoiding complex cases.",
    guardrail: "Pair with first-contact resolution and CSAT.",
    severity: "high",
  },
  {
    test: /\b(hires?|headcount|number of (employees|people) hired)\b/i,
    risk: "Hiring volume without quality",
    why: "Fill-the-seat metrics degrade hiring quality.",
    behavior: "Lowering the bar, rushing offers, ignoring values fit.",
    guardrail: "Pair with 90-day retention, hiring-manager quality and time-to-productivity.",
    severity: "medium",
  },
  {
    test: /\b(lines of code|story points|velocity)\b/i,
    risk: "Proxy inflation",
    why: "Engineering proxies inflate without shipping value.",
    behavior: "Verbose code, point inflation, avoiding unpointed work.",
    guardrail: "Prefer lead time, change-fail rate and outcomes over volume.",
    severity: "high",
  },
  {
    test: /\b(attendance|hours worked|utilisation|utilization)\b/i,
    risk: "Presence over contribution",
    why: "Time-at-desk is not performance.",
    behavior: "Presenteeism, logging idle time, avoiding deep work.",
    guardrail: "Use outcome measures; treat utilisation as a capacity constraint, not a KPI.",
    severity: "medium",
  },
  {
    test: /\b(nps|csat|satisfaction)\b/i,
    risk: "Survey selection",
    why: "Satisfaction scores can be gamed by sampling only happy customers.",
    behavior: "Selective survey send, coaching customers, tiny samples.",
    guardrail: "Require response rate, sample size and a complaint/quality partner metric.",
    severity: "medium",
  },
  {
    test: /\b(units produced|output volume|throughput)\b/i,
    risk: "Volume over quality",
    why: "Production volume without quality or safety guardrails creates scrap and incidents.",
    behavior: "Rushing, skipping checks, hiding defects.",
    guardrail: "Pair with first-pass yield, scrap and safety incidents.",
    severity: "high",
  },
  {
    test: /\b(completion rate|pass rate|graduation)\b/i,
    risk: "Standards dilution",
    why: "Completion as a sole learner measure encourages easier assessments.",
    behavior: "Lowering the bar, teaching to the test, pushing unready learners through.",
    guardrail: "Pair with assessment integrity, skill demonstration and application on the job.",
    severity: "medium",
  },
];

export function detectGaming(kpi: Partial<Kpi> & { id?: string; name: string }): GamingFinding {
  const blob = `${kpi.name} ${kpi.definition ?? ""} ${kpi.purpose ?? ""}`;
  const hit = GAMING_PATTERNS.find((p) => p.test.test(blob));
  if (hit) {
    return {
      kpiId: kpi.id ?? "",
      kpiName: kpi.name,
      risk: hit.risk,
      why: hit.why,
      severity: hit.severity,
      possibleBehavior: hit.behavior,
      guardrail: kpi.guardrail || hit.guardrail,
    };
  }
  return {
    kpiId: kpi.id ?? "",
    kpiName: kpi.name,
    risk: "General metric risk",
    why: "Any unmanaged measure can be optimised at the expense of the business.",
    severity: "low",
    possibleBehavior: "Local optimisation, ignoring unmeasured outcomes.",
    guardrail: kpi.guardrail || "Name the decision this KPI informs and the behaviour it must not create.",
  };
}

export function designTargets(opts: {
  baseline: number | null | undefined;
  direction: Direction | null;
  ambition?: "modest" | "expected" | "aggressive";
  userProvidedTarget?: number | null;
}): {
  conservative: number | null;
  expected: number | null;
  stretch: number | null;
  notes: string[];
} {
  const notes: string[] = [];
  const baseline = opts.baseline;
  if (baseline === null || baseline === undefined || Number.isNaN(baseline)) {
    return {
      conservative: opts.userProvidedTarget ?? null,
      expected: opts.userProvidedTarget ?? null,
      stretch: null,
      notes: [
        "Target cannot be responsibly determined yet.",
        "Insufficient data to establish a reliable benchmark.",
        "A user-supplied target is stored as an assumption until a baseline exists.",
      ],
    };
  }
  const dir = opts.direction ?? "higher";
  const improve = (pct: number) =>
    dir === "lower" ? round2(baseline * (1 - pct)) : round2(baseline * (1 + pct));

  const conservative = improve(0.05);
  const expected = improve(0.12);
  const stretch = improve(0.22);
  notes.push(
    `Conservative is a realistic ~5% ${dir === "lower" ? "reduction" : "improvement"} from the stated baseline.`,
  );
  notes.push("Expected is the recommended 12% move if capacity is normal and no constraint was given.");
  notes.push("Stretch is ambitious (~22%) and should not be used for bonuses without a guardrail.");
  notes.push("These are design recommendations, not industry benchmarks. No external benchmark was used.");
  if (opts.userProvidedTarget !== null && opts.userProvidedTarget !== undefined) {
    notes.push("A user-provided target is preserved as a fact and not overwritten.");
  }
  return { conservative, expected, stretch, notes };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function alignmentReport(
  objectives: Objective[],
  kpis: Kpi[],
  krCountByObjective: Record<string, number>,
  keyResults: KeyResult[] = [],
): AlignmentReport {
  const reasons: string[] = [];
  const objIds = new Set(objectives.map((o) => o.id));
  const orphanKpis = kpis.filter((k) => !k.objectiveId || !objIds.has(k.objectiveId)).map((k) => k.name);
  const orphanKrs = keyResults.filter((k) => !k.objectiveId || !objIds.has(k.objectiveId)).map((k) => k.name);
  const unmeasuredObjectives = objectives
    .filter((o) => (krCountByObjective[o.id] ?? 0) === 0 && !kpis.some((k) => k.objectiveId === o.id))
    .map((o) => o.title);

  const nameMap = new Map<string, string[]>();
  for (const k of kpis) {
    const key = k.name.trim().toLowerCase();
    nameMap.set(key, [...(nameMap.get(key) ?? []), k.id]);
  }
  const duplicates = [...nameMap.entries()].filter(([, ids]) => ids.length > 1).map(([n]) => n);

  const conflicts: string[] = [];
  const byStem = new Map<string, Kpi[]>();
  for (const k of kpis) {
    const stem = k.name.toLowerCase().split(" ").slice(0, 2).join(" ");
    byStem.set(stem, [...(byStem.get(stem) ?? []), k]);
  }
  for (const [stem, group] of byStem) {
    const dirs = new Set(group.map((g) => g.direction).filter(Boolean));
    if (dirs.has("higher") && dirs.has("lower")) conflicts.push(stem);
  }

  let score = 100;
  if (orphanKpis.length) {
    score -= Math.min(24, orphanKpis.length * 8);
    reasons.push(`${orphanKpis.length} KPI(s) are orphaned — they support no objective.`);
  }
  if (orphanKrs.length) {
    score -= Math.min(16, orphanKrs.length * 6);
    reasons.push(`${orphanKrs.length} key result(s) are orphaned — they are not linked to an objective.`);
  }
  if (unmeasuredObjectives.length) {
    score -= Math.min(24, unmeasuredObjectives.length * 8);
    reasons.push(`${unmeasuredObjectives.length} objective(s) have no key result or KPI.`);
  }
  if (duplicates.length) {
    score -= Math.min(12, duplicates.length * 4);
    reasons.push(`${duplicates.length} duplicated measure name(s).`);
  }
  if (conflicts.length) {
    score -= Math.min(12, conflicts.length * 6);
    reasons.push(`${conflicts.length} potential conflicting direction(s) on similar measures.`);
  }
  const company = objectives.filter((o) => o.level === "company");
  const lower = objectives.filter((o) => o.level !== "company");
  if (company.length && lower.length) {
    const linked = lower.filter((o) => o.parentId).length;
    if (linked / lower.length >= 0.7) {
      reasons.push("Strong connection between lower-level objectives and company strategy.");
    } else {
      score -= 10;
      reasons.push("Several lower-level objectives are not cascaded from a company objective.");
    }
  } else if (!company.length && objectives.length) {
    score -= 8;
    reasons.push("No company-level objective is present to cascade from.");
  }
  if (reasons.length === 0) reasons.push("Objectives, results and KPIs are linked with no obvious gaps.");
  return {
    score: clamp(Math.round(score), 0, 100),
    reasons,
    orphanKpis,
    orphanKrs,
    unmeasuredObjectives,
    duplicates,
    conflicts,
  };
}

export function balanceReport(kpis: Kpi[]): BalanceReport {
  const count = (fn: (k: Kpi) => boolean) => kpis.filter(fn).length;
  const leading = count((k) => k.leadingLagging === "leading");
  const lagging = count((k) => k.leadingLagging === "lagging");
  const result = count((k) => k.resultDriver === "result");
  const driver = count((k) => k.resultDriver === "driver");
  const efficiency = count((k) => k.efficiencyEffectiveness === "efficiency");
  const effectiveness = count((k) => k.efficiencyEffectiveness === "effectiveness");
  const quality = count((k) => k.qualityQuantity === "quality");
  const quantity = count((k) => k.qualityQuantity === "quantity");
  const ipoo: Record<string, number> = {
    input: count((k) => k.ipoo === "input"),
    process: count((k) => k.ipoo === "process"),
    output: count((k) => k.ipoo === "output"),
    outcome: count((k) => k.ipoo === "outcome"),
  };
  const parmenter: Record<string, number> = {
    KRI: count((k) => k.parmenterType === "KRI"),
    RI: count((k) => k.parmenterType === "RI"),
    PI: count((k) => k.parmenterType === "PI"),
    KPI: count((k) => k.parmenterType === "KPI"),
  };
  const notes: string[] = [];
  if (kpis.length === 0) notes.push("No KPIs to balance yet.");
  if (lagging > leading * 3 && kpis.length >= 4) {
    notes.push("The set is lagging-heavy. Add a small number of leading drivers management can actually influence.");
  }
  if (quantity > quality * 2 && kpis.length >= 4) {
    notes.push("Quantity dominates quality. Add guardrail quality measures.");
  }
  if (parmenter.KPI > Math.max(2, Math.round(kpis.length * 0.2))) {
    notes.push("Too many items are labelled KPI. Parmenter’s 10/80/10 is a guideline — most measures should be RIs or PIs.");
  }
  if (ipoo.outcome === 0 && kpis.length >= 4) {
    notes.push("No outcome measures. The system may track activity without knowing if the business improved.");
  }
  if (notes.length === 0) notes.push("The mix of leading/lagging and result/driver is acceptable for this scope.");
  return { leading, lagging, result, driver, efficiency, effectiveness, quality, quantity, ipoo, parmenter, notes };
}

export function weightReport(kpis: Kpi[]): WeightReport {
  const weighted = kpis.filter((k) => k.weight !== null && k.weight !== undefined);
  if (weighted.length === 0) {
    return {
      total: 0,
      unallocated: 100,
      valid: true,
      message: "No weights assigned. Weighting is optional; leave blank rather than inventing numbers.",
    };
  }
  const total = weighted.reduce((s, k) => s + (k.weight ?? 0), 0);
  const unallocated = Math.round((100 - total) * 10) / 10;
  const valid = Math.abs(100 - total) <= 1;
  const message = valid
    ? "KPI weights total 100%."
    : `KPI weights total ${Math.round(total * 10) / 10}%. ${Math.abs(unallocated)}% remains ${unallocated > 0 ? "unallocated" : "over-allocated"}.`;
  return { total, unallocated, valid, message };
}

export function maturityReport(opts: {
  objectives: Objective[];
  kpis: Kpi[];
  krCount: number;
  checkinCount: number;
  hasCompanyObjective: boolean;
}): MaturityReport {
  const { objectives, kpis, krCount, checkinCount, hasCompanyObjective } = opts;
  const avgQuality =
    kpis.length === 0 ? 0 : Math.round(kpis.reduce((s, k) => s + (k.qualityScore ?? 0), 0) / kpis.length);
  const owned = kpis.filter((k) => k.ownerName).length;
  const sourced = kpis.filter((k) => k.dataSource).length;
  const approved = kpis.filter((k) => k.status === "approved" || k.status === "active").length;
  const guarded = kpis.filter((k) => k.guardrail).length;
  const withTarget = kpis.filter((k) => k.target !== null && k.target !== undefined).length;

  const categories = [
    {
      id: "strategy",
      label: "Strategy alignment",
      score: hasCompanyObjective ? (objectives.length >= 3 ? 80 : 60) : objectives.length ? 35 : 10,
      note: hasCompanyObjective ? "Company objectives exist." : "No company objective to cascade from.",
    },
    {
      id: "kpiq",
      label: "KPI quality",
      score: avgQuality,
      note: kpis.length ? `Average quality score ${avgQuality}/100.` : "No KPIs yet.",
    },
    {
      id: "okr",
      label: "OKR quality",
      score: krCount === 0 ? 10 : clamp(40 + krCount * 8, 0, 85),
      note: krCount ? `${krCount} key results defined.` : "No key results yet.",
    },
    {
      id: "data",
      label: "Data readiness",
      score: kpis.length ? Math.round((sourced / kpis.length) * 100) : 0,
      note: kpis.length ? `${sourced}/${kpis.length} have a data source.` : "No measures to source.",
    },
    {
      id: "own",
      label: "Ownership",
      score: kpis.length ? Math.round((owned / kpis.length) * 100) : 0,
      note: kpis.length ? `${owned}/${kpis.length} have an owner.` : "No owners yet.",
    },
    {
      id: "review",
      label: "Review discipline",
      score: kpis.length === 0 ? 0 : clamp(Math.round((checkinCount / kpis.length) * 50), 0, 90),
      note: checkinCount ? `${checkinCount} check-ins recorded.` : "No reviews recorded yet.",
    },
    {
      id: "gov",
      label: "Governance",
      score: kpis.length ? Math.round((approved / kpis.length) * 100) : 0,
      note: `${approved} approved or active.`,
    },
    {
      id: "meas",
      label: "Measurement consistency",
      score: kpis.length ? Math.round((kpis.filter((k) => k.frequency).length / kpis.length) * 100) : 0,
      note: "Frequency completeness.",
    },
    {
      id: "risk",
      label: "Risk controls",
      score: kpis.length ? Math.round((guarded / kpis.length) * 100) : 0,
      note: `${guarded} guardrails documented.`,
    },
    {
      id: "ci",
      label: "Continuous improvement",
      score: clamp(checkinCount * 12 + (withTarget > 0 ? 20 : 0), 0, 80),
      note: "Improvement requires a review cadence, not a one-off design.",
    },
  ];
  const score = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);
  const weaknesses = [...categories].sort((a, b) => a.score - b.score).slice(0, 5).map((c) => `${c.label}: ${c.note}`);
  const priorities = weaknesses.slice(0, 3).map((w) => `Address: ${w}`);
  const plan: ImprovementAction[] = [
    {
      phase: "1-30",
      action: "Confirm owners, definitions and data sources for every draft KPI. Archive vanity measures.",
      owner: "Performance lead",
      priority: "high",
      expectedOutcome: "A short list of measurable, owned indicators.",
      relatedWeakness: weaknesses[0] ?? "Foundation",
      deadline: "Day 30",
    },
    {
      phase: "1-30",
      action: "Link every remaining KPI to a cascading objective. Close orphan measures.",
      owner: "Leadership team",
      priority: "high",
      expectedOutcome: "Alignment score above 70 with documented exceptions.",
      relatedWeakness: "Strategy alignment",
      deadline: "Day 30",
    },
    {
      phase: "31-60",
      action: "Run the first review cadence. Record actuals only from real sources — never estimates presented as facts.",
      owner: "KPI owners",
      priority: "high",
      expectedOutcome: "Every active KPI has at least one honest check-in.",
      relatedWeakness: "Review discipline",
      deadline: "Day 60",
    },
    {
      phase: "31-60",
      action: "Install guardrails on high gaming-risk measures. Refuse to bonus a gamed number.",
      owner: "Finance / People partner",
      priority: "medium",
      expectedOutcome: "High-severity risks have a partner metric.",
      relatedWeakness: "Risk controls",
      deadline: "Day 60",
    },
    {
      phase: "61-90",
      action: "Retire or replace weak KPIs after two review cycles. Tighten targets only where baseline evidence exists.",
      owner: "Performance lead",
      priority: "medium",
      expectedOutcome: "A smaller, higher-quality set and a refreshed 90-day plan.",
      relatedWeakness: "Continuous improvement",
      deadline: "Day 90",
    },
    {
      phase: "61-90",
      action: "Train managers to ask: what decision does this number change? Kill metrics that cannot answer.",
      owner: "People / Operations",
      priority: "medium",
      expectedOutcome: "Review meetings discuss decisions, not slide decoration.",
      relatedWeakness: "KPI quality",
      deadline: "Day 90",
    },
  ];
  return { score, categories, weaknesses, priorities, plan };
}

export function nextVersion(current: string, kind: "minor" | "major" = "minor"): string {
  const m = /^v?(\d+)\.(\d+)/.exec(current.trim());
  if (!m) return "v1.1";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (kind === "major") return `v${major + 1}.0`;
  return `v${major}.${minor + 1}`;
}

export function classifyParmenterNote(kpis: Kpi[]): string {
  const n = kpis.length;
  if (n === 0) return "Parmenter’s 10/80/10 guideline is not applied until measures exist.";
  const kpiN = kpis.filter((k) => k.parmenterType === "KPI").length;
  const kriN = kpis.filter((k) => k.parmenterType === "KRI").length;
  return `Guideline only: ~10% KPIs, ~80% RIs/PIs, ~10% KRIs. This set has ${kpiN} KPI(s) and ${kriN} KRI(s) out of ${n}. It is not forced to those ratios.`;
}

export function isWeakKpiName(name: string): boolean {
  const n = name.trim();
  return !n || n.length < 3 || /^(kpi|metric|measure|test|xxx+)(\s*\d+)?$/i.test(n);
}

/** Hard blockers independent of the 10-criteria score. Incomplete KPIs must not be approved. */
export function qualityGateBlockers(kpi: Partial<Kpi>): string[] {
  const blockers: string[] = [];
  const name = (kpi.name ?? "").trim();
  if (!name || isWeakKpiName(name)) blockers.push("Name is missing or is not a meaningful KPI name.");
  const def = (kpi.definition ?? "").trim();
  if (def.length < 16) blockers.push("Definition is missing or too short.");
  if (!(kpi.ownerName ?? "").trim()) blockers.push("Owner is missing.");
  const formula = (kpi.formula ?? "").trim() || (kpi.calculationMethod ?? "").trim();
  if (!formula) blockers.push("Formula or measurement method is missing.");
  if (!(kpi.dataSource ?? "").trim()) blockers.push("Data source is missing.");
  return blockers;
}

export function canApproveKpi(kpi: Partial<Kpi>): { ok: true } | { ok: false; blockers: string[] } {
  const blockers = qualityGateBlockers(kpi);
  if (blockers.length) return { ok: false, blockers };
  return { ok: true };
}
