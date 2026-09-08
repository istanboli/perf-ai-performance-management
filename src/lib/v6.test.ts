import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditExisting } from "./audit-existing.ts";
import { parentOptions, wouldCreateCycle } from "./hierarchy.ts";
import { alignmentReport, canApproveKpi } from "./kpi-engine.ts";
import { buildFromAudit } from "./system-builder.ts";
import type { KeyResult, Kpi, Objective, Project } from "./types.ts";

const project: Project = {
  id: "prj_1",
  workspaceId: "ws_1",
  userId: "u_1",
  name: "Acme",
  scope: "company",
  mode: "audit",
  industry: "retail",
  department: null,
  status: "draft",
  isDemo: false,
  interviewState: null,
  alignmentScore: null,
  maturityScore: null,
  qualityScore: null,
  createdAt: "",
  updatedAt: "",
};

describe("V6 hierarchy", () => {
  it("blocks circular parents", () => {
    const objs = [
      { id: "a", parentId: null, title: "Company" },
      { id: "b", parentId: "a", title: "Dept" },
      { id: "c", parentId: "b", title: "Team" },
    ];
    assert.equal(wouldCreateCycle(objs, "a", "c"), true);
    assert.equal(wouldCreateCycle(objs, "c", "a"), false);
    assert.equal(wouldCreateCycle(objs, "b", "b"), true);
    assert.equal(parentOptions(objs, "a").some((o) => o.id === "c"), false);
    assert.equal(parentOptions(objs, "c").some((o) => o.id === "a"), true);
  });
});

describe("V6 alignment", () => {
  it("flags orphan KRs and KPIs", () => {
    const objectives: Objective[] = [
      {
        id: "o1",
        projectId: "p",
        workspaceId: "w",
        parentId: null,
        level: "company",
        title: "Win",
        description: null,
        ownerName: null,
        status: "draft",
        origin: "user",
      },
    ];
    const kpis = [{ id: "k1", name: "Orphan KPI", objectiveId: null } as Kpi];
    const krs = [{ id: "kr1", name: "Orphan KR", objectiveId: "missing" } as KeyResult];
    const report = alignmentReport(objectives, kpis, { o1: 0 }, krs);
    assert.ok(report.orphanKpis.includes("Orphan KPI"));
    assert.ok(report.orphanKrs.includes("Orphan KR"));
    assert.ok(report.unmeasuredObjectives.includes("Win"));
  });
});

describe("V6 audit manual actions", () => {
  it("inserts ADD and never regenerates REMOVE", () => {
    const names = ["Revenue", "Likes"];
    const engine = auditExisting(names);
    const items = engine.items.map((it) => (it.name === "Likes" ? { ...it, action: "remove" as const } : it));
    const draft = buildFromAudit({
      project,
      userId: "u_1",
      owner: "COO",
      interview: { round: 1, facts: {}, assumptions: [], missing: [], questions: [], done: true },
      audit: {
        items,
        adds: [{ name: "Gross margin %", action: "add", reason: "User added a quality guardrail." }],
      },
    });
    const kpiNames = draft.kpis.map((k) => k.name);
    assert.ok(kpiNames.includes("Revenue"));
    assert.ok(!kpiNames.includes("Likes"));
    assert.ok(kpiNames.includes("Gross margin %"));
  });
});

describe("V6 quality gate still holds", () => {
  it("rejects X", () => {
    assert.equal(canApproveKpi({ name: "X" }).ok, false);
  });
});
