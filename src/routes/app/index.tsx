import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ScoreRing } from "@/components/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardSummary, seedDemo } from "@/lib/server/fns";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { t } = useT();
  const demo = useRouterState({
    select: (s) => {
      const raw = s.location.search as unknown;
      if (typeof raw === "string") {
        return new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`).get("demo");
      }
      if (raw && typeof raw === "object" && "demo" in (raw as object)) {
        const v = (raw as { demo?: unknown }).demo;
        return v == null ? null : String(v);
      }
      return null;
    },
  });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dash"], queryFn: () => dashboardSummary() });
  const seed = useMutation({
    mutationFn: () => seedDemo(),
    onSuccess: () => {
      toast.success(t("ok.seeded"));
      qc.invalidateQueries();
    },
  });

  const seeded = useRef(false);
  useEffect(() => {
    if (demo === "1" && q.data && q.data.demoCount === 0 && !seed.isPending && !seeded.current) {
      seeded.current = true;
      seed.mutate();
    }
  }, [demo, q.data, seed]);

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-[24px] bg-muted" />;
  const d = q.data;
  if (!d) return null;

  if (d.projectCount === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState title={t("empty.projects")} cta={t("empty.kpisCta")} to="/app/build" />
        <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
          {t("proj.demo")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Header />
      {d.demoCount > 0 ? (
        <div className="rounded-[16px] border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">{t("dash.demoBanner")}</div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-around py-6">
            <ScoreRing value={d.alignment} label={t("dash.alignment")} />
            <ScoreRing value={d.quality} label={t("dash.quality")} />
            <ScoreRing value={d.maturity} label={t("dash.maturity")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System volume</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Stat label={t("dash.objectives")} value={d.objectiveCount} />
            <Stat label={t("dash.okrs")} value={d.krCount} />
            <Stat label={t("dash.kpis")} value={d.kpiCount} />
            <Stat label={t("dash.atRisk")} value={d.atRisk} warn />
            <Stat label={t("dash.behind")} value={d.behind} danger />
            <Stat label={t("dash.reviewCompletion")} value={`${d.reviewCompletion}%`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dash.dataReady")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-display text-4xl tabular">{d.dataReadiness}%</div>
            <p className="mt-2 text-sm text-muted-foreground">{t("dash.subtitle")}</p>
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl">{t("nav.projects")}</h2>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/app/build">{t("proj.build")}</Link>
            </Button>
            {d.demoCount === 0 ? (
              <Button variant="ghost" size="sm" onClick={() => seed.mutate()}>
                {t("proj.demo")}
              </Button>
            ) : null}
          </div>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {d.projects.map((p) => (
            <li key={p.id}>
              <Link
                to="/app/projects/$projectId"
                params={{ projectId: p.id }}
                className="block rounded-[20px] border border-border bg-card p-5 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {p.industry} · {p.scope}
                    </div>
                  </div>
                  {p.isDemo ? <Badge tone="info">{t("proj.demoTag")}</Badge> : null}
                </div>
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span className="tabular">{t("dash.alignment")} {p.alignmentScore ?? "—"}</span>
                  <span className="tabular">{t("dash.quality")} {p.qualityScore ?? "—"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {d.weakKpis.length ? (
        <section>
          <h2 className="mb-3 font-display text-2xl">{t("dash.opportunities")}</h2>
          <ul className="space-y-2">
            {d.weakKpis.map((k) => (
              <li key={k.id} className="flex items-center justify-between rounded-[16px] border border-border bg-card px-4 py-3 text-sm">
                <span>{k.name}</span>
                <span className="tabular text-muted-foreground">{t("kpi.quality")} {k.qualityScore ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Header() {
  const { t } = useT();
  return (
    <div>
      <h1 className="font-display text-4xl">{t("dash.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("dash.subtitle")}</p>
    </div>
  );
}

function Stat({ label, value, warn, danger }: { label: string; value: string | number; warn?: boolean; danger?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl tabular ${danger ? "text-danger" : warn ? "text-warn" : ""}`}>{value}</div>
    </div>
  );
}
