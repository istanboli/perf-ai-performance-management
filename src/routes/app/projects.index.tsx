import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProjects, seedDemo } from "@/lib/server/fns";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/app/projects/")({ component: ProjectsPage });

function ProjectsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const seed = useMutation({
    mutationFn: () => seedDemo(),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-[24px] bg-muted" />;
  const rows = q.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">{t("nav.projects")}</h1>
          <p className="text-sm text-muted-foreground">{t("empty.projects")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/app/build">{t("proj.build")}</Link>
          </Button>
          <Button variant="outline" onClick={() => seed.mutate()}>
            {t("proj.demo")}
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t("empty.projects")} cta={t("empty.kpisCta")} to="/app/build" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                to="/app/projects/$projectId"
                params={{ projectId: p.id }}
                className="block rounded-[20px] border border-border bg-card p-5 hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {p.industry} · {p.scope} · {p.mode}
                    </div>
                  </div>
                  {p.isDemo ? <Badge tone="info">{t("proj.demoTag")}</Badge> : <Badge>{p.status}</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
