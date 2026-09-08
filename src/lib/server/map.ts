import { parseJson } from "@/lib/utils";
import type {
  AuditLog,
  Checkin,
  InterviewState,
  KeyResult,
  Kpi,
  Objective,
  Organization,
  Project,
  QualityNotes,
  Thresholds,
  Workspace,
} from "@/lib/types";

export function mapWorkspace(r: Record<string, unknown>): Workspace {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    name: String(r.name),
    industry: (r.industry as string) ?? null,
    sizeBand: (r.size_band as string) ?? null,
    locale: (r.locale as Workspace["locale"]) ?? "en",
    plan: (r.plan as Workspace["plan"]) ?? "free",
    createdAt: String(r.created_at),
  };
}

export function mapOrg(r: Record<string, unknown>): Organization {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    industry: (r.industry as string) ?? null,
    sizeBand: (r.size_band as string) ?? null,
    businessModel: (r.business_model as string) ?? null,
    strategicPriorities: (r.strategic_priorities as string) ?? null,
    maturityNotes: (r.maturity_notes as string) ?? null,
  };
}

export function mapProject(r: Record<string, unknown>): Project {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    userId: String(r.user_id),
    name: String(r.name),
    scope: r.scope as Project["scope"],
    mode: r.mode as Project["mode"],
    industry: (r.industry as string) ?? null,
    department: (r.department as string) ?? null,
    status: String(r.status),
    isDemo: Boolean(r.is_demo),
    interviewState: parseJson<InterviewState | null>(r.interview_state as string | null, null),
    alignmentScore: r.alignment_score === null || r.alignment_score === undefined ? null : Number(r.alignment_score),
    maturityScore: r.maturity_score === null || r.maturity_score === undefined ? null : Number(r.maturity_score),
    qualityScore: r.quality_score === null || r.quality_score === undefined ? null : Number(r.quality_score),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function mapObjective(r: Record<string, unknown>): Objective {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    workspaceId: String(r.workspace_id),
    parentId: (r.parent_id as string) ?? null,
    level: r.level as Objective["level"],
    title: String(r.title),
    description: (r.description as string) ?? null,
    ownerName: (r.owner_name as string) ?? null,
    status: String(r.status),
    origin: r.origin as Objective["origin"],
  };
}

export function mapKr(r: Record<string, unknown>): KeyResult {
  return {
    id: String(r.id),
    objectiveId: String(r.objective_id),
    projectId: String(r.project_id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    definition: (r.definition as string) ?? null,
    baseline: num(r.baseline),
    target: num(r.target),
    unit: (r.unit as string) ?? null,
    deadline: (r.deadline as string) ?? null,
    ownerName: (r.owner_name as string) ?? null,
    measurementMethod: (r.measurement_method as string) ?? null,
    progress: num(r.progress),
    status: String(r.status),
    relatedKpiId: (r.related_kpi_id as string) ?? null,
    origin: r.origin as KeyResult["origin"],
  };
}

export function mapKpi(r: Record<string, unknown>): Kpi {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    workspaceId: String(r.workspace_id),
    objectiveId: (r.objective_id as string) ?? null,
    relatedKrId: (r.related_kr_id as string) ?? null,
    kpiCode: (r.kpi_code as string) ?? null,
    name: String(r.name),
    definition: (r.definition as string) ?? null,
    purpose: (r.purpose as string) ?? null,
    scope: (r.scope as string) ?? null,
    ownerName: (r.owner_name as string) ?? null,
    responsibleTeam: (r.responsible_team as string) ?? null,
    unit: (r.unit as string) ?? null,
    direction: (r.direction as Kpi["direction"]) ?? null,
    frequency: (r.frequency as string) ?? null,
    reviewCadence: (r.review_cadence as string) ?? null,
    baseline: num(r.baseline),
    currentValue: num(r.current_value),
    target: num(r.target),
    conservativeTarget: num(r.conservative_target),
    expectedTarget: num(r.expected_target),
    stretchTarget: num(r.stretch_target),
    formula: (r.formula as string) ?? null,
    numerator: (r.numerator as string) ?? null,
    denominator: (r.denominator as string) ?? null,
    calculationMethod: (r.calculation_method as string) ?? null,
    dataSource: (r.data_source as string) ?? null,
    weight: num(r.weight),
    thresholds: parseJson<Thresholds | null>(r.thresholds as string | null, null),
    guardrail: (r.guardrail as string) ?? null,
    leadingLagging: (r.leading_lagging as string) ?? null,
    resultDriver: (r.result_driver as string) ?? null,
    efficiencyEffectiveness: (r.efficiency_effectiveness as string) ?? null,
    qualityQuantity: (r.quality_quantity as string) ?? null,
    parmenterType: (r.parmenter_type as Kpi["parmenterType"]) ?? null,
    ipoo: (r.ipoo as string) ?? null,
    gamingRisk: (r.gaming_risk as string) ?? null,
    gamingSeverity: (r.gaming_severity as string) ?? null,
    dataQualityRisk: (r.data_quality_risk as string) ?? null,
    definitionAmbiguity: (r.definition_ambiguity as string) ?? null,
    ownershipRisk: (r.ownership_risk as string) ?? null,
    measurementRisk: (r.measurement_risk as string) ?? null,
    manipulationRisk: (r.manipulation_risk as string) ?? null,
    qualityScore: r.quality_score === null || r.quality_score === undefined ? null : Number(r.quality_score),
    qualityNotes: parseJson<QualityNotes | null>(r.quality_notes as string | null, null),
    status: r.status as Kpi["status"],
    version: String(r.version ?? "v1.0"),
    origin: r.origin as Kpi["origin"],
    createdBy: (r.created_by as string) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function mapCheckin(r: Record<string, unknown>): Checkin {
  return {
    id: String(r.id),
    kpiId: String(r.kpi_id),
    projectId: String(r.project_id),
    workspaceId: String(r.workspace_id),
    currentValue: num(r.current_value),
    target: num(r.target),
    progress: num(r.progress),
    status: (r.status as Checkin["status"]) ?? null,
    comment: (r.comment as string) ?? null,
    ownerName: (r.owner_name as string) ?? null,
    recordedAt: String(r.recorded_at),
  };
}

export function mapLog(r: Record<string, unknown>): AuditLog {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    action: String(r.action),
    entityType: (r.entity_type as string) ?? null,
    entityId: (r.entity_id as string) ?? null,
    detail: (r.detail as string) ?? null,
    createdAt: String(r.created_at),
  };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
