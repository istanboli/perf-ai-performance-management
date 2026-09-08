import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { OriginBadge, StatusBadge } from "@/components/origin-badge";
import { ScoreRing } from "@/components/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { balanceReport, classifyParmenterNote, detectGaming, weightReport } from "@/lib/kpi-engine";
import { parentOptions } from "@/lib/hierarchy";
import {
  approveProjectDrafts,
  createKeyResult,
  createObjective,
  deleteKeyResult,
  deleteObjective,
  getProjectBundle,
  modifyWithAi,
  updateKeyResult,
  updateObjective,
} from "@/lib/server/fns";
import { useT } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { KeyResult, ObjLevel, Objective } from "@/lib/types";

export const Route = createFileRoute("/app/projects/$projectId")({ component: ProjectHub });

const TABS = ["overview", "objectives", "okrs", "kpis", "alignment", "quality", "risks", "plan", "ai"] as const;

function ProjectHub() {
  const { projectId } = Route.useParams();
  const { t } = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("overview");
  const [instruction, setInstruction] = useState("");
  const q = useQuery({ queryKey: ["project", projectId], queryFn: () => getProjectBundle({ data: projectId }) });
  const approve = useMutation({
    mutationFn: () => approveProjectDrafts({ data: projectId }),
    onSuccess: (r) => {
      toast.success(t("ok.approved"));
      if (r.skipped.length) toast.message(`${r.skipped.length} weak KPIs were not approved.`);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const mod = useMutation({
    mutationFn: () => modifyWithAi({ data: { projectId, instruction } }),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.explanation ?? t("ok.saved"));
        setInstruction("");
        qc.invalidateQueries({ queryKey: ["project", projectId] });
      }
    },
  });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-[24px] bg-muted" />;
  if (q.error || !q.data) return <p className="text-sm text-danger">{t("err.generic")}</p>;
  const { project, objectives, keyResults, kpis, align, mat } = q.data;
  const balance = balanceReport(kpis);
  const weights = weightReport(kpis);
  const risks = kpis.map((k) => detectGaming(k));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {project.industry} · {project.scope}
            {project.isDemo ? ` · ${t("proj.demoTag")}` : ""}
          </p>
          <h1 className="font-display text-4xl">{project.name}</h1>
        </div>
        <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
          {t("wiz.approve")}
        </Button>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-2 text-sm",
              tab === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {id}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="flex flex-wrap items-center justify-around gap-4 py-8">
              <ScoreRing value={align.score} label={t("dash.alignment")} />
              <ScoreRing value={project.qualityScore} label={t("dash.quality")} />
              <ScoreRing value={mat.score} label={t("dash.maturity")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dash.opportunities")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {mat.weaknesses.slice(0, 4).map((w) => (
                <p key={w}>{w}</p>
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Facts / assumptions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-2">
              <div>
                <div className="font-medium">{t("wiz.assumptions")}</div>
                <ul className="mt-2 list-disc ps-5 text-warn">
                  {(project.interviewState?.assumptions ?? ["None recorded."]).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-medium">{t("wiz.missing")}</div>
                <ul className="mt-2 list-disc ps-5 text-muted-foreground">
                  {(project.interviewState?.missing ?? ["—"]).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "objectives" && (
        <ObjectivePanel projectId={projectId} objectives={objectives} keyResults={keyResults} />
      )}

      {tab === "okrs" && (
        <KeyResultPanel projectId={projectId} objectives={objectives} keyResults={keyResults} />
      )}

      {tab === "kpis" && (
        <ul className="space-y-3">
          {kpis.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty.kpis")}</p> : null}
          {kpis.map((k) => (
            <li key={k.id}>
              <Link
                to="/app/kpis/$kpiId"
                params={{ kpiId: k.id }}
                className="block rounded-[20px] border border-border bg-card p-5 hover:border-primary/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{k.name}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{k.purpose ?? k.definition}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={k.status} />
                    <OriginBadge origin={k.origin} />
                    {k.parmenterType ? <Badge>{k.parmenterType}</Badge> : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>
                    {t("kpi.owner")}: {k.ownerName ?? t("kpi.missing")}
                  </span>
                  <span className="tabular">
                    {t("kpi.quality")}: {k.qualityScore ?? "—"}
                  </span>
                  <span>
                    {t("kpi.target")}: {k.target ?? t("kpi.missing")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === "alignment" && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-6">
              <ScoreRing value={align.score} label={t("dash.alignment")} />
              <p className="text-sm text-muted-foreground">Every score has an explanation. It is not decorative.</p>
            </div>
            <ul className="list-disc ps-5 text-sm">
              {align.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {align.orphanKpis.length ? (
              <p className="text-sm text-warn">Orphan KPIs: {align.orphanKpis.join(", ")}</p>
            ) : null}
            {align.orphanKrs?.length ? (
              <p className="text-sm text-warn">Orphan key results: {align.orphanKrs.join(", ")}</p>
            ) : null}
            <div className="space-y-2 text-sm">
              {objectives.map((o) => (
                <div key={o.id} className="rounded-[12px] border border-border px-3 py-2">
                  <div className="font-medium">
                    {o.level} · {o.title}
                    {o.parentId ? ` ← ${objectives.find((p) => p.id === o.parentId)?.title ?? ""}` : ""}
                  </div>
                  {keyResults
                    .filter((kr) => kr.objectiveId === o.id)
                    .map((kr) => (
                      <div key={kr.id} className="mt-1 ps-3 text-muted-foreground">
                        KR · {kr.name} · target {kr.target ?? t("kpi.missing")}
                        {kpis
                          .filter((k) => k.relatedKrId === kr.id || k.objectiveId === o.id)
                          .slice(0, 4)
                          .map((k) => (
                            <div key={k.id} className="ps-3">
                              KPI · {k.name} · {t("kpi.target")} {k.target ?? t("kpi.missing")}
                            </div>
                          ))}
                      </div>
                    ))}
                </div>
              ))}
            </div>
            <Tree objectives={objectives} kpis={kpis} krs={keyResults} />
          </CardContent>
        </Card>
      )}

      {tab === "quality" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{classifyParmenterNote(kpis)}</p>
          <p className="text-sm">{weights.message}</p>
          <p className="text-sm text-muted-foreground">{balance.notes.join(" ")}</p>
          <ul className="space-y-2">
            {kpis.map((k) => (
              <li key={k.id} className="rounded-[16px] border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{k.name}</span>
                  <span className="tabular">{k.qualityScore ?? "—"}/100</span>
                </div>
                <Progress value={k.qualityScore ?? 0} className="mt-2" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "risks" && (
        <ul className="space-y-3">
          {risks.map((r) => (
            <li key={r.kpiId} className="rounded-[20px] border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{r.kpiName}</div>
                <Badge tone={r.severity === "high" ? "danger" : r.severity === "medium" ? "warn" : "neutral"}>{r.severity}</Badge>
              </div>
              <p className="mt-2 text-sm">{r.risk}</p>
              <p className="mt-1 text-sm text-muted-foreground">{r.why}</p>
              <p className="mt-2 text-xs">Possible behaviour: {r.possibleBehavior}</p>
              <p className="mt-1 text-xs">Guardrail: {r.guardrail}</p>
            </li>
          ))}
        </ul>
      )}

      {tab === "plan" && (
        <ol className="space-y-3">
          {mat.plan.map((a) => (
            <li key={a.action} className="rounded-[20px] border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Days {a.phase}</div>
              <div className="mt-1 font-medium">{a.action}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                {a.owner} · {a.priority} · {a.deadline}
              </p>
              <p className="mt-1 text-sm">{a.expectedOutcome}</p>
            </li>
          ))}
        </ol>
      )}

      {tab === "ai" && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-display text-2xl">{t("ai.modify")}</h2>
            <p className="text-sm text-muted-foreground">{t("ai.modifyHint")}</p>
            <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Reduce the number of KPIs. Add quality guardrails." />
            <Button disabled={!instruction.trim() || mod.isPending} onClick={() => mod.mutate()}>
              {mod.isPending ? t("ai.thinking") : t("ai.send")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ObjectivePanel({
  projectId,
  objectives,
  keyResults,
}: {
  projectId: string;
  objectives: Objective[];
  keyResults: KeyResult[];
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [level, setLevel] = useState<ObjLevel>("company");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", description: "", ownerName: "", level: "company" as ObjLevel, parentId: "" });

  const create = useMutation({
    mutationFn: () =>
      createObjective({ data: { projectId, title, description, ownerName, level, parentId: parentId || null } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setTitle("");
      setDescription("");
      setOwnerName("");
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const save = useMutation({
    mutationFn: () =>
      updateObjective({
        data: {
          id: editing!,
          title: edit.title,
          description: edit.description,
          ownerName: edit.ownerName,
          level: edit.level,
          parentId: edit.parentId || null,
        },
      }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteObjective({ data: id }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-display text-2xl">{t("okr.addObjective")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("okr.title")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("kpi.definition")}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("kpi.owner")}</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("okr.level")}</Label>
              <NativeSelect value={level} onChange={(e) => setLevel(e.target.value as ObjLevel)}>
                <option value="company">company</option>
                <option value="department">department</option>
                <option value="team">team</option>
                <option value="role">role</option>
                <option value="individual">individual</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("okr.parent")}</Label>
              <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{t("okr.none")}</option>
                {parentOptions(objectives).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            {t("okr.addObjective")}
          </Button>
        </CardContent>
      </Card>
      {objectives.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty.okrs")}</p> : null}
      <ul className="space-y-3">
        {objectives.map((o) => (
          <li key={o.id} className="rounded-[20px] border border-border bg-card p-5">
            {editing === o.id ? (
              <div className="space-y-3">
                <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                <Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                <Input value={edit.ownerName} onChange={(e) => setEdit({ ...edit, ownerName: e.target.value })} />
                <NativeSelect value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value as ObjLevel })}>
                  <option value="company">company</option>
                  <option value="department">department</option>
                  <option value="team">team</option>
                  <option value="role">role</option>
                  <option value="individual">individual</option>
                </NativeSelect>
                <NativeSelect value={edit.parentId} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}>
                  <option value="">{t("okr.none")}</option>
                  {parentOptions(objectives, o.id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!edit.title.trim() || save.isPending} onClick={() => save.mutate()}>
                    {t("kpi.save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {t("wiz.back")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {o.level}
                      {o.parentId ? ` · ← ${objectives.find((p) => p.id === o.parentId)?.title ?? ""}` : ""}
                    </div>
                    <div className="font-medium">{o.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("kpi.owner")}: {o.ownerName ?? t("kpi.missing")}
                    </p>
                  </div>
                  <OriginBadge origin={o.origin} />
                </div>
                <ul className="mt-2 text-xs text-muted-foreground">
                  {keyResults
                    .filter((k) => k.objectiveId === o.id)
                    .map((k) => (
                      <li key={k.id}>KR · {k.name}</li>
                    ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(o.id);
                      setEdit({
                        title: o.title,
                        description: o.description ?? "",
                        ownerName: o.ownerName ?? "",
                        level: o.level,
                        parentId: o.parentId ?? "",
                      });
                    }}
                  >
                    {t("kpi.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(t("okr.confirmDelete"))) remove.mutate(o.id);
                    }}
                  >
                    {t("okr.delete")}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeyResultPanel({
  projectId,
  objectives,
  keyResults,
}: {
  projectId: string;
  objectives: Objective[];
  keyResults: KeyResult[];
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [objectiveId, setObjectiveId] = useState(objectives[0]?.id ?? "");
  const effectiveObjectiveId = objectives.some((o) => o.id === objectiveId) ? objectiveId : (objectives[0]?.id ?? "");
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", definition: "", ownerName: "", unit: "", target: "" });

  const create = useMutation({
    mutationFn: () =>
      createKeyResult({
        data: {
          projectId,
          objectiveId: effectiveObjectiveId,
          name,
          definition,
          ownerName,
          unit,
          target: target === "" ? null : Number(target),
        },
      }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setName("");
      setDefinition("");
      setOwnerName("");
      setUnit("");
      setTarget("");
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const save = useMutation({
    mutationFn: () =>
      updateKeyResult({
        data: {
          id: editing!,
          name: edit.name,
          definition: edit.definition,
          ownerName: edit.ownerName,
          unit: edit.unit,
          target: edit.target === "" ? null : Number(edit.target),
        },
      }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteKeyResult({ data: id }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-display text-2xl">{t("okr.addKr")}</h2>
          {objectives.length === 0 ? (
            <p className="text-sm text-warn">{t("okr.needObjective")}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("okr.objective")}</Label>
                  <NativeSelect value={effectiveObjectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
                    {objectives.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("okr.title")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("kpi.definition")}</Label>
                  <Textarea value={definition} onChange={(e) => setDefinition(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kpi.owner")}</Label>
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kpi.target")}</Label>
                  <Input value={target} onChange={(e) => setTarget(e.target.value)} type="number" />
                </div>
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
              </div>
              <Button disabled={!name.trim() || !effectiveObjectiveId || create.isPending} onClick={() => create.mutate()}>
                {t("okr.addKr")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      {keyResults.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty.okrs")}</p> : null}
      <ul className="space-y-3">
        {keyResults.map((kr) => (
          <li key={kr.id} className="rounded-[20px] border border-border bg-card p-5">
            {editing === kr.id ? (
              <div className="space-y-3">
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                <Textarea value={edit.definition} onChange={(e) => setEdit({ ...edit, definition: e.target.value })} />
                <Input value={edit.ownerName} onChange={(e) => setEdit({ ...edit, ownerName: e.target.value })} />
                <Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
                <Input
                  type="number"
                  value={edit.target}
                  onChange={(e) => setEdit({ ...edit, target: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={!edit.name.trim() || save.isPending} onClick={() => save.mutate()}>
                    {t("kpi.save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {t("wiz.back")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{kr.name}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{kr.definition}</p>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {t("kpi.owner")}: {kr.ownerName ?? t("kpi.missing")} · {t("kpi.target")}: {kr.target ?? t("kpi.missing")}
                      {kr.unit ? ` ${kr.unit}` : ""}
                    </div>
                  </div>
                  <OriginBadge origin={kr.origin} />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(kr.id);
                      setEdit({
                        name: kr.name,
                        definition: kr.definition ?? "",
                        ownerName: kr.ownerName ?? "",
                        unit: kr.unit ?? "",
                        target: kr.target == null ? "" : String(kr.target),
                      });
                    }}
                  >
                    {t("kpi.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(t("okr.confirmDelete"))) remove.mutate(kr.id);
                    }}
                  >
                    {t("okr.delete")}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tree({
  objectives,
  kpis,
  krs,
}: {
  objectives: { id: string; title: string; parentId: string | null; level: string }[];
  kpis: { id: string; name: string; objectiveId: string | null }[];
  krs: { id: string; name: string; objectiveId: string }[];
}) {
  const roots = objectives.filter((o) => !o.parentId);
  const kids = (id: string) => objectives.filter((o) => o.parentId === id);
  const render = (id: string, depth = 0) => {
    const o = objectives.find((x) => x.id === id);
    if (!o) return null;
    return (
      <li key={id} className="relative">
        <div className="rounded-[12px] border border-border bg-card px-3 py-2" style={{ marginInlineStart: depth * 16 }}>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{o.level}</div>
          <div className="text-sm font-medium">{o.title}</div>
          <ul className="mt-1 text-xs text-muted-foreground">
            {krs.filter((k) => k.objectiveId === id).map((k) => (
              <li key={k.id}>KR · {k.name}</li>
            ))}
            {kpis.filter((k) => k.objectiveId === id).map((k) => (
              <li key={k.id}>KPI · {k.name}</li>
            ))}
          </ul>
        </div>
        {kids(id).length ? <ul className="mt-2 space-y-2">{kids(id).map((c) => render(c.id, depth + 1))}</ul> : null}
      </li>
    );
  };
  return <ul className="space-y-2">{(roots.length ? roots : objectives).map((o) => render(o.id))}</ul>;
}
