import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiSystemSchema } from "./ai/schema.ts";
import { auditExisting } from "./audit-existing.ts";
import { firstInterviewRound, harvestFacts } from "./interview.ts";
import { canApproveKpi, qualityGateBlockers } from "./kpi-engine.ts";
import { buildFromAudit, draftFromAi } from "./system-builder.ts";
import { INDUSTRIES, type InterviewState, type Project } from "./types.ts";

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

describe("P0-1 interview", () => {
  it("loads 1–3 relevant questions for every industry", () => {
    for (const ind of INDUSTRIES) {
      const qs = firstInterviewRound({ industry: ind.id, scope: "company", hasExisting: false });
      assert.ok(qs.length >= 1 && qs.length <= 3, `${ind.id} got ${qs.length}`);
      for (const q of qs) {
        assert.ok(q.prompt.length > 10);
        assert.equal(q.answer, "");
      }
    }
  });

  it("does not mark the interview done when answers are empty", () => {
    const questions = firstInterviewRound({ industry: "retail", scope: "company", hasExisting: true });
    const state: InterviewState = {
      round: 1,
      facts: {},
      assumptions: [],
      missing: [],
      questions,
      done: false,
    };
    const harvested = harvestFacts(state);
    assert.equal(harvested.done, false);
    assert.ok(harvested.missing.length >= 1);
  });

  it("saves answers and records explicit skips", () => {
    const questions = firstInterviewRound({ industry: "manufacturing", scope: "company", hasExisting: false });
    questions[0].answer = "Throughput is constrained by changeovers.";
    if (questions[1]) questions[1].skipped = true;
    if (questions[2]) questions[2].answer = "The plant manager.";
    const harvested = harvestFacts({
      round: 1,
      facts: {},
      assumptions: [],
      missing: [],
      questions,
      done: false,
    });
    assert.equal(harvested.facts[questions[0].id], "Throughput is constrained by changeovers.");
    assert.ok(harvested.assumptions.some((a) => a.startsWith("Skipped:")));
    assert.ok(!harvested.missing.includes(questions[0].prompt));
  });

  it("round-1 facts stay when follow-up is not complete", () => {
    const harvested = harvestFacts({
      round: 1,
      facts: {},
      assumptions: [],
      missing: [],
      questions: [
        { id: "constraint", prompt: "Which constraint?", answer: "Changeovers on line 2", skipped: false },
        { id: "owner", prompt: "Who owns it?", answer: "Plant manager", skipped: false },
      ],
      done: false,
    });
    assert.equal(harvested.done, false);
    assert.equal(harvested.facts.constraint, "Changeovers on line 2");
    assert.equal(harvested.facts.owner, "Plant manager");
  });
});

describe("P0-3 quality gate", () => {
  it("blocks a KPI named X with no critical fields", () => {
    const blockers = qualityGateBlockers({ name: "X" });
    assert.ok(blockers.some((b) => /name/i.test(b)));
    assert.ok(blockers.some((b) => /definition/i.test(b)));
    assert.ok(blockers.some((b) => /owner/i.test(b)));
    assert.ok(blockers.some((b) => /formula/i.test(b)));
    assert.ok(blockers.some((b) => /source/i.test(b)));
    assert.equal(canApproveKpi({ name: "X" }).ok, false);
  });

  it("allows a complete KPI through the hard gate", () => {
    const kpi = {
      name: "First-pass yield",
      definition: "Share of units that pass inspection without rework on the first attempt.",
      ownerName: "Plant manager",
      formula: "(Good units / Units started) × 100",
      dataSource: "MES",
    };
    assert.deepEqual(qualityGateBlockers(kpi), []);
    assert.equal(canApproveKpi(kpi).ok, true);
  });
});

describe("P0-4 audit → project", () => {
  it("keeps, improves, removes and adds instead of dumping the catalog", () => {
    const names = ["Revenue", "Number of tasks completed", "Likes", "Customer retention", "Hours worked"];
    const audit = auditExisting(names);
    const draft = buildFromAudit({
      project,
      userId: "u_1",
      owner: "COO",
      interview: { round: 1, facts: {}, assumptions: [], missing: [], questions: [], done: true },
      audit,
    });
    const kpiNames = draft.kpis.map((k) => k.name);
    assert.ok(!kpiNames.includes("Likes"), "REMOVE vanity must be excluded");
    assert.ok(!kpiNames.includes("Hours worked"), "REMOVE hours worked");
    assert.ok(
      kpiNames.includes("Revenue") || kpiNames.includes("Number of tasks completed") || kpiNames.includes("Customer retention"),
      "KEEP/IMPROVE originals must be preserved",
    );
    assert.ok(
      !kpiNames.includes("Store conversion rate"),
      "must not substitute a generic retail catalog KPI",
    );
    const added = audit.adds.map((a) => a.name);
    for (const n of added) assert.ok(kpiNames.includes(n), `ADD ${n} missing`);
    assert.ok(draft.notes.some((n) => /Audit applied/i.test(n)));
  });
});

describe("P0-2 AI draft mapping", () => {
  it("persists AI KPI names instead of the catalog", () => {
    const parsed = AiSystemSchema.parse({
      objectives: [{ title: "Win profitable work", level: "company" }],
      kpis: [
        {
          name: "Qualified pipeline coverage",
          definition: "Weighted pipeline divided by quota for the next two quarters.",
          purpose: "See whether we can hit the number without stuffing junk.",
          formula: "Weighted pipeline / 2-quarter quota",
          owner: "CRO",
          dataSource: "CRM",
          direction: "higher",
        },
      ],
      follow_up_questions: [
        { id: "a", prompt: "q1" },
        { id: "b", prompt: "q2" },
        { id: "c", prompt: "q3" },
        { id: "d", prompt: "q4 extra should be dropped" },
      ],
    });
    assert.equal(parsed.follow_up_questions?.length, 3);
    const draft = draftFromAi({
      project,
      userId: "u_1",
      orgName: "Acme",
      priorities: "Win better work",
      owner: "CRO",
      interview: { round: 1, facts: { decision: "pricing" }, assumptions: [], missing: [], questions: [], done: true },
      ai: parsed,
    });
    assert.ok(draft);
    assert.equal(draft!.kpis[0].name, "Qualified pipeline coverage");
    assert.equal(draft!.kpis[0].origin, "ai");
    assert.equal(draft!.objectives[0].title, "Win profitable work");
    assert.ok(!draft!.kpis.some((k) => k.name === "Store conversion rate"));
    assert.equal(draft!.kpis[0].direction, "higher");
  });

  it("does not invent direction or frequency when AI omitted them", () => {
    const parsed = AiSystemSchema.parse({
      objectives: [{ title: "Stay honest" }],
      kpis: [{ name: "Mystery KPI", definition: "Whatever we can actually measure." }],
    });
    const draft = draftFromAi({
      project,
      userId: "u_1",
      orgName: "Acme",
      priorities: "",
      owner: "Lead",
      interview: { round: 1, facts: {}, assumptions: [], missing: [], questions: [], done: true },
      ai: parsed,
    });
    assert.ok(draft);
    assert.equal(draft!.kpis[0].name, "Mystery KPI");
    assert.equal(draft!.kpis[0].direction, null);
    assert.equal(draft!.kpis[0].frequency, null);
  });

  it("accepts messy AI JSON without failing the whole payload", () => {
    const parsed = AiSystemSchema.safeParse({
      kpis: [
        { name: "OK KPI", direction: "upwards" },
        { name: "" },
        { notAKpi: true },
      ],
      objectives: [{ title: "Stay alive", level: "org" }],
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.kpis?.length, 1);
      assert.equal(parsed.data.kpis?.[0].name, "OK KPI");
      assert.equal(parsed.data.objectives?.[0].level, undefined);
    }
  });

  it("returns null when AI sent no KPIs so the caller can fall back locally", () => {
    const parsed = AiSystemSchema.parse({ objectives: [{ title: "Nope" }] });
    const draft = draftFromAi({
      project,
      userId: "u_1",
      orgName: "Acme",
      priorities: "",
      owner: "Lead",
      interview: { round: 1, facts: {}, assumptions: [], missing: [], questions: [], done: true },
      ai: parsed,
    });
    assert.equal(draft, null);
  });
});
