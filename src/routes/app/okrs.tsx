import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { OriginBadge } from "@/components/origin-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { parentOptions } from "@/lib/hierarchy";
import {
  createKeyResult,
  createObjective,
  deleteKeyResult,
  deleteObjective,
  listWorkspaceOkrs,
  updateKeyResult,
  updateObjective,
} from "@/lib/server/fns";
import { useT } from "@/lib/locale";
import type { ObjLevel } from "@/lib/types";

export const Route = createFileRoute("/app/okrs")({ component: OkrsPage });

function OkrsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["workspace-okrs"], queryFn: () => listWorkspaceOkrs() });
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<ObjLevel>("company");
  const [parentId, setParentId] = useState("");
  const [krName, setKrName] = useState("");
  const [krObjectiveId, setKrObjectiveId] = useState("");
  const [editingObj, setEditingObj] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editingKr, setEditingKr] = useState<string | null>(null);
  const [editKrName, setEditKrName] = useState("");

  const projects = q.data?.projects ?? [];
  const objectives = q.data?.objectives ?? [];
  const keyResults = q.data?.keyResults ?? [];
  const effectiveProject = projects.some((p) => p.id === projectId) ? projectId : (projects[0]?.id ?? "");
  const projectObjectives = objectives.filter((o) => o.projectId === effectiveProject);
  const effectiveKrObj = projectObjectives.some((o) => o.id === krObjectiveId)
    ? krObjectiveId
    : (projectObjectives[0]?.id ?? "");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["workspace-okrs"] });

  const addObj = useMutation({
    mutationFn: () =>
      createObjective({
        data: { projectId: effectiveProject, title, level, parentId: parentId || null },
      }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setTitle("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const saveObj = useMutation({
    mutationFn: () => updateObjective({ data: { id: editingObj!, title: editTitle } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setEditingObj(null);
      invalidate();
    },
  });
  const delObj = useMutation({
    mutationFn: (id: string) => deleteObjective({ data: id }),
    onSuccess: invalidate,
  });
  const addKr = useMutation({
    mutationFn: () =>
      createKeyResult({ data: { projectId: effectiveProject, objectiveId: effectiveKrObj, name: krName } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setKrName("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const saveKr = useMutation({
    mutationFn: () => updateKeyResult({ data: { id: editingKr!, name: editKrName } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setEditingKr(null);
      invalidate();
    },
  });
  const delKr = useMutation({
    mutationFn: (id: string) => deleteKeyResult({ data: id }),
    onSuccess: invalidate,
  });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-[24px] bg-muted" />;

  if (!projects.length) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-4xl">{t("nav.okrs")}</h1>
        <EmptyState title={t("empty.okrs")} cta={t("empty.kpisCta")} to="/app/build" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">{t("nav.okrs")}</h1>
      <div className="max-w-sm space-y-1.5">
        <Label>{t("nav.projects")}</Label>
        <NativeSelect value={effectiveProject} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDemo ? ` (${t("proj.demoTag")})` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          <h2 className="font-display text-2xl sm:col-span-2">{t("okr.addObjective")}</h2>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("okr.title")} />
          <NativeSelect value={level} onChange={(e) => setLevel(e.target.value as ObjLevel)}>
            <option value="company">company</option>
            <option value="department">department</option>
            <option value="team">team</option>
            <option value="role">role</option>
            <option value="individual">individual</option>
          </NativeSelect>
          <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t("okr.none")}</option>
            {parentOptions(projectObjectives).map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </NativeSelect>
          <Button disabled={!title.trim() || addObj.isPending} onClick={() => addObj.mutate()}>
            {t("okr.addObjective")}
          </Button>
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {projectObjectives.map((o) => (
          <li key={o.id} className="rounded-[20px] border border-border bg-card p-5">
            {editingObj === o.id ? (
              <div className="flex flex-wrap gap-2">
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                <Button size="sm" onClick={() => saveObj.mutate()}>
                  {t("kpi.save")}
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link to="/app/projects/$projectId" params={{ projectId: o.projectId }} className="text-xs text-muted-foreground">
                    {o.level}
                    {o.parentId ? ` · ← ${projectObjectives.find((p) => p.id === o.parentId)?.title ?? ""}` : ""}
                  </Link>
                  <div className="font-medium">{o.title}</div>
                </div>
                <OriginBadge origin={o.origin} />
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingObj(o.id);
                  setEditTitle(o.title);
                }}
              >
                {t("kpi.edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t("okr.confirmDelete"))) delObj.mutate(o.id);
                }}
              >
                {t("okr.delete")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          <h2 className="font-display text-2xl sm:col-span-2">{t("okr.addKr")}</h2>
          {projectObjectives.length === 0 ? (
            <p className="text-sm text-warn sm:col-span-2">{t("okr.needObjective")}</p>
          ) : (
            <>
              <NativeSelect value={effectiveKrObj} onChange={(e) => setKrObjectiveId(e.target.value)}>
                {projectObjectives.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </NativeSelect>
              <Input value={krName} onChange={(e) => setKrName(e.target.value)} placeholder={t("okr.title")} />
              <Button disabled={!krName.trim() || addKr.isPending} onClick={() => addKr.mutate()}>
                {t("okr.addKr")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {keyResults
          .filter((kr) => kr.projectId === effectiveProject)
          .map((kr) => (
            <li key={kr.id} className="rounded-[20px] border border-border bg-card p-5">
              {editingKr === kr.id ? (
                <div className="flex flex-wrap gap-2">
                  <Input value={editKrName} onChange={(e) => setEditKrName(e.target.value)} />
                  <Button size="sm" onClick={() => saveKr.mutate()}>
                    {t("kpi.save")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{kr.name}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{kr.definition}</p>
                  </div>
                  <OriginBadge origin={kr.origin} />
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingKr(kr.id);
                    setEditKrName(kr.name);
                  }}
                >
                  {t("kpi.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t("okr.confirmDelete"))) delKr.mutate(kr.id);
                  }}
                >
                  {t("okr.delete")}
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
