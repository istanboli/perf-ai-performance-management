import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/origin-badge";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { listCheckins, listWorkspaceKpis, recordCheckin, updateKpi } from "@/lib/server/fns";
import { useT } from "@/lib/locale";
import { missingLabel } from "@/lib/kpi-engine";

export const Route = createFileRoute("/app/reviews")({ component: ReviewsPage });

function ReviewsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const kpis = useQuery({ queryKey: ["all-kpis"], queryFn: () => listWorkspaceKpis() });
  const checks = useQuery({ queryKey: ["checkins"], queryFn: () => listCheckins({ data: {} }) });
  const [kpiId, setKpiId] = useState("");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const selected = (kpis.data ?? []).find((k) => k.id === kpiId);
  const save = useMutation({
    mutationFn: () => recordCheckin({ data: { kpiId, currentValue: Number(value), comment: comment || undefined } }),
    onSuccess: (r) => {
      toast.success(r.reason);
      setValue("");
      setComment("");
      qc.invalidateQueries();
    },
  });
  const cadence = useMutation({
    mutationFn: (reviewCadence: string) => updateKpi({ data: { id: kpiId, patch: { reviewCadence, frequency: reviewCadence }, reason: "review cadence" } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      qc.invalidateQueries({ queryKey: ["all-kpis"] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">{t("rev.title")}</h1>
      <form
        className="space-y-3 rounded-[20px] border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (kpiId) save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("rev.kpi")}</Label>
            <NativeSelect value={kpiId} onChange={(e) => setKpiId(e.target.value)} required>
              <option value="">KPI…</option>
              {(kpis.data ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                  {k.isDemo ? ` (${t("proj.demoTag")})` : ""} — {k.projectName}
                </option>
              ))}
            </NativeSelect>
          </div>
          {selected ? (
            <>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {t("kpi.target")}: {missingLabel(selected.target)} · {t("kpi.current")}: {missingLabel(selected.currentValue)} · {t("rev.frequency")}: {selected.reviewCadence ?? selected.frequency ?? t("kpi.missing")}
              </p>
              <div className="space-y-1">
                <Label>{t("rev.frequency")}</Label>
                <NativeSelect
                  value={selected.reviewCadence ?? selected.frequency ?? "monthly"}
                  onChange={(e) => cadence.mutate(e.target.value)}
                >
                  <option value="daily">{t("rev.daily")}</option>
                  <option value="weekly">{t("rev.weekly")}</option>
                  <option value="monthly">{t("rev.monthly")}</option>
                  <option value="quarterly">{t("rev.quarterly")}</option>
                </NativeSelect>
              </div>
            </>
          ) : null}
          <div className="space-y-1">
            <Label>{t("rev.value")}</Label>
            <Input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} required />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("rev.comment")}</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <Button type="submit" disabled={!kpiId || save.isPending}>
          {t("rev.save")}
        </Button>
      </form>
      {(checks.data ?? []).length === 0 ? (
        <EmptyState title={t("empty.reviews")} cta={t("empty.kpisCta")} to="/app/build" />
      ) : (
        <ul className="space-y-2">
          {(checks.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-border bg-card px-4 py-3 text-sm">
              <span className="font-medium">{c.kpiName}</span>
              <span className="tabular">{c.recordedAt.slice(0, 16).replace("T", " ")}</span>
              <span className="tabular">
                {t("rev.value")} {c.currentValue} · {t("kpi.target")} {c.target ?? t("kpi.missing")}
                {c.progress != null ? ` · ${Math.round(c.progress)}%` : ""}
              </span>
              {c.status ? <StatusBadge status={c.status} /> : null}
              {c.comment ? <span className="w-full text-xs text-muted-foreground">{c.comment}</span> : null}
              <Link to="/app/kpis/$kpiId" params={{ kpiId: c.kpiId }} className="text-xs text-primary">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
