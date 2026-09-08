import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { OriginBadge, StatusBadge } from "@/components/origin-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { missingLabel, qualityGateBlockers } from "@/lib/kpi-engine";
import { getKpi, recordCheckin, restoreKpiVersion, setKpiStatus, updateKpi } from "@/lib/server/fns";
import { useT } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { Direction, Kpi, KpiStatus } from "@/lib/types";

export const Route = createFileRoute("/app/kpis/$kpiId")({ component: KpiPage });

function KpiPage() {
  const { kpiId } = Route.useParams();
  const { t } = useT();
  const qc = useQueryClient();
  const [view, setView] = useState<"simple" | "pro">("simple");
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ["kpi", kpiId], queryFn: () => getKpi({ data: kpiId }) });
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateKpi>[0]["data"]["patch"]) => updateKpi({ data: { id: kpiId, patch, reason: "manual edit" } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["kpi", kpiId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const status = useMutation({
    mutationFn: (s: KpiStatus) => setKpiStatus({ data: { id: kpiId, status: s } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      qc.invalidateQueries({ queryKey: ["kpi", kpiId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });
  const check = useMutation({
    mutationFn: (payload: { currentValue: number; comment?: string }) => recordCheckin({ data: { kpiId, ...payload } }),
    onSuccess: (r) => {
      toast.success(r.reason);
      qc.invalidateQueries({ queryKey: ["kpi", kpiId] });
    },
  });
  const restore = useMutation({
    mutationFn: (versionId: string) => restoreKpiVersion({ data: { kpiId, versionId } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      qc.invalidateQueries({ queryKey: ["kpi", kpiId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("err.generic")),
  });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-[24px] bg-muted" />;
  if (!q.data) return <p>{t("err.generic")}</p>;
  const { kpi, gaming, scored, versions, checkins, objectives, keyResults } = q.data;
  const blockers = qualityGateBlockers(kpi);
  const relatedObj = objectives?.find((o) => o.id === kpi.objectiveId);
  const relatedKr = keyResults?.find((k) => k.id === kpi.relatedKrId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{kpi.kpiCode} · {t("kpi.contract")}</p>
        <h1 className="font-display text-4xl">{kpi.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge status={kpi.status} />
          <OriginBadge origin={kpi.origin} />
          <StatusBadge status={scored.status} />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className={cn("rounded-full px-3 py-1.5 text-sm", view === "simple" ? "bg-foreground text-background" : "bg-muted")} onClick={() => setView("simple")}>
          {t("kpi.simple")}
        </button>
        <button type="button" className={cn("rounded-full px-3 py-1.5 text-sm", view === "pro" ? "bg-foreground text-background" : "bg-muted")} onClick={() => setView("pro")}>
          {t("kpi.pro")}
        </button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label={t("kpi.purpose")} value={missingLabel(kpi.purpose)} />
          <Field label={t("kpi.owner")} value={missingLabel(kpi.ownerName)} />
          <Field label={t("kpi.target")} value={missingLabel(kpi.target)} />
          <Field label={t("kpi.current")} value={missingLabel(kpi.currentValue)} />
          <Field label={t("kpi.progress")} value={scored.score === null ? t("kpi.missing") : `${Math.round(scored.score)}`} />
          <Field label={t("kpi.status")} value={t(`status.${scored.status}`)} />
        </CardContent>
      </Card>

      {view === "pro" && (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <Field label={t("kpi.definition")} value={missingLabel(kpi.definition)} wide />
            <Field label={t("kpi.formula")} value={missingLabel(kpi.formula)} wide />
            <Field label={t("kpi.unit")} value={missingLabel(kpi.unit)} />
            <Field label={t("kpi.source")} value={missingLabel(kpi.dataSource)} />
            <Field label={t("kpi.owner")} value={missingLabel(kpi.ownerName)} />
            <Field label={t("kpi.frequency")} value={missingLabel(kpi.frequency ?? kpi.reviewCadence)} />
            <Field label={t("kpi.baseline")} value={missingLabel(kpi.baseline)} />
            <Field label={t("kpi.target")} value={missingLabel(kpi.target)} />
            <Field label="Conservative" value={missingLabel(kpi.conservativeTarget)} />
            <Field label="Expected" value={missingLabel(kpi.expectedTarget)} />
            <Field label="Stretch" value={missingLabel(kpi.stretchTarget)} />
            <Field label={t("kpi.thresholds")} value={kpi.thresholds ? JSON.stringify(kpi.thresholds) : t("kpi.missing")} />
            <Field label={t("kpi.direction")} value={missingLabel(kpi.direction)} />
            <Field label={t("kpi.weight")} value={missingLabel(kpi.weight)} />
            <Field label={t("kpi.relatedObjective")} value={missingLabel(relatedObj?.title)} />
            <Field label={t("kpi.relatedKr")} value={missingLabel(relatedKr?.name)} />
            <Field label={t("kpi.cadence")} value={missingLabel(kpi.reviewCadence)} />
            <Field label={t("kpi.version")} value={kpi.version} />
            <Field label={t("kpi.guardrail")} value={missingLabel(kpi.guardrail)} wide />
            <Field label={t("kpi.risk")} value={missingLabel(kpi.gamingRisk)} wide />
            <Field label="Parmenter" value={missingLabel(kpi.parmenterType)} />
            <Field label="Leading / lagging" value={missingLabel(kpi.leadingLagging)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("kpi.quality")}</span>
            <span className="tabular">{kpi.qualityScore ?? "—"}/100</span>
          </div>
          <Progress value={kpi.qualityScore ?? 0} />
          <ul className="space-y-1 text-xs text-muted-foreground">
            {kpi.qualityNotes?.criteria.map((c) => (
              <li key={c.id}>
                {c.label}: {c.score}/{c.max} — {c.note}
              </li>
            ))}
          </ul>
          <p className="text-xs text-warn">
            {gaming.risk}: {gaming.why}
          </p>
          {blockers.length ? (
            <div className="rounded-[12px] bg-danger/10 px-3 py-2 text-xs text-danger">
              <p className="font-medium">{t("kpi.gateBlocked")}</p>
              <ul className="mt-1 list-disc ps-4">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {editing ? (
        <>
          <Editor
            kpi={kpi}
            objectives={objectives ?? []}
            keyResults={keyResults ?? []}
            onCancel={() => setEditing(false)}
            onSave={(patch) => save.mutate(patch)}
            busy={save.isPending}
          />
          {save.isError ? (
            <p role="alert" className="text-sm text-danger">
              {save.error instanceof Error ? save.error.message : t("err.generic")}
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t("kpi.edit")}
          </Button>
          <Button variant="outline" onClick={() => status.mutate("under_review")}>
            {t("kpi.underReview")}
          </Button>
          <Button variant="outline" onClick={() => status.mutate("approved")} disabled={blockers.length > 0}>
            {t("kpi.approve")}
          </Button>
          <Button variant="outline" onClick={() => status.mutate("active")} disabled={blockers.length > 0}>
            {t("kpi.activate")}
          </Button>
          <Button variant="ghost" onClick={() => status.mutate("archived")}>
            {t("kpi.archive")}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-display text-2xl">{t("rev.record")}</h2>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const n = Number(fd.get("v"));
              const comment = String(fd.get("c") ?? "");
              if (Number.isFinite(n)) check.mutate({ currentValue: n, comment: comment || undefined });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="v">{t("rev.value")}</Label>
              <Input id="v" name="v" type="number" step="any" required className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c">{t("rev.comment")}</Label>
              <Input id="c" name="c" className="w-56" />
            </div>
            <Button type="submit" disabled={check.isPending}>
              {t("rev.save")}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            {t("kpi.target")}: {missingLabel(kpi.target)} · {t("rev.achievement")}: {scored.score === null ? t("kpi.missing") : `${Math.round(scored.score)}%`}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {checkins.map((c) => (
              <li key={c.id} className="tabular">
                {c.recordedAt.slice(0, 10)} · {c.currentValue} · {c.status}
                {c.comment ? ` · ${c.comment}` : ""}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {versions.length ? (
        <div>
          <h2 className="mb-2 font-display text-2xl">{t("kpi.version")}</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {v.version} · {v.createdAt.slice(0, 10)} · {v.changeSummary ?? ""}
                </span>
                <Button size="sm" variant="outline" onClick={() => restore.mutate(v.id)} disabled={restore.isPending}>
                  {t("kpi.restore")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function Editor({
  kpi,
  objectives,
  keyResults,
  onSave,
  onCancel,
  busy,
}: {
  kpi: Kpi;
  objectives: { id: string; title: string }[];
  keyResults: { id: string; name: string }[];
  onSave: (p: Parameters<typeof updateKpi>[0]["data"]["patch"]) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { t } = useT();
  const [form, setForm] = useState({
    name: kpi.name,
    definition: kpi.definition ?? "",
    purpose: kpi.purpose ?? "",
    ownerName: kpi.ownerName ?? "",
    formula: kpi.formula ?? "",
    dataSource: kpi.dataSource ?? "",
    guardrail: kpi.guardrail ?? "",
    unit: kpi.unit ?? "",
    frequency: kpi.frequency ?? kpi.reviewCadence ?? "monthly",
    reviewCadence: kpi.reviewCadence ?? "monthly",
    direction: (kpi.direction ?? "higher") as Direction,
    weight: kpi.weight,
    baseline: kpi.baseline,
    target: kpi.target,
    objectiveId: kpi.objectiveId ?? "",
    relatedKrId: kpi.relatedKrId ?? "",
    thMin: kpi.thresholds?.min ?? ("" as number | ""),
    thMax: kpi.thresholds?.max ?? ("" as number | ""),
  });
  return (
    <form
      className="space-y-3 rounded-[20px] border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          definition: form.definition,
          purpose: form.purpose,
          ownerName: form.ownerName,
          formula: form.formula,
          dataSource: form.dataSource,
          guardrail: form.guardrail,
          unit: form.unit || null,
          frequency: form.frequency,
          reviewCadence: form.reviewCadence,
          direction: form.direction,
          weight: form.weight,
          baseline: form.baseline,
          target: form.target,
          objectiveId: form.objectiveId || null,
          relatedKrId: form.relatedKrId || null,
          thresholds:
            form.thMin === "" && form.thMax === ""
              ? null
              : {
                  min: form.thMin === "" ? undefined : Number(form.thMin),
                  max: form.thMax === "" ? undefined : Number(form.thMax),
                },
        });
      }}
    >
      <Label>Name</Label>
      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Label>{t("kpi.definition")}</Label>
      <Textarea value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} />
      <Label>{t("kpi.purpose")}</Label>
      <Textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
      <Label>{t("kpi.owner")}</Label>
      <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
      <Label>{t("kpi.formula")}</Label>
      <Input value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} />
      <Label>{t("kpi.source")}</Label>
      <Input value={form.dataSource} onChange={(e) => setForm({ ...form, dataSource: e.target.value })} />
      <Label>{t("kpi.unit")}</Label>
      <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
      <Label>{t("kpi.frequency")}</Label>
      <NativeSelect
        value={form.frequency}
        onChange={(e) => setForm({ ...form, frequency: e.target.value, reviewCadence: e.target.value })}
      >
        <option value="daily">{t("rev.daily")}</option>
        <option value="weekly">{t("rev.weekly")}</option>
        <option value="monthly">{t("rev.monthly")}</option>
        <option value="quarterly">{t("rev.quarterly")}</option>
      </NativeSelect>
      <Label>{t("kpi.direction")}</Label>
      <NativeSelect value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}>
        <option value="higher">higher</option>
        <option value="lower">lower</option>
        <option value="range">range</option>
        <option value="threshold">threshold</option>
      </NativeSelect>
      <Label>{t("kpi.relatedObjective")}</Label>
      <NativeSelect value={form.objectiveId} onChange={(e) => setForm({ ...form, objectiveId: e.target.value })}>
        <option value="">{t("okr.none")}</option>
        {objectives.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </NativeSelect>
      <Label>{t("kpi.relatedKr")}</Label>
      <NativeSelect value={form.relatedKrId} onChange={(e) => setForm({ ...form, relatedKrId: e.target.value })}>
        <option value="">{t("okr.none")}</option>
        {keyResults.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </NativeSelect>
      <Label>{t("kpi.guardrail")}</Label>
      <Textarea value={form.guardrail} onChange={(e) => setForm({ ...form, guardrail: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("kpi.baseline")}</Label>
          <Input type="number" step="any" value={form.baseline ?? ""} onChange={(e) => setForm({ ...form, baseline: e.target.value === "" ? null : Number(e.target.value) })} />
        </div>
        <div>
          <Label>{t("kpi.target")}</Label>
          <Input type="number" step="any" value={form.target ?? ""} onChange={(e) => setForm({ ...form, target: e.target.value === "" ? null : Number(e.target.value) })} />
        </div>
        <div>
          <Label>{t("kpi.weight")}</Label>
          <Input type="number" step="any" value={form.weight ?? ""} onChange={(e) => setForm({ ...form, weight: e.target.value === "" ? null : Number(e.target.value) })} />
        </div>
        <div>
          <Label>{t("kpi.thresholds")} min</Label>
          <Input type="number" step="any" value={form.thMin} onChange={(e) => setForm({ ...form, thMin: e.target.value === "" ? "" : Number(e.target.value) })} />
        </div>
        <div>
          <Label>{t("kpi.thresholds")} max</Label>
          <Input type="number" step="any" value={form.thMax} onChange={(e) => setForm({ ...form, thMax: e.target.value === "" ? "" : Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t("kpi.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("wiz.back")}
        </Button>
      </div>
    </form>
  );
}

