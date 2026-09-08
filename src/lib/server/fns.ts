import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { runArchitect } from "@/lib/ai/service";
import { PROMPT_VERSION } from "@/lib/ai/schema";
import { auditExisting, parseCsvKpis, parseKpiList, type AuditItem } from "@/lib/audit-existing";
import { CATALOG, findCatalog } from "@/lib/catalog";
import { wouldCreateCycle } from "@/lib/hierarchy";
import {
  alignmentReport,
  assessQuality,
  canApproveKpi,
  detectGaming,
  designTargets,
  maturityReport,
  nextVersion,
  scoreKpiValue,
} from "@/lib/kpi-engine";
import { harvestFacts } from "@/lib/interview";
import { buildFromAudit, buildSystem, draftFromAi, scoresFor, startInterview } from "@/lib/system-builder";
import type {
  BuildMode,
  CheckinStatus,
  IndustryId,
  InterviewState,
  Kpi,
  KpiStatus,
  ObjLevel,
  Scope,
} from "@/lib/types";
import { nid, parseJson } from "@/lib/utils";
import { mapCheckin, mapKpi, mapKr, mapLog, mapObjective, mapOrg, mapProject, mapWorkspace } from "./map";

type Sql = Awaited<ReturnType<typeof getSql>>;

async function logAudit(
  sql: Sql,
  opts: { userId: string; workspaceId: string; action: string; entityType?: string; entityId?: string; detail?: string },
) {
  await sql`insert into audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, detail)
    values (${nid("log")}, ${opts.workspaceId}, ${opts.userId}, ${opts.action}, ${opts.entityType ?? null}, ${opts.entityId ?? null}, ${opts.detail ?? null})`;
}

export async function ensureWorkspace(sql: Sql, userId: string, displayName?: string | null) {
  const existing = await sql`select * from workspaces where user_id = ${userId} order by created_at asc limit 1`;
  if (existing[0]) {
    const orgRows = await sql`select * from organizations where workspace_id = ${existing[0].id as string} limit 1`;
    return { workspace: mapWorkspace(existing[0]), org: orgRows[0] ? mapOrg(orgRows[0]) : null };
  }
  const wsId = nid("ws");
  const name = displayName?.trim() ? `${displayName.trim()}'s workspace` : "Workspace";
  await sql`insert into workspaces (id, user_id, name) values (${wsId}, ${userId}, ${name})`;
  const orgId = nid("org");
  await sql`insert into organizations (id, workspace_id, user_id, name) values (${orgId}, ${wsId}, ${userId}, ${name})`;
  await logAudit(sql, { userId, workspaceId: wsId, action: "workspace.create", entityType: "workspace", entityId: wsId });
  const ws = await sql`select * from workspaces where id = ${wsId} and user_id = ${userId}`;
  const org = await sql`select * from organizations where id = ${orgId}`;
  return { workspace: mapWorkspace(ws[0]), org: mapOrg(org[0]) };
}

async function requireProject(sql: Sql, userId: string, projectId: string) {
  const rows = await sql`select * from projects where id = ${projectId} and user_id = ${userId} limit 1`;
  if (!rows[0]) throw new Error("Project not found");
  return mapProject(rows[0]);
}

export const bootstrapWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return ensureWorkspace(sql, context.userId);
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { name: string; industry?: string; sizeBand?: string; businessModel?: string; priorities?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { workspace, org } = await ensureWorkspace(sql, context.userId);
    if (!org) return { workspace, org };
    await sql`update organizations set name = ${data.name}, industry = ${data.industry ?? null}, size_band = ${data.sizeBand ?? null},
      business_model = ${data.businessModel ?? null}, strategic_priorities = ${data.priorities ?? null}
      where id = ${org.id} and user_id = ${context.userId}`;
    await sql`update workspaces set name = ${data.name}, industry = ${data.industry ?? null}, size_band = ${data.sizeBand ?? null}
      where id = ${workspace.id} and user_id = ${context.userId}`;
    const org2 = await sql`select * from organizations where id = ${org.id}`;
    return { workspace, org: mapOrg(org2[0]) };
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const rows = await sql`select * from projects where workspace_id = ${workspace.id} and user_id = ${context.userId} order by updated_at desc`;
    return rows.map(mapProject);
  });

export const getProjectBundle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((projectId: string) => projectId)
  .handler(async ({ context, data: projectId }) => {
    const sql = await getSql();
    const project = await requireProject(sql, context.userId, projectId);
    const [objectives, krs, kpis, checkins] = await Promise.all([
      sql`select * from objectives where project_id = ${projectId} and user_id = ${context.userId} order by created_at`,
      sql`select * from key_results where project_id = ${projectId} and user_id = ${context.userId} order by created_at`,
      sql`select * from kpis where project_id = ${projectId} and user_id = ${context.userId} and status != 'archived' order by created_at`,
      sql`select * from checkins where project_id = ${projectId} and user_id = ${context.userId} order by recorded_at desc`,
    ]);
    const obj = objectives.map(mapObjective);
    const kr = krs.map(mapKr);
    const kpi = kpis.map(mapKpi);
    const cin = checkins.map(mapCheckin);
    const krBy: Record<string, number> = {};
    for (const k of kr) krBy[k.objectiveId] = (krBy[k.objectiveId] ?? 0) + 1;
    const align = alignmentReport(obj, kpi, krBy, kr);
    const mat = maturityReport({
      objectives: obj,
      kpis: kpi,
      krCount: kr.length,
      checkinCount: cin.length,
      hasCompanyObjective: obj.some((o) => o.level === "company"),
    });
    return { project, objectives: obj, keyResults: kr, kpis: kpi, checkins: cin, align, mat };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      name: string;
      scope: Scope;
      mode: BuildMode;
      industry?: string;
      department?: string;
      isDemo?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const id = nid("prj");
    await sql`insert into projects (id, workspace_id, user_id, name, scope, mode, industry, department, is_demo)
      values (${id}, ${workspace.id}, ${context.userId}, ${data.name}, ${data.scope}, ${data.mode}, ${data.industry ?? null}, ${data.department ?? null}, ${data.isDemo ?? false})`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: workspace.id,
      action: "project.create",
      entityType: "project",
      entityId: id,
      detail: data.name,
    });
    const rows = await sql`select * from projects where id = ${id} and user_id = ${context.userId}`;
    return mapProject(rows[0]);
  });

export const listWorkspaceOkrs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const [projects, objectives, krs] = await Promise.all([
      sql`select * from projects where workspace_id = ${workspace.id} and user_id = ${context.userId} order by created_at desc`,
      sql`select * from objectives where workspace_id = ${workspace.id} and user_id = ${context.userId} order by created_at`,
      sql`select * from key_results where workspace_id = ${workspace.id} and user_id = ${context.userId} order by created_at`,
    ]);
    return {
      projects: projects.map(mapProject),
      objectives: objectives.map(mapObjective),
      keyResults: krs.map(mapKr),
    };
  });

export const createObjective = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: { projectId: string; title: string; description?: string; ownerName?: string; level?: ObjLevel; parentId?: string | null }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const project = await requireProject(sql, context.userId, data.projectId);
    const title = data.title.trim();
    if (!title) throw new Error("Objective title is required.");
    const id = nid("obj");
    const level = data.level ?? "company";
    let parentId = data.parentId || null;
    if (parentId) {
      const parent = await sql`select id from objectives where id = ${parentId} and project_id = ${project.id} and user_id = ${context.userId} limit 1`;
      if (!parent[0]) throw new Error("Parent objective not found");
    }
    await sql`insert into objectives (id, project_id, workspace_id, user_id, parent_id, level, title, description, owner_name, status, origin)
      values (${id}, ${project.id}, ${project.workspaceId}, ${context.userId}, ${parentId}, ${level}, ${title}, ${data.description?.trim() || null}, ${data.ownerName?.trim() || null}, ${"draft"}, ${"user"})`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: project.workspaceId,
      action: "objective.create",
      entityType: "objective",
      entityId: id,
      detail: title,
    });
    const rows = await sql`select * from objectives where id = ${id} and user_id = ${context.userId}`;
    return mapObjective(rows[0]);
  });

export const updateObjective = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: { id: string; title?: string; description?: string | null; ownerName?: string | null; level?: ObjLevel; parentId?: string | null }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql`select * from objectives where id = ${data.id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("Objective not found");
    const prev = mapObjective(rows[0]);
    const title = data.title !== undefined ? data.title.trim() : prev.title;
    if (!title) throw new Error("Objective title is required.");
    const description = data.description !== undefined ? data.description?.trim() || null : prev.description;
    const ownerName = data.ownerName !== undefined ? data.ownerName?.trim() || null : prev.ownerName;
    const level = data.level ?? prev.level;
    let parentId = data.parentId !== undefined ? data.parentId || null : prev.parentId;
    if (parentId) {
      const siblings = (await sql`select id, parent_id from objectives where project_id = ${prev.projectId} and user_id = ${context.userId}`).map((r) => ({
        id: String(r.id),
        parentId: (r.parent_id as string) ?? null,
      }));
      if (wouldCreateCycle(siblings, prev.id, parentId)) throw new Error("Circular parent is not allowed.");
      const parent = siblings.find((o) => o.id === parentId);
      if (!parent) throw new Error("Parent objective not found");
    }
    await sql`update objectives set title = ${title}, description = ${description}, owner_name = ${ownerName}, level = ${level}, parent_id = ${parentId}
      where id = ${prev.id} and user_id = ${context.userId}`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: prev.workspaceId,
      action: "objective.modify",
      entityType: "objective",
      entityId: prev.id,
      detail: title,
    });
    const next = await sql`select * from objectives where id = ${prev.id} and user_id = ${context.userId}`;
    return mapObjective(next[0]);
  });

export const deleteObjective = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql`select * from objectives where id = ${id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("Objective not found");
    const prev = mapObjective(rows[0]);
    await sql`update objectives set parent_id = ${prev.parentId} where parent_id = ${id} and user_id = ${context.userId}`;
    await sql`update kpis set objective_id = null, updated_at = now() where objective_id = ${id} and user_id = ${context.userId}`;
    await sql`delete from key_results where objective_id = ${id} and user_id = ${context.userId}`;
    await sql`delete from objectives where id = ${id} and user_id = ${context.userId}`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: prev.workspaceId,
      action: "objective.delete",
      entityType: "objective",
      entityId: id,
      detail: prev.title,
    });
    return { ok: true as const, id };
  });

export const createKeyResult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      projectId: string;
      objectiveId: string;
      name: string;
      definition?: string;
      ownerName?: string;
      unit?: string;
      target?: number | null;
      baseline?: number | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const project = await requireProject(sql, context.userId, data.projectId);
    const name = data.name.trim();
    if (!name) throw new Error("Key result name is required.");
    const obj = await sql`select id from objectives where id = ${data.objectiveId} and project_id = ${project.id} and user_id = ${context.userId} limit 1`;
    if (!obj[0]) throw new Error("Objective not found");
    const id = nid("kr");
    await sql`insert into key_results (id, objective_id, project_id, workspace_id, user_id, name, definition, baseline, target, unit, owner_name, measurement_method, status, origin)
      values (${id}, ${data.objectiveId}, ${project.id}, ${project.workspaceId}, ${context.userId}, ${name}, ${data.definition?.trim() || null}, ${data.baseline ?? null}, ${data.target ?? null}, ${data.unit?.trim() || null}, ${data.ownerName?.trim() || null}, ${"Manual check-in until a source is connected"}, ${"not_measured"}, ${"user"})`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: project.workspaceId,
      action: "kr.create",
      entityType: "key_result",
      entityId: id,
      detail: name,
    });
    const rows = await sql`select * from key_results where id = ${id} and user_id = ${context.userId}`;
    return mapKr(rows[0]);
  });

export const updateKeyResult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      id: string;
      name?: string;
      definition?: string | null;
      ownerName?: string | null;
      unit?: string | null;
      target?: number | null;
      baseline?: number | null;
      objectiveId?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql`select * from key_results where id = ${data.id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("Key result not found");
    const prev = mapKr(rows[0]);
    const name = data.name !== undefined ? data.name.trim() : prev.name;
    if (!name) throw new Error("Key result name is required.");
    const definition = data.definition !== undefined ? data.definition?.trim() || null : prev.definition;
    const ownerName = data.ownerName !== undefined ? data.ownerName?.trim() || null : prev.ownerName;
    const unit = data.unit !== undefined ? data.unit?.trim() || null : prev.unit;
    const target = data.target !== undefined ? data.target : prev.target;
    const baseline = data.baseline !== undefined ? data.baseline : prev.baseline;
    const objectiveId = data.objectiveId ?? prev.objectiveId;
    await sql`update key_results set name = ${name}, definition = ${definition}, owner_name = ${ownerName}, unit = ${unit},
      target = ${target}, baseline = ${baseline}, objective_id = ${objectiveId}
      where id = ${prev.id} and user_id = ${context.userId}`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: prev.workspaceId,
      action: "kr.modify",
      entityType: "key_result",
      entityId: prev.id,
      detail: name,
    });
    const next = await sql`select * from key_results where id = ${prev.id} and user_id = ${context.userId}`;
    return mapKr(next[0]);
  });

export const deleteKeyResult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql`select * from key_results where id = ${id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("Key result not found");
    const prev = mapKr(rows[0]);
    await sql`update kpis set related_kr_id = null, updated_at = now() where related_kr_id = ${id} and user_id = ${context.userId}`;
    await sql`delete from key_results where id = ${id} and user_id = ${context.userId}`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: prev.workspaceId,
      action: "kr.delete",
      entityType: "key_result",
      entityId: id,
      detail: prev.name,
    });
    return { ok: true as const, id };
  });

async function insertDraft(
  sql: Sql,
  userId: string,
  draft: ReturnType<typeof buildSystem>,
  projectId: string,
  workspaceId: string,
) {
  for (const o of draft.objectives) {
    await sql`insert into objectives (id, project_id, workspace_id, user_id, parent_id, level, title, description, owner_name, status, origin)
      values (${o.id}, ${projectId}, ${workspaceId}, ${userId}, ${o.parentId}, ${o.level}, ${o.title}, ${o.description}, ${o.ownerName}, ${o.status}, ${o.origin})`;
  }
  for (const k of draft.keyResults) {
    await sql`insert into key_results (id, objective_id, project_id, workspace_id, user_id, name, definition, unit, owner_name, measurement_method, status, related_kpi_id, origin)
      values (${k.id}, ${k.objectiveId}, ${projectId}, ${workspaceId}, ${userId}, ${k.name}, ${k.definition}, ${k.unit}, ${k.ownerName}, ${k.measurementMethod}, ${k.status}, ${k.relatedKpiId}, ${k.origin})`;
  }
  for (const k of draft.kpis) {
    await insertKpiRow(sql, k);
  }
}

async function insertKpiRow(sql: Sql, k: Kpi) {
  await sql`insert into kpis (
      id, project_id, workspace_id, user_id, objective_id, related_kr_id, kpi_code, name, definition, purpose, scope,
      owner_name, responsible_team, unit, direction, frequency, review_cadence, baseline, current_value, target,
      conservative_target, expected_target, stretch_target, formula, numerator, denominator, calculation_method,
      data_source, weight, thresholds, guardrail, leading_lagging, result_driver, efficiency_effectiveness,
      quality_quantity, parmenter_type, ipoo, gaming_risk, gaming_severity, data_quality_risk, definition_ambiguity,
      ownership_risk, measurement_risk, manipulation_risk, quality_score, quality_notes, status, version, origin, created_by
    ) values (
      ${k.id}, ${k.projectId}, ${k.workspaceId}, ${k.createdBy ?? ""}, ${k.objectiveId}, ${k.relatedKrId}, ${k.kpiCode},
      ${k.name}, ${k.definition}, ${k.purpose}, ${k.scope}, ${k.ownerName}, ${k.responsibleTeam}, ${k.unit}, ${k.direction},
      ${k.frequency}, ${k.reviewCadence}, ${k.baseline}, ${k.currentValue}, ${k.target}, ${k.conservativeTarget},
      ${k.expectedTarget}, ${k.stretchTarget}, ${k.formula}, ${k.numerator}, ${k.denominator}, ${k.calculationMethod},
      ${k.dataSource}, ${k.weight}, ${k.thresholds ? JSON.stringify(k.thresholds) : null}, ${k.guardrail},
      ${k.leadingLagging}, ${k.resultDriver}, ${k.efficiencyEffectiveness}, ${k.qualityQuantity}, ${k.parmenterType},
      ${k.ipoo}, ${k.gamingRisk}, ${k.gamingSeverity}, ${k.dataQualityRisk}, ${k.definitionAmbiguity}, ${k.ownershipRisk},
      ${k.measurementRisk}, ${k.manipulationRisk}, ${k.qualityScore}, ${k.qualityNotes ? JSON.stringify(k.qualityNotes) : null},
      ${k.status}, ${k.version}, ${k.origin}, ${k.createdBy}
    )`;
}

export const generateSystem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      projectId: string;
      orgName: string;
      priorities: string;
      owner: string;
      interview: InterviewState;
      existingText?: string;
      useAi?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const project = await requireProject(sql, context.userId, data.projectId);
    const existingNames = data.existingText ? parseKpiList(data.existingText) : [];
    let interview = harvestFacts(data.interview);

    let aiUsed = false;
    let draft: ReturnType<typeof buildSystem> | null = null;
    if (data.useAi) {
      const ai = await runArchitect({
        kind: "generate",
        payload: {
          project: { name: project.name, industry: project.industry, scope: project.scope },
          orgName: data.orgName,
          priorities: data.priorities,
          owner: data.owner,
          interview,
          existingNames,
        },
      });
      await sql`insert into ai_interactions (id, workspace_id, user_id, project_id, prompt_version, request_kind, request_payload, response_payload, validation_ok)
        values (${nid("ai")}, ${project.workspaceId}, ${context.userId}, ${project.id}, ${PROMPT_VERSION}, ${"generate"}, ${JSON.stringify({ orgName: data.orgName })}, ${ai.ok ? ai.raw : ai.error}, ${ai.ok})`;
      if (ai.ok) {
        const fromAi = draftFromAi({
          project,
          userId: context.userId,
          orgName: data.orgName,
          priorities: data.priorities,
          owner: data.owner,
          interview,
          ai: ai.data,
        });
        if (fromAi && fromAi.kpis.length > 0) {
          draft = fromAi;
          aiUsed = true;
          interview = {
            ...interview,
            assumptions: ai.data.assumptions ?? interview.assumptions,
            missing: ai.data.missing_information ?? interview.missing,
            done: true,
          };
        }
      }
    }

    if (!draft) {
      draft = buildSystem({
        project,
        userId: context.userId,
        orgName: data.orgName,
        priorities: data.priorities,
        owner: data.owner,
        interview,
        existingNames,
      });
      if (data.useAi) {
        draft.notes.unshift(
          "Locally generated. AI was unavailable or returned nothing usable. This did not come from the AI architect.",
        );
      } else {
        draft.notes.unshift("Locally generated from your facts and the industry library.");
      }
    } else if (aiUsed) {
      draft.notes.unshift("Designed with AI from your interview answers and context. Every item is editable.");
    }

    await sql`delete from checkins where project_id = ${project.id} and user_id = ${context.userId}`;
    await sql`delete from kpis where project_id = ${project.id} and user_id = ${context.userId}`;
    await sql`delete from key_results where project_id = ${project.id} and user_id = ${context.userId}`;
    await sql`delete from objectives where project_id = ${project.id} and user_id = ${context.userId}`;

    await insertDraft(sql, context.userId, draft, project.id, project.workspaceId);

    const scored = scoresFor(draft.objectives, draft.kpis, draft.keyResults.length, 0);
    await sql`update projects set interview_state = ${JSON.stringify(interview)}, alignment_score = ${scored.align.score},
      maturity_score = ${scored.mat.score}, quality_score = ${scored.quality}, status = ${"draft"},
      updated_at = now()
      where id = ${project.id} and user_id = ${context.userId}`;

    await logAudit(sql, {
      userId: context.userId,
      workspaceId: project.workspaceId,
      action: "ai.generate",
      entityType: "project",
      entityId: project.id,
      detail: aiUsed ? "ai" : "local",
    });

    return { notes: draft.notes, interview, scores: scored, aiUsed };
  });

export const interviewRound = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { industry: string; scope: Scope; hasExisting: boolean; interview?: InterviewState; useAi?: boolean }) => d)
  .handler(async ({ data }) => {
    const questions = startInterview(data.industry, data.scope, data.hasExisting).slice(0, 3);
    if (!data.useAi) {
      return { questions, complete: false, source: "local" as const };
    }
    const harvested = data.interview ? harvestFacts(data.interview) : undefined;
    const ai = await runArchitect({
      kind: "interview",
      payload: { industry: data.industry, scope: data.scope, interview: harvested },
      timeoutMs: 8000,
    });
    if (ai.ok && ai.data.follow_up_questions?.length && !ai.data.interview_complete) {
      return {
        questions: ai.data.follow_up_questions.slice(0, 3).map((q) => ({
          id: q.id,
          prompt: q.prompt,
          promptAr: q.promptAr,
          answer: "",
        })),
        complete: false,
        source: "ai" as const,
        interview: harvested,
      };
    }
    if (ai.ok && ai.data.interview_complete) {
      return { questions: [] as typeof questions, complete: true, source: "ai" as const, interview: harvested };
    }
    // Failure, timeout, or empty follow-up: never treat as interview_complete.
    // Round-1 answers stay on `interview` (harvested).
    if (!harvested || harvested.round < 1) {
      return { questions, complete: false, source: "local" as const };
    }
    return { questions: [] as typeof questions, complete: false, source: "local" as const, interview: harvested };
  });

export const updateKpi = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      id: string;
      patch: Partial<Pick<Kpi, "name" | "definition" | "purpose" | "ownerName" | "unit" | "direction" | "frequency" | "baseline" | "target" | "currentValue" | "formula" | "dataSource" | "guardrail" | "weight" | "status" | "reviewCadence" | "objectiveId" | "relatedKrId" | "thresholds">>;
      reason?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql`select * from kpis where id = ${data.id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("KPI not found");
    const prev = mapKpi(rows[0]);
    const next = { ...prev, ...data.patch, updatedAt: new Date().toISOString() };
    const q = assessQuality(next);
    next.qualityScore = q.total;
    next.qualityNotes = q;
    const gaming = detectGaming(next);
    next.gamingRisk = gaming.risk + " — " + gaming.why;
    next.gamingSeverity = gaming.severity;
    if (next.status === "approved" || next.status === "active") {
      const gate = canApproveKpi(next);
      if (!gate.ok) {
        throw new Error(`Quality gate blocked: ${gate.blockers.join(" ")}`);
      }
    }
    if (data.patch.baseline !== undefined || data.patch.direction) {
      const t = designTargets({
        baseline: next.baseline,
        direction: next.direction,
        userProvidedTarget: next.target,
      });
      next.conservativeTarget = t.conservative;
      next.expectedTarget = t.expected;
      next.stretchTarget = t.stretch;
    }
    const ver = nextVersion(prev.version);
    await sql`insert into entity_versions (id, workspace_id, user_id, entity_type, entity_id, version, change_summary, author, reason, previous_value, new_value)
      values (${nid("ver")}, ${prev.workspaceId}, ${context.userId}, ${"kpi"}, ${prev.id}, ${ver}, ${"KPI updated"}, ${context.userId}, ${data.reason ?? "edit"}, ${JSON.stringify(prev)}, ${JSON.stringify(next)})`;
    next.version = ver;
    await sql`update kpis set
      name = ${next.name}, definition = ${next.definition}, purpose = ${next.purpose}, owner_name = ${next.ownerName},
      unit = ${next.unit}, direction = ${next.direction}, frequency = ${next.frequency}, baseline = ${next.baseline},
      target = ${next.target}, current_value = ${next.currentValue}, formula = ${next.formula}, data_source = ${next.dataSource},
      guardrail = ${next.guardrail}, weight = ${next.weight}, status = ${next.status}, review_cadence = ${next.reviewCadence},
      objective_id = ${next.objectiveId}, related_kr_id = ${next.relatedKrId},
      thresholds = ${next.thresholds ? JSON.stringify(next.thresholds) : null},
      quality_score = ${next.qualityScore}, quality_notes = ${JSON.stringify(next.qualityNotes)},
      gaming_risk = ${next.gamingRisk}, gaming_severity = ${next.gamingSeverity},
      conservative_target = ${next.conservativeTarget}, expected_target = ${next.expectedTarget}, stretch_target = ${next.stretchTarget},
      version = ${next.version}, updated_at = now()
      where id = ${next.id} and user_id = ${context.userId}`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: prev.workspaceId,
      action: "kpi.modify",
      entityType: "kpi",
      entityId: prev.id,
      detail: next.name,
    });
    return next;
  });

export const setKpiStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: KpiStatus }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql`select * from kpis where id = ${data.id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("KPI not found");
    const prev = mapKpi(rows[0]);
    if (data.status === "approved" || data.status === "active") {
      const gate = canApproveKpi(prev);
      if (!gate.ok) {
        throw new Error(`Quality gate blocked: ${gate.blockers.join(" ")}`);
      }
      if ((prev.qualityScore ?? 0) < 40) {
        throw new Error("Quality gate: this KPI is too weak to approve. Complete definition, owner, formula and source.");
      }
    }
    await sql`update kpis set status = ${data.status}, updated_at = now() where id = ${data.id} and user_id = ${context.userId}`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: prev.workspaceId,
      action: `kpi.${data.status}`,
      entityType: "kpi",
      entityId: data.id,
    });
    return { ok: true };
  });

export const addKpiFromCatalog = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { projectId: string; catalogKey: string; objectiveId?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const project = await requireProject(sql, context.userId, data.projectId);
    const tpl = findCatalog(data.catalogKey);
    if (!tpl) throw new Error("Template not found");
    const objs = await sql`select id from objectives where project_id = ${project.id} and user_id = ${context.userId} limit 1`;
    const draft = buildSystem({
      project,
      userId: context.userId,
      orgName: project.name,
      priorities: "",
      owner: "Performance lead",
      interview: { round: 0, facts: {}, assumptions: [], missing: [], questions: [], done: true },
    });
    const k = draft.kpis[0];
    const source = CATALOG.find((c) => c.key === data.catalogKey)!;
    k.id = nid("kpi");
    k.name = source.name;
    k.definition = source.definition;
    k.purpose = source.purpose;
    k.formula = source.formula;
    k.unit = source.unit;
    k.direction = source.direction;
    k.origin = "template";
    k.objectiveId = data.objectiveId ?? (objs[0]?.id as string) ?? null;
    k.projectId = project.id;
    k.workspaceId = project.workspaceId;
    const q = assessQuality(k);
    k.qualityScore = q.total;
    k.qualityNotes = q;
    await insertKpiRow(sql, { ...k, createdBy: context.userId });
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: project.workspaceId,
      action: "kpi.create",
      entityType: "kpi",
      entityId: k.id,
      detail: k.name,
    });
    return k;
  });

export const recordCheckin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { kpiId: string; currentValue: number; comment?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql`select * from kpis where id = ${data.kpiId} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("KPI not found");
    const kpi = mapKpi(rows[0]);
    const scored = scoreKpiValue({
      current: data.currentValue,
      target: kpi.target,
      baseline: kpi.baseline,
      direction: kpi.direction,
      thresholds: kpi.thresholds,
    });
    const id = nid("chk");
    await sql`insert into checkins (id, kpi_id, project_id, workspace_id, user_id, current_value, target, progress, status, comment)
      values (${id}, ${kpi.id}, ${kpi.projectId}, ${kpi.workspaceId}, ${context.userId}, ${data.currentValue}, ${kpi.target}, ${scored.score}, ${scored.status}, ${data.comment ?? null})`;
    await sql`update kpis set current_value = ${data.currentValue}, updated_at = now() where id = ${kpi.id} and user_id = ${context.userId}`;
    return { id, status: scored.status, score: scored.score, reason: scored.reason };
  });

export const listCheckins = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { projectId?: string } | undefined) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const rows = data?.projectId
      ? await sql`select c.*, k.name as kpi_name from checkins c join kpis k on k.id = c.kpi_id where c.workspace_id = ${workspace.id} and c.user_id = ${context.userId} and c.project_id = ${data.projectId} order by c.recorded_at desc limit 100`
      : await sql`select c.*, k.name as kpi_name from checkins c join kpis k on k.id = c.kpi_id where c.workspace_id = ${workspace.id} and c.user_id = ${context.userId} order by c.recorded_at desc limit 100`;
    return rows.map((r) => ({ ...mapCheckin(r), kpiName: String(r.kpi_name ?? "") }));
  });

export const approveProjectDrafts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((projectId: string) => projectId)
  .handler(async ({ context, data: projectId }) => {
    const sql = await getSql();
    const project = await requireProject(sql, context.userId, projectId);
    const rows = await sql`select * from kpis where project_id = ${projectId} and user_id = ${context.userId} and status = 'draft'`;
    const skipped: { id: string; name: string; quality: number }[] = [];
    for (const row of rows) {
      const kpi = mapKpi(row);
      const gate = canApproveKpi(kpi);
      if (!gate.ok || (kpi.qualityScore ?? 0) < 40) {
        skipped.push({ id: kpi.id, name: kpi.name, quality: kpi.qualityScore ?? 0 });
        continue;
      }
      await sql`update kpis set status = 'approved', updated_at = now() where id = ${kpi.id} and user_id = ${context.userId}`;
    }
    if (skipped.length > 0) {
      return { skipped };
    }
    await sql`update objectives set status = 'approved' where project_id = ${projectId} and user_id = ${context.userId}`;
    await sql`update projects set status = 'active', updated_at = now() where id = ${projectId} and user_id = ${context.userId}`;
    await logAudit(sql, {
      userId: context.userId,
      workspaceId: project.workspaceId,
      action: "kpi.approval",
      entityType: "project",
      entityId: projectId,
    });
    return { skipped };
  });

export const runAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { text: string; isCsv?: boolean }) => d)
  .handler(async ({ data }) => {
    const names = data.isCsv ? parseCsvKpis(data.text) : parseKpiList(data.text);
    return { names, ...auditExisting(names) };
  });

export const applyAuditAsProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { name: string; industry?: string; text: string; isCsv?: boolean; items?: AuditItem[]; adds?: AuditItem[] }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const id = nid("prj");
    await sql`insert into projects (id, workspace_id, user_id, name, scope, mode, industry, status)
      values (${id}, ${workspace.id}, ${context.userId}, ${data.name}, ${"company"}, ${"audit"}, ${data.industry ?? null}, ${"draft"})`;
    const project = mapProject((await sql`select * from projects where id = ${id}`)[0]);
    const names = data.isCsv ? parseCsvKpis(data.text) : parseKpiList(data.text);
    const engine = auditExisting(names);
    const audit = {
      items: data.items ?? engine.items,
      adds: data.adds ?? engine.adds,
    };
    const interview: InterviewState = {
      round: 1,
      facts: { existing: names.join(", ") },
      assumptions: ["Baselines and owners were not in the upload."],
      missing: ["Baselines, owners, formulas and sources were not all in the upload."],
      questions: [],
      done: true,
    };
    const draft = buildFromAudit({
      project,
      userId: context.userId,
      owner: "Performance lead",
      interview,
      audit,
    });
    await insertDraft(sql, context.userId, draft, project.id, workspace.id);
    const scored = scoresFor(draft.objectives, draft.kpis, draft.keyResults.length);
    await sql`update projects set interview_state = ${JSON.stringify(interview)}, alignment_score = ${scored.align.score},
      quality_score = ${scored.quality}, maturity_score = ${scored.mat.score}, updated_at = now()
      where id = ${id} and user_id = ${context.userId}`;
    return { projectId: id, audit, notes: draft.notes };
  });

export const modifyWithAi = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { projectId: string; instruction: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const project = await requireProject(sql, context.userId, data.projectId);
    const kpis = (await sql`select * from kpis where project_id = ${project.id} and user_id = ${context.userId}`).map(mapKpi);
    const ai = await runArchitect({
      kind: "modify",
      payload: {
        instruction: data.instruction,
        kpis: kpis.map((k) => ({ id: k.id, name: k.name, definition: k.definition, purpose: k.purpose, guardrail: k.guardrail })),
      },
    });
    await sql`insert into ai_interactions (id, workspace_id, user_id, project_id, prompt_version, request_kind, request_payload, response_payload, validation_ok)
      values (${nid("ai")}, ${project.workspaceId}, ${context.userId}, ${project.id}, ${PROMPT_VERSION}, ${"modify"}, ${data.instruction}, ${ai.ok ? ai.raw : ai.error}, ${ai.ok})`;
    if (!ai.ok) return { ok: false as const, error: ai.error, explanation: null as string | null, changed: 0 };

    let changed = 0;
    const explanation = ai.data.modifier_explanation ?? ai.data.recommendations?.join(" ") ?? "Changes applied with a new version.";
    if (ai.data.kpi_patches) {
      for (const patch of ai.data.kpi_patches) {
        const current = kpis.find((k) => k.name === patch.name);
        if (!current) continue;
        if (patch.action === "remove") {
          await sql`update kpis set status = 'archived', updated_at = now() where id = ${current.id} and user_id = ${context.userId}`;
          changed += 1;
          continue;
        }
        if (patch.improved) {
          const next = {
            ...current,
            name: patch.improved.name ?? current.name,
            definition: patch.improved.definition ?? current.definition,
            purpose: patch.improved.purpose ?? current.purpose,
            guardrail: patch.improved.guardrail ?? current.guardrail,
          };
          const ver = nextVersion(current.version);
          await sql`insert into entity_versions (id, workspace_id, user_id, entity_type, entity_id, version, change_summary, author, reason, previous_value, new_value)
            values (${nid("ver")}, ${project.workspaceId}, ${context.userId}, ${"kpi"}, ${current.id}, ${ver}, ${patch.reason}, ${context.userId}, ${data.instruction}, ${JSON.stringify(current)}, ${JSON.stringify(next)})`;
          const q = assessQuality(next);
          await sql`update kpis set name = ${next.name}, definition = ${next.definition}, purpose = ${next.purpose}, guardrail = ${next.guardrail},
            version = ${ver}, quality_score = ${q.total}, quality_notes = ${JSON.stringify(q)}, updated_at = now()
            where id = ${current.id} and user_id = ${context.userId}`;
          changed += 1;
        }
      }
    }
    return { ok: true as const, error: null, explanation, changed };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const rows = await sql`select * from audit_logs where workspace_id = ${workspace.id} and user_id = ${context.userId} order by created_at desc limit 80`;
    return rows.map(mapLog);
  });

export const listKpiVersions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((kpiId: string) => kpiId)
  .handler(async ({ context, data: kpiId }) => {
    const sql = await getSql();
    const rows = await sql`select id, version, change_summary, author, reason, created_at from entity_versions where entity_id = ${kpiId} and user_id = ${context.userId} order by created_at desc`;
    return rows.map((r) => ({
      id: String(r.id),
      version: String(r.version),
      changeSummary: (r.change_summary as string) ?? null,
      author: (r.author as string) ?? null,
      reason: (r.reason as string) ?? null,
      createdAt: String(r.created_at),
    }));
  });

export const restoreKpiVersion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { kpiId: string; versionId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql`select * from kpis where id = ${data.kpiId} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("KPI not found");
    const prev = mapKpi(rows[0]);
    const verRows = await sql`select * from entity_versions where id = ${data.versionId} and entity_id = ${data.kpiId} and user_id = ${context.userId} limit 1`;
    if (!verRows[0]) throw new Error("Version not found");
    const snapshot =
      parseJson<Partial<Kpi> | null>(verRows[0].new_value as string, null) ??
      parseJson<Partial<Kpi> | null>(verRows[0].previous_value as string, null);
    if (!snapshot || !snapshot.name) throw new Error("Version snapshot is empty");
    const next: Kpi = {
      ...prev,
      name: snapshot.name ?? prev.name,
      definition: snapshot.definition ?? prev.definition,
      purpose: snapshot.purpose ?? prev.purpose,
      ownerName: snapshot.ownerName ?? prev.ownerName,
      unit: snapshot.unit ?? prev.unit,
      direction: snapshot.direction ?? prev.direction,
      frequency: snapshot.frequency ?? prev.frequency,
      reviewCadence: snapshot.reviewCadence ?? prev.reviewCadence,
      baseline: snapshot.baseline ?? prev.baseline,
      target: snapshot.target ?? prev.target,
      formula: snapshot.formula ?? prev.formula,
      dataSource: snapshot.dataSource ?? prev.dataSource,
      guardrail: snapshot.guardrail ?? prev.guardrail,
      weight: snapshot.weight ?? prev.weight,
      thresholds: snapshot.thresholds ?? prev.thresholds,
      objectiveId: snapshot.objectiveId ?? prev.objectiveId,
      relatedKrId: snapshot.relatedKrId ?? prev.relatedKrId,
    };
    const q = assessQuality(next);
    next.qualityScore = q.total;
    next.qualityNotes = q;
    if ((prev.status === "approved" || prev.status === "active") && !canApproveKpi(next).ok) {
      next.status = "under_review";
    }
    const ver = nextVersion(prev.version);
    await sql`insert into entity_versions (id, workspace_id, user_id, entity_type, entity_id, version, change_summary, author, reason, previous_value, new_value)
      values (${nid("ver")}, ${prev.workspaceId}, ${context.userId}, ${"kpi"}, ${prev.id}, ${ver}, ${"Restored from " + String(verRows[0].version)}, ${context.userId}, ${"restore"}, ${JSON.stringify(prev)}, ${JSON.stringify(next)})`;
    next.version = ver;
    await sql`update kpis set
      name = ${next.name}, definition = ${next.definition}, purpose = ${next.purpose}, owner_name = ${next.ownerName},
      unit = ${next.unit}, direction = ${next.direction}, frequency = ${next.frequency}, baseline = ${next.baseline},
      target = ${next.target}, formula = ${next.formula}, data_source = ${next.dataSource}, guardrail = ${next.guardrail},
      weight = ${next.weight}, status = ${next.status}, review_cadence = ${next.reviewCadence},
      objective_id = ${next.objectiveId}, related_kr_id = ${next.relatedKrId},
      thresholds = ${next.thresholds ? JSON.stringify(next.thresholds) : null},
      quality_score = ${next.qualityScore}, quality_notes = ${JSON.stringify(next.qualityNotes)},
      version = ${next.version}, updated_at = now()
      where id = ${next.id} and user_id = ${context.userId}`;
    return next;
  });

export const listOrgUnits = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const rows = await sql`select * from org_units where workspace_id = ${workspace.id} and user_id = ${context.userId} order by created_at`;
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      parentId: (r.parent_id as string) ?? null,
      kind: String(r.kind),
      name: String(r.name),
      ownerName: (r.owner_name as string) ?? null,
    }));
  });

export const createOrgUnit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { name: string; kind: string; parentId?: string | null; ownerName?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const name = data.name.trim();
    if (!name) throw new Error("Name is required.");
    const kind = data.kind || "department";
    const id = nid("ou");
    await sql`insert into org_units (id, workspace_id, user_id, parent_id, kind, name, owner_name)
      values (${id}, ${workspace.id}, ${context.userId}, ${data.parentId || null}, ${kind}, ${name}, ${data.ownerName?.trim() || null})`;
    return { id, name, kind };
  });

export const deleteOrgUnit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`update org_units set parent_id = null where parent_id = ${id} and user_id = ${context.userId}`;
    await sql`delete from org_units where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const, id };
  });

export const dashboardSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { workspace, org } = await ensureWorkspace(sql, context.userId);
    const projects = (await sql`select * from projects where workspace_id = ${workspace.id} and user_id = ${context.userId}`).map(mapProject);
    const kpis = (await sql`select * from kpis where workspace_id = ${workspace.id} and user_id = ${context.userId} and status != 'archived'`).map(mapKpi);
    const objectiveRows = await sql`select project_id from objectives where workspace_id = ${workspace.id} and user_id = ${context.userId}`;
    const krRows = await sql`select project_id from key_results where workspace_id = ${workspace.id} and user_id = ${context.userId}`;
    const checkins = (await sql`select * from checkins where workspace_id = ${workspace.id} and user_id = ${context.userId}`).map(mapCheckin);
    const demoProjectIds = new Set(projects.filter((p) => p.isDemo).map((p) => p.id));
    const realProjects = projects.filter((p) => !p.isDemo);
    const realKpis = kpis.filter((k) => !demoProjectIds.has(k.projectId));
    const realCheckins = checkins.filter((c) => !demoProjectIds.has(c.projectId));
    const statuses = realKpis.map((k) =>
      scoreKpiValue({
        current: k.currentValue,
        target: k.target,
        baseline: k.baseline,
        direction: k.direction,
        thresholds: k.thresholds,
      }),
    );
    const atRisk = statuses.filter((s) => s.status === "at_risk").length;
    const behind = statuses.filter((s) => s.status === "behind").length;
    const measured = statuses.filter((s) => s.status !== "not_measured").length;
    const sourced = realKpis.filter((k) => k.dataSource).length;
    const avgAlign = realProjects.length ? Math.round(realProjects.reduce((s, p) => s + (p.alignmentScore ?? 0), 0) / realProjects.length) : 0;
    const avgQual = realKpis.length ? Math.round(realKpis.reduce((s, k) => s + (k.qualityScore ?? 0), 0) / realKpis.length) : 0;
    const avgMat = realProjects.length ? Math.round(realProjects.reduce((s, p) => s + (p.maturityScore ?? 0), 0) / realProjects.length) : 0;
    return {
      workspace,
      org,
      projectCount: projects.length,
      demoCount: demoProjectIds.size,
      kpiCount: realKpis.length,
      objectiveCount: objectiveRows.filter((r) => !demoProjectIds.has(String(r.project_id))).length,
      krCount: krRows.filter((r) => !demoProjectIds.has(String(r.project_id))).length,
      atRisk,
      behind,
      reviewCompletion: realKpis.length ? Math.round((measured / realKpis.length) * 100) : 0,
      dataReadiness: realKpis.length ? Math.round((sourced / realKpis.length) * 100) : 0,
      alignment: avgAlign,
      quality: avgQual,
      maturity: avgMat,
      checkinCount: realCheckins.length,
      weakKpis: realKpis.filter((k) => (k.qualityScore ?? 0) < 50).slice(0, 5),
      projects,
    };
  });

export const seedDemo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId, "Demo");
    const existing = await sql`select id from projects where workspace_id = ${workspace.id} and user_id = ${context.userId} and is_demo = true limit 1`;
    if (existing[0]) return { ok: true, already: true };

    const demos: { name: string; industry: IndustryId; department: string }[] = [
      { name: "Northstar Retail — Sales", industry: "retail", department: "Sales" },
      { name: "Lumen People — HR", industry: "hr", department: "People" },
      { name: "Helix Plants — Manufacturing", industry: "manufacturing", department: "Operations" },
      { name: "Atlas Academy — Education", industry: "education", department: "Learning" },
    ];
    for (const d of demos) {
      const id = nid("prj");
      await sql`insert into projects (id, workspace_id, user_id, name, scope, mode, industry, department, is_demo, status)
        values (${id}, ${workspace.id}, ${context.userId}, ${d.name}, ${"department"}, ${"scratch"}, ${d.industry}, ${d.department}, ${true}, ${"active"})`;
      const project = mapProject((await sql`select * from projects where id = ${id}`)[0]);
      const interview: InterviewState = {
        round: 1,
        facts: { demo: "true", industry: d.industry },
        assumptions: ["Demo figures below are labelled sample data, not this organisation’s actuals."],
        missing: [],
        questions: [],
        done: true,
      };
      const draft = buildSystem({
        project,
        userId: context.userId,
        orgName: d.name,
        priorities: "Demo strategy: improve the core outcome without harming the guardrail.",
        owner: `${d.department} lead`,
        interview,
      });
      // Attach labelled sample actuals so the dashboard is not empty — clearly demo.
      draft.kpis.forEach((k, i) => {
        if (k.direction === "higher") {
          k.baseline = 40 + i * 3;
          k.target = 55 + i * 3;
          k.currentValue = 48 + i * 2;
        } else {
          k.baseline = 18 - i;
          k.target = 10 - i * 0.4;
          k.currentValue = 14 - i * 0.5;
        }
        const t = designTargets({ baseline: k.baseline, direction: k.direction, userProvidedTarget: k.target });
        k.conservativeTarget = t.conservative;
        k.expectedTarget = t.expected;
        k.stretchTarget = t.stretch;
        const q = assessQuality(k);
        k.qualityScore = q.total;
        k.qualityNotes = q;
        k.status = "active";
        k.origin = "template";
      });
      await insertDraft(sql, context.userId, draft, project.id, workspace.id);
      for (const k of draft.kpis.slice(0, 4)) {
        const scored = scoreKpiValue({
          current: k.currentValue,
          target: k.target,
          baseline: k.baseline,
          direction: k.direction,
        });
        await sql`insert into checkins (id, kpi_id, project_id, workspace_id, user_id, current_value, target, progress, status, comment)
          values (${nid("chk")}, ${k.id}, ${project.id}, ${workspace.id}, ${context.userId}, ${k.currentValue}, ${k.target}, ${scored.score}, ${scored.status}, ${"Demo check-in (sample data)"})`;
      }
      const scored = scoresFor(draft.objectives, draft.kpis, draft.keyResults.length, 4);
      await sql`update projects set interview_state = ${JSON.stringify(interview)}, alignment_score = ${scored.align.score},
        quality_score = ${scored.quality}, maturity_score = ${scored.mat.score}, updated_at = now()
        where id = ${id}`;
    }
    await logAudit(sql, { userId: context.userId, workspaceId: workspace.id, action: "workspace.demo", entityType: "workspace", entityId: workspace.id });
    return { ok: true, already: false };
  });

export const getKpi = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql`select * from kpis where id = ${id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("KPI not found");
    const kpi = mapKpi(rows[0]);
    const versions = (
      await sql`select id, version, change_summary, reason, created_at from entity_versions where entity_id = ${id} and user_id = ${context.userId} order by created_at desc`
    ).map((r) => ({
      id: String(r.id),
      version: String(r.version),
      changeSummary: (r.change_summary as string) ?? null,
      reason: (r.reason as string) ?? null,
      createdAt: String(r.created_at),
    }));
    const checkins = (await sql`select * from checkins where kpi_id = ${id} and user_id = ${context.userId} order by recorded_at desc limit 20`).map(mapCheckin);
    const gaming = detectGaming(kpi);
    const scored = scoreKpiValue({
      current: kpi.currentValue,
      target: kpi.target,
      baseline: kpi.baseline,
      direction: kpi.direction,
      thresholds: kpi.thresholds,
    });
    const objectives = (await sql`select * from objectives where project_id = ${kpi.projectId} and user_id = ${context.userId} order by created_at`).map(mapObjective);
    const keyResults = (await sql`select * from key_results where project_id = ${kpi.projectId} and user_id = ${context.userId} order by created_at`).map(mapKr);
    return { kpi, versions, checkins, gaming, scored, objectives, keyResults };
  });

export const catalogList = createServerFn({ method: "GET" }).handler(async () => {
  return CATALOG.map((c) => ({
    key: c.key,
    category: c.category,
    name: c.name,
    nameAr: c.nameAr,
    definition: c.definition,
    purpose: c.purpose,
    unit: c.unit,
    parmenterType: c.parmenterType,
    leadingLagging: c.leadingLagging,
    gamingSeverity: c.gamingSeverity,
  }));
});

export const listWorkspaceKpis = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { workspace } = await ensureWorkspace(sql, context.userId);
    const rows = await sql`select k.id, k.name, k.project_id, k.current_value, k.target, k.status, k.review_cadence, k.frequency, p.is_demo, p.name as project_name
      from kpis k join projects p on p.id = k.project_id
      where k.workspace_id = ${workspace.id} and k.user_id = ${context.userId} and k.status != 'archived' order by k.name`;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      projectId: String(r.project_id),
      projectName: String(r.project_name ?? ""),
      isDemo: Boolean(r.is_demo),
      currentValue: r.current_value === null || r.current_value === undefined ? null : Number(r.current_value),
      target: r.target === null || r.target === undefined ? null : Number(r.target),
      status: String(r.status),
      reviewCadence: (r.review_cadence as string) ?? null,
      frequency: (r.frequency as string) ?? null,
    }));
  });
