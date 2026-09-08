import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardSummary, getProjectBundle, listAuditLogs, listProjects } from "@/lib/server/fns";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/app/reports")({ component: ReportsPage });

function ReportsPage() {
  const { t } = useT();
  const dash = useQuery({ queryKey: ["dash"], queryFn: () => dashboardSummary() });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const logs = useQuery({ queryKey: ["logs"], queryFn: () => listAuditLogs() });

  async function exportCsv() {
    const list = projects.data ?? [];
    const lines = [
      ["Type", "Project", "Name", "Owner", "Unit", "Direction", "Formula", "Source", "Baseline", "Target", "Conservative", "Expected", "Stretch", "Current", "Quality", "Status", "Origin", "Objective", "Guardrail"].join(","),
    ];
    const cell = (x: unknown) => `"${String(x ?? "").replaceAll('"', '""')}"`;
    for (const p of list) {
      const b = await getProjectBundle({ data: p.id });
      for (const o of b.objectives) {
        lines.push(["Objective", p.name, o.title, o.ownerName, "", "", "", "", "", "", "", "", "", "", "", o.status, o.origin, o.parentId ? "child" : "root", o.description].map(cell).join(","));
      }
      for (const kr of b.keyResults) {
        lines.push(["KR", p.name, kr.name, kr.ownerName, kr.unit, "", "", "", kr.baseline, kr.target, "", "", "", "", "", kr.status, kr.origin, kr.objectiveId, kr.definition].map(cell).join(","));
      }
      for (const k of b.kpis) {
        lines.push(
          ["KPI", p.name, k.name, k.ownerName, k.unit, k.direction, k.formula, k.dataSource, k.baseline, k.target, k.conservativeTarget, k.expectedTarget, k.stretchTarget, k.currentValue, k.qualityScore, k.status, k.origin, k.objectiveId, k.guardrail].map(cell).join(","),
        );
      }
      for (const c of b.checkins) {
        lines.push(["Review", p.name, c.kpiId, c.ownerName, "", "", "", "", "", c.target, "", "", "", c.currentValue, c.progress, c.status, "", "", c.comment].map(cell).join(","));
      }
    }
    download("kpi-architect.csv", lines.join("\n"), "text/csv");
  }

  async function exportJson() {
    const list = projects.data ?? [];
    const payload = [];
    for (const p of list) payload.push(await getProjectBundle({ data: p.id }));
    download(
      "kpi-architect.json",
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          creator: "Yassin Astanboli",
          dashboard: dash.data ?? null,
          auditLog: logs.data ?? [],
          payload,
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  return (
    <div className="space-y-6 print:p-0">
      <div className="print:hidden">
        <h1 className="font-display text-4xl">{t("rep.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("rep.sub")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={exportCsv}>{t("rep.csv")}</Button>
          <Button variant="outline" onClick={exportJson}>
            {t("rep.json")}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            {t("rep.print")}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("rep.coming")}</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">AI KPI & OKR Architect</p>
          <h2 className="font-display text-3xl">{dash.data?.org?.name ?? dash.data?.workspace.name}</h2>
          <p className="text-sm text-muted-foreground">
            Alignment {dash.data?.alignment ?? "—"} · Quality {dash.data?.quality ?? "—"} · Maturity {dash.data?.maturity ?? "—"}
          </p>
          <p className="text-sm">
            {dash.data?.kpiCount ?? 0} KPIs · {dash.data?.objectiveCount ?? 0} objectives · {dash.data?.krCount ?? 0} key results
          </p>
          <ul className="text-sm">
            {(projects.data ?? []).map((p) => (
              <li key={p.id}>
                {p.name}
                {p.isDemo ? " (demo)" : ""} — {p.status}
              </li>
            ))}
          </ul>
          <p className="pt-6 text-xs text-muted-foreground">{t("app.creator")}</p>
        </CardContent>
      </Card>

      <div className="print:hidden">
        <h2 className="mb-2 font-display text-2xl">Audit log</h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {(logs.data ?? []).map((l) => (
            <li key={l.id} className="tabular">
              {l.createdAt.slice(0, 19).replace("T", " ")} · {l.action} · {l.detail}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
