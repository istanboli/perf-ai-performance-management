import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { INDUSTRIES } from "@/lib/types";
import { addKpiFromCatalog, catalogList, listProjects } from "@/lib/server/fns";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/app/library")({ component: LibraryPage });

function LibraryPage() {
  const { t, locale } = useT();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [projectId, setProjectId] = useState("");
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => catalogList() });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const add = useMutation({
    mutationFn: (key: string) => addKpiFromCatalog({ data: { projectId, catalogKey: key } }),
    onSuccess: () => toast.success(t("ok.saved")),
    onError: () => toast.error("Select a project first."),
  });

  const rows = useMemo(() => {
    const list = catalog.data ?? [];
    return list.filter((c) => {
      if (cat !== "all" && c.category !== cat) return false;
      if (q && !`${c.name} ${c.definition}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [catalog.data, cat, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">{t("lib.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("lib.sub")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t("lib.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect className="max-w-xs" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All</option>
          {INDUSTRIES.map((i) => (
            <option key={i.id} value={i.id}>
              {locale === "ar" ? i.ar : i.en}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="max-w-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Project…</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((c) => (
          <li key={c.key} className="rounded-[20px] border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{locale === "ar" ? c.nameAr : c.name}</div>
                <p className="mt-1 text-sm text-muted-foreground">{c.definition}</p>
              </div>
              <Badge tone="info">{t("lib.template")}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge>{c.parmenterType}</Badge>
              <Badge>{c.leadingLagging}</Badge>
              <Badge tone={c.gamingSeverity === "high" ? "danger" : "warn"}>{c.gamingSeverity}</Badge>
            </div>
            <Button className="mt-4" size="sm" disabled={!projectId} onClick={() => add.mutate(c.key)}>
              {t("lib.add")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
