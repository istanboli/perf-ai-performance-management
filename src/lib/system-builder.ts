import { CATALOG, CATEGORY_OBJECTIVE, matchCatalogByName } from "./catalog";
import { firstInterviewRound } from "./interview";
import {
  alignmentReport,
  assessQuality,
  balanceReport,
  detectGaming,
  designTargets,
  maturityReport,
} from "./kpi-engine";
import type { AiSystem } from "./ai/schema";
import type { AuditItem } from "./audit-existing";
import type {
  CatalogKpi,
  IndustryId,
  InterviewState,
  KeyResult,
  Kpi,
  Objective,
  Origin,
  Project,
  Scope,
} from "./types";
import { nid } from "./utils";

const INDUSTRY_KPI: Record<string, string[]> = {
  retail: ["retail.conversion", "retail.atv", "retail.margin", "retail.repeat", "retail.shrink", "cs.csat"],
  sales: ["sales.winrate", "sales.cycletime", "sales.pipeline", "sales.ndr", "fin.fcst", "mkt.qual"],
  marketing: ["mkt.cac", "mkt.qual", "sales.ndr", "cs.csat"],
  hr: ["hr.regrettable", "hr.ttp", "hr.offer", "hr.engagement", "hr.ninety"],
  finance: ["fin.cash", "fin.fcst", "sales.ndr", "retail.margin"],
  operations: ["ops.otif", "ops.cycle", "mfg.fpy", "sc.fill"],
  customer_service: ["cs.fcr", "cs.csat", "ops.otif"],
  manufacturing: ["mfg.fpy", "mfg.oee", "mfg.safety", "mfg.scrap", "ops.otif"],
  supply_chain: ["sc.fill", "sc.turns", "ops.otif", "ops.cycle"],
  it: ["it.cfr", "it.lt", "cs.fcr"],
  education: ["edu.mastery", "edu.completion", "edu.apply", "hr.engagement"],
  training: ["edu.apply", "edu.mastery", "hr.ttp", "hr.ninety"],
  nonprofit: ["npo.cost", "edu.apply", "fin.fcst"],
  project_management: ["pm.cpi", "pm.spi", "it.lt", "it.cfr"],
};

export interface DraftSystem {
  objectives: Objective[];
  keyResults: KeyResult[];
  kpis: Kpi[];
  interview: InterviewState;
  notes: string[];
}

export function pickIndustry(raw: string | null | undefined): IndustryId {
  const id = (raw ?? "operations") as IndustryId;
  return INDUSTRY_KPI[id] ? id : "operations";
}

function catalogKpiToRow(
  tpl: CatalogKpi,
  ctx: {
    project: Project;
    objectiveId: string;
    owner: string;
    origin: Origin;
    userId: string;
    index: number;
  },
): Kpi {
  const gaming = detectGaming({ name: tpl.name, definition: tpl.definition, purpose: tpl.purpose, guardrail: tpl.guardrail });
  const targets = designTargets({ baseline: null, direction: tpl.direction });
  const now = new Date().toISOString();
  const row: Kpi = {
    id: nid("kpi"),
    projectId: ctx.project.id,
    workspaceId: ctx.project.workspaceId,
    objectiveId: ctx.objectiveId,
    relatedKrId: null,
    kpiCode: `KPI-${String(ctx.index + 1).padStart(3, "0")}`,
    name: tpl.name,
    definition: tpl.definition,
    purpose: tpl.purpose,
    scope: ctx.project.scope,
    ownerName: ctx.owner,
    responsibleTeam: ctx.project.department,
    unit: tpl.unit,
    direction: tpl.direction,
    frequency: tpl.frequency,
    reviewCadence: tpl.frequency === "daily" ? "weekly" : tpl.frequency === "weekly" ? "weekly" : "monthly",
    baseline: null,
    currentValue: null,
    target: null,
    conservativeTarget: targets.conservative,
    expectedTarget: targets.expected,
    stretchTarget: targets.stretch,
    formula: tpl.formula,
    numerator: tpl.numerator ?? null,
    denominator: tpl.denominator ?? null,
    calculationMethod: tpl.formula,
    dataSource: tpl.dataSource,
    weight: null,
    thresholds: null,
    guardrail: tpl.guardrail,
    leadingLagging: tpl.leadingLagging,
    resultDriver: tpl.resultDriver,
    efficiencyEffectiveness: tpl.efficiencyEffectiveness,
    qualityQuantity: tpl.qualityQuantity,
    parmenterType: tpl.parmenterType,
    ipoo: tpl.ipoo,
    gamingRisk: gaming.risk + " — " + gaming.why,
    gamingSeverity: gaming.severity,
    dataQualityRisk: "Source named but not yet connected. Treat values as unmeasured until a check-in exists.",
    definitionAmbiguity: tpl.definition.length > 40 ? "low" : "medium",
    ownershipRisk: ctx.owner ? "low" : "high",
    measurementRisk: "medium",
    manipulationRisk: gaming.severity,
    qualityScore: 0,
    qualityNotes: null,
    status: "draft",
    version: "v1.0",
    origin: ctx.origin,
    createdBy: ctx.userId,
    createdAt: now,
    updatedAt: now,
  };
  const q = assessQuality(row);
  row.qualityScore = q.total;
  row.qualityNotes = q;
  return row;
}

export function buildSystem(opts: {
  project: Project;
  userId: string;
  orgName: string;
  priorities: string;
  owner: string;
  interview: InterviewState;
  existingNames?: string[];
}): DraftSystem {
  const industry = pickIndustry(opts.project.industry);
  const keys = INDUSTRY_KPI[industry] ?? INDUSTRY_KPI.operations;
  const templates = keys
    .map((k) => CATALOG.find((c) => c.key === k))
    .filter((x): x is CatalogKpi => Boolean(x));

  const objSpecs = CATEGORY_OBJECTIVE[industry] ?? CATEGORY_OBJECTIVE.operations;
  const nowOwner = opts.owner || "Performance lead";
  const notes: string[] = [];

  if (templates.length > 12) notes.push("This is not a good idea as a dump of metrics. The architect kept a short set.");
  notes.push("Fewer, better, strategically relevant indicators. Additional library items can be added later.");
  if (!opts.interview.facts.data) {
    notes.push("Data availability was not fully confirmed. Measurement risk is flagged rather than invented.");
  }

  const company: Objective = {
    id: nid("obj"),
    projectId: opts.project.id,
    workspaceId: opts.project.workspaceId,
    parentId: null,
    level: "company",
    title: objSpecs[0]?.title ?? "Improve the outcomes that matter",
    description:
      (opts.priorities && opts.priorities.trim()) ||
      objSpecs[0]?.description ||
      "User did not state strategy. This objective is an AI recommendation, not a fact.",
    ownerName: nowOwner,
    status: "draft",
    origin: opts.priorities.trim() ? "user" : "ai",
  };

  const second: Objective = {
    id: nid("obj"),
    projectId: opts.project.id,
    workspaceId: opts.project.workspaceId,
    parentId: company.id,
    level: opts.project.scope === "company" ? "department" : (opts.project.scope as Objective["level"]),
    title: objSpecs[1]?.title ?? "Install a measurable operating rhythm",
    description: objSpecs[1]?.description ?? "Cascade from the company objective.",
    ownerName: nowOwner,
    status: "draft",
    origin: "ai",
  };

  const objectives = [company, second];

  const krFor = (obj: Objective, name: string, definition: string, unit: string): KeyResult => ({
    id: nid("kr"),
    objectiveId: obj.id,
    projectId: opts.project.id,
    workspaceId: opts.project.workspaceId,
    name,
    definition,
    baseline: null,
    target: null,
    unit,
    deadline: null,
    ownerName: nowOwner,
    measurementMethod: "Manual check-in until a source is connected",
    progress: null,
    status: "not_measured",
    relatedKpiId: null,
    origin: "ai",
  });

  const keyResults: KeyResult[] = [
    krFor(company, "Move the primary outcome without harming the guardrail", "The lead KPI for this objective improves while the named guardrail stays inside policy. No baseline was provided, so the target is not yet set.", "index"),
    krFor(second, "Every remaining measure has an owner, source and cadence", "Count of KPIs that are approved with owner + source + frequency.", "count"),
  ];

  // Prefer outcome/KPI templates; drop obvious vanity if user listed them.
  const existing = new Set((opts.existingNames ?? []).map((n) => n.toLowerCase()));
  const chosen = templates.slice(0, 8);
  const kpis = chosen.map((tpl, i) => {
    const obj = i < 4 ? company : second;
    const row = catalogKpiToRow(tpl, {
      project: opts.project,
      objectiveId: obj.id,
      owner: nowOwner,
      origin: "ai",
      userId: opts.userId,
      index: i,
    });
    if (existing.has(tpl.name.toLowerCase())) row.origin = "user";
    return row;
  });

  if (kpis[0] && keyResults[0]) {
    keyResults[0].relatedKpiId = kpis[0].id;
    kpis[0].relatedKrId = keyResults[0].id;
  }

  notes.push("Targets are not fabricated. Baseline is missing, so targets remain ‘not yet defined’ except as design recommendations.");
  if (opts.existingNames?.length) {
    notes.push(`Existing list contained ${opts.existingNames.length} names. Duplicates and vanity items were not automatically kept.`);
  }

  return { objectives, keyResults, kpis, interview: opts.interview, notes };
}

export function scoresFor(objectives: Objective[], kpis: Kpi[], krCount: number, checkins = 0) {
  const krBy: Record<string, number> = {};
  for (const o of objectives) krBy[o.id] = 0;
  // caller can pass krCount globally; distribute evenly for report
  if (objectives[0]) krBy[objectives[0].id] = krCount;
  const align = alignmentReport(objectives, kpis, krBy);
  const quality = kpis.length ? Math.round(kpis.reduce((s, k) => s + (k.qualityScore ?? 0), 0) / kpis.length) : 0;
  const mat = maturityReport({
    objectives,
    kpis,
    krCount,
    checkinCount: checkins,
    hasCompanyObjective: objectives.some((o) => o.level === "company"),
  });
  const bal = balanceReport(kpis);
  return { align, quality, mat, bal };
}

export function startInterview(industry: string, scope: Scope, hasExisting: boolean) {
  return firstInterviewRound({ industry: industry as IndustryId, scope, hasExisting });
}

export function suggestAdds(industry: string): CatalogKpi[] {
  const id = pickIndustry(industry);
  const have = new Set(INDUSTRY_KPI[id]);
  return CATALOG.filter((c) => c.category === id && !have.has(c.key)).slice(0, 3);
}

function applyEngines(row: Kpi): Kpi {
  const gaming = detectGaming(row);
  row.gamingRisk = gaming.risk + " — " + gaming.why;
  row.gamingSeverity = gaming.severity;
  row.manipulationRisk = gaming.severity;
  const q = assessQuality(row);
  row.qualityScore = q.total;
  row.qualityNotes = q;
  return row;
}

function kpiFromFields(
  ctx: {
    project: Project;
    userId: string;
    owner: string;
    objectiveId: string;
    origin: Origin;
    index: number;
  },
  fields: {
    name: string;
    definition?: string | null;
    purpose?: string | null;
    formula?: string | null;
    unit?: string | null;
    direction?: Kpi["direction"];
    owner?: string | null;
    dataSource?: string | null;
    guardrail?: string | null;
    leadingLagging?: string | null;
    parmenterType?: Kpi["parmenterType"];
    frequency?: string | null;
  },
): Kpi {
  const owner = fields.owner?.trim() || ctx.owner;
  const now = new Date().toISOString();
  const targets = designTargets({ baseline: null, direction: fields.direction ?? null });
  const row: Kpi = {
    id: nid("kpi"),
    projectId: ctx.project.id,
    workspaceId: ctx.project.workspaceId,
    objectiveId: ctx.objectiveId,
    relatedKrId: null,
    kpiCode: `KPI-${String(ctx.index + 1).padStart(3, "0")}`,
    name: fields.name,
    definition: fields.definition ?? null,
    purpose: fields.purpose ?? null,
    scope: ctx.project.scope,
    ownerName: owner,
    responsibleTeam: ctx.project.department,
    unit: fields.unit ?? null,
    direction: fields.direction ?? null,
    frequency: fields.frequency ?? null,
    reviewCadence: "monthly",
    baseline: null,
    currentValue: null,
    target: null,
    conservativeTarget: targets.conservative,
    expectedTarget: targets.expected,
    stretchTarget: targets.stretch,
    formula: fields.formula ?? null,
    numerator: null,
    denominator: null,
    calculationMethod: fields.formula ?? null,
    dataSource: fields.dataSource ?? null,
    weight: null,
    thresholds: null,
    guardrail: fields.guardrail ?? null,
    leadingLagging: fields.leadingLagging ?? null,
    resultDriver: null,
    efficiencyEffectiveness: null,
    qualityQuantity: null,
    parmenterType: fields.parmenterType ?? null,
    ipoo: null,
    gamingRisk: null,
    gamingSeverity: null,
    dataQualityRisk: fields.dataSource
      ? "Source named but not yet connected. Treat values as unmeasured until a check-in exists."
      : "No data source named.",
    definitionAmbiguity: (fields.definition ?? "").length > 40 ? "low" : "medium",
    ownershipRisk: owner ? "low" : "high",
    measurementRisk: fields.dataSource ? "medium" : "high",
    manipulationRisk: null,
    qualityScore: 0,
    qualityNotes: null,
    status: "draft",
    version: "v1.0",
    origin: ctx.origin,
    createdBy: ctx.userId,
    createdAt: now,
    updatedAt: now,
  };
  return applyEngines(row);
}

function defaultObjectives(opts: {
  project: Project;
  owner: string;
  priorities?: string;
  origin: Origin;
}): Objective[] {
  const industry = pickIndustry(opts.project.industry);
  const objSpecs = CATEGORY_OBJECTIVE[industry] ?? CATEGORY_OBJECTIVE.operations;
  const company: Objective = {
    id: nid("obj"),
    projectId: opts.project.id,
    workspaceId: opts.project.workspaceId,
    parentId: null,
    level: "company",
    title: objSpecs[0]?.title ?? "Improve the outcomes that matter",
    description:
      (opts.priorities && opts.priorities.trim()) ||
      objSpecs[0]?.description ||
      "User did not state strategy. This objective is a recommendation, not a fact.",
    ownerName: opts.owner,
    status: "draft",
    origin: opts.origin,
  };
  const second: Objective = {
    id: nid("obj"),
    projectId: opts.project.id,
    workspaceId: opts.project.workspaceId,
    parentId: company.id,
    level: opts.project.scope === "company" ? "department" : (opts.project.scope as Objective["level"]),
    title: objSpecs[1]?.title ?? "Install a measurable operating rhythm",
    description: objSpecs[1]?.description ?? "Cascade from the company objective.",
    ownerName: opts.owner,
    status: "draft",
    origin: opts.origin,
  };
  return [company, second];
}

/** Map a validated AI payload onto the existing draft shape and run quality engines. */
export function draftFromAi(opts: {
  project: Project;
  userId: string;
  orgName: string;
  priorities: string;
  owner: string;
  interview: InterviewState;
  ai: AiSystem;
}): DraftSystem | null {
  const kpisIn = opts.ai.kpis ?? [];
  if (!kpisIn.length) return null;

  const nowOwner = opts.owner || "Performance lead";
  const notes: string[] = [];
  if (opts.ai.system_summary?.narrative) notes.push(opts.ai.system_summary.narrative);
  if (opts.ai.recommendations?.length) notes.push(...opts.ai.recommendations);

  const aiObjectives = opts.ai.objectives ?? [];
  const objectives: Objective[] =
    aiObjectives.length > 0
      ? aiObjectives.map((o, i) => {
          const id = nid("obj");
          return {
            id,
            projectId: opts.project.id,
            workspaceId: opts.project.workspaceId,
            parentId: null,
            level: o.level ?? (i === 0 ? "company" : "department"),
            title: o.title,
            description: o.description ?? null,
            ownerName: o.owner ?? nowOwner,
            status: "draft",
            origin: "ai" as const,
          };
        })
      : defaultObjectives({ project: opts.project, owner: nowOwner, priorities: opts.priorities, origin: "ai" });

  if (objectives.length > 1 && !objectives[0].parentId) {
    for (let i = 1; i < objectives.length; i++) {
      if (!objectives[i].parentId) objectives[i].parentId = objectives[0].id;
    }
  }
  // parentId on first must be null
  objectives[0].parentId = null;

  const findObj = (title?: string) => {
    if (!title) return objectives[0];
    const hit = objectives.find((o) => o.title.toLowerCase() === title.toLowerCase());
    return hit ?? objectives[0];
  };

  const kpis = kpisIn.slice(0, 12).map((k, i) => {
    const obj = findObj(k.relatedObjective);
    return kpiFromFields(
      {
        project: opts.project,
        userId: opts.userId,
        owner: nowOwner,
        objectiveId: obj.id,
        origin: "ai",
        index: i,
      },
      {
        name: k.name,
        definition: k.definition,
        purpose: k.purpose,
        formula: k.formula,
        unit: k.unit,
        direction: k.direction,
        owner: k.owner,
        dataSource: k.dataSource,
        guardrail: k.guardrail,
        leadingLagging: k.leadingLagging ?? null,
        parmenterType: k.parmenterType,
      },
    );
  });

  const krIn = opts.ai.key_results ?? [];
  const keyResults: KeyResult[] = krIn.length
    ? krIn.slice(0, 8).map((kr) => ({
        id: nid("kr"),
        objectiveId: findObj(kr.objectiveTitle).id,
        projectId: opts.project.id,
        workspaceId: opts.project.workspaceId,
        name: kr.name,
        definition: kr.definition ?? null,
        baseline: null,
        target: null,
        unit: kr.unit ?? null,
        deadline: null,
        ownerName: nowOwner,
        measurementMethod: "Manual check-in until a source is connected",
        progress: null,
        status: "not_measured",
        relatedKpiId: null,
        origin: "ai",
      }))
    : [
        {
          id: nid("kr"),
          objectiveId: objectives[0].id,
          projectId: opts.project.id,
          workspaceId: opts.project.workspaceId,
          name: kpis[0]?.name ?? "Move the primary outcome without harming the guardrail",
          definition: kpis[0]?.definition ?? null,
          baseline: null,
          target: null,
          unit: kpis[0]?.unit ?? "index",
          deadline: null,
          ownerName: nowOwner,
          measurementMethod: "Manual check-in until a source is connected",
          progress: null,
          status: "not_measured",
          relatedKpiId: kpis[0]?.id ?? null,
          origin: "ai",
        },
      ];

  if (kpis[0] && keyResults[0] && !kpis[0].relatedKrId) {
    keyResults[0].relatedKpiId = kpis[0].id;
    kpis[0].relatedKrId = keyResults[0].id;
  }

  notes.push("Targets are not fabricated. Baseline is missing, so targets remain ‘not yet defined’ except as design recommendations.");
  return { objectives, keyResults, kpis, interview: opts.interview, notes };
}

function fillFromCatalog(name: string, item: AuditItem): {
  definition: string | null;
  purpose: string | null;
  formula: string | null;
  unit: string | null;
  direction: Kpi["direction"];
  dataSource: string | null;
  guardrail: string | null;
} {
  const tpl = matchCatalogByName(name);
  return {
    definition: tpl?.definition ?? null,
    purpose: tpl?.purpose ?? item.reason,
    formula: tpl?.formula ?? null,
    unit: tpl?.unit ?? null,
    direction: tpl?.direction ?? "higher",
    dataSource: tpl?.dataSource ?? null,
    guardrail: item.suggestion || tpl?.guardrail || null,
  };
}

/** Build a project from KEEP / IMPROVE / REMOVE / ADD — never a generic catalog dump. */
export function buildFromAudit(opts: {
  project: Project;
  userId: string;
  owner: string;
  interview: InterviewState;
  audit: { items: AuditItem[]; adds: AuditItem[] };
}): DraftSystem {
  const nowOwner = opts.owner || "Performance lead";
  const notes: string[] = [];
  const objectives = defaultObjectives({
    project: opts.project,
    owner: nowOwner,
    origin: "user",
  });
  const company = objectives[0];
  const second = objectives[1] ?? objectives[0];

  const kpis: Kpi[] = [];
  let kept = 0;
  let improved = 0;
  let removed = 0;
  let added = 0;

  const push = (item: AuditItem, origin: Origin, action: "keep" | "improve" | "add") => {
    const filled = fillFromCatalog(item.name, item);
    const definition =
      action === "improve"
        ? [filled.definition, item.suggestion].filter(Boolean).join(" — ") || item.reason
        : filled.definition;
    const purpose =
      action === "add" ? item.reason : action === "improve" ? item.reason : filled.purpose;
    const obj = action === "add" ? second : company;
    kpis.push(
      kpiFromFields(
        {
          project: opts.project,
          userId: opts.userId,
          owner: nowOwner,
          objectiveId: obj.id,
          origin,
          index: kpis.length,
        },
        {
          name: item.name,
          definition,
          purpose,
          formula: filled.formula,
          unit: filled.unit,
          direction: filled.direction,
          dataSource: filled.dataSource,
          guardrail: action === "improve" ? item.suggestion || filled.guardrail : filled.guardrail,
        },
      ),
    );
  };

  for (const item of opts.audit.items) {
    if (item.action === "remove") {
      removed += 1;
      continue;
    }
    if (item.action === "add") {
      added += 1;
      push(item, "user", "add");
      continue;
    }
    if (item.action === "keep") {
      kept += 1;
      push(item, "user", "keep");
      continue;
    }
    // improve or replace: preserve original name and apply the improvement
    improved += 1;
    push(item, "user", "improve");
  }

  for (const item of opts.audit.adds) {
    added += 1;
    push(item, "ai", "add");
  }

  const keyResults: KeyResult[] = [
    {
      id: nid("kr"),
      objectiveId: company.id,
      projectId: opts.project.id,
      workspaceId: opts.project.workspaceId,
      name: "Clean the existing measure set",
      definition: "Keep and improve the user's KPIs; do not replace them with a generic catalog.",
      baseline: null,
      target: null,
      unit: "count",
      deadline: null,
      ownerName: nowOwner,
      measurementMethod: "Audit actions applied to the uploaded list",
      progress: null,
      status: "not_measured",
      relatedKpiId: kpis[0]?.id ?? null,
      origin: "user",
    },
  ];
  if (kpis[0]) kpis[0].relatedKrId = keyResults[0].id;

  notes.push(
    `Audit applied: ${kept} kept, ${improved} improved, ${removed} removed, ${added} added. Original KPI names were preserved. Generic catalog KPIs were not substituted.`,
  );
  if (!kpis.length) {
    notes.push("Every uploaded KPI was recommended for removal. No measures were created. Add from the library if you still need a starting set.");
  }
  return { objectives, keyResults, kpis, interview: opts.interview, notes };
}
